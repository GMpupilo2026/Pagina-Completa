-- Una sesión puede tener su grabación en varias partes. Lo pidió el dueño: la
-- Sesión IV del taller «Formación Ajedrez» se subió a YouTube en dos videos
-- («Sesión 4 Parte 1» y «Parte 2»), y la tabla guardaba UN video por clase
-- (horario + fecha): poner la parte 2 habría borrado la 1.
--
-- La grabación pasa a ser de (horario, fecha, parte). `parte` va de 1 a 9 y es
-- 1 por omisión, así que todo lo que ya estaba (las sesiones I a III, sus
-- vistas y sus respuestas) queda como la parte 1, sin tocar ninguna fila, y
-- quien llame sin parte sigue hablando de la parte 1.
--
-- Lo que cuelga de una grabación también lleva su parte, porque cada parte es
-- otro video: cuánto vio cada uno (grabaciones_vistas) y lo que contestó a las
-- preguntas que la pausan (grabacion_respuestas). Sus llaves foráneas apuntan
-- ahora a (horario, fecha, parte). Las preguntas siguen siendo por video
-- (grabacion_preguntas, por youtube_id): no cambian.
--
-- Las seis funciones que hablan de una grabación cambian de forma (un
-- parámetro o una columna más), y en Postgres eso pide borrarlas: con el
-- parámetro nuevo con valor por omisión, la vieja y la nueva serían dos
-- funciones y una llamada sin parte no sabría a cuál ir. Como en
-- 20261021051602, no se borran: se apartan con otro nombre («_apartada2») y
-- sin permiso para nadie, y las nuevas toman su lugar. No las llama nadie;
-- cualquier migración posterior puede borrarlas.
--
-- No reparte permisos, accesos ni dinero: no lleva bitácora.
--
-- Ver «Una sesión en varias partes» en docs/decisiones/paneles.md.

-- 1. La parte, en la grabación y en lo que cuelga de ella.
alter table public.grabaciones_clase
  add column parte smallint not null default 1 check (parte between 1 and 9);
alter table public.grabaciones_vistas add column parte smallint not null default 1;
alter table public.grabacion_respuestas add column parte smallint not null default 1;

alter table public.grabaciones_vistas drop constraint grabaciones_vistas_horario_id_fecha_fkey;
alter table public.grabacion_respuestas drop constraint grabacion_respuestas_horario_id_fecha_fkey;

alter table public.grabaciones_clase drop constraint grabaciones_clase_pkey;
alter table public.grabaciones_clase add primary key (horario_id, fecha, parte);
alter table public.grabaciones_vistas drop constraint grabaciones_vistas_pkey;
alter table public.grabaciones_vistas add primary key (horario_id, fecha, parte, persona_id);
alter table public.grabacion_respuestas drop constraint grabacion_respuestas_pkey;
alter table public.grabacion_respuestas add primary key (horario_id, fecha, parte, persona_id, n);

alter table public.grabaciones_vistas
  add foreign key (horario_id, fecha, parte) references public.grabaciones_clase(horario_id, fecha, parte) on delete cascade;
alter table public.grabacion_respuestas
  add foreign key (horario_id, fecha, parte) references public.grabaciones_clase(horario_id, fecha, parte) on delete cascade;

comment on column public.grabaciones_clase.parte is
  'Qué parte de la grabación de esa clase es este video (1 a 9; 1 si la clase quedó en un solo video).';

-- 2. Las funciones de antes, apartadas.
alter function public.mis_grabaciones() rename to mis_grabaciones_apartada2;
revoke execute on function public.mis_grabaciones_apartada2() from public, anon, authenticated;
comment on function public.mis_grabaciones_apartada2() is 'Apartada: la reemplazó mis_grabaciones() con la parte. No la llama nadie; se puede borrar.';

