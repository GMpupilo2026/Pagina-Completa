-- Una función de TRIGGER no es una API, y estas diez estaban publicadas en
-- /rest/v1/rpc/ para anon y authenticated. Hoy no es una fuga —Postgres las
-- rechaza por su cuenta con "trigger functions can only be called as
-- triggers", está comprobado—, y por eso nadie lo notó en meses.
--
-- Lo que sí cuesta es el RUIDO: el linter de Supabase levanta 78 avisos de
-- "SECURITY DEFINER ejecutable", casi todos por diseño (las funciones de
-- permiso validan por dentro). Entre ese montón, estas diez son las únicas
-- que no tenían ninguna razón de estar, y el día que aparezca un aviso de
-- verdad va a estar enterrado en la misma lista que nadie lee.
--
-- Y ya era la costumbre de la casa: las siete funciones de trigger más
-- viejas (handle_new_user, protect_answer_grading,
-- protect_profiles_identity_columns, sincronizar_profesor_principal,
-- avisar_clase_abierta, avisar_desafio, protect_game_state_teacher_columns)
-- YA estaban revocadas. Se fue olvidando en las que se escribieron después.
--
-- Revocar el execute NO afecta a los triggers: el motor los dispara con los
-- privilegios del trigger y no pide EXECUTE a quien hace el insert. Queda
-- comprobado abajo, no asumido.
revoke execute on function public.avisar_tarea_asignada()           from anon, authenticated;
revoke execute on function public.avisar_examen_asignado()          from anon, authenticated;
revoke execute on function public.avisar_examen_reabierto()         from anon, authenticated;
revoke execute on function public.proteger_notas_alumno()           from anon, authenticated;
revoke execute on function public.proteger_planes_clase()           from anon, authenticated;
revoke execute on function public.proteger_tareas_alumno()          from anon, authenticated;
revoke execute on function public.proteger_tarea_items_alumno()     from anon, authenticated;
revoke execute on function public.proteger_tiempos_de_presencia()   from anon, authenticated;
revoke execute on function public.validar_marca_training_progress() from anon, authenticated;
revoke execute on function public.proteger_reloj_de_partida()       from anon, authenticated;

-- Era la ÚNICA de las diecisiete funciones de trigger sin search_path fijo.
-- Sin él, el path lo pone quien dispara el trigger, así que un esquema
-- propio por delante puede cambiar qué `now()` se resuelve — y este trigger
-- existe justamente para que la hora la ponga el servidor.
--
-- Va en '' y no en 'public' porque su cuerpo no toca ninguna tabla ni
-- función de esquema: solo now(), greatest, coalesce, extract y los
-- operadores de jsonb, todos de pg_catalog, que está siempre en el path.
alter function public.proteger_reloj_de_partida() set search_path = '';