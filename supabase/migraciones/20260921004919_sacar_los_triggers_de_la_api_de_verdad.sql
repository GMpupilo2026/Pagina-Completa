-- La migración anterior revocaba `from anon, authenticated` y NO revocó nada,
-- devolviendo éxito: el fallo callado de siempre, esta vez en el SQL.
--
-- El permiso no era de anon ni de authenticated: era de PUBLIC. Postgres le
-- concede EXECUTE a PUBLIC a toda función nueva, y anon/authenticated lo
-- heredan de ahí, así que quitárselo a ellos no toca el grant que de verdad
-- abre la puerta. Se ve en el ACL: las siete funciones de trigger viejas —las
-- que ya estaban bien— no tienen la entrada `=X/postgres`, y estas diez sí.
--
-- Por eso el REVOKE va contra PUBLIC. Y se comprueba después con
-- has_function_privilege, que es lo único que dice la verdad: mirar que el
-- comando "pasó" ya se demostró que no sirve de nada.
revoke execute on function public.avisar_tarea_asignada()           from public;
revoke execute on function public.avisar_examen_asignado()          from public;
revoke execute on function public.avisar_examen_reabierto()         from public;
revoke execute on function public.proteger_notas_alumno()           from public;
revoke execute on function public.proteger_planes_clase()           from public;
revoke execute on function public.proteger_tareas_alumno()          from public;
revoke execute on function public.proteger_tarea_items_alumno()     from public;
revoke execute on function public.proteger_tiempos_de_presencia()   from public;
revoke execute on function public.validar_marca_training_progress() from public;
revoke execute on function public.proteger_reloj_de_partida()       from public;