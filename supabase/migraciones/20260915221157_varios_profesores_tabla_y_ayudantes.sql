-- Un alumno puede tener VARIOS profesores.
--
-- Hasta ahora la relación era una sola columna, profiles.teacher_id, y de ahí
-- colgaban 68 políticas de RLS. Ahora la verdad de "quién es profesor de quién"
-- vive en esta tabla, y teacher_id se queda con un trabajo más chico y bien
-- definido: el PROFESOR PRINCIPAL — el que lo invitó, o el primero que le
-- asignaron. Es el que viene preseleccionado cuando el alumno entra a clase, y
-- nada más: ningún permiso se decide con él.
create table if not exists public.profile_teachers (
  student_id uuid not null references public.profiles(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (student_id, teacher_id),
  constraint profile_teachers_no_uno_mismo check (student_id <> teacher_id)
);
create index if not exists profile_teachers_teacher_idx on public.profile_teachers (teacher_id);

comment on table public.profile_teachers is
  'Qué profesores tiene cada alumno. Es la verdad para los permisos; profiles.teacher_id solo guarda cuál es el principal.';

-- Se llena con lo que hay hoy. Solo alumnos: un profesor con teacher_id puesto
-- (pasaba) no es alumno de nadie, y tratarlo como tal le daba de regalo la clase
-- entera del otro por la regla de "compañeros".
insert into public.profile_teachers (student_id, teacher_id)
select p.id, p.teacher_id
from public.profiles p
where p.role = 'alumno' and p.teacher_id is not null and p.teacher_id <> p.id
on conflict do nothing;

alter table public.profile_teachers enable row level security;

-- Se puede leer para saber con quién tiene uno que ver; escribir, nadie desde el
-- navegador: lo hacen las Edge Functions con la service role, igual que el cupo
-- de invitaciones. Sin política de insert/update/delete no hay forma de que un
-- alumno se apunte con otro profesor.
drop policy if exists profile_teachers_select on public.profile_teachers;
create policy profile_teachers_select on public.profile_teachers
  for select using (
    student_id = auth.uid()
    or teacher_id = auth.uid()
    or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
  );

-- ---------------------------------------------------------------- ayudantes
-- Son SECURITY DEFINER por la misma razón que my_profile(): las usa la RLS de
-- profiles, así que si pasaran por la RLS de profiles se morderían la cola.

create or replace function public.soy_profesor_de(p_alumno uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profile_teachers pt
    where pt.student_id = p_alumno and pt.teacher_id = auth.uid()
  );
$$;

create or replace function public.soy_profesor_de_alguno(p_alumnos uuid[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profile_teachers pt
    where pt.student_id = any (p_alumnos) and pt.teacher_id = auth.uid()
  );
$$;

-- Para los insert de partidas: TODOS los jugadores tienen que ser alumnos míos.
create or replace function public.soy_profesor_de_todos(p_alumnos uuid[])
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from unnest(p_alumnos) as j(id)
    where j.id is not null
      and not exists (select 1 from public.profile_teachers pt
                      where pt.student_id = j.id and pt.teacher_id = auth.uid())
  );
$$;

create or replace function public.es_mi_profesor(p_profe uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_profe is not null and exists (
    select 1 from public.profile_teachers pt
    where pt.student_id = auth.uid() and pt.teacher_id = p_profe
  );
$$;

-- Compañeros de clase: compartimos al menos un profesor. Solo los alumnos
-- figuran como student_id, así que un profesor nunca es "compañero" de nadie.
create or replace function public.es_companero(p_otro uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.profile_teachers yo
    join public.profile_teachers otro on otro.teacher_id = yo.teacher_id
    where yo.student_id = auth.uid() and otro.student_id = p_otro
  );
$$;

comment on function public.soy_profesor_de(uuid) is 'Quien llama es uno de los profesores de ese alumno.';
comment on function public.es_mi_profesor(uuid) is 'Ese uuid es uno de los profesores de quien llama.';
comment on function public.es_companero(uuid) is 'Quien llama y esa persona comparten al menos un profesor.';

revoke execute on function public.soy_profesor_de(uuid) from public, anon;
revoke execute on function public.soy_profesor_de_alguno(uuid[]) from public, anon;
revoke execute on function public.soy_profesor_de_todos(uuid[]) from public, anon;
revoke execute on function public.es_mi_profesor(uuid) from public, anon;
revoke execute on function public.es_companero(uuid) from public, anon;
grant execute on function public.soy_profesor_de(uuid) to authenticated;
grant execute on function public.soy_profesor_de_alguno(uuid[]) to authenticated;
grant execute on function public.soy_profesor_de_todos(uuid[]) to authenticated;
grant execute on function public.es_mi_profesor(uuid) to authenticated;
grant execute on function public.es_companero(uuid) to authenticated;