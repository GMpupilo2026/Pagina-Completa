-- La encuesta anónima de un curso, pensada para que la conteste una persona
-- ciega con su lector de pantalla y SIN iniciar sesión.
--
-- Es para cursos de gente que empezó sabiendo 0 de ajedrez: si siguen yendo o
-- lo dejaron (y por qué), cómo enseñó el profesor (si empezó de lo más básico,
-- si describía el tablero con palabras, el ritmo, si guió paso a paso, si el
-- material funcionó con el lector de pantalla), hasta dónde aprendieron, si
-- fue lo bastante básico, y qué esperaban frente a lo que encontraron.
--
-- ANÓNIMA DE VERDAD: la fila no guarda quién contestó —ni auth.uid() aunque
-- haya sesión, ni la IP, ni la hora: solo el DÍA—. La IP pasa por el freno de
-- envíos públicos, que la borra a los dos días, y nunca se junta con la
-- respuesta.
--
-- Quien administra crea una encuesta por curso (`encuestas_curso`) y comparte
-- su enlace: encuesta-curso.html?e=<slug>. El público no toca las tablas: lee
-- con encuesta_curso_publica() y escribe con responder_encuesta_curso(), las
-- dos SECURITY DEFINER, como formulario_publico()/responder_formulario().
--
-- Ver «La encuesta anónima de un curso» en docs/decisiones/cuentas-y-formularios.md.

