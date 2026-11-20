-- Las horas del taller: cuánto lleva cada asesor de las 30 horas del taller
-- «Formación Ajedrez» del MEP, y la práctica que vale por la sesión
-- presencial. Lo pidió el dueño del sitio el 16/11/2026. Ver «Las horas del
-- taller» en docs/decisiones/paneles.md.
--
-- La meta no está escrita en ningún lado: es la suma de la duración de las
-- sesiones del taller (las filas de horario_clases de sus clases con
-- desde = hasta, una por sesión). Hoy 4 × 4 h + 2 × 3 h + 8 h = 30 h.
--
-- Cada sesión cuenta, como mucho, lo que dura:
--   * en línea: el tiempo dentro de la clase en vivo (class_presence_log,
--     recortado a la hora en que la clase estuvo abierta) MÁS lo que vio de
--     la grabación, en proporción: la grabación completa vale la sesión
--     entera. Así quien faltó, o se fue antes, repone viendo la grabación;
--   * si la sesión tiene asistencia_cuenta_completa (la IV, que fue en parte
--     de prácticas fuera de la clase), quien se conectó lleva la sesión entera;
--   * presencial: solo la práctica que la persona sube y administración (o el
--     profe de la clase) aprueba. Aprobada, vale la sesión entera.

-- --------------------------------------------- la sesión que vale completa
alter table public.horario_clases
  add column asistencia_cuenta_completa boolean not null default false;
comment on column public.horario_clases.asistencia_cuenta_completa is
  'Para las horas del taller: quien se conectó a la clase en vivo de esta sesión lleva la sesión entera, aunque no haya estado todo el rato (la parte de la mañana fue de prácticas fuera de la clase).';

update public.horario_clases
   set asistencia_cuenta_completa = true
 where id = '4a04f83e-6372-4677-8a56-8d5dd8f4c189';   -- Sesión IV del MEP, 11/11/2026

-- --------------------------------------------- las prácticas
create table public.taller_practicas (
  id uuid primary key default gen_random_uuid(),
  horario_id uuid not null references public.horario_clases (id) on delete cascade,
  persona_id uuid not null references public.profiles (id) on delete cascade,
  archivos text[] not null check (cardinality(archivos) between 1 and 5),
  comentario text not null default '' check (length(comentario) <= 2000),
  estado text not null default 'enviada' check (estado in ('enviada', 'aprobada', 'devuelta')),
  nota_revision text not null default '' check (length(nota_revision) <= 2000),
  enviada_en timestamptz not null default now(),
  revisada_por uuid references public.profiles (id) on delete set null,
  revisada_en timestamptz,
  unique (horario_id, persona_id)
);
comment on table public.taller_practicas is
  'La práctica que un asesor sube por una sesión presencial del taller (una por persona y sesión). Aprobada, esa sesión cuenta entera en sus horas. La escriben taller_practica_enviar() y taller_practica_revisar(); los archivos están en el bucket privado taller-practicas, en <persona>/<id al azar>/<nombre>.';
create index taller_practicas_persona_idx on public.taller_practicas (persona_id);

alter table public.taller_practicas enable row level security;
revoke all on public.taller_practicas from public, anon, authenticated;
grant select on public.taller_practicas to authenticated;

-- La lee la persona, quien administra y el profe de esa clase. Sin política
-- de escritura: el estado lo cambian solo las dos funciones.
create policy taller_practicas_ver on public.taller_practicas
  for select to authenticated
  using (persona_id = (select auth.uid())
         or (select public.soy_admin())
         or horario_id in (select h.id from public.horario_clases h where h.profesor_id = (select auth.uid())));

-- Aprobar una práctica le da horas: queda anotado quién y cuándo.
create trigger auditar after insert or update or delete on public.taller_practicas
  for each row execute function interno.auditar('horario_id', 'persona_id', 'estado');

