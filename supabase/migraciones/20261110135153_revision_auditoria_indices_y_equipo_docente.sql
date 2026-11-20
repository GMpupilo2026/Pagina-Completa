-- Cuatro huecos que encontró la revisión del código (10/11/2026). Ninguno se
-- veía: la base contestaba bien y la pantalla también.
--
-- 1. compras_tienda y course_unlocks reparten acceso (un material de pago; un
--    curso abierto antes de tiempo, que el profesor escribe directo por su
--    política) y no quedaban en la bitácora: nadie podía contestar «¿quién le
--    abrió esto?». Llevan el trigger de siempre y van en VIGILADAS de
--    verificar-auditoria.js. compras_tienda no tiene student_id: la persona
--    queda en la fila (profile_id), no en `sobre`.
create trigger auditar after insert or update or delete on public.compras_tienda
  for each row execute function interno.auditar();
create trigger auditar after insert or update or delete on public.course_unlocks
  for each row execute function interno.auditar();

-- 2. Un doble clic en «Programar recordatorio» (cobros.html) dejaba dos filas
--    iguales y la Edge Function cobros-recordatorios mandaba DOS correos a la
--    familia. El botón ya no deja (js/cobros.js), pero lo que no puede pasar
--    dos veces lo garantiza un índice, no la pantalla. Solo entre los
--    pendientes: uno cancelado o ya enviado no impide volver a programar el
--    mismo momento. Comprobado antes: no había ningún duplicado.
create unique index cobros_recordatorios_programados_una_vez
  on public.cobros_recordatorios_programados (student_id, programado_para)
  where estado = 'pendiente';

-- 3. Claves foráneas sin índice que se recorren al borrar: user_id va de
--    segunda en la llave (room_id, user_id), así que borrar una cuenta
--    recorría partida_mediciones y partida_latidos enteras; borrar una sala,
--    reloj_recortes; quitar el enlace de un árbitro del Centroamericano (on
--    delete set null, y centroamericano_quitar_enlace filtra por esa
--    columna), las cuatro tablas de la mesa.
create index if not exists partida_mediciones_user_id_fk on public.partida_mediciones (user_id);
create index if not exists partida_latidos_user_id_fk on public.partida_latidos (user_id);
create index if not exists reloj_recortes_room_id_fk on public.reloj_recortes (room_id);
create index if not exists centroamericano_registro_asignacion_id_fk on public.centroamericano_registro (asignacion_id);
create index if not exists centroamericano_tiempos_asignacion_id_fk on public.centroamericano_tiempos (asignacion_id);
create index if not exists centroamericano_presencia_asignacion_id_fk on public.centroamericano_presencia (asignacion_id);
create index if not exists centroamericano_planillas_asignacion_id_fk on public.centroamericano_planillas (asignacion_id);

-- 4. es_del_equipo_docente(<uuid>) la podía llamar cualquiera SIN sesión y
--    decía si esa persona da clase o administra. Quedó abierta a propósito
--    (ver «quitar_a_anon_las_funciones_internas» en permisos-y-roles.md)
--    porque la usa la política plan_compartidos_insert, que era `to public`:
--    sin el execute, la consulta de anon tronaría en vez de dar «0 filas».
--    La política pasa a `authenticated` (anon no tiene insert en esa tabla:
--    no cambia nada para nadie) y entonces sí se revoca. La otra que la usa,
--    planes_compartidos_conmigo(), es SECURITY DEFINER: corre como su dueño.
alter policy plan_compartidos_insert on public.plan_compartidos to authenticated;
revoke execute on function public.es_del_equipo_docente(uuid) from public, anon;
grant execute on function public.es_del_equipo_docente(uuid) to authenticated, service_role;