alter function public.grabacion_clase_poner(uuid, date, text, text, integer) rename to grabacion_clase_poner_apartada2;
revoke execute on function public.grabacion_clase_poner_apartada2(uuid, date, text, text, integer) from public, anon, authenticated;
comment on function public.grabacion_clase_poner_apartada2(uuid, date, text, text, integer) is 'Apartada: la reemplazó grabacion_clase_poner() con la parte. No la llama nadie; se puede borrar.';

alter function public.grabacion_vista_anotar(uuid, date, jsonb) rename to grabacion_vista_anotar_apartada2;
revoke execute on function public.grabacion_vista_anotar_apartada2(uuid, date, jsonb) from public, anon, authenticated;
comment on function public.grabacion_vista_anotar_apartada2(uuid, date, jsonb) is 'Apartada: la reemplazó grabacion_vista_anotar() con la parte. No la llama nadie; se puede borrar.';

alter function public.grabacion_pregunta_responder(uuid, date, integer, integer) rename to grabacion_pregunta_responder_apartada2;
revoke execute on function public.grabacion_pregunta_responder_apartada2(uuid, date, integer, integer) from public, anon, authenticated;
comment on function public.grabacion_pregunta_responder_apartada2(uuid, date, integer, integer) is 'Apartada: la reemplazó grabacion_pregunta_responder() con la parte. No la llama nadie; se puede borrar.';

alter function public.asesores_grabaciones(text) rename to asesores_grabaciones_apartada2;
revoke execute on function public.asesores_grabaciones_apartada2(text) from public, anon, authenticated;
comment on function public.asesores_grabaciones_apartada2(text) is 'Apartada: la reemplazó asesores_grabaciones() con la parte. No la llama nadie; se puede borrar.';

alter function public.asesores_preguntas_video(text) rename to asesores_preguntas_video_apartada2;
revoke execute on function public.asesores_preguntas_video_apartada2(text) from public, anon, authenticated;
comment on function public.asesores_preguntas_video_apartada2(text) is 'Apartada: la reemplazó asesores_preguntas_video() con la parte. No la llama nadie; se puede borrar.';

-- 3. Las nuevas: lo mismo de antes, con la parte.

-- Las grabaciones de las clases que me tocan, en orden de clase y de parte.
create function public.mis_grabaciones()
 returns table(horario_id uuid, fecha date, parte smallint, inicio timestamp with time zone, fin timestamp with time zone, titulo text, modalidad text, youtube_id text, tema text, duracion_seg integer)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select g.horario_id, g.fecha, g.parte, o.inicio, o.fin, nullif(btrim(h.titulo), ''), o.modalidad, g.youtube_id, g.tema, g.duracion_seg
    from public.grabaciones_clase g
    join public.horario_clases h on h.id = g.horario_id
    cross join lateral public.ocurrencias_horario(h.profesor_id, g.fecha, g.fecha) o
   where g.horario_id in (select interno.horarios_del_alumno((select auth.uid())))
     and o.horario_id = g.horario_id
   order by o.inicio, g.parte
   limit 100;
$function$;
revoke execute on function public.mis_grabaciones() from public, anon;
grant execute on function public.mis_grabaciones() to authenticated;

-- Pone (o cambia) una parte de la grabación de una clase; el enlace vacío la
-- quita. Sin parte, es la 1.
create function public.grabacion_clase_poner(p_horario uuid, p_fecha date, p_video text, p_tema text default null, p_duracion_seg integer default null, p_parte integer default 1)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_profesor uuid;
  v_texto text := btrim(coalesce(p_video, ''));
  v_tema text := nullif(btrim(coalesce(p_tema, '')), '');
  v_parte smallint;
  v_id text;
