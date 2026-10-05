-- plantillas_casa se creó con el permiso por omisión de Supabase, que incluye
-- TRUNCATE para authenticated. Por PostgREST no se puede pedir, pero vaciar la
-- tabla entera no es algo que una persona tenga que poder hacer: se quita,
-- igual que en mensajes_casa.
revoke truncate on public.plantillas_casa from authenticated;
