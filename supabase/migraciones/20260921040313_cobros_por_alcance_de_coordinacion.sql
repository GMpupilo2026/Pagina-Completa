-- Los cobros que ve quien coordina son los de SU gente, no los de la Academia
-- entera. Antes `soy_coordinador()` abría todo: con una academia de miles de
-- alumnos y varios coordinadores, eso es administrar, no coordinar — y las
-- mensualidades de un colegio no son asunto del que coordina otro.
--
-- Quien administra sigue viendo todo: `bajo_mi_coordinacion()` le da true
-- siempre, así que no hace falta una segunda rama en cada política.
--
-- Los PLANES no se acotan a propósito: son las tarifas de la Academia, no de
-- un alumno, y no hay a quién atarlos.

drop policy if exists cobros_coordinacion on public.cobros;
create policy cobros_coordinacion on public.cobros for all
  using (public.soy_coordinador() and public.bajo_mi_coordinacion(student_id))
  with check (public.soy_coordinador() and public.bajo_mi_coordinacion(student_id));

drop policy if exists suscripciones_coordinacion on public.suscripciones;
create policy suscripciones_coordinacion on public.suscripciones for all
  using (public.soy_coordinador() and public.bajo_mi_coordinacion(student_id))
  with check (public.soy_coordinador() and public.bajo_mi_coordinacion(student_id));

drop policy if exists cobros_contacto_coordinacion on public.cobros_contacto;
create policy cobros_contacto_coordinacion on public.cobros_contacto for all
  using (public.soy_coordinador() and public.bajo_mi_coordinacion(student_id))
  with check (public.soy_coordinador() and public.bajo_mi_coordinacion(student_id));

-- `pagos` cuelga de su cobro, no lleva alumno: se acota por el cobro, que es
-- el mismo principio de `plan_items` — así ampliar o cerrar el acceso a un
-- cobro no obliga a acordarse de una segunda política.
drop policy if exists pagos_coordinacion on public.pagos;
create policy pagos_coordinacion on public.pagos for all
  using (exists (select 1 from public.cobros c where c.id = cobro_id))
  with check (exists (select 1 from public.cobros c where c.id = cobro_id));