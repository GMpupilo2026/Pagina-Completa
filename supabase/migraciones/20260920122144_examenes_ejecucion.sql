-- El reloj lo fija el SERVIDOR. Es la misma decisión que
-- proteger_reloj_de_partida(): un `termina_at` calculado por el
-- navegador se corre desde la consola y el examen dura lo que el
-- alumno quiera.
create or replace function public.iniciar_examen(p_examen uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  e public.examenes%rowtype;
begin
  select * into e from public.examenes where id = p_examen for update;
  if not found then raise exception 'Ese examen no existe.'; end if;
  if e.alumno_id is distinct from auth.uid() then
    raise exception 'Ese examen no es tuyo.';
  end if;
  if e.estado = 'entregado' then raise exception 'Ese examen ya lo entregaste.'; end if;
  if e.estado = 'congelado' then
    raise exception 'El examen está congelado. Tu profe tiene que volver a abrirlo.';
  end if;
  if now() > e.vence_at and e.estado = 'asignado' then
    raise exception 'Se pasó la fecha para hacer este examen.';
  end if;

  -- Volver a entrar NO reinicia el reloj: sigue corriendo desde la
  -- primera vez. Si no, cerrar y abrir la pestaña regalaría el tiempo
  -- entero otra vez, y eso no daría ningún error.
  if e.estado = 'asignado' then
    update public.examenes
       set estado = 'en_curso',
           iniciado_at = now(),
           termina_at = now() + make_interval(mins => e.minutos)
     where id = p_examen
     returning * into e;
  end if;

  return jsonb_build_object('estado', e.estado, 'termina_at', e.termina_at, 'ahora', now());
end;
$$;

revoke execute on function public.iniciar_examen(uuid) from anon;


-- Califica en el SERVIDOR, contra la clave que el alumno no puede
-- leer, y devuelve solo "quedó registrada" — nunca si acertó: esto es
-- un examen, no un ejercicio con corrección al momento.
--
-- Una sola oportunidad la hace cumplir el UNIQUE de examen_respuestas,
-- no un `if`: dos pestañas mandando a la vez no pueden colar dos.
create or replace function public.responder_examen(
  p_item uuid,
  p_respuesta jsonb,
  p_segundos integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  it public.examen_items%rowtype;
  e  public.examenes%rowtype;
  v_correcta boolean := false;
  v_clave jsonb;
begin
  select * into it from public.examen_items where id = p_item;
  if not found then raise exception 'Esa pregunta no existe.'; end if;

  select * into e from public.examenes where id = it.examen_id;
  if e.alumno_id is distinct from auth.uid() then
    raise exception 'Ese examen no es tuyo.';
  end if;
  if e.estado <> 'en_curso' then
    raise exception 'El examen no está abierto.';
  end if;
  -- El reloj del servidor, no el de la página. Pasado el tiempo se
  -- congela: lo que no contestó vale cero, que es justamente lo que
  -- significa "se le acabó el tiempo".
  if e.termina_at is not null and now() > e.termina_at then
    perform public.cerrar_examen(e.id, 'tiempo');
    raise exception 'Se acabó el tiempo.';
  end if;

  v_clave := it.clave;

  -- Cada tipo se corrige como corresponde. Todo esto pasa acá y no en
  -- el navegador porque en el navegador la comparación se puede saltar.
  if it.tipo in ('opcion','opcion_tablero') then
    -- La clave es el índice DENTRO del barajado que se le mandó, así
    -- que no delata nada aunque se filtrara el número suelto.
    v_correcta := (p_respuesta->>'opcion') is not null
              and (p_respuesta->>'opcion') = (v_clave->>'correcta');

  elsif it.tipo = 'jugada' then
    -- Vale la jugada principal o cualquiera de sus alternas: dar solo
    -- una marcaría mal una respuesta correcta (la misma razón por la
    -- que la hoja de respuestas del libro imprime las dos).
    v_correcta := exists (
      select 1 from jsonb_array_elements(v_clave->'jugadas') j
      where lower(j->>'from') = lower(coalesce(p_respuesta->>'from',''))
        and lower(j->>'to')   = lower(coalesce(p_respuesta->>'to',''))
    );

  elsif it.tipo = 'casilla' then
    v_correcta := exists (
      select 1 from jsonb_array_elements_text(v_clave->'casillas') c
      where lower(c) = lower(coalesce(p_respuesta->>'casilla',''))
    );

  elsif it.tipo = 'linea' then
    -- Ejecutar la apertura de una vez: la línea entera, en orden, sin
    -- pistas. O la dio completa o no la dio.
    v_correcta := (v_clave->'jugadas') = (p_respuesta->'jugadas');
  end if;

  insert into public.examen_respuestas (item_id, examen_id, respuesta, correcta, puntos, segundos)
  values (p_item, e.id, coalesce(p_respuesta,'{}'::jsonb), v_correcta,
          case when v_correcta then it.peso else 0 end,
          greatest(0, coalesce(p_segundos, 0)))
  on conflict (item_id) do nothing;

  if not found then
    -- Ya estaba contestada: una sola oportunidad, y se dice.
    return jsonb_build_object('guardada', false, 'motivo', 'ya_respondida');
  end if;

  return jsonb_build_object('guardada', true);
end;
$$;

revoke execute on function public.responder_examen(uuid, jsonb, integer) from anon;