-- `Coles` es el directorio de centros educativos del MEP y el selector de
-- colegios de `inscripcion.html` lo LEE con `anon`: ese permiso se queda.
-- Lo que no tiene ninguna razon de estar es el insert/update/delete que
-- Supabase le concede por omision -- hoy los para la RLS (su unica politica
-- es de select), o sea que la lista de colegios del pais depende de que esa
-- politica siga siendo la unica. Se deja el permiso en lo que de verdad usa.
--
-- `authenticated` no la toca desde ninguna parte: `inscripcion.html` es el
-- formulario publico y entra sin sesion. Se le deja select por si alguna vez
-- se lee con sesion iniciada, que es el mismo dato publico.

revoke all on table public."Coles" from anon, authenticated;
grant select on table public."Coles" to anon, authenticated;