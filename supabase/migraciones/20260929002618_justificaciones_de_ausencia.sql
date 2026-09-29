-- Justificar una ausencia: el alumno cuenta por qué no llegó a clase, con un
-- texto, un documento (la constancia médica, la nota del colegio) o los dos, y
-- le llega a sus profesores, a quien lo coordina y a quien lo supervisa.
--
-- Ver «Las justificaciones de ausencia» en docs/decisiones/seguimiento-del-alumno.md.
--
-- - La tabla NO tiene política de escritura: la escriben tres funciones que
--   validan (justificar_ausencia, responder_justificacion, retirar_justificacion).
-- - Quién la LEE lo decide la RLS: el propio alumno, sus profesores y quien lo
--   tiene bajo su coordinación (coordinación, supervisión, administración). El
--   conjunto se arma una vez, nunca fila por fila.
-- - Los documentos van a un bucket PRIVADO, en la carpeta <id del alumno>/, y
--   los lee quien puede leer la justificación que los nombra.

-- --------------------------------------------------------------- la tabla
create table public.justificaciones_ausencia (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  fecha_desde date not null,
  fecha_hasta date not null,
  motivo text not null,
  detalle text not null default '',
  adjuntos jsonb not null default '[]'::jsonb,
  estado text not null default 'pendiente',
  respuesta text,
  revisada_por uuid references public.profiles(id) on delete set null,
  revisada_en timestamptz,
  -- El nombre de quien contestó, tal cual era al contestar: la RLS de profiles
  -- no le deja a la supervisión leer a todos los profesores, y «contestó
  -- alguien» no dice nada.
  revisada_por_nombre text,
  privacidad_version text not null,
  privacidad_aceptada_en timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint justificaciones_fechas check (fecha_hasta >= fecha_desde and fecha_hasta - fecha_desde <= 31),
  constraint justificaciones_motivo check (motivo in ('salud', 'cita', 'familiar', 'estudios', 'viaje', 'otro')),
  constraint justificaciones_estado check (estado in ('pendiente', 'aceptada', 'no_aceptada')),
  constraint justificaciones_detalle_largo check (char_length(detalle) <= 2000),
  constraint justificaciones_respuesta_largo check (respuesta is null or char_length(respuesta) <= 1000),
  constraint justificaciones_adjuntos_lista check (jsonb_typeof(adjuntos) = 'array' and jsonb_array_length(adjuntos) <= 5),
  constraint justificaciones_algo_dice check (btrim(detalle) <> '' or jsonb_array_length(adjuntos) > 0)
);
comment on table public.justificaciones_ausencia is
  'Por qué un alumno no llegó a clase. La escriben justificar_ausencia(), responder_justificacion() y retirar_justificacion(); ver docs/decisiones/seguimiento-del-alumno.md.';

-- Mandar dos veces la misma justificación (el doble toque, el reintento) no
-- deja dos filas: lo impide el índice, no un if.
create unique index justificaciones_una_por_dias
  on public.justificaciones_ausencia (student_id, fecha_desde, fecha_hasta);
create index justificaciones_por_fecha on public.justificaciones_ausencia (fecha_desde desc, created_at desc);
create index justificaciones_revisada_por_fk on public.justificaciones_ausencia (revisada_por);

alter table public.justificaciones_ausencia enable row level security;
revoke all on public.justificaciones_ausencia from anon;
revoke insert, update, delete, truncate on public.justificaciones_ausencia from authenticated;
grant select on public.justificaciones_ausencia to authenticated;

create policy justificaciones_select on public.justificaciones_ausencia
  for select to authenticated using (
    student_id = (select auth.uid())
    or student_id in (select interno.alumnos_de((select auth.uid())))
    or student_id in (select interno.bajo_mi_coordinacion_conjunto())
  );