begin
  select h.profesor_id into v_profesor from public.horario_clases h where h.id = p_horario;
  if not coalesce(public.soy_admin() or (v_profesor is not null and v_profesor = (select auth.uid())), false) then
    raise exception 'Solo el profe de esa clase o quien administra pone su grabación.' using errcode = '42501';
  end if;
  if v_profesor is null then
    raise exception 'Esa clase ya no está en el horario.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.ocurrencias_horario(v_profesor, p_fecha, p_fecha) o where o.horario_id = p_horario) then
    raise exception 'Ese día no hay clase en ese horario.' using errcode = '22023';
  end if;
  if p_parte is null or p_parte not between 1 and 9 then
    raise exception 'La parte va de 1 a 9.' using errcode = '22023';
  end if;
  v_parte := p_parte;

  if v_texto = '' then
    delete from public.grabaciones_clase where horario_id = p_horario and fecha = p_fecha and parte = v_parte;
    return null;
  end if;

  if v_texto ~ '^[A-Za-z0-9_-]{11}$' then
    v_id := v_texto;
  elsif v_texto ~* '^(https?://)?([a-z0-9-]+\.)*(youtube\.com|youtube-nocookie\.com|youtu\.be)/' then
    v_id := substring(v_texto from '(?:youtu\.be/|[?&]v=|/(?:embed|live|shorts)/)([A-Za-z0-9_-]{11})(?:[^A-Za-z0-9_-]|$)');
  end if;
  if v_id is null then
    raise exception 'Ese enlace no es de un video de YouTube.' using errcode = '22023';
  end if;
  if v_tema is not null and char_length(v_tema) not between 2 and 120 then
    raise exception 'El tema va de 2 a 120 caracteres.' using errcode = '22023';
  end if;
  if p_duracion_seg is not null and p_duracion_seg not between 1 and 86400 then
    raise exception 'La duración va en segundos, de 1 a 86 400.' using errcode = '22023';
  end if;

  insert into public.grabaciones_clase (horario_id, fecha, parte, youtube_id, tema, duracion_seg, puesta_por)
  values (p_horario, p_fecha, v_parte, v_id, v_tema, p_duracion_seg, (select auth.uid()))
  on conflict (horario_id, fecha, parte) do update
    set youtube_id = excluded.youtube_id, tema = excluded.tema, duracion_seg = excluded.duracion_seg,
        puesta_por = excluded.puesta_por, puesta_en = now();

  return (select g.youtube_id from public.grabaciones_clase g where g.horario_id = p_horario and g.fecha = p_fecha and g.parte = v_parte);
end;
$function$;
revoke execute on function public.grabacion_clase_poner(uuid, date, text, text, integer, integer) from public, anon;
grant execute on function public.grabacion_clase_poner(uuid, date, text, text, integer, integer) to authenticated;

-- Lo que vio de una parte (sin parte, la 1). Igual que antes en todo lo demás.
create function public.grabacion_vista_anotar(p_horario uuid, p_fecha date, p_tramos jsonb, p_parte integer default 1)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_yo uuid := (select auth.uid());
  v_fin integer;
  v_tramo jsonb;
  v_desde integer;
  v_hasta integer;
  v_nuevos int4multirange := '{}';
  v_antes int4multirange;
  v_ultima timestamptz;
  v_tope numeric;
