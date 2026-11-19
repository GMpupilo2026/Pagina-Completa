-- vistas_en_prueba: desde afuera, solo lectura.
--
-- Supabase le da a `authenticated`, por omisión, todos los permisos sobre una
-- tabla nueva de public (INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES,
-- TRIGGER). Sin política de escritura la RLS ya rechaza INSERT, UPDATE y
-- DELETE, pero TRUNCATE no pasa por la RLS. PostgREST no lo ofrece, y aun así
-- un permiso que no se usa no se deja puesto: las cuentas se anotan desde SQL
-- y nadie más escribe aquí.
revoke insert, update, delete, truncate, references, trigger on public.vistas_en_prueba from authenticated;
