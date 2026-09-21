-- Supabase le da a "anon" permisos de tabla por omisión en todo lo nuevo de
-- public, y confía en que la RLS lo pare. Acá la RLS lo para igual, pero de mala
-- manera: sus políticas llaman a my_profile(), que anon no puede ejecutar, así
-- que un intento de leer no devuelve "0 filas" sino un error de permisos.
--
-- Para estas tres tablas el público no tiene absolutamente nada que hacer —lo
-- suyo pasa por formulario_publico() y responder_formulario(), que son
-- SECURITY DEFINER—, así que se le quita el permiso de raíz. Una puerta menos
-- que dependa de que la política esté bien escrita.
revoke all on public.formularios from anon;
revoke all on public.formulario_respuestas from anon;
revoke all on public.profile_teachers from anon;