-- ------------------------------------------- quién coordina a una persona
-- Lo contrario de bajo_mi_coordinacion(): los coordinadores de sus profesores y
-- los de su academia. Solo la usan las funciones de acá, para avisar.
create or replace function interno.coordinadores_de(p_persona uuid)
returns setof uuid
language sql stable security definer
set search_path = public
set row_security = off
as $$
  select c.id from public.profiles c
   where coalesce(c.es_coordinador, false)
     and c.id <> p_persona
     and (exists (select 1 from public.coordinador_profesores cp
                   where cp.coordinador_id = c.id
                     and cp.profesor_id in (select interno.profesores_de(p_persona)))
          or exists (select 1 from public.academia_miembros yo_m
                       join public.academia_miembros m on m.academia_id = yo_m.academia_id
                      where yo_m.persona_id = c.id and m.persona_id = p_persona));
$$;
revoke execute on function interno.coordinadores_de(uuid) from public, anon, authenticated;
grant execute on function interno.coordinadores_de(uuid) to service_role;

-- ------------------------------------------------------ el bucket privado
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('justificaciones', 'justificaciones', false, 10485760, array[
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

-- Sube solo a su propia carpeta.
create policy justificaciones_archivos_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'justificaciones'
    and (storage.foldername(name))[1] = ((select auth.uid()))::text
  );
-- Lee lo suyo, y lo que nombra una justificación que puede leer (la
-- subconsulta pasa por la RLS de la tabla: es la misma pregunta).
create policy justificaciones_archivos_select on storage.objects
  for select to authenticated using (
    bucket_id = 'justificaciones'
    and ((storage.foldername(name))[1] = ((select auth.uid()))::text
         or exists (select 1 from public.justificaciones_ausencia j where j.adjuntos ? objects.name))
  );
-- Borra solo lo suyo que ya no nombra ninguna justificación: el documento de
-- una que ya se mandó no se cambia por detrás.
create policy justificaciones_archivos_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'justificaciones'
    and (storage.foldername(name))[1] = ((select auth.uid()))::text
    and not exists (select 1 from public.justificaciones_ausencia j where j.adjuntos ? objects.name)
  );

