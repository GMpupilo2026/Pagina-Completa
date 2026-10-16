-- arbitros_cr_normas_revision quedó con los permisos que Supabase le da por
-- omisión a authenticated (TRUNCATE, REFERENCES, TRIGGER): un TRUNCATE no
-- pasa por la RLS y vaciaría la tabla de todos. Se le deja solo lo que usa la
-- página; lo demás lo decide la RLS.
revoke all on public.arbitros_cr_normas_revision from authenticated;
grant select, insert, update, delete on public.arbitros_cr_normas_revision to authenticated;