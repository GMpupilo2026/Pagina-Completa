-- La RLS de las tablas de actividad llamaba a soy_profesor_de(student_id) y a
-- supervisado_por_mi(student_id) UNA VEZ POR FILA. Son SECURITY DEFINER con
-- SET, así que Postgres no las puede meter dentro de la consulta: con ~7000
-- filas en training_progress, contar lo que ve un profesor-supervisor tardaba
-- 8,5 s y el informe se caía por statement timeout (8 s).
--
-- La regla es la misma, dicha al revés: en vez de preguntar fila por fila
-- «¿soy profesor de este alumno?», se arma UNA VEZ el conjunto de alumnos de
-- quien mira y cada fila solo se busca en ese conjunto (hashed subplan).
--   soy_profesor_de(s)    ⇔ s in interno.alumnos_de(auth.uid())
--   supervisado_por_mi(s) ⇔ s in interno.supervisados_por_mi()

-- El inverso exacto de supervisado_por_mi(): las mismas tres vías que
-- supervisores_de(), recorridas desde el supervisor. No es mis_supervisados():
-- esa suma además los alumnos propios, y aquí la política de supervisor tiene
-- que dejar ver lo mismo que antes, ni una fila más.
create or replace function interno.supervisados_por_mi()
returns setof uuid
language sql stable security definer
set search_path = public
set row_security = off
as $$
  select sc.persona_id from public.supervisor_cuentas sc
    join public.profiles s on s.id = sc.supervisor_id and s.es_supervisor
   where sc.supervisor_id = auth.uid()
  union
  select a from public.supervisor_cuentas sc
    join public.profiles s on s.id = sc.supervisor_id and s.es_supervisor
    cross join lateral interno.alumnos_de(sc.persona_id) a
   where sc.supervisor_id = auth.uid()
  union
  select m.persona_id from public.academias ac
    join public.academia_miembros m on m.academia_id = ac.id
    join public.profiles s on s.id = ac.supervisor_id and s.es_supervisor
   where ac.supervisor_id = auth.uid() and m.persona_id <> ac.supervisor_id;
$$;
revoke execute on function interno.supervisados_por_mi() from public, anon;
grant execute on function interno.supervisados_por_mi() to authenticated, service_role;

alter policy training_progress_select_teacher on public.training_progress
  using ((select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
         or student_id in (select interno.alumnos_de(auth.uid())));
alter policy training_state_select_teacher on public.training_state
  using ((select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
         or student_id in (select interno.alumnos_de(auth.uid())));
alter policy platform_activity_log_select on public.platform_activity_log
  using ((auth.uid() = student_id)
         or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
         or student_id in (select interno.alumnos_de(auth.uid())));

alter policy training_progress_select_supervisor on public.training_progress
  using ((select public.soy_supervisor()) and student_id in (select interno.supervisados_por_mi()));
alter policy training_state_select_supervisor on public.training_state
  using ((select public.soy_supervisor()) and student_id in (select interno.supervisados_por_mi()));
alter policy platform_activity_log_select_supervisor on public.platform_activity_log
  using ((select public.soy_supervisor()) and student_id in (select interno.supervisados_por_mi()));
alter policy class_attendance_select_supervisor on public.class_attendance
  using ((select public.soy_supervisor()) and student_id in (select interno.supervisados_por_mi()));
alter policy class_presence_log_select_supervisor on public.class_presence_log
  using ((select public.soy_supervisor()) and student_id in (select interno.supervisados_por_mi()));
alter policy question_answers_select_supervisor on public.question_answers
  using ((select public.soy_supervisor()) and student_id in (select interno.supervisados_por_mi()));