-- -------------------------------------------------------------- mandarla
create or replace function public.justificar_ausencia(
  p_desde date, p_hasta date, p_motivo text, p_detalle text,
  p_adjuntos jsonb, p_privacidad text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  hoy date := (now() at time zone 'America/Costa_Rica')::date;
  v_hasta date := coalesce(p_hasta, p_desde);
  v_detalle text := btrim(coalesce(p_detalle, ''));
  v_adjuntos jsonb := coalesce(p_adjuntos, '[]'::jsonb);
  ruta text;
  v_id uuid;
  nombre text;
  destinos uuid[];
  motivo_txt text;
  dias_txt text;
begin
  if yo is null then raise exception 'Hace falta iniciar sesión.'; end if;
  if not coalesce((select p.role = 'alumno' from public.profiles p where p.id = yo), false) then
    raise exception 'Las justificaciones de ausencia las manda el alumno.';
  end if;
  if not coalesce(interno.version_legal_valida(p_privacidad), false) then
    raise exception 'Falta aceptar la política de privacidad.';
  end if;
  if p_desde is null then raise exception 'Falta el día de la ausencia.'; end if;
  if v_hasta < p_desde then raise exception 'El último día no puede ser antes del primero.'; end if;
  if v_hasta - p_desde > 31 then raise exception 'Una justificación cubre un mes como máximo. Si fueron más días, manda otra.'; end if;
  if p_desde < hoy - 120 then raise exception 'Esa ausencia es de hace más de cuatro meses. Habla directamente con tu profesor.'; end if;
  if p_desde > hoy + 60 then raise exception 'Solo se puede avisar con dos meses de anticipación como máximo.'; end if;
  if p_motivo is null or p_motivo not in ('salud', 'cita', 'familiar', 'estudios', 'viaje', 'otro') then
    raise exception 'Elige el motivo de la ausencia.';
  end if;
  if char_length(v_detalle) > 2000 then raise exception 'La explicación es muy larga: caben 2000 caracteres.'; end if;
  if jsonb_typeof(v_adjuntos) <> 'array' then raise exception 'Los documentos no llegaron bien.'; end if;
  if jsonb_array_length(v_adjuntos) > 5 then raise exception 'Caben 5 documentos como máximo.'; end if;
  if v_detalle = '' and jsonb_array_length(v_adjuntos) = 0 then
    raise exception 'Escribe por qué faltaste o adjunta un documento.';
  end if;

  -- Cada documento: de SU carpeta, con la forma que arma la página y que
  -- exista de verdad. Sin eso podría nombrar el documento de otro alumno.
  for ruta in select jsonb_array_elements_text(v_adjuntos) loop
    if ruta !~ ('^' || yo::text || '/[A-Za-z0-9-]{8,40}/[A-Za-z0-9._-]{1,80}\.(jpg|png|webp|pdf|doc|docx|xls|xlsx)$') then
      raise exception 'Un documento no llegó bien. Vuelve a elegirlo.';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'justificaciones' and o.name = ruta) then
      raise exception 'Un documento no terminó de subirse. Vuelve a intentarlo.';
    end if;
  end loop;

  begin
    insert into public.justificaciones_ausencia
      (student_id, fecha_desde, fecha_hasta, motivo, detalle, adjuntos, privacidad_version)
    values (yo, p_desde, v_hasta, p_motivo, v_detalle, v_adjuntos, p_privacidad)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Ya mandaste una justificación para esos mismos días. Si quieres cambiarla, retírala y vuelve a mandarla.';
  end;

  -- El aviso al celular: a sus profesores, a quien lo coordina y a quien lo
  -- supervisa. Un aviso que falla no deshace el envío.
  begin
    select coalesce(nullif(btrim(p.full_name), ''), 'Un alumno') into nombre from public.profiles p where p.id = yo;
    select array_agg(distinct d) into destinos from (
      select interno.profesores_de(yo) as d
      union select interno.coordinadores_de(yo)
      union select public.supervisores_de(yo)
    ) x where d is not null and d <> yo;
    motivo_txt := case p_motivo when 'salud' then 'salud' when 'cita' then 'una cita'
      when 'familiar' then 'un asunto familiar' when 'estudios' then 'el colegio o los estudios'
      when 'viaje' then 'un viaje' else 'otro motivo' end;
    dias_txt := case when v_hasta = p_desde then 'del ' || to_char(p_desde, 'DD/MM/YYYY')
      else 'del ' || to_char(p_desde, 'DD/MM') || ' al ' || to_char(v_hasta, 'DD/MM/YYYY') end;
    perform public.avisar_push(destinos, 'Justificación de ausencia',
      nombre || ' justificó su ausencia ' || dias_txt || ' por ' || motivo_txt || '.',
      '/justificaciones.html', 'justificacion-' || v_id::text);
  exception when others then
    raise warning 'No salió el aviso de la justificación %: %', v_id, sqlerrm;
  end;
  return v_id;
end;
$$;
revoke execute on function public.justificar_ausencia(date, date, text, text, jsonb, text) from public, anon;
grant execute on function public.justificar_ausencia(date, date, text, text, jsonb, text) to authenticated;

