-- Un alumno puede estar en varios equipos y un equipo puede tener cualquier
-- cantidad de entrenadores (sin límite artificial). "profiles.grupo" (texto
-- libre, uno solo, sin efecto en permisos) NO se toca: sigue siendo la
-- etiqueta organizativa de siempre. "equipos" es el sistema nuevo, real, con
-- dos tablas puente (muchos a muchos) y efecto directo en permisos: estar en
-- un equipo cuyo entrenador es X le da a X los mismos permisos que ya le da
-- profile_teachers, sin escribir en esa tabla (evita el problema de sincronía
-- que tuvo el contador de invitaciones).

create table public.equipos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index equipos_nombre_unico on public.equipos (lower(trim(nombre)));

create table public.equipo_alumnos (
  equipo_id uuid not null references public.equipos(id) on delete cascade,
  alumno_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (equipo_id, alumno_id)
);
create index equipo_alumnos_alumno_idx on public.equipo_alumnos (alumno_id);

create table public.equipo_entrenadores (
  equipo_id uuid not null references public.equipos(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (equipo_id, teacher_id)
);
create index equipo_entrenadores_teacher_idx on public.equipo_entrenadores (teacher_id);

alter table public.equipos enable row level security;
alter table public.equipo_alumnos enable row level security;
alter table public.equipo_entrenadores enable row level security;

-- Solo lectura por RLS: igual que profile_teachers, nadie escribe estas tres
-- tablas desde el navegador — lo hace la Edge Function admin-manage-users
-- con la service role.
create policy equipos_select on public.equipos for select
using (
  public.soy_coordinador()
  or exists (select 1 from public.equipo_entrenadores ee where ee.equipo_id = equipos.id and ee.teacher_id = auth.uid())
  or exists (select 1 from public.equipo_alumnos ea where ea.equipo_id = equipos.id and ea.alumno_id = auth.uid())
);

create policy equipo_alumnos_select on public.equipo_alumnos for select
using (
  public.soy_coordinador()
  or alumno_id = auth.uid()
  or exists (select 1 from public.equipo_entrenadores ee where ee.equipo_id = equipo_alumnos.equipo_id and ee.teacher_id = auth.uid())
);

create policy equipo_entrenadores_select on public.equipo_entrenadores for select
using (
  public.soy_coordinador()
  or teacher_id = auth.uid()
  or exists (select 1 from public.equipo_alumnos ea where ea.equipo_id = equipo_entrenadores.equipo_id and ea.alumno_id = auth.uid())
);

-- Las dos preguntas de siempre ("¿quiénes son los profesores de este
-- alumno?" / "¿de quiénes es profesor este profesor?"), ahora como la unión
-- de la asignación directa (profile_teachers) y la que da pertenecer a un
-- equipo con ese entrenador. profesores_de()/alumnos_de() son la ÚNICA
-- fuente de esa unión: soy_profesor_de(), es_mi_profesor(),
-- soy_profesor_de_alguno(), soy_profesor_de_todos(), es_companero(),
-- mis_clases(), alumnos_del_profesor(), avisar_clase_abierta() y
-- pueden_jugar_entre_si() se reescriben sobre estas dos, nunca leen
-- profile_teachers o equipo_* directo — el mismo principio que ya regía
-- para profile_teachers sola.
create or replace function public.profesores_de(p_alumno uuid)
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select teacher_id from public.profile_teachers where student_id = p_alumno
  union
  select ee.teacher_id
  from public.equipo_alumnos ea
  join public.equipo_entrenadores ee on ee.equipo_id = ea.equipo_id
  where ea.alumno_id = p_alumno;
$$;

create or replace function public.alumnos_de(p_profesor uuid)
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select student_id from public.profile_teachers where teacher_id = p_profesor
  union
  select ea.alumno_id
  from public.equipo_entrenadores ee
  join public.equipo_alumnos ea on ea.equipo_id = ee.equipo_id
  where ee.teacher_id = p_profesor;
$$;

create or replace function public.soy_profesor_de(p_alumno uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select auth.uid() in (select public.profesores_de(p_alumno));
$$;

create or replace function public.es_mi_profesor(p_profe uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select p_profe is not null and p_profe in (select public.profesores_de(auth.uid()));
$$;

create or replace function public.soy_profesor_de_alguno(p_alumnos uuid[])
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from unnest(p_alumnos) as j(id)
    where j.id is not null and auth.uid() in (select public.profesores_de(j.id))
  );
$$;

create or replace function public.soy_profesor_de_todos(p_alumnos uuid[])
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select not exists (
    select 1 from unnest(p_alumnos) as j(id)
    where j.id is not null and auth.uid() not in (select public.profesores_de(j.id))
  );
$$;

create or replace function public.es_companero(p_otro uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select pr from public.profesores_de(auth.uid()) pr
    intersect
    select pr from public.profesores_de(p_otro) pr
  );
$$;

create or replace function public.puedo_armar_partida_con(p_jugadores uuid[])
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  -- Quien administra arma partidas con cualquiera; el profesor, con sus
  -- alumnos (directos o de un equipo suyo) y consigo mismo. Cualquier otro
  -- rol, con nadie.
  select (select is_admin from public.my_profile())
     or (
       (select role from public.my_profile()) = 'profesor'
       and not exists (
         select 1 from unnest(p_jugadores) as j(id)
         where j.id is not null
           and j.id <> auth.uid()
           and auth.uid() not in (select public.profesores_de(j.id))
       )
     );
$function$;

create or replace function public.pueden_jugar_entre_si(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select a is distinct from b and (
    exists (select 1 from public.profiles p where p.id in (a, b) and p.is_admin)
    or b in (select public.profesores_de(a))
    or a in (select public.profesores_de(b))
    or exists (
      select pr from public.profesores_de(a) pr
      intersect
      select pr from public.profesores_de(b) pr
    )
  );
$$;

create or replace function public.alumnos_del_profesor(p_profesor uuid)
returns table(id uuid, full_name text, email text, grupo text)
language sql
stable
set search_path to 'public'
as $$
  select p.id, p.full_name, p.email, p.grupo
  from public.profiles p
  where p.role = 'alumno' and p.id in (select public.alumnos_de(p_profesor))
  order by coalesce(nullif(p.full_name, ''), p.email) collate "es-CR-x-icu";
$$;

create or replace function public.mis_clases()
returns table(profesor_id uuid, profesor text, es_principal boolean, clase_abierta boolean, titulo_clase text)
language sql
stable
set search_path to 'public'
as $$
  select pr.id as profesor_id,
         coalesce(nullif(pr.full_name, ''), pr.email) as profesor,
         pr.id = yo.teacher_id as es_principal,
         cs.id is not null as clase_abierta,
         cs.title
  from public.profiles yo
  join public.profiles pr on pr.id in (select public.profesores_de(auth.uid()))
  left join lateral (
    select c.id, c.title from public.class_sessions c
    where c.created_by = pr.id and c.ended_at is null
    order by c.started_at desc nulls last limit 1
  ) cs on true
  where yo.id = auth.uid()
  order by (pr.id = yo.teacher_id) desc, 2;
$$;

create or replace function public.avisar_clase_abierta()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  alumnos uuid[];
  profe   text;
begin
  select array_agg(a) into alumnos from public.alumnos_de(new.created_by) as a;
  if alumnos is null then return new; end if;

  select coalesce(p.full_name, 'Tu profe') into profe
    from public.profiles p where p.id = new.created_by;

  perform public.avisar_push(
    alumnos,
    'Empezó la clase',
    profe || ' abrió la sesión en vivo. Entra cuando puedas.',
    '/sesion.html',
    'clase-abierta');
  return new;
end;
$function$;
