-- Las tablas y la vista de las cuentas de cobro nacieron con los permisos por
-- omisión de Supabase, que incluyen a `anon`. La RLS ya no le devolvía nada
-- (sus políticas son solo para authenticated), pero el resto de cobros
-- (recibos, paquetes_acceso, cobros_vista) no le da a anon ni el select: se
-- deja igual, para que no dependa de una sola capa.
revoke all on public.cuentas_cobro, public.cuenta_cobro_alumnos, public.cobros_ajustes,
              public.pagos_reportados, public.cuentas_cobro_vista from anon;
