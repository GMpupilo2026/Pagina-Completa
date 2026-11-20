-- Los tramos sin clase de cada grabación (recesos, silencios, esperas) no se
-- le exigen a nadie: quien los salta no pierde nada.
--
-- El dueño lo pidió el 17/11/2026, después de que una asesora reportara haber
-- visto la Sesión III completa y tuviera 89 %: lo que le faltaba era el
-- receso, los primeros minutos de espera y los silencios en que solo hablaban
-- los participantes (su micrófono no quedó en la grabación).
--
-- La regla: lo visto ÚTIL es lo visto menos los tramos sin clase, y la
-- duración ÚTIL es la del video menos esos tramos. El porcentaje, el «✓ La
-- viste completa» y las horas del taller salen de esas dos. Lo que se vio de
-- un receso no suma, y saltarlo no resta. Quien no vio nada sigue en 0: no se
-- regalan los tramos sin clase.
--
-- grabaciones_vistas no cambia: guarda lo que corrió de verdad, y su
-- visto_seg (columna generada) sigue siendo lo visto en bruto. Lo útil se
-- calcula al leer (interno.segundos_utiles), porque depende de otra tabla y
-- cambia si se corrigen los tramos sin clase: no se guarda.

-- 1. Los tramos, en la grabación. Vacío = todo el video es clase.
alter table public.grabaciones_clase
  add column sin_clase int4multirange not null default '{}';
comment on column public.grabaciones_clase.sin_clase is
  'Tramos [desde, hasta) en segundos del video sin clase (recesos, silencios, esperas): no cuentan ni en lo visto ni en la duración útil. Los pone grabacion_sin_clase_poner().';

-- 2. Lo visto útil: lo visto menos lo sin clase, dentro del video.
create function interno.segundos_utiles(p_vistos int4multirange, p_sin_clase int4multirange, p_duracion integer)
 returns integer
 language sql
 immutable parallel safe
 set search_path to ''
as $function$
  select interno.segundos_vistos(
    (coalesce(p_vistos, '{}'::pg_catalog.int4multirange) - coalesce(p_sin_clase, '{}'::pg_catalog.int4multirange))
    * pg_catalog.int4multirange(pg_catalog.int4range(0, coalesce(p_duracion, 86400))));
$function$;
revoke execute on function interno.segundos_utiles(int4multirange, int4multirange, integer) from public, anon, authenticated;
comment on function interno.segundos_utiles(int4multirange, int4multirange, integer) is
  'Segundos de p_vistos fuera de p_sin_clase y dentro de [0, p_duracion). Con p_vistos = el video entero da la duración útil.';

-- Los tramos como lista [[desde, hasta], …] para la página.
create function interno.tramos_jsonb(p_tramos int4multirange)
 returns jsonb
 language sql
 immutable parallel safe
 set search_path to ''
as $function$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(lower(r), upper(r)) order by lower(r)), '[]'::jsonb)
    from pg_catalog.unnest(p_tramos) r;
$function$;
revoke execute on function interno.tramos_jsonb(int4multirange) from public, anon, authenticated;

-- Los tramos de al menos p_min segundos (lo demás es el redondeo de las
-- puntas al medir, no algo que falte ver).
create function interno.tramos_largos(p_tramos int4multirange, p_min integer)
 returns int4multirange
 language sql
 immutable parallel safe
 set search_path to ''
as $function$
  select coalesce(pg_catalog.range_agg(r), '{}'::pg_catalog.int4multirange)
    from pg_catalog.unnest(p_tramos) r
   where upper(r) - lower(r) >= p_min;
$function$;
revoke execute on function interno.tramos_largos(int4multirange, integer) from public, anon, authenticated;

-- 3. Quién los pone: quien administra o el profe de esa clase, como la
-- grabación. Deja la lista EXACTAMENTE como llega (vacía = todo es clase).
create function public.grabacion_sin_clase_poner(p_horario uuid, p_fecha date, p_tramos jsonb, p_parte integer default 1)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_profesor uuid;
  v_fin integer;
  v_tramo jsonb;
  v_desde integer;
  v_hasta integer;
  v_sin int4multirange := '{}';
