-- Los exámenes de rango: 90 % para aprobar, y en Caballo los dos mates básicos.
--
-- Decisiones del dueño (18/11/2026):
-- * Todos los exámenes de rango se aprueban con 90 % (antes 70 %).
-- * El de Caballo suma a sus 10 de táctica dos preguntas de práctica: dar mate
--   con dama y rey contra rey, y con dos torres contra rey, en menos de 2
--   minutos cada una. Son OBLIGATORIAS: sin los dos mates no se aprueba,
--   aunque el porcentaje llegue.
--
-- Cómo se juega un mate sin que el navegador pueda mentir:
-- * La partida la arbitra la Edge Function examen-mate: recibe cada jugada,
--   la valida con chess.js, contesta con la defensa (para la dama, la
--   distancia exacta al mate de herramientas/lib/finales-dtm.js; para las
--   torres, el rey de «Con lo justo») y decide si hubo mate o tablas.
-- * El estado y el reloj viven acá (examen_mate_partidas): el reloj de 2
--   minutos corre desde que la base anota el comienzo, con su now(), y las
--   funciones mate_estado()/mate_registrar() solo las puede llamar la clave de
--   servicio (la función). La jugada que llega se encadena con la posición
--   anterior (p_fen_antes): no se puede saltar ni repetir una.
-- * El resultado entra a examen_respuestas como cualquier respuesta (una
--   sola, por el UNIQUE), con su peso. responder_examen() ya no acepta
--   preguntas de mate: desde la consola solo se podría marcar mal la propia.

-- ---------------- La partida ----------------
create table public.examen_mate_partidas (
  item_id       uuid primary key references public.examen_items(id) on delete cascade,
  examen_id     uuid not null references public.examenes(id) on delete cascade,
  alumno_id     uuid not null references public.profiles(id) on delete cascade,
  fen           text not null,
  posiciones    jsonb not null default '[]'::jsonb,
  jugadas       jsonb not null default '[]'::jsonb,
  empezo_at     timestamptz not null default now(),
  terminado_at  timestamptz,
  resultado     text check (resultado in ('mate', 'tiempo', 'tablas'))
);
comment on table public.examen_mate_partidas is
  'Una pregunta de mate de un examen de rango, jugada contra el servidor (Edge Function examen-mate). El reloj (2 minutos) corre desde empezo_at; la escriben solo mate_estado()/mate_registrar() con la clave de servicio.';
alter table public.examen_mate_partidas enable row level security;
revoke all on public.examen_mate_partidas from public, anon, authenticated;
grant select on public.examen_mate_partidas to authenticated;
create policy examen_mate_partidas_ver on public.examen_mate_partidas for select to authenticated
  using (alumno_id = (select auth.uid()) or (select public.soy_admin())
         or alumno_id in (select interno.alumnos_de((select auth.uid()))));

create or replace function interno.mate_finalizar(p_item uuid, p_resultado text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  p public.examen_mate_partidas;
  it public.examen_items;
begin
  update public.examen_mate_partidas set terminado_at = now(), resultado = p_resultado
   where item_id = p_item and terminado_at is null
   returning * into p;
  if p.item_id is null then return; end if;
  select * into it from public.examen_items where id = p_item;
  insert into public.examen_respuestas (item_id, examen_id, respuesta, correcta, puntos, segundos)
  values (p_item, p.examen_id,
          jsonb_build_object('resultado', p_resultado, 'jugadas', p.jugadas),
          p_resultado = 'mate', case when p_resultado = 'mate' then it.peso else 0 end,
          greatest(0, extract(epoch from (now() - p.empezo_at))::integer))
  on conflict (item_id) do nothing;
end;
$$;
revoke all on function interno.mate_finalizar(uuid, text) from public, anon, authenticated;

-- El estado de la partida (y la empieza la primera vez). Solo la clave de servicio.
create or replace function public.mate_estado(p_item uuid, p_alumno uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  it public.examen_items;
  e public.examenes;
  p public.examen_mate_partidas;
  v_seg integer;
  v_rest numeric;
begin
  select * into it from public.examen_items where id = p_item;
  if it.id is null or it.tipo <> 'mate' then return jsonb_build_object('error', 'Esa pregunta no es de mate.'); end if;
  select * into e from public.examenes where id = it.examen_id;
  if e.alumno_id is distinct from p_alumno then return jsonb_build_object('error', 'Ese examen no es tuyo.'); end if;
  v_seg := coalesce((it.clave->>'segundos')::integer, 120);

  select * into p from public.examen_mate_partidas where item_id = p_item;
  if p.item_id is null then
    if e.estado <> 'en_curso' then return jsonb_build_object('error', 'El examen no está en curso.'); end if;
    if e.termina_at is not null and now() > e.termina_at then return jsonb_build_object('error', 'Se acabó el tiempo del examen.'); end if;
    if exists (select 1 from public.examen_respuestas where item_id = p_item) then
      return jsonb_build_object('error', 'Esa pregunta ya está contestada.');
    end if;
    insert into public.examen_mate_partidas (item_id, examen_id, alumno_id, fen, posiciones)
    values (p_item, e.id, p_alumno, it.visible->>'fen',
            jsonb_build_array(array_to_string((string_to_array(it.visible->>'fen', ' '))[1:4], ' ')))
    on conflict (item_id) do nothing;
    select * into p from public.examen_mate_partidas where item_id = p_item;
  end if;

  v_rest := v_seg - extract(epoch from (now() - p.empezo_at));
  if p.terminado_at is null and (v_rest <= 0 or e.estado <> 'en_curso' or (e.termina_at is not null and now() > e.termina_at)) then
    perform interno.mate_finalizar(p_item, 'tiempo');
    select * into p from public.examen_mate_partidas where item_id = p_item;
  end if;

  return jsonb_build_object('fen', p.fen, 'final', it.clave->>'final', 'segundos', v_seg,
    'restantes', greatest(0, floor(v_rest))::integer, 'terminado', p.terminado_at is not null,
    'resultado', p.resultado, 'posiciones', p.posiciones, 'jugadas', p.jugadas);
end;
$$;
revoke execute on function public.mate_estado(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mate_estado(uuid, uuid) to service_role;

-- Anota una jugada (la del alumno y la respuesta del rey) que la función ya validó.
create or replace function public.mate_registrar(p_item uuid, p_alumno uuid, p_fen_antes text, p_fen_despues text,
                                                 p_jugada jsonb, p_posicion text, p_resultado text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  p public.examen_mate_partidas;
  it public.examen_items;
  e public.examenes;
begin
  select * into p from public.examen_mate_partidas where item_id = p_item for update;
  if p.item_id is null or p.alumno_id is distinct from p_alumno then return jsonb_build_object('error', 'No hay partida.'); end if;
  if p.terminado_at is not null then return public.mate_estado(p_item, p_alumno); end if;
  if p.fen <> p_fen_antes then return jsonb_build_object('error', 'La posición cambió: vuelve a cargar la pregunta.'); end if;
  select * into it from public.examen_items where id = p_item;
  select * into e from public.examenes where id = p.examen_id;
  -- El reloj de la base: llegar tarde es perderla, aunque la jugada fuera mate.
  if now() - p.empezo_at > make_interval(secs => coalesce((it.clave->>'segundos')::integer, 120))
     or e.estado <> 'en_curso' or (e.termina_at is not null and now() > e.termina_at) then
    perform interno.mate_finalizar(p_item, 'tiempo');
    return public.mate_estado(p_item, p_alumno);
  end if;
  update public.examen_mate_partidas
     set fen = p_fen_despues, jugadas = jugadas || jsonb_build_array(p_jugada), posiciones = posiciones || to_jsonb(p_posicion)
   where item_id = p_item;
  if p_resultado in ('mate', 'tablas') then perform interno.mate_finalizar(p_item, p_resultado); end if;
  return public.mate_estado(p_item, p_alumno);
end;
$$;
revoke execute on function public.mate_registrar(uuid, uuid, text, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.mate_registrar(uuid, uuid, text, text, jsonb, text, text) to service_role;

-- ---------------- responder_examen ya no acepta mates ----------------
create or replace function public.responder_examen(p_item uuid, p_respuesta jsonb, p_segundos integer DEFAULT NULL::integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

  -- Un mate se juega contra el servidor (Edge Function examen-mate), no se
  -- contesta: aceptarlo acá dejaría marcarla desde la consola.
  if it.tipo = 'mate' then
    return jsonb_build_object('guardada', false, 'motivo', 'se_juega');
  end if;

  if e.estado <> 'en_curso' then
    return jsonb_build_object('guardada', false, 'motivo', 'cerrado', 'estado', e.estado);
  end if;

  -- El reloj del servidor, no el de la página. Pasado el tiempo el
  -- examen se cierra y se califica con lo que llevaba: lo que no
  -- contestó vale cero, que es lo que significa que se le acabó.
  if e.termina_at is not null and now() > e.termina_at then
    perform public.cerrar_examen(e.id, 'tiempo');
    return jsonb_build_object('guardada', false, 'motivo', 'tiempo');
  end if;

  v_clave := it.clave;

  if it.tipo in ('opcion','opcion_tablero') then
    v_correcta := (p_respuesta->>'opcion') is not null
              and (p_respuesta->>'opcion') = (v_clave->>'correcta');

  elsif it.tipo = 'jugada' then
    -- Vale la principal o cualquiera de sus alternas: dar solo una
    -- marcaría mal una respuesta correcta.
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
    -- Ejecutar la apertura de una vez: la línea entera, en orden y sin
    -- pistas. O la dio completa o no la dio.
    v_correcta := (v_clave->'jugadas') = (p_respuesta->'jugadas');
  end if;

  insert into public.examen_respuestas (item_id, examen_id, respuesta, correcta, puntos, segundos)
  values (p_item, e.id, coalesce(p_respuesta,'{}'::jsonb), v_correcta,
          case when v_correcta then it.peso else 0 end,
          greatest(0, coalesce(p_segundos, 0)))
  on conflict (item_id) do nothing;

  if not found then
    -- Una sola oportunidad, y lo hace cumplir el UNIQUE de la tabla.
    return jsonb_build_object('guardada', false, 'motivo', 'ya_respondida');
  end if;

  return jsonb_build_object('guardada', true);
end;
$function$;

-- ---------------- El banco: las posiciones de mate ----------------
-- Una pregunta de mate en el banco compacto: {"t":"mate","fin":"q"|"rr","f":fen}.
create or replace function interno.pregunta_de_rango(p_item jsonb)
returns jsonb language sql immutable as $$
  select case when p_item->>'t' = 'mate' then
    jsonb_build_object(
      'tipo', 'mate', 'banco', 'mate',
      'area', case p_item->>'fin' when 'q' then 'Mate de dama' else 'Mate de dos torres' end,
      'peso', 2,
      'visible', jsonb_build_object(
        'enunciado', 'Da mate con ' || case p_item->>'fin' when 'q' then 'la dama y el rey' else 'las dos torres' end
                     || ' en menos de 2 minutos. El rey negro se defiende solo; si lo ahogas, son tablas.',
        'fen', p_item->>'f'),
      'clave', jsonb_build_object('final', p_item->>'fin', 'segundos', 120))
  else
    jsonb_build_object(
      'tipo', 'jugada', 'banco', 'tactica', 'area', p_item->>'a', 'peso', (p_item->>'p')::integer,
      'visible', jsonb_build_object(
        'enunciado', 'Juegan las ' || case split_part(p_item->>'f', ' ', 2) when 'w' then 'blancas' else 'negras' end
                     || ': ' || case when (p_item->>'m')::integer = 1 then 'encuentra el mate' else 'encuentra la mejor jugada' end || '.',
        'fen', p_item->>'f',
        'explica', (p_item->>'a') || '. La solución: ' || (p_item->>'s') || ' — Ejercicio de Lichess de dificultad ' || (p_item->>'r') || '.'),
      'clave', jsonb_build_object('jugadas',
        (select coalesce(jsonb_agg(jsonb_build_object('from', j->>0, 'to', j->>1)), '[]'::jsonb) from jsonb_array_elements(p_item->'j') j)))
  end;
$$;
revoke all on function interno.pregunta_de_rango(jsonb) from public, anon, authenticated;

-- ---------------- Armar: 10 de táctica + los mates del rango ----------------
create or replace function interno.revisar_examen_rango(p_alumno uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_pend uuid;
  v_actual text;
  v_sig text;
  v_prof uuid;
  v_examen uuid;
  v_mates integer;
begin
  if p_alumno is null or coalesce((select role from public.profiles where id = p_alumno), '') <> 'alumno' then
    return null;
  end if;
  select examen_id into v_pend from public.rango_examenes where alumno_id = p_alumno and resultado = 'pendiente';
  if v_pend is not null then
    if interno.resolver_examen_rango(v_pend) = 'pendiente' then return v_pend; end if;
  end if;

  v_actual := coalesce((select rango from public.rangos_alumno where alumno_id = p_alumno), 'peon');
  v_sig := interno.rango_siguiente(v_actual);
  if v_sig is null or interno.puntos_para_rango(p_alumno) < interno.umbral_rango(v_sig) then
    return null;
  end if;
  if not exists (select 1 from interno.rango_examen_banco where rango = v_sig and item->>'t' is null) then return null; end if;

  select x into v_prof from interno.profesores_de(p_alumno) x order by x limit 1;
  if v_prof is null then
    select a.supervisor_id into v_prof from public.academia_miembros m join public.academias a on a.id = m.academia_id
     where m.persona_id = p_alumno and a.supervisor_id is not null order by a.nombre limit 1;
  end if;
  if v_prof is null then return null; end if;

  select count(distinct item->>'fin') into v_mates from interno.rango_examen_banco where rango = v_sig and item->>'t' = 'mate';

  insert into public.examenes (profesor_id, alumno_id, titulo, instrucciones, minutos, vence_at, salidas_permitidas)
  values (v_prof, p_alumno, 'Examen de rango: ' || interno.nombre_rango(v_sig),
          'Juntaste los puntos para subir a ' || interno.nombre_rango(v_sig) || '. Diez ejercicios de táctica'
          || case when v_mates > 0 then ' y ' || v_mates || ' mates contra el rey solo, de 2 minutos cada uno' else '' end
          || '. Se aprueba con el 90 %' || case when v_mates > 0 then ' y dando todos los mates' else '' end || '. '
          || 'Si lo apruebas, subes de rango y recibes tu diploma. Si no, se te restan 500 puntos del avance y, cuando los vuelvas a juntar, te sale otra vez.',
          20 + 3 * v_mates, now() + interval '7 days', 2)
  returning id into v_examen;

  insert into public.examen_items (examen_id, orden, tipo, banco, item_id, area, peso, visible, clave)
  select v_examen, row_number() over (order by b.grupo, b.azar) - 1, q->>'tipo', q->>'banco', b.item_id, q->>'area',
         (q->>'peso')::integer, q->'visible', q->'clave'
    from (
      (select 0 grupo, random() azar, item_id, interno.pregunta_de_rango(item) q
         from interno.rango_examen_banco where rango = v_sig and item->>'t' is null order by random() limit 10)
      union all
      (select distinct on (item->>'fin') 1, random(), item_id, interno.pregunta_de_rango(item)
         from interno.rango_examen_banco where rango = v_sig and item->>'t' = 'mate' order by item->>'fin', random())
    ) b;

  insert into public.rango_examenes (examen_id, alumno_id, rango) values (v_examen, p_alumno, v_sig);
  return v_examen;
end;
$$;
revoke all on function interno.revisar_examen_rango(uuid) from public, anon, authenticated;

-- ---------------- Resolver: 90 % y todos los mates ----------------
create or replace function interno.resolver_examen_rango(p_examen uuid)
returns text language plpgsql security definer set search_path to 'public' as $$
declare
  r public.rango_examenes;
  e public.examenes;
  v_aprobo boolean;
  v_cert uuid;
  v_ac record;
  v_codigo text;
begin
  select * into r from public.rango_examenes where examen_id = p_examen and resultado = 'pendiente' for update;
  if r.examen_id is null then return null; end if;
  select * into e from public.examenes where id = p_examen;
  if e.estado <> 'entregado' and e.vence_at > now() then return 'pendiente'; end if;

  -- 90 % y, si el examen trae mates, todos dados: son obligatorios.
  v_aprobo := e.estado = 'entregado' and coalesce(e.porcentaje, 0) >= 90
    and not exists (select 1 from public.examen_items it
                     where it.examen_id = p_examen and it.tipo = 'mate'
                       and not exists (select 1 from public.examen_respuestas er where er.item_id = it.id and er.correcta));

  if v_aprobo then
    insert into public.rangos_alumno (alumno_id, rango, titulo, desde)
    values (r.alumno_id, r.rango, null, now())
    on conflict (alumno_id) do update set rango = excluded.rango,
      titulo = case when excluded.rango = 'dama_rey' then null else public.rangos_alumno.titulo end,
      desde = now();
    select a.id, a.nombre, a.logo_path into v_ac
      from public.academia_miembros m join public.academias a on a.id = m.academia_id
     where m.persona_id = r.alumno_id order by a.nombre limit 1;
    loop
      v_codigo := substr(md5(gen_random_uuid()::text), 1, 10);
      exit when not exists (select 1 from public.certificados where codigo = v_codigo);
    end loop;
    insert into public.certificados (codigo, student_id, curso, curso_titulo, lecciones, alumno_nombre,
                                     academia_id, academia_nombre, academia_logo_path, profesor_id, profesor_nombre)
    values (v_codigo, r.alumno_id, 'rango:' || r.rango, 'Rango ' || interno.nombre_rango(r.rango), 0,
            coalesce((select full_name from public.profiles where id = r.alumno_id), ''),
            v_ac.id, v_ac.nombre, v_ac.logo_path, e.profesor_id,
            coalesce((select full_name from public.profiles where id = e.profesor_id), 'Ajedrez Integral'))
    returning id into v_cert;
    update public.rango_examenes set resultado = 'aprobado', porcentaje = e.porcentaje, resuelto_at = now(), certificado_id = v_cert
     where examen_id = p_examen;
    return 'aprobado';
  else
    update public.rango_examenes set resultado = 'reprobado', porcentaje = e.porcentaje, resuelto_at = now()
     where examen_id = p_examen;
    return 'reprobado';
  end if;
end;
$$;
revoke all on function interno.resolver_examen_rango(uuid) from public, anon, authenticated;
