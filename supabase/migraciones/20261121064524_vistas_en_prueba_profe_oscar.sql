-- Vistas en prueba: «rival_profe» también para la cuenta «Profe Oscar».
--
-- Pedido del dueño el 21/11/2026, después de anotar a los alumnos del grupo
-- SJ (20261121064012): «haz también la del profe Oscar».
--
-- Decisiones:
--
-- * Solo «rival_profe». La otra vista de Oscarov, «panel_jornada», es el
--   panel del ALUMNO con pestañas: js/panel-jornada.js no la aplica a quien
--   no es alumno (el panel docente tiene otros grupos), así que una fila suya
--   para un profesor no haría nada y diría que prueba algo que no ve.
-- * `on conflict do nothing`: correrla dos veces no falla.
insert into public.vistas_en_prueba (profile_id, vista)
values ('30761e7a-cb28-49f2-ba55-4b89de9e41d3', 'rival_profe')
on conflict do nothing;