-- CUIDADO CON ESTA: colgarla solo del cobro visible abre la puerta que se
-- quería cerrar. Un alumno VE su propio cobro (`cobros_lee_alumno`), así que
-- con `exists (select 1 from cobros ...)` a secas podría insertar un pago
-- sobre él y darse por pagado. El `soy_coordinador()` tiene que estar escrito:
-- lo que cuelga del cobro es el ALCANCE, no el permiso.
drop policy if exists pagos_coordinacion on public.pagos;
create policy pagos_coordinacion on public.pagos for all
  using (public.soy_coordinador()
         and exists (select 1 from public.cobros c
                     where c.id = cobro_id and public.bajo_mi_coordinacion(c.student_id)))
  with check (public.soy_coordinador()
              and exists (select 1 from public.cobros c
                          where c.id = cobro_id and public.bajo_mi_coordinacion(c.student_id)));