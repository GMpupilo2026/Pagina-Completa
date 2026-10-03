-- Sacar a un alumno de la clase en vivo (por si alguien entró por error; ver
-- «Sacar a un alumno de la clase» en docs/decisiones/clase-en-vivo.md).
--
--  * clase_sacados: un renglón por clase y alumno sacado. No tiene política de
--    escritura: la escriben sacar_de_la_clase() y dejar_volver_a_la_clase(),
--    que comprueban que quien llama es el dueño de la clase (o administra).
--  * Mientras esté sacado, la base le rechaza a ese alumno, en esa clase, la
--    asistencia, el tiempo en clase, las respuestas a las preguntas y los
--    resultados del calentamiento (políticas restrictivas). La pantalla lo
--    saca al instante, pero quien decide es esto: una consola no lo salta.
--  * No se borra nada: dejarlo volver marca devuelto_at (y sacarlo de nuevo
--    la vuelve a dejar en nulo). Lo que ya hizo antes de que lo sacaran
--    (asistencia, respuestas) se queda: si el profe se equivocó y lo deja
--    volver, no pierde nada.
set local lock_timeout = '8s';

create table if not exists public.clase_sacados (
  class_session_id uuid not null references public.class_sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  devuelto_at timestamptz,
  primary key (class_session_id, student_id)
);
create index if not exists clase_sacados_alumno on public.clase_sacados (student_id);
alter table public.clase_sacados enable row level security;

-- ¿Puede quien llama sacar gente de esta clase? El dueño o quien administra.
create or replace function interno.puedo_sacar_de(p_clase uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select mp.is_admin from public.my_profile() mp)
    or exists (select 1 from public.class_sessions cs
                where cs.id = p_clase and cs.created_by = (select auth.uid())),
    false);
$$;
revoke execute on function interno.puedo_sacar_de(uuid) from public, anon;
grant execute on function interno.puedo_sacar_de(uuid) to authenticated;

-- ¿Sacaron a quien llama de esta clase? (para las políticas restrictivas)
create or replace function interno.me_sacaron_de(p_clase uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_clase is not null and exists (
    select 1 from public.clase_sacados s
     where s.class_session_id = p_clase and s.student_id = (select auth.uid())
       and s.devuelto_at is null);
$$;
revoke execute on function interno.me_sacaron_de(uuid) from public, anon;
grant execute on function interno.me_sacaron_de(uuid) to authenticated;

-- Lo mismo, desde una pregunta (las respuestas no traen la clase).
create or replace function interno.me_sacaron_de_la_pregunta(p_pregunta uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.questions q
      join public.clase_sacados s on s.class_session_id = q.class_session_id
     where q.id = p_pregunta and s.student_id = (select auth.uid())
       and s.devuelto_at is null);
$$;
revoke execute on function interno.me_sacaron_de_la_pregunta(uuid) from public, anon;
grant execute on function interno.me_sacaron_de_la_pregunta(uuid) to authenticated;

do $$ begin
  -- Quién lee: el alumno, lo suyo (para saber que lo sacaron); el dueño de la clase y quien administra.
  if not exists (select 1 from pg_policies where tablename = 'clase_sacados' and policyname = 'clase_sacados_lee') then
    create policy clase_sacados_lee on public.clase_sacados for select to authenticated
      using (student_id = (select auth.uid()) or (select interno.puedo_sacar_de(class_session_id)));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'clase_sacados' and policyname = 'verificacion_en_dos_pasos') then
    create policy verificacion_en_dos_pasos on public.clase_sacados as restrictive for all to authenticated
      using ((select interno.verificacion_al_dia())) with check ((select interno.verificacion_al_dia()));
  end if;

  -- Lo que el sacado ya no puede escribir en esa clase.
  if not exists (select 1 from pg_policies where tablename = 'class_attendance' and policyname = 'class_attendance_no_sacado') then
    create policy class_attendance_no_sacado on public.class_attendance as restrictive for insert to authenticated
      with check (not interno.me_sacaron_de(session_id));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'class_presence_log' and policyname = 'class_presence_log_no_sacado') then
    create policy class_presence_log_no_sacado on public.class_presence_log as restrictive for insert to authenticated
      with check (not interno.me_sacaron_de(session_id));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'question_answers' and policyname = 'question_answers_no_sacado_ins') then
    create policy question_answers_no_sacado_ins on public.question_answers as restrictive for insert to authenticated
      with check (not interno.me_sacaron_de_la_pregunta(question_id));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'question_answers' and policyname = 'question_answers_no_sacado_upd') then
    create policy question_answers_no_sacado_upd on public.question_answers as restrictive for update to authenticated
      using (not interno.me_sacaron_de_la_pregunta(question_id))
      with check (not interno.me_sacaron_de_la_pregunta(question_id));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tanda_resultados' and policyname = 'tanda_resultados_no_sacado') then
    create policy tanda_resultados_no_sacado on public.tanda_resultados as restrictive for insert to authenticated
      with check (not interno.me_sacaron_de(class_session_id));
  end if;
end $$;
grant select on public.clase_sacados to authenticated;

-- Sacar: lo anota (si ya lo habían dejado volver, queda sacado otra vez).
create or replace function public.sacar_de_la_clase(p_clase uuid, p_alumno uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(interno.puedo_sacar_de(p_clase), false) then
    raise exception 'Solo quien da la clase puede sacar a alguien.' using errcode = '42501';
  end if;
  if p_alumno is null or p_alumno = (select auth.uid()) then
    raise exception 'No puedes sacarte a ti.' using errcode = '22023';
  end if;
  insert into public.clase_sacados (class_session_id, student_id)
  values (p_clase, p_alumno)
  on conflict (class_session_id, student_id)
  do update set created_at = now(), devuelto_at = null;
end;
$$;
revoke execute on function public.sacar_de_la_clase(uuid, uuid) from public, anon;
grant execute on function public.sacar_de_la_clase(uuid, uuid) to authenticated;

-- Dejarlo volver: marca la hora en que lo dejó volver.
create or replace function public.dejar_volver_a_la_clase(p_clase uuid, p_alumno uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(interno.puedo_sacar_de(p_clase), false) then
    raise exception 'Solo quien da la clase puede dejar volver a alguien.' using errcode = '42501';
  end if;
  update public.clase_sacados set devuelto_at = now()
   where class_session_id = p_clase and student_id = p_alumno and devuelto_at is null;
end;
$$;
revoke execute on function public.dejar_volver_a_la_clase(uuid, uuid) from public, anon;
grant execute on function public.dejar_volver_a_la_clase(uuid, uuid) to authenticated;