-- ----------------------------------------------------------- contestarla
create or replace function public.responder_justificacion(p_id uuid, p_estado text, p_respuesta text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  j public.justificaciones_ausencia;
  v_resp text := nullif(btrim(coalesce(p_respuesta, '')), '');
  quien text;
begin
  select * into j from public.justificaciones_ausencia where id = p_id;
  if not found then raise exception 'Esa justificación ya no existe.'; end if;
  if yo is null or j.student_id = yo
     or not coalesce(public.soy_profesor_de(j.student_id) or public.bajo_mi_coordinacion(j.student_id), false) then
    raise exception 'Solo la contestan los profesores, la coordinación o la supervisión de ese alumno.';
  end if;
  if p_estado is null or p_estado not in ('pendiente', 'aceptada', 'no_aceptada') then
    raise exception 'Elige si la aceptas o no.';
  end if;
  if char_length(coalesce(v_resp, '')) > 1000 then raise exception 'La respuesta es muy larga: caben 1000 caracteres.'; end if;

  update public.justificaciones_ausencia
     set estado = p_estado,
         respuesta = v_resp,
         revisada_por = case when p_estado = 'pendiente' and v_resp is null then null else yo end,
         revisada_en = case when p_estado = 'pendiente' and v_resp is null then null else now() end,
         revisada_por_nombre = case when p_estado = 'pendiente' and v_resp is null then null
           else (select coalesce(nullif(btrim(p.full_name), ''), 'Sin nombre') from public.profiles p where p.id = yo) end
   where id = p_id;

  if p_estado <> 'pendiente' then
    begin
      select coalesce(nullif(btrim(p.full_name), ''), 'Tu profesor') into quien from public.profiles p where p.id = yo;
      perform public.avisar_push(array[j.student_id], 'Tu justificación de ausencia',
        quien || case when p_estado = 'aceptada' then ' aceptó' else ' no aceptó' end
          || ' tu justificación del ' || to_char(j.fecha_desde, 'DD/MM/YYYY') || '.',
        '/justificaciones.html', 'justificacion-' || j.id::text);
    exception when others then
      raise warning 'No salió el aviso de la respuesta %: %', p_id, sqlerrm;
    end;
  end if;
end;
$$;
revoke execute on function public.responder_justificacion(uuid, text, text) from public, anon;
grant execute on function public.responder_justificacion(uuid, text, text) to authenticated;

-- ------------------------------------------------------------ retirarla
-- Solo el alumno, y solo mientras nadie la contestó. Devuelve los documentos
-- que nombraba, para que la página los borre (ya sin fila que los nombre, la
-- política de Storage lo deja).
create or replace function public.retirar_justificacion(p_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_adj jsonb;
begin
  delete from public.justificaciones_ausencia
   where id = p_id and student_id = auth.uid() and estado = 'pendiente' and revisada_por is null
  returning adjuntos into v_adj;
  if v_adj is null then
    raise exception 'Solo se puede retirar una justificación tuya que todavía no te han contestado.';
  end if;
  return v_adj;
end;
$$;
revoke execute on function public.retirar_justificacion(uuid) from public, anon;
grant execute on function public.retirar_justificacion(uuid) to authenticated;

-- ------------------------------------------------- la lista, ya ordenada
-- Lo que les llegó a los profesores, la coordinación y la supervisión: de a
-- una página, con el total en cada fila (PostgREST corta a mil). INVOKER: lo
-- que se ve lo sigue decidiendo la RLS de la tabla y la de profiles.
create or replace function public.justificaciones_recibidas(
  p_estado text default null, p_busqueda text default null,
  p_limite int default 50, p_desde int default 0)
returns table (
  id uuid, student_id uuid, alumno text, grupo text,
  fecha_desde date, fecha_hasta date, motivo text, detalle text, adjuntos jsonb,
  estado text, respuesta text, revisada_por_nombre text, revisada_en timestamptz,
  created_at timestamptz, total bigint)
language sql stable security invoker
set search_path = public
as $$
  select j.id, j.student_id, coalesce(nullif(btrim(p.full_name), ''), 'Sin nombre'), p.grupo,
         j.fecha_desde, j.fecha_hasta, j.motivo, j.detalle, j.adjuntos,
         j.estado, j.respuesta, j.revisada_por_nombre, j.revisada_en, j.created_at,
         count(*) over ()
    from public.justificaciones_ausencia j
    left join public.profiles p on p.id = j.student_id
   where j.student_id <> (select auth.uid())
     and (p_estado is null or j.estado = p_estado)
     and (p_busqueda is null or btrim(p_busqueda) = ''
          or p.full_name ilike '%' || btrim(p_busqueda) || '%')
   order by j.fecha_desde desc, j.created_at desc
   limit least(greatest(coalesce(p_limite, 50), 1), 200)
   offset greatest(coalesce(p_desde, 0), 0);
$$;
revoke execute on function public.justificaciones_recibidas(text, text, int, int) from public, anon;
grant execute on function public.justificaciones_recibidas(text, text, int, int) to authenticated;

-- Cuántas esperan respuesta: el número del panel, contado en la base.
create or replace function public.justificaciones_pendientes()
returns bigint
language sql stable security invoker
set search_path = public
as $$
  select count(*) from public.justificaciones_ausencia j
   where j.estado = 'pendiente' and j.student_id <> (select auth.uid());
$$;
revoke execute on function public.justificaciones_pendientes() from public, anon;
grant execute on function public.justificaciones_pendientes() to authenticated;