begin
  select h.profesor_id into v_profesor from public.horario_clases h where h.id = p_horario;
  if not coalesce(public.soy_admin() or (v_profesor is not null and v_profesor = (select auth.uid())), false) then
    raise exception 'Solo el profe de esa clase o quien administra marca lo que no es clase.' using errcode = '42501';
  end if;
  select g.duracion_seg into v_fin
    from public.grabaciones_clase g where g.horario_id = p_horario and g.fecha = p_fecha and g.parte = p_parte;
  if not found then
    raise exception 'Esa clase no tiene grabación.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_tramos) is distinct from 'array' or jsonb_array_length(p_tramos) > 50 then
    raise exception 'Los tramos van en una lista de [desde, hasta], de a lo sumo 50.' using errcode = '22023';
  end if;
  for v_tramo in select t from jsonb_array_elements(p_tramos) t loop
    if jsonb_typeof(v_tramo) is distinct from 'array' or jsonb_array_length(v_tramo) <> 2
       or (v_tramo->>0) !~ '^[0-9]{1,6}$' or (v_tramo->>1) !~ '^[0-9]{1,6}$' then
      raise exception 'Cada tramo es [desde, hasta], en segundos enteros.' using errcode = '22023';
    end if;
    v_desde := (v_tramo->>0)::integer;
    v_hasta := (v_tramo->>1)::integer;
    if v_desde >= v_hasta or (v_fin is not null and v_hasta > v_fin) then
      raise exception 'El tramo % a % no cabe en el video.', v_desde, v_hasta using errcode = '22023';
    end if;
    v_sin := v_sin + int4multirange(int4range(v_desde, v_hasta));
  end loop;

  update public.grabaciones_clase g set sin_clase = v_sin
   where g.horario_id = p_horario and g.fecha = p_fecha and g.parte = p_parte;

  return (select interno.tramos_jsonb(g.sin_clase) from public.grabaciones_clase g
           where g.horario_id = p_horario and g.fecha = p_fecha and g.parte = p_parte);
end;
$function$;
revoke execute on function public.grabacion_sin_clase_poner(uuid, date, jsonb, integer) from public, anon;
grant execute on function public.grabacion_sin_clase_poner(uuid, date, jsonb, integer) to authenticated;

-- 4. mis_grabaciones(): además, la duración útil, lo visto útil de quien
-- pregunta, los tramos sin clase (para el botón «Saltar») y lo que le FALTA
-- ver (lo útil que no vio, en tramos de 20 segundos o más): al abrir, el video
-- sigue donde le falta, y la ventana lista lo que le queda. Un asesor
-- contaba que el video le arrancaba siempre del principio y tenía que buscar
-- a mano dónde iba; otra, que lo veía todo y le decía que llevaba menos,
-- sin saber qué partes le faltaban. Cambia lo que
-- devuelve, así que se vuelve a crear (no tiene parámetros: no hay dos
-- funciones con el mismo nombre que confundir).
drop function public.mis_grabaciones();
create function public.mis_grabaciones()
 returns table(horario_id uuid, fecha date, parte smallint, inicio timestamp with time zone, fin timestamp with time zone, titulo text, modalidad text, youtube_id text, tema text, duracion_seg integer, util_seg integer, visto_seg integer, sin_clase jsonb, faltan jsonb)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select g.horario_id, g.fecha, g.parte, o.inicio, o.fin, nullif(btrim(h.titulo), ''), o.modalidad, g.youtube_id, g.tema, g.duracion_seg,
         case when g.duracion_seg is null then null
              else interno.segundos_utiles(int4multirange(int4range(0, g.duracion_seg)), g.sin_clase, g.duracion_seg) end,
         interno.segundos_utiles(v.vistos, g.sin_clase, g.duracion_seg),
         interno.tramos_jsonb(g.sin_clase),
         case when g.duracion_seg is null then '[]'::jsonb
              else interno.tramos_jsonb(interno.tramos_largos(
                     int4multirange(int4range(0, g.duracion_seg)) - g.sin_clase - coalesce(v.vistos, '{}'), 20)) end
    from public.grabaciones_clase g
    join public.horario_clases h on h.id = g.horario_id
    cross join lateral public.ocurrencias_horario(h.profesor_id, g.fecha, g.fecha) o
    left join public.grabaciones_vistas v
      on v.horario_id = g.horario_id and v.fecha = g.fecha and v.parte = g.parte and v.persona_id = (select auth.uid())
   where g.horario_id in (select interno.horarios_del_alumno((select auth.uid())))
     and o.horario_id = g.horario_id
   order by o.inicio, g.parte
   limit 100;
$function$;
revoke execute on function public.mis_grabaciones() from public, anon;
grant execute on function public.mis_grabaciones() to authenticated;

