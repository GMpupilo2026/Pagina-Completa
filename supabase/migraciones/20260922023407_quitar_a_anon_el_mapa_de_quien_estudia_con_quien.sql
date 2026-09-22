revoke execute on function public.profesores_de(uuid) from public, anon;
revoke execute on function public.alumnos_de(uuid) from public, anon;
grant execute on function public.profesores_de(uuid) to authenticated;
grant execute on function public.alumnos_de(uuid) to authenticated;