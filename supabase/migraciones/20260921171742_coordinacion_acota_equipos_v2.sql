
-- Reintento sin la función nueva (ya existía equipo_bajo_mi_coordinacion(),
-- que evalúa cada alumno/entrenador del equipo -- más estricta que mi
-- versión por created_by -- pero nunca estaba conectada a ninguna política).

drop policy if exists equipos_select on public.equipos;
create policy equipos_select on public.equipos
  for select to authenticated
  using (
    (soy_coordinador() and equipo_bajo_mi_coordinacion(id))
    or exists (select 1 from public.equipo_entrenadores ee
                where ee.equipo_id = equipos.id and ee.teacher_id = auth.uid())
    or exists (select 1 from public.equipo_alumnos ea
                where ea.equipo_id = equipos.id and ea.alumno_id = auth.uid())
  );

drop policy if exists equipo_alumnos_select on public.equipo_alumnos;
create policy equipo_alumnos_select on public.equipo_alumnos
  for select to authenticated
  using (
    (soy_coordinador() and equipo_bajo_mi_coordinacion(equipo_alumnos.equipo_id))
    or alumno_id = auth.uid()
    or exists (select 1 from public.equipo_entrenadores ee
                where ee.equipo_id = equipo_alumnos.equipo_id and ee.teacher_id = auth.uid())
  );

drop policy if exists equipo_entrenadores_select on public.equipo_entrenadores;
create policy equipo_entrenadores_select on public.equipo_entrenadores
  for select to authenticated
  using (
    (soy_coordinador() and equipo_bajo_mi_coordinacion(equipo_entrenadores.equipo_id))
    or teacher_id = auth.uid()
    or exists (select 1 from public.equipo_alumnos ea
                where ea.equipo_id = equipo_entrenadores.equipo_id and ea.alumno_id = auth.uid())
  );
