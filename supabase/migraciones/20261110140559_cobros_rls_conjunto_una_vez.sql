-- Las políticas de cobros arman el conjunto de coordinación UNA vez.
--
-- Preguntaban bajo_mi_coordinacion(student_id) fila por fila: cobros, recibos,
-- pagos, avisos y suscripciones crecen cada mes con cada alumno, y es el mismo
-- patrón que tumbó el informe con 7000 filas (ver «La RLS de las tablas de
-- actividad arma el conjunto UNA vez» en informes.md). Ahora:
--   bajo_mi_coordinacion(x)  ⇔  x in (select interno.bajo_mi_coordinacion_conjunto())
--   coordinador_puede('cobros')  →  (select public.coordinador_puede('cobros'))
-- El conjunto es el inverso exacto de la función (si se cambia una, se cambian
-- las dos). Comprobado antes de aplicar: las dos dan lo mismo en las 81 510
-- parejas (285 cuentas × 285 personas, más sin sesión), y la vista de cada
-- cuenta en estas ocho tablas, con la RLS de verdad, se fotografió antes y se
-- compara después.
--
-- De paso pasan de `public` a `authenticated`: anon no tiene ningún permiso
-- sobre estas tablas, así que no cambia nada para nadie, y con `to public` la
-- política se evaluaba también para anon, que no puede usar el esquema interno.
-- El with check de pagos_coordinacion_actualiza (corrijo_cobros_de) no se toca.

-- cobros
alter policy cobros_select on public.cobros to authenticated
  using (((select public.coordinador_puede('cobros')) and student_id in (select interno.bajo_mi_coordinacion_conjunto()))
         or student_id = (select auth.uid()));
alter policy cobros_coordinacion_escribe on public.cobros to authenticated
  with check ((select public.coordinador_puede('cobros')) and student_id in (select interno.bajo_mi_coordinacion_conjunto()));
alter policy cobros_coordinacion_actualiza on public.cobros to authenticated
  using ((select public.coordinador_puede('cobros')) and student_id in (select interno.bajo_mi_coordinacion_conjunto()))
  with check ((select public.coordinador_puede('cobros')) and student_id in (select interno.bajo_mi_coordinacion_conjunto()));
alter policy cobros_coordinacion_borra on public.cobros to authenticated
  using ((select public.coordinador_puede('cobros')) and student_id in (select interno.bajo_mi_coordinacion_conjunto()));

-- cobros_contacto
alter policy cobros_contacto_select on public.cobros_contacto to authenticated
  using (((select public.coordinador_puede('cobros')) and student_id in (select interno.bajo_mi_coordinacion_conjunto()))
         or student_id = (select auth.uid()));
alter policy cobros_contacto_coordinacion_escribe on public.cobros_contacto to authenticated
  with check ((select public.coordinador_puede('cobros')) and student_id in (select interno.bajo_mi_coordinacion_conjunto()));
alter policy cobros_contacto_coordinacion_actualiza on public.cobros_contacto to authenticated
  using ((select public.coordinador_puede('cobros')) and student_id in (select interno.bajo_mi_coordinacion_conjunto()))
  with check ((select public.coordinador_puede('cobros')) and student_id in (select interno.bajo_mi_coordinacion_conjunto()));
alter policy cobros_contacto_coordinacion_borra on public.cobros_contacto to authenticated
  using ((select public.coordinador_puede('cobros')) and student_id in (select interno.bajo_mi_coordinacion_conjunto()));

-- cobros_recordatorios_programados
alter policy cobros_recordatorios_programados_coordinacion on public.cobros_recordatorios_programados to authenticated
  using ((select public.coordinador_puede('cobros')) and student_id in (select interno.bajo_mi_coordinacion_conjunto()))
  with check ((select public.coordinador_puede('cobros')) and student_id in (select interno.bajo_mi_coordinacion_conjunto()));

-- datos_facturacion (ya era authenticated)
alter policy facturacion_select on public.datos_facturacion to authenticated
  using (((select public.coordinador_puede('cobros')) and student_id in (select interno.bajo_mi_coordinacion_conjunto()))
         or student_id = (select auth.uid()));
alter policy facturacion_coordinacion_escribe on public.datos_facturacion to authenticated
  with check ((select public.coordinador_puede('cobros')) and student_id in (select interno.bajo_mi_coordinacion_conjunto()));
alter policy facturacion_coordinacion_actualiza on public.datos_facturacion to authenticated
  using ((select public.coordinador_puede('cobros')) and student_id in (select interno.bajo_mi_coordinacion_conjunto()))
  with check ((select public.coordinador_puede('cobros')) and student_id in (select interno.bajo_mi_coordinacion_conjunto()));
alter policy facturacion_coordinacion_borra on public.datos_facturacion to authenticated
  using ((select public.coordinador_puede('cobros')) and student_id in (select interno.bajo_mi_coordinacion_conjunto()));

-- suscripciones
alter policy suscripciones_select on public.suscripciones to authenticated
  using (((select public.coordinador_puede('cobros')) and student_id in (select interno.bajo_mi_coordinacion_conjunto()))
         or student_id = (select auth.uid()));
alter policy suscripciones_coordinacion_escribe on public.suscripciones to authenticated
  with check ((select public.coordinador_puede('cobros')) and student_id in (select interno.bajo_mi_coordinacion_conjunto()));
alter policy suscripciones_coordinacion_actualiza on public.suscripciones to authenticated
  using ((select public.coordinador_puede('cobros')) and student_id in (select interno.bajo_mi_coordinacion_conjunto()))
  with check ((select public.coordinador_puede('cobros')) and student_id in (select interno.bajo_mi_coordinacion_conjunto()));
alter policy suscripciones_coordinacion_borra on public.suscripciones to authenticated
  using ((select public.coordinador_puede('cobros')) and student_id in (select interno.bajo_mi_coordinacion_conjunto()));

-- recibos (ya era authenticated)
alter policy recibos_select on public.recibos to authenticated
  using (((select public.coordinador_puede('cobros')) and student_id in (select interno.bajo_mi_coordinacion_conjunto()))
         or student_id = (select auth.uid()));

-- pagos: el permiso viene del cobro.
alter policy pagos_select on public.pagos to authenticated
  using (((select public.coordinador_puede('cobros'))
          and cobro_id in (select c.id from public.cobros c where c.student_id in (select interno.bajo_mi_coordinacion_conjunto())))
         or cobro_id in (select c.id from public.cobros c where c.student_id = (select auth.uid())));
alter policy pagos_coordinacion_actualiza on public.pagos to authenticated
  using ((select public.coordinador_puede('cobros'))
         and cobro_id in (select c.id from public.cobros c where c.student_id in (select interno.bajo_mi_coordinacion_conjunto())));
alter policy pagos_coordinacion_borra on public.pagos to authenticated
  using ((select public.coordinador_puede('cobros'))
         and cobro_id in (select c.id from public.cobros c where c.student_id in (select interno.bajo_mi_coordinacion_conjunto())));

-- avisos_cobro: también por el cobro (ya era authenticated).
alter policy avisos_lee_coordinacion on public.avisos_cobro to authenticated
  using ((select public.coordinador_puede('cobros'))
         and cobro_id in (select c.id from public.cobros c where c.student_id in (select interno.bajo_mi_coordinacion_conjunto())));