begin
  if not coalesce(v_yo is not null and p_horario in (select interno.horarios_del_alumno(v_yo)), false) then
    raise exception 'Esa grabación no es de una clase tuya.' using errcode = '42501';
  end if;
  select coalesce(g.duracion_seg, 86400) into v_fin
    from public.grabaciones_clase g where g.horario_id = p_horario and g.fecha = p_fecha and g.parte = p_parte;
  if v_fin is null then
    raise exception 'Esa clase no tiene grabación.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_tramos) is distinct from 'array' or jsonb_array_length(p_tramos) > 200 then
    raise exception 'Los tramos van en una lista de [desde, hasta], de a lo sumo 200.' using errcode = '22023';
  end if;

  for v_tramo in select t from jsonb_array_elements(p_tramos) t loop
    if jsonb_typeof(v_tramo) is distinct from 'array' or jsonb_array_length(v_tramo) <> 2
       or (v_tramo->>0) !~ '^[0-9]{1,6}$' or (v_tramo->>1) !~ '^[0-9]{1,6}$' then
      raise exception 'Cada tramo es [desde, hasta], en segundos enteros.' using errcode = '22023';
    end if;
    v_desde := (v_tramo->>0)::integer;
    v_hasta := least((v_tramo->>1)::integer, v_fin);
    if v_desde < v_hasta then
      v_nuevos := v_nuevos + int4multirange(int4range(v_desde, v_hasta));
    end if;
  end loop;

  select v.vistos, v.ultima_vez into v_antes, v_ultima
    from public.grabaciones_vistas v
   where v.horario_id = p_horario and v.fecha = p_fecha and v.parte = p_parte and v.persona_id = v_yo
   for update;
  if isempty(v_nuevos) then
    return coalesce(interno.segundos_vistos(v_antes), 0);
  end if;

  -- La página manda cada 30 segundos: a velocidad doble son 60 de video.
  v_tope := case when v_ultima is null then 120
                 else least(86400, 2 * extract(epoch from (now() - v_ultima)) + 60) end;
  if interno.segundos_vistos(coalesce(v_antes, '{}') + v_nuevos) - coalesce(interno.segundos_vistos(v_antes), 0) > v_tope then
    raise exception 'Eso es más video del que da el tiempo para verlo.' using errcode = '22023';
  end if;

  insert into public.grabaciones_vistas as v (horario_id, fecha, parte, persona_id, vistos)
  values (p_horario, p_fecha, p_parte, v_yo, v_nuevos)
  on conflict (horario_id, fecha, parte, persona_id) do update
    set vistos = v.vistos + excluded.vistos, ultima_vez = now();

  return (select v.visto_seg from public.grabaciones_vistas v
           where v.horario_id = p_horario and v.fecha = p_fecha and v.parte = p_parte and v.persona_id = v_yo);
end;
$function$;
revoke execute on function public.grabacion_vista_anotar(uuid, date, jsonb, integer) from public, anon;
grant execute on function public.grabacion_vista_anotar(uuid, date, jsonb, integer) to authenticated;

-- Contestar una pregunta de una parte (sin parte, la 1). Igual que antes.
create function public.grabacion_pregunta_responder(p_horario uuid, p_fecha date, p_n integer, p_opcion integer, p_parte integer default 1)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_yo uuid := (select auth.uid());
  v_alumno boolean;
  v_video text;
  v_correcta smallint;
  v_elegida smallint;
  v_acerto boolean;
begin
  if p_opcion is null or p_opcion not between 0 and 3 or p_n is null or p_n not between 1 and 50 then
    raise exception 'La respuesta es una opción de la A a la D de una pregunta del video.' using errcode = '22023';
  end if;
  v_alumno := coalesce(v_yo is not null and p_horario in (select interno.horarios_del_alumno(v_yo)), false);
  if not coalesce(v_alumno or public.soy_admin()
                  or exists (select 1 from public.horario_clases h where h.id = p_horario and h.profesor_id = v_yo), false) then
    raise exception 'Esa grabación no es de una clase tuya.' using errcode = '42501';
  end if;
  select g.youtube_id into v_video from public.grabaciones_clase g
   where g.horario_id = p_horario and g.fecha = p_fecha and g.parte = p_parte;
  if v_video is null then
    raise exception 'Esa clase no tiene grabación.' using errcode = '22023';
  end if;
  select q.correcta into v_correcta from public.grabacion_preguntas q where q.youtube_id = v_video and q.n = p_n;
  if v_correcta is null then
    raise exception 'Ese video no tiene esa pregunta.' using errcode = '22023';
  end if;

  if not v_alumno then
    -- Quien administra o el profe de la clase la prueba: se le contesta, no se anota.
    return jsonb_build_object('correcta', v_correcta, 'elegida', p_opcion, 'acerto', p_opcion = v_correcta, 'anotada', false);
  end if;

  insert into public.grabacion_respuestas (horario_id, fecha, parte, persona_id, n, elegida, acerto)
  values (p_horario, p_fecha, p_parte, v_yo, p_n, p_opcion, p_opcion = v_correcta)
  on conflict (horario_id, fecha, parte, persona_id, n) do nothing;

  -- Lo que vale es la primera vez: se lee de la tabla, no de lo que llegó.
  select r.elegida, r.acerto into v_elegida, v_acerto
    from public.grabacion_respuestas r
   where r.horario_id = p_horario and r.fecha = p_fecha and r.parte = p_parte and r.persona_id = v_yo and r.n = p_n;
  return jsonb_build_object('correcta', v_correcta, 'elegida', v_elegida, 'acerto', v_acerto, 'anotada', true,
                            'primera_vez', v_elegida = p_opcion);
