-- Metropolitano 2026: la tabla de códigos de descuento nació con los permisos
-- por omisión, y TRUNCATE se salta la RLS. Nadie la escribe desde afuera: la
-- escriben las funciones que validan; administración solo la lee.
revoke all on table public.metropolitano_codigos from anon;
revoke insert, update, delete, truncate, references, trigger on table public.metropolitano_codigos from authenticated;
grant select on table public.metropolitano_codigos to authenticated;
