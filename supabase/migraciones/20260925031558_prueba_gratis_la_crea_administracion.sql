-- La prueba gratis ya no se abre sola desde la página: se pide por WhatsApp
-- y la crea quien administra (la Edge Function `prueba-gratis` lo exige). El
-- freno por IP de las pruebas sin cuenta sobra: no queda ninguna puerta
-- pública que abra cuentas. Se borra la función que lo llamaba; el tipo
-- «prueba» de interno.frenar_envio_publico() queda sin uso y no hace daño.
-- Ver «La prueba gratis de 3 días» en docs/decisiones/cobros-acceso-y-tienda.md.
drop function public.prueba_gratis_frenar(text);