-- 5. grabacion_vista_anotar(): lo mismo de antes, pero devuelve lo visto útil
-- (lo que la tarjeta pinta). El tope de «más video del que da el tiempo»
-- sigue contando lo que corrió en bruto.
create or replace function public.grabacion_vista_anotar(p_horario uuid, p_fecha date, p_tramos jsonb, p_parte integer default 1)
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
  if not isempty(v_nuevos) then
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
  end if;

  -- Lo visto útil, leído de la tabla.
  return coalesce((select interno.segundos_utiles(v.vistos, g.sin_clase, g.duracion_seg)
                     from public.grabaciones_vistas v
                     join public.grabaciones_clase g on g.horario_id = v.horario_id and g.fecha = v.fecha and g.parte = v.parte
                    where v.horario_id = p_horario and v.fecha = p_fecha and v.parte = p_parte and v.persona_id = v_yo), 0);
end;
$function$;

-- 6. asesores_grabaciones(): la duración útil aparte, y visto_seg es lo
-- visto útil. Cambia lo que devuelve: se vuelve a crear.
drop function public.asesores_grabaciones(text);
create function public.asesores_grabaciones(p_detalle text)
 returns table(persona_id uuid, horario_id uuid, fecha date, parte smallint, titulo text, inicio timestamp with time zone, duracion_seg integer, util_seg integer, visto_seg integer, ultima_vez timestamp with time zone)
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
    select g.horario_id, g.fecha, g.parte, g.duracion_seg, g.sin_clase, nullif(btrim(h.titulo), '') as titulo, o.inicio
      from public.grabaciones_clase g
      join public.horario_clases h on h.id = g.horario_id
      cross join lateral public.ocurrencias_horario(h.profesor_id, g.fecha, g.fecha) o
     where o.horario_id = g.horario_id
  )
  select p.persona_id, gr.horario_id, gr.fecha, gr.parte, gr.titulo, gr.inicio, gr.duracion_seg,
         case when gr.duracion_seg is null then null
              else interno.segundos_utiles(int4multirange(int4range(0, gr.duracion_seg)), gr.sin_clase, gr.duracion_seg) end,
         coalesce(interno.segundos_utiles(v.vistos, gr.sin_clase, gr.duracion_seg), 0), v.ultima_vez
    from gente p
    join grabadas gr on gr.horario_id in (select interno.horarios_del_alumno(p.persona_id))
    left join public.grabaciones_vistas v
      on v.horario_id = gr.horario_id and v.fecha = gr.fecha and v.parte = gr.parte and v.persona_id = p.persona_id
   order by gr.inicio, gr.parte, p.persona_id
   limit 5000;
$function$;
revoke execute on function public.asesores_grabaciones(text) from public, anon;
grant execute on function public.asesores_grabaciones(text) to authenticated;

