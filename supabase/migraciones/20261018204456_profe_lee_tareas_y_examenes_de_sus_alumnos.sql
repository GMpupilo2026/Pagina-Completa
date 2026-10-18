-- El profe lee también lo que OTRO profe le puso a un alumno suyo, y solo lo
-- que el alumno ya ve (disponible_desde <= now()). Sin esto, el panel del
-- alumno visto por uno de sus dos profes salía con la mitad de sus tareas
-- (ver «El profe ve el panel de su alumno» en docs/decisiones/permisos-y-roles.md).
-- Escribir sigue siendo solo de quien la puso (tareas_update/examenes_update
-- no cambian). examen_items NO se abre: guarda la clave de las respuestas.
--
-- Aplicada el 18/10/2026 desde el SQL Editor de Supabase (la herramienta de
-- migraciones no llegó a ejecutarla), así que no figura en
-- supabase_migrations.schema_migrations; la versión de este archivo es la
-- hora en que se guardó. Comprobado impersonando a un profe con un alumno
-- compartido: ve las 5 tareas que le puso el otro profe, ninguna de alumnos
-- ajenos, ninguna programada ajena y ninguna clave de examen ajena.

drop policy if exists tareas_select on public.tareas;
create policy tareas_select on public.tareas for select
  using (
    (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or profesor_id = (select auth.uid())
    or (alumno_id = (select auth.uid()) and disponible_desde <= now())
    or ((select public.soy_supervisor()) and alumno_id in (select interno.supervisados_por_mi()))
    or (alumno_id in (select interno.alumnos_de((select auth.uid()))) and disponible_desde <= now())
  );

drop policy if exists examenes_select on public.examenes;
create policy examenes_select on public.examenes for select
  using (
    (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or profesor_id = (select auth.uid())
    or (alumno_id = (select auth.uid()) and disponible_desde <= now())
    or ((select public.soy_supervisor()) and public.supervisado_por_mi(alumno_id))
    or (alumno_id in (select interno.alumnos_de((select auth.uid()))) and disponible_desde <= now())
  );
