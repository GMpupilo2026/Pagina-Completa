-- Postgres le da EXECUTE a PUBLIC a toda función nueva por omisión; revocar solo
-- de anon no alcanza. my_profile()/soy_coordinador() ya lo hacen así.
revoke execute on function public.mi_grupo() from public;
grant execute on function public.mi_grupo() to authenticated;