-- 7. Las horas del taller: la grabación cuenta lo visto útil entre la
-- duración útil (sumando las partes). Lo demás, igual.
create or replace function interno.taller_horas_de(p_persona uuid)
 returns table(horario_id uuid, titulo text, fecha date, inicio timestamp with time zone, fin timestamp with time zone, modalidad text, duracion_min integer, min_clase integer, min_grabacion integer, conectado boolean, completa_por_asistencia boolean, practica_estado text, min_contados integer)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with ses as (
    select h.id, nullif(btrim(h.titulo), '') as titulo, h.desde as fecha, o.inicio, o.fin,
           coalesce(h.modalidad, 'en_linea') as modalidad, h.duracion_min, h.profesor_id,
           h.asistencia_cuenta_completa
      from public.horario_clases h
      cross join lateral public.ocurrencias_horario(h.profesor_id, h.desde, h.desde) o
     where h.id in (select interno.horarios_del_alumno(p_persona))
       and h.desde is not null and h.desde = h.hasta
       and o.horario_id = h.id
  ), clase as (
    -- La clase en vivo de cada sesión: la que abrió ese profe desde dos horas
    -- antes de la hora de inicio hasta la de fin.
    select s.id as horario_id, c.id as clase_id, c.started_at,
           coalesce(c.ended_at, least(now(), s.fin + interval '2 hours')) as cerrada
      from ses s
      join public.class_sessions c
        on c.created_by = s.profesor_id
       and c.started_at >= s.inicio - interval '2 hours' and c.started_at < s.fin
  ), tramos as (
    select k.horario_id,
           array_agg(row(k.horario_id::text, greatest(p.joined_at, k.started_at),
                         case when p.left_at is null then null else least(p.left_at, k.cerrada) end
                        )::public.tramo_crudo) as t
      from clase k
      join public.class_presence_log p on p.session_id = k.clase_id and p.student_id = p_persona
     where p.joined_at < k.cerrada
       and coalesce(p.left_at, p.joined_at) >= k.started_at
     group by k.horario_id
  ), en_clase as (
    select (m.particion)::uuid as horario_id, m.minutos
      from tramos, public.minutos_por_tramos(tramos.t) m
  ), video as (
    -- Lo visto útil entre la duración útil: los tramos sin clase no cuentan
    -- ni para lo visto ni para lo que había que ver.
    select s.id as horario_id,
           least(1.0, sum(interno.segundos_utiles(v.vistos, g.sin_clase, g.duracion_seg))::numeric
                      / nullif(sum(interno.segundos_utiles(pg_catalog.int4multirange(pg_catalog.int4range(0, g.duracion_seg)), g.sin_clase, g.duracion_seg)), 0)) as parte
      from ses s
      join public.grabaciones_clase g on g.horario_id = s.id and g.fecha = s.fecha
      left join public.grabaciones_vistas v
        on v.horario_id = g.horario_id and v.fecha = g.fecha and v.parte = g.parte and v.persona_id = p_persona
     group by s.id
  ), cuenta as (
    select s.*,
           least(s.duracion_min, floor(coalesce(e.minutos, 0)))::integer as m_clase,
           round(coalesce(v.parte, 0) * s.duracion_min)::integer as m_video,
           exists (select 1 from clase k join public.class_attendance a
                     on a.session_id = k.clase_id and a.student_id = p_persona
                    where k.horario_id = s.id) as conectado,
           (select tp.estado from public.taller_practicas tp
             where tp.horario_id = s.id and tp.persona_id = p_persona) as practica
      from ses s
      left join en_clase e on e.horario_id = s.id
      left join video v on v.horario_id = s.id
  )
  select c.id, c.titulo, c.fecha, c.inicio, c.fin, c.modalidad, c.duracion_min,
         c.m_clase, c.m_video, c.conectado,
         (c.asistencia_cuenta_completa and c.conectado),
         c.practica,
         case
           when c.modalidad = 'presencial' then case when c.practica = 'aprobada' then c.duracion_min else 0 end
           when c.asistencia_cuenta_completa and c.conectado then c.duracion_min
           else least(c.duracion_min, c.m_clase + c.m_video)
         end
    from cuenta c
   order by c.inicio;
$function$;

-- 8. Los tramos de cada grabación, medidos con UNA regla para todas: silencio
-- de 30 s o más bajo −30 dB (herramientas/grabaciones-silencios.js, corrido el
-- 17/11/2026 en la computadora del dueño sobre el audio de los 8 videos),
-- juntando los pedazos a menos de un minuto entre sí, más lo que las notas de
-- los subtítulos marcan sin clase aunque tenga sonido (los «avisos» de
-- herramientas/datos/formacion-grabaciones.json: el problema técnico y la
-- charla después del receso de la Sesión I, y los bordes de los recesos y
-- silencios de las sesiones II y III). Ninguno pisa una pregunta dentro del
-- video. La Sesión IV parte 1 y las tres partes de la V no tienen silencios
-- largos: la grabación se detuvo en los recesos (por eso quedaron en partes).
update public.grabaciones_clase set sin_clase = '{[961,1080),[4879,4913),[5201,5232),[7912,8861)}'
 where horario_id = '8d26f704-74d1-4668-9f86-6e30a8fda4bc' and fecha = '2026-10-12' and parte = 1;  -- Sesión I: 0:16:01-0:18:00 (problema técnico), 1:21:19, 1:26:41 (silencios) y 2:11:52-2:27:41 (receso y charla)
update public.grabaciones_clase set sin_clase = '{[6594,7445),[10912,11244)}'
 where horario_id = '2eb6d88b-81d0-4627-82f2-3f27fe27dc5f' and fecha = '2026-10-20' and parte = 1;  -- Sesión II: recesos 1:49:54-2:04:05 y 3:01:52-3:07:24
update public.grabaciones_clase set sin_clase = '{[1413,1471),[1657,1746),[2215,2328),[3570,4117),[9468,9510),[11010,11059),[11557,11636)}'
 where horario_id = 'a7b2516d-c9b5-4e42-ad4c-6f78532e147c' and fecha = '2026-10-29' and parte = 1;  -- Sesión III: receso 0:59:30-1:08:37 y silencios largos
update public.grabaciones_clase set sin_clase = '{[5862,5897)}'
 where horario_id = '4a04f83e-6372-4677-8a56-8d5dd8f4c189' and fecha = '2026-11-11' and parte = 2;  -- Sesión IV parte 2: silencio 1:37:42-1:38:17
