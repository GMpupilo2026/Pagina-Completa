
-- equipos / equipo_alumnos / equipo_entrenadores (los "equipos" que arma cada
-- coordinador en coordinacion.html con sus propios profesores y alumnos):
-- hoy cualquier coordinador ve TODOS los equipos de la Academia, de
-- cualquier otro coordinador, porque la condición era soy_coordinador() a
-- secas. Se acota por bajo_mi_coordinacion(equipos.created_by), igual que el
-- resto de la coordinación. Entrenar/jugar el propio equipo (ser
-- teacher_id/alumno_id de una fila) sigue igual, sin tocar.

drop policy if exists equipos_select on public.equipos;
create policy equipos_select on public.equipos
  for select to authenticated
  using (
    (soy_coordinador() and bajo_mi_coordinacion(created_by))
    or exists (select 1 from public.equipo_entrenadores ee
                where ee.equipo_id = equipos.id and ee.teacher_id = auth.uid())
    or exists (select 1 from public.equipo_alumnos ea
                where ea.equipo_id = equipos.id and ea.alumno_id = auth.uid())
  );

drop policy if exists equipo_alumnos_select on public.equipo_alumnos;
create policy equipo_alumnos_select on public.equipo_alumnos
  for select to authenticated
  using (
    (soy_coordinador() and exists (
      select 1 from public.equipos e
       where e.id = equipo_alumnos.equipo_id and bajo_mi_coordinacion(e.created_by)
    ))
    or alumno_id = auth.uid()
    or exists (select 1 from public.equipo_entrenadores ee
                where ee.equipo_id = equipo_alumnos.equipo_id and ee.teacher_id = auth.uid())
  );

drop policy if exists equipo_entrenadores_select on public.equipo_entrenadores;
create policy equipo_entrenadores_select on public.equipo_entrenadores
  for select to authenticated
  using (
    (soy_coordinador() and exists (
      select 1 from public.equipos e
       where e.id = equipo_entrenadores.equipo_id and bajo_mi_coordinacion(e.created_by)
    ))
    or teacher_id = auth.uid()
    or exists (select 1 from public.equipo_alumnos ea
                where ea.equipo_id = equipo_entrenadores.equipo_id and ea.alumno_id = auth.uid())
  );
