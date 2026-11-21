-- Vistas en prueba: lo que probaba Oscarov, para todos los alumnos del grupo SJ.
--
-- Pedido del dueño el 21/11/2026: «la configuración de Oscarov a todos los de
-- San José». La configuración de Oscarov son sus dos filas de esta tabla:
-- «panel_jornada» (el panel del alumno con pestañas y el aspecto de tablero de
-- control, js/panel-jornada.js) y «rival_profe» (el profe Oscar como rival con
-- personalidad en bot.html, js/rival-profe.js).
--
-- Decisiones:
--
-- * «Los de San José» son los alumnos con grupo «SJ», el grupo de Oscarov. No
--   la academia «CCDR San José» entera: ahí hay además dos alumnos del grupo
--   «ciegos» (su panel es el adaptado, donde las pestañas no se aplican), uno
--   de ADAPZ y uno sin grupo, que no se tocan.
-- * Es una foto de quienes están hoy en el grupo: un alumno que entre después
--   a SJ no queda anotado solo; se anota con otro insert como este.
-- * Solo alumnos: el panel jornada no se aplica a quien no lo es.
-- * `on conflict do nothing`: Oscarov ya tiene las dos filas.
insert into public.vistas_en_prueba (profile_id, vista)
select p.id, v.vista
from public.profiles p
cross join (values ('panel_jornada'), ('rival_profe')) as v(vista)
where p.role = 'alumno' and p.grupo = 'SJ'
on conflict do nothing;