create table public.encuestas_curso (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{6,60}$'),
  curso text not null check (char_length(btrim(curso)) between 3 and 140),
  profesor_id uuid references public.profiles(id) on delete set null,
  abierta boolean not null default true,
  creado_por uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
comment on table public.encuestas_curso is
  'Una encuesta anónima por curso (encuesta-curso.html?e=<slug>). La administra quien administra; el público solo la lee con encuesta_curso_publica().';

create table public.encuesta_curso_respuestas (
  id uuid primary key default gen_random_uuid(),
  encuesta_id uuid not null references public.encuestas_curso(id) on delete cascade,
  -- Solo el día, en hora de Costa Rica: la hora exacta ayudaría a saber quién fue.
  fecha date not null default ((now() at time zone 'America/Costa_Rica')::date),
  asistencia text not null check (asistencia in ('termino', 'sigue', 'a_veces', 'dejo')),
  motivos text[] not null default '{}'
    check (motivos <@ array['horario', 'rapido', 'no_entendia', 'no_accesible', 'tecnologia', 'personal', 'expectativa', 'otro']),
  motivo_otro text not null default '' check (char_length(motivo_otro) <= 500),
  -- La metodología, del 1 al 5. NULL = «No sé o no llegué a verlo».
  desde_cero smallint check (desde_cero between 1 and 5),
  describe smallint check (describe between 1 and 5),
  ritmo smallint check (ritmo between 1 and 5),
  dudas smallint check (dudas between 1 and 5),
  guia smallint check (guia between 1 and 5),
  accesible smallint check (accesible between 1 and 5),
  aprendizaje text not null check (aprendizaje in ('nada', 'piezas', 'reglas', 'ideas')),
  suficiente text not null check (suficiente in ('si', 'a_veces', 'no')),
  recomendaria text not null check (recomendaria in ('si', 'tal_vez', 'no')),
  expectativas text not null default '' check (char_length(expectativas) <= 2000),
  realidad text not null default '' check (char_length(realidad) <= 2000),
  comentario text not null default '' check (char_length(comentario) <= 2000),
  privacidad_version text not null,
  privacidad_aceptada_en timestamptz not null default now()
);
comment on table public.encuesta_curso_respuestas is
  'Respuestas ANÓNIMAS de encuesta-curso.html: sin cuenta, sin IP y solo con el día. Solo las escribe responder_encuesta_curso(); las lee quien administra.';
create index encuesta_curso_respuestas_encuesta on public.encuesta_curso_respuestas (encuesta_id, fecha);

alter table public.encuestas_curso enable row level security;
alter table public.encuesta_curso_respuestas enable row level security;
revoke all on public.encuestas_curso from public, anon, authenticated;
revoke all on public.encuesta_curso_respuestas from public, anon, authenticated;
grant select, insert, update, delete on public.encuestas_curso to authenticated;
grant select on public.encuesta_curso_respuestas to authenticated;

-- Las encuestas: las arma y las cierra quien administra.
create policy encuestas_curso_admin on public.encuestas_curso
  for all to authenticated
  using ((select public.soy_admin()))
  with check ((select public.soy_admin()));
-- Las respuestas: solo se leen, y solo quien administra. Nadie las escribe
-- desde el navegador: pasa por la función de abajo.
create policy encuesta_curso_respuestas_ver on public.encuesta_curso_respuestas
  for select to authenticated
  using ((select public.soy_admin()));

-- ---- el freno: un tipo nuevo, 'encuesta' ----
create or replace function interno.frenar_envio_publico(p_tipo text, p_ambito text, p_correo text, p_ip text default null)
 returns text
 language plpgsql
 set search_path to 'public'
as $function$
declare
  cab jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_ip text := nullif(btrim(coalesce(
                 p_ip,
                 cab->>'cf-connecting-ip',
                 cab->>'x-real-ip',
                 split_part(cab->>'x-forwarded-for', ',', 1))), '');
  v_correo text := nullif(lower(btrim(coalesce(p_correo, ''))), '');
  v_ambito text := left(coalesce(p_ambito, ''), 200);
  -- Topes: por IP en una hora, por correo en el período, total por hora.
  tope_ip int;  tope_correo int;  periodo_correo interval;  tope_total int;
begin
  case p_tipo
    when 'formulario' then tope_ip := 40; tope_correo := null; periodo_correo := null;              tope_total := 300;
    when 'arbitraje'  then tope_ip := 40; tope_correo := 10;   periodo_correo := interval '1 hour'; tope_total := 200;
    when 'solicitud'  then tope_ip := 5;  tope_correo := 3;    periodo_correo := interval '1 day';  tope_total := 30;
    -- Cada prueba es una cuenta nueva con 3 días de Academia: el tope por IP
    -- es chico. Un colegio sale por una sola IP, pero la prueba es de una
    -- persona que decide si compra, no de un grupo (el grupo se arma con un
    -- paquete).
    when 'prueba'     then tope_ip := 3;  tope_correo := null; periodo_correo := null;              tope_total := 40;
    -- La encuesta anónima de un curso: como un formulario. Un grupo entero
    -- puede contestar desde la misma conexión (un aula, una asociación).
    when 'encuesta'   then tope_ip := 40; tope_correo := null; periodo_correo := null;              tope_total := 300;
    else raise exception 'tipo de envío desconocido: %', p_tipo;
  end case;

  -- Dos envíos a la vez del mismo tipo no se cuentan uno al otro por fuera.
  perform pg_advisory_xact_lock(hashtext('envios_publicos:' || p_tipo));

  if v_ip is not null and (select count(*) from interno.envios_publicos
        where tipo = p_tipo and ip = v_ip and creado > now() - interval '1 hour') >= tope_ip then
    return 'Llegaron demasiados envíos seguidos desde tu conexión. Espera un rato e intenta de nuevo.';
  end if;

  if v_correo is not null and tope_correo is not null and (select count(*) from interno.envios_publicos
        where tipo = p_tipo and correo = v_correo and creado > now() - periodo_correo) >= tope_correo then
    return 'Ya recibimos varios envíos con este correo. Espera un rato antes de mandar otro.';
  end if;

  if (select count(*) from interno.envios_publicos
        where tipo = p_tipo and ambito = v_ambito and creado > now() - interval '1 hour') >= tope_total then
    return 'Este formulario está recibiendo demasiados envíos en este momento. Intenta de nuevo en una hora.';
  end if;

  insert into interno.envios_publicos (tipo, ambito, ip, correo)
  values (p_tipo, v_ambito, v_ip, v_correo);

  -- Lo de hace más de dos días ya no cuenta para ningún tope.
  delete from interno.envios_publicos where creado < now() - interval '2 days';
  return null;
end;
$function$;
revoke execute on function interno.frenar_envio_publico(text, text, text, text) from public, anon, authenticated;

-- ---- lo que ve el público: el curso y si está abierta, nada más ----
create or replace function public.encuesta_curso_publica(p_slug text)
 returns table(curso text, profesor text, abierta boolean)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select e.curso,
         nullif(btrim(p.full_name), ''),
         e.abierta
    from public.encuestas_curso e
    left join public.profiles p on p.id = e.profesor_id
   where e.slug = p_slug;
$function$;
revoke execute on function public.encuesta_curso_publica(text) from public;
grant execute on function public.encuesta_curso_publica(text) to anon, authenticated;

-- ---- contestar: sin cuenta, anónima ----
create or replace function public.responder_encuesta_curso(p_slug text, p_respuestas jsonb, p_version_privacidad text DEFAULT NULL::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  e record;
  r jsonb := p_respuestas;
  v_motivos text[];
  v_nota jsonb;
  clave text;
  freno text;
begin
  if not coalesce(interno.version_legal_valida(p_version_privacidad), false) then
    return jsonb_build_object('ok', false, 'error', 'Falta aceptar el uso de los datos (la casilla de la Política de privacidad).');
  end if;
  if jsonb_typeof(r) is distinct from 'object' or length(r::text) > 12000 then
    return jsonb_build_object('ok', false, 'error', 'Las respuestas llegaron con un formato inválido.');
  end if;

  select * into e from public.encuestas_curso where slug = p_slug and abierta;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Esta encuesta ya no está recibiendo respuestas.');
  end if;

  if coalesce(r->>'asistencia', '') not in ('termino', 'sigue', 'a_veces', 'dejo') then
    return jsonb_build_object('ok', false, 'error', 'Falta contestar la pregunta 1: cómo va tu asistencia al curso.');
  end if;
  if jsonb_typeof(coalesce(r->'motivos', '[]'::jsonb)) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'Los motivos llegaron con un formato inválido.');
  end if;
  select coalesce(array_agg(distinct m), '{}') into v_motivos
    from jsonb_array_elements_text(coalesce(r->'motivos', '[]'::jsonb)) m;
  if not v_motivos <@ array['horario', 'rapido', 'no_entendia', 'no_accesible', 'tecnologia', 'personal', 'expectativa', 'otro'] then
    return jsonb_build_object('ok', false, 'error', 'Un motivo no es de la lista.');
  end if;
  -- Cada nota: del 1 al 5, o null («No sé o no llegué a verlo»). Que la
  -- clave falte no vale: la pregunta hay que contestarla, aunque sea con «No sé».
  foreach clave in array array['desde_cero', 'describe', 'ritmo', 'dudas', 'guia', 'accesible'] loop
    v_nota := r->clave;
    if v_nota is null
       or not (v_nota = 'null'::jsonb
               or (jsonb_typeof(v_nota) = 'number' and (v_nota #>> '{}') in ('1', '2', '3', '4', '5'))) then
      return jsonb_build_object('ok', false, 'error', 'Falta contestar una pregunta sobre la forma de enseñar (' || clave || ').');
    end if;
  end loop;
  if coalesce(r->>'aprendizaje', '') not in ('nada', 'piezas', 'reglas', 'ideas') then
    return jsonb_build_object('ok', false, 'error', 'Falta contestar hasta dónde aprendiste.');
  end if;
  if coalesce(r->>'suficiente', '') not in ('si', 'a_veces', 'no') then
    return jsonb_build_object('ok', false, 'error', 'Falta contestar si el curso fue lo bastante básico.');
  end if;
  if coalesce(r->>'recomendaria', '') not in ('si', 'tal_vez', 'no') then
    return jsonb_build_object('ok', false, 'error', 'Falta contestar si recomendarías el curso.');
  end if;

  -- El tope es por encuesta: una inundada no frena a las demás.
  freno := interno.frenar_envio_publico('encuesta', e.id::text, null);
  if freno is not null then
    return jsonb_build_object('ok', false, 'error', freno);
  end if;

  -- Sin auth.uid() y sin IP: la respuesta no dice de quién es.
  insert into public.encuesta_curso_respuestas
    (encuesta_id, asistencia, motivos, motivo_otro, desde_cero, describe, ritmo, dudas, guia, accesible,
     aprendizaje, suficiente, recomendaria, expectativas, realidad, comentario,
     privacidad_version, privacidad_aceptada_en)
  values (e.id, r->>'asistencia', v_motivos, left(btrim(coalesce(r->>'motivo_otro', '')), 500),
          (r->>'desde_cero')::smallint, (r->>'describe')::smallint, (r->>'ritmo')::smallint,
          (r->>'dudas')::smallint, (r->>'guia')::smallint, (r->>'accesible')::smallint,
          r->>'aprendizaje', r->>'suficiente', r->>'recomendaria',
          left(btrim(coalesce(r->>'expectativas', '')), 2000), left(btrim(coalesce(r->>'realidad', '')), 2000),
          left(btrim(coalesce(r->>'comentario', '')), 2000),
          p_version_privacidad, now());

  return jsonb_build_object('ok', true);
end;
$function$;
revoke execute on function public.responder_encuesta_curso(text, jsonb, text) from public;
grant execute on function public.responder_encuesta_curso(text, jsonb, text) to anon, authenticated;

-- ---- el resumen de una encuesta: las cuentas, en la base ----
-- INVOKER: la RLS decide (solo quien administra ve respuestas).
create or replace function public.resumen_encuesta_curso(p_encuesta uuid)
 returns jsonb
 language sql
 stable
 security invoker
 set search_path to 'public'
as $function$
  with r as (select * from public.encuesta_curso_respuestas where encuesta_id = p_encuesta)
  select jsonb_build_object(
    'respuestas', (select count(*) from r),
    'asistencia', (select coalesce(jsonb_object_agg(asistencia, n), '{}') from (select asistencia, count(*) n from r group by 1) x),
    'motivos', (select coalesce(jsonb_object_agg(m, n), '{}') from (select m, count(*) n from r, unnest(r.motivos) m group by 1) x),
    'aprendizaje', (select coalesce(jsonb_object_agg(aprendizaje, n), '{}') from (select aprendizaje, count(*) n from r group by 1) x),
    'suficiente', (select coalesce(jsonb_object_agg(suficiente, n), '{}') from (select suficiente, count(*) n from r group by 1) x),
    'recomendaria', (select coalesce(jsonb_object_agg(recomendaria, n), '{}') from (select recomendaria, count(*) n from r group by 1) x),
    'notas', (select jsonb_build_object(
        'desde_cero', jsonb_build_object('promedio', round(avg(desde_cero), 1), 'n', count(desde_cero)),
        'describe',   jsonb_build_object('promedio', round(avg(describe), 1),   'n', count(describe)),
        'ritmo',      jsonb_build_object('promedio', round(avg(ritmo), 1),      'n', count(ritmo)),
        'dudas',      jsonb_build_object('promedio', round(avg(dudas), 1),      'n', count(dudas)),
        'guia',       jsonb_build_object('promedio', round(avg(guia), 1),       'n', count(guia)),
        'accesible',  jsonb_build_object('promedio', round(avg(accesible), 1),  'n', count(accesible)))
      from r)
  );
$function$;
revoke execute on function public.resumen_encuesta_curso(uuid) from public, anon;
grant execute on function public.resumen_encuesta_curso(uuid) to authenticated;