end;
$function$;
revoke execute on function public.grabacion_pregunta_responder(uuid, date, integer, integer, integer) from public, anon;
grant execute on function public.grabacion_pregunta_responder(uuid, date, integer, integer, integer) to authenticated;

-- La ficha Asesores: una fila por persona y parte grabada de sus clases.
create function public.asesores_grabaciones(p_detalle text)
 returns table(persona_id uuid, horario_id uuid, fecha date, parte smallint, titulo text, inicio timestamp with time zone, duracion_seg integer, visto_seg integer, ultima_vez timestamp with time zone)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  with gente as (
    select ct.persona_id
      from public.cuentas_temporales ct
     where ct.detalle = p_detalle
       and ct.vence > now()
       and coalesce(public.soy_admin() or ct.persona_id = (select auth.uid()), false)
  ), grabadas as (
    select g.horario_id, g.fecha, g.parte, g.duracion_seg, nullif(btrim(h.titulo), '') as titulo, o.inicio
      from public.grabaciones_clase g
      join public.horario_clases h on h.id = g.horario_id
      cross join lateral public.ocurrencias_horario(h.profesor_id, g.fecha, g.fecha) o
     where o.horario_id = g.horario_id
  )
  select p.persona_id, gr.horario_id, gr.fecha, gr.parte, gr.titulo, gr.inicio, gr.duracion_seg,
         coalesce(v.visto_seg, 0), v.ultima_vez
    from gente p
    join grabadas gr on gr.horario_id in (select interno.horarios_del_alumno(p.persona_id))
    left join public.grabaciones_vistas v
      on v.horario_id = gr.horario_id and v.fecha = gr.fecha and v.parte = gr.parte and v.persona_id = p.persona_id
   order by gr.inicio, gr.parte, p.persona_id
   limit 5000;
$function$;
revoke execute on function public.asesores_grabaciones(text) from public, anon;
grant execute on function public.asesores_grabaciones(text) to authenticated;

-- La ficha Asesores: las preguntas de cada parte grabada que las tiene.
create function public.asesores_preguntas_video(p_detalle text)
 returns table(persona_id uuid, horario_id uuid, fecha date, parte smallint, total integer, respondidas integer, aciertos integer)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  with gente as (
    select ct.persona_id
      from public.cuentas_temporales ct
     where ct.detalle = p_detalle
       and ct.vence > now()
       and coalesce(public.soy_admin() or ct.persona_id = (select auth.uid()), false)
  ), grabadas as (
    select g.horario_id, g.fecha, g.parte, count(q.n)::integer as total
      from public.grabaciones_clase g
      join public.grabacion_preguntas q on q.youtube_id = g.youtube_id
     group by g.horario_id, g.fecha, g.parte
  )
  select p.persona_id, gr.horario_id, gr.fecha, gr.parte, gr.total,
         count(r.n)::integer, count(r.n) filter (where r.acerto)::integer
    from gente p
    join grabadas gr on gr.horario_id in (select interno.horarios_del_alumno(p.persona_id))
    left join public.grabacion_respuestas r
      on r.horario_id = gr.horario_id and r.fecha = gr.fecha and r.parte = gr.parte and r.persona_id = p.persona_id
   group by p.persona_id, gr.horario_id, gr.fecha, gr.parte, gr.total
   limit 5000;
$function$;
revoke execute on function public.asesores_preguntas_video(text) from public, anon;
grant execute on function public.asesores_preguntas_video(text) to authenticated;
