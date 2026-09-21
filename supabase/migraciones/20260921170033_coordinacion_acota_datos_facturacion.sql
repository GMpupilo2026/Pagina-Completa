
-- datos_facturacion: los datos fiscales de un alumno (cédula, correo, etc.)
-- estaban abiertos a CUALQUIER coordinador. Mismo acotamiento que cobros.
drop policy if exists facturacion_coordinacion on public.datos_facturacion;
create policy facturacion_coordinacion on public.datos_facturacion
  for all to authenticated
  using (soy_coordinador() and bajo_mi_coordinacion(student_id))
  with check (soy_coordinador() and bajo_mi_coordinacion(student_id));
