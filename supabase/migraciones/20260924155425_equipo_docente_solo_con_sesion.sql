-- equipo_docente() la podía llamar cualquiera sin sesión
-- (/rest/v1/rpc/equipo_docente con la clave pública). No filtraba nada —sin
-- auth.uid() el exists no pasa y devuelve una lista vacía—, pero una función
-- SECURITY DEFINER que contesta sobre otras personas es una API y va cerrada
-- a anon (la regla de CLAUDE.md). Revocar solo de anon no sirve: lo hereda de
-- public. authenticated la conserva: la usan plan-clase.js y la política
-- plan_compartidos_insert.
revoke execute on function public.equipo_docente() from public, anon;
grant execute on function public.equipo_docente() to authenticated, service_role;