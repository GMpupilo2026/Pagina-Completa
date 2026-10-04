-- Las clases en vivo que se olvidaron abiertas se cierran solas.
--
-- El 3/10 había dos clases abiertas desde el 29/9. Con una abierta, el índice
-- class_sessions_una_abierta_por_profesor no deja abrir la de hoy: la página
-- se cuelga de la vieja, todo lo de hoy (asistencia, minutos, puntos) se suma
-- a esa y la duración crece sola. Ningún error en ninguna parte.
--
-- Cada 10 minutos, una clase en línea sin NINGUNA señal de actividad hace más
-- de 1 hora se cierra con la hora de la última señal (no con la de ahora: una
-- clase de 2 horas olvidada 4 días no puede contar 4 días). Las señales:
--   · el latido de cada alumno conectado (class_presence_log, cada 20 s);
--   · el tablero del profe (game_state.updated_at, cada jugada);
--   · las preguntas, rondas de práctica y tandas de esa clase;
--   · los invitados sin cuenta que la miran (clase_espectadores.visto_at).
-- Mientras un alumno tenga la clase abierta, su latido la mantiene viva.
-- Las presenciales no entran: nacen cerradas.
--
-- Solo cierra: NO limpia lo de la clase en game_state (podio, equipos,
-- calentamiento…) como hace el botón (limpiarLoDeLaClase en js/sesion.js).
-- Esas columnas las protege protect_game_state_teacher_columns, que deshace en
-- silencio el cambio si auth.uid() no es un profesor; bajo pg_cron no hay
-- nadie, y hacerlo a nombre del profe (poniendo request.jwt.claims) se
-- descartó. Lo que quede puesto lo quita el profe al cerrar su clase
-- siguiente. Tampoco guarda la partida en saved_games (el PGN lo arma el
-- navegador) ni termina una partida votada, ronda o cuestionario en curso.
--
-- Aplicada el 4/10/2026 con execute_sql (apply_migration no estaba
-- disponible en la sesión). Ensayada en un bloque que se deshace solo: una
-- clase de 3 h sin actividad se cerró a su hora de inicio, una de 30 min
-- siguió abierta y una segunda pasada no cerró nada.

create or replace function interno.ultima_actividad_de_clase(p_clase uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    cs.started_at,
    (select max(greatest(l.joined_at, coalesce(l.left_at, l.joined_at)))
       from public.class_presence_log l where l.session_id = cs.id),
    (select g.updated_at from public.game_state g
      where g.owner_id = cs.created_by and g.updated_at >= cs.started_at),
    (select max(q.created_at) from public.questions q where q.class_session_id = cs.id),
    (select max(p.created_at) from public.practice_sessions p where p.class_session_id = cs.id),
    (select max(t.created_at) from public.tanda_resultados t where t.class_session_id = cs.id),
    (select max(e.visto_at) from public.clase_espectadores e
      where e.owner_id = cs.created_by and e.visto_at >= cs.started_at)
  )
  from public.class_sessions cs
  where cs.id = p_clase;
$$;
revoke execute on function interno.ultima_actividad_de_clase(uuid) from public, anon, authenticated;

create or replace function interno.cerrar_clases_inactivas(p_inactiva interval default interval '1 hour')
returns table (clase uuid, profesor uuid, cerrada_a timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_ultima timestamptz;
begin
  for r in
    select cs.id, cs.created_by
      from public.class_sessions cs
     where cs.ended_at is null
       and cs.modalidad is distinct from 'presencial'
       and cs.started_at < now() - p_inactiva
  loop
    v_ultima := interno.ultima_actividad_de_clase(r.id);
    continue when v_ultima is null or v_ultima >= now() - p_inactiva;

    update public.class_sessions
       set ended_at = v_ultima
     where id = r.id and ended_at is null;
    continue when not found;

    clase := r.id; profesor := r.created_by; cerrada_a := v_ultima;
    return next;
  end loop;
end;
$$;
revoke execute on function interno.cerrar_clases_inactivas(interval) from public, anon, authenticated;

select cron.schedule('cerrar-clases-inactivas', '*/10 * * * *',
  'select count(*) from interno.cerrar_clases_inactivas();');