-- --------------------------------------------- el bucket de los archivos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('taller-practicas', 'taller-practicas', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.ms-excel',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

-- Sube a su carpeta quien es de una academia con panel de taller. La carpeta
-- se compara como texto (nunca se convierte a uuid: la política se evalúa
-- también con objetos de otros buckets).
create policy taller_practicas_subir on storage.objects
  for insert to authenticated
  with check (bucket_id = 'taller-practicas'
              and (storage.foldername(name))[1] = ((select auth.uid()))::text
              and (select public.mi_panel_taller()));
create policy taller_practicas_bajar on storage.objects
  for select to authenticated
  using (bucket_id = 'taller-practicas'
         and ((storage.foldername(name))[1] = ((select auth.uid()))::text
              or (select public.soy_admin())
              or (storage.foldername(name))[1] in (select a::text from interno.alumnos_de((select auth.uid())) a)));

-- --------------------------------------------- la cuenta, sin preguntar permiso
create or replace function interno.taller_horas_de(p_persona uuid)
returns table(horario_id uuid, titulo text, fecha date, inicio timestamptz, fin timestamptz,
              modalidad text, duracion_min integer, min_clase integer, min_grabacion integer,
              conectado boolean, completa_por_asistencia boolean, practica_estado text,
              min_contados integer)
language sql
stable
security definer
set search_path = ''
as $$
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
    select s.id as horario_id,
           least(1.0, sum(coalesce(v.visto_seg, 0))::numeric / nullif(sum(g.duracion_seg), 0)) as parte
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
$$;
revoke execute on function interno.taller_horas_de(uuid) from public, anon, authenticated;

-- --------------------------------------------- lo que pide cada pantalla
-- Las de una persona: ella misma, quien administra o su profe.
create or replace function public.taller_horas(p_persona uuid)
returns table(horario_id uuid, titulo text, fecha date, inicio timestamptz, fin timestamptz,
              modalidad text, duracion_min integer, min_clase integer, min_grabacion integer,
              conectado boolean, completa_por_asistencia boolean, practica_estado text,
              min_contados integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce(p_persona = (select auth.uid()) or public.soy_admin() or public.soy_profesor_de(p_persona), false) then
    raise exception 'No puedes ver las horas de esta persona.' using errcode = '42501';
  end if;
  return query select * from interno.taller_horas_de(p_persona);
end;
$$;
revoke execute on function public.taller_horas(uuid) from public, anon;
grant execute on function public.taller_horas(uuid) to authenticated;

-- Las de todo el taller, para la ficha Asesores (como asesores_grabaciones):
-- quien administra recibe a todos; cualquier otro, solo lo suyo.
create or replace function public.asesores_horas(p_detalle text)
returns table(persona_id uuid, horario_id uuid, titulo text, inicio timestamptz, modalidad text,
              duracion_min integer, min_clase integer, min_grabacion integer, conectado boolean,
              completa_por_asistencia boolean, practica_estado text, min_contados integer)
language sql
stable
security definer
set search_path = ''
as $$
  select ct.persona_id, x.horario_id, x.titulo, x.inicio, x.modalidad, x.duracion_min, x.min_clase,
         x.min_grabacion, x.conectado, x.completa_por_asistencia, x.practica_estado, x.min_contados
    from public.cuentas_temporales ct
    cross join lateral interno.taller_horas_de(ct.persona_id) x
   where ct.detalle = p_detalle
     and ct.vence > now()
     and coalesce(public.soy_admin() or ct.persona_id = (select auth.uid()), false)
   order by ct.persona_id, x.inicio
   limit 5000;
$$;
revoke execute on function public.asesores_horas(text) from public, anon;
grant execute on function public.asesores_horas(text) to authenticated;

-- --------------------------------------------- subir la práctica
-- Por una sesión presencial de SUS clases. Los archivos tienen que estar en
-- su carpeta del bucket. Mandarla otra vez reemplaza la anterior y vuelve a
-- quedar por revisar; una ya aprobada no se cambia.
create or replace function public.taller_practica_enviar(p_horario uuid, p_archivos text[], p_comentario text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  yo uuid := (select auth.uid());
  a text;
  v_estado text;
begin
  if yo is null then
    raise exception 'Entra con tu cuenta para subir la práctica.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.horario_clases h
                  where h.id = p_horario and h.modalidad = 'presencial'
                    and h.id in (select interno.horarios_del_alumno(yo))) then
    raise exception 'Esa sesión no es una sesión presencial de tus clases.' using errcode = '42501';
  end if;
  if p_archivos is null or cardinality(p_archivos) not between 1 and 5 then
    raise exception 'Sube entre 1 y 5 archivos.' using errcode = '22023';
  end if;
  foreach a in array p_archivos loop
    if a is null or split_part(a, '/', 1) <> yo::text or a !~ '^[0-9a-f-]{36}/[A-Za-z0-9-]{8,40}/[A-Za-z0-9._-]{1,80}$' then
      raise exception 'Un archivo no está en tu carpeta.' using errcode = '22023';
    end if;
  end loop;
  select tp.estado into v_estado from public.taller_practicas tp
   where tp.horario_id = p_horario and tp.persona_id = yo;
  if v_estado = 'aprobada' then
    raise exception 'Tu práctica ya está aprobada.' using errcode = '22023';
  end if;
  insert into public.taller_practicas (horario_id, persona_id, archivos, comentario)
  values (p_horario, yo, p_archivos, left(coalesce(p_comentario, ''), 2000))
  on conflict (horario_id, persona_id) do update
     set archivos = excluded.archivos, comentario = excluded.comentario, estado = 'enviada',
         enviada_en = now(), nota_revision = '', revisada_por = null, revisada_en = null;
  return (select tp.estado from public.taller_practicas tp
           where tp.horario_id = p_horario and tp.persona_id = yo);
end;
$$;
revoke execute on function public.taller_practica_enviar(uuid, text[], text) from public, anon;
grant execute on function public.taller_practica_enviar(uuid, text[], text) to authenticated;

-- --------------------------------------------- revisarla
-- Quien administra o el profe de esa clase. Aprobar o devolverla con una nota.
create or replace function public.taller_practica_revisar(p_id uuid, p_aprobar boolean, p_nota text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  yo uuid := (select auth.uid());
begin
  if not coalesce(public.soy_admin()
                  or exists (select 1 from public.taller_practicas tp
                               join public.horario_clases h on h.id = tp.horario_id
                              where tp.id = p_id and h.profesor_id = yo), false) then
    raise exception 'Solo administración o el profe de la clase revisa las prácticas.' using errcode = '42501';
  end if;
  if p_aprobar is null then
    raise exception 'Falta decir si se aprueba.' using errcode = '22023';
  end if;
  update public.taller_practicas
     set estado = case when p_aprobar then 'aprobada' else 'devuelta' end,
         nota_revision = left(coalesce(p_nota, ''), 2000),
         revisada_por = yo, revisada_en = now()
   where id = p_id;
  if not found then
    raise exception 'Esa práctica no existe.' using errcode = '22023';
  end if;
  return (select tp.estado from public.taller_practicas tp where tp.id = p_id);
end;
$$;
revoke execute on function public.taller_practica_revisar(uuid, boolean, text) from public, anon;
grant execute on function public.taller_practica_revisar(uuid, boolean, text) to authenticated;
