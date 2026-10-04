-- Certificados de curso (3 de 3): quién puede qué. Una tabla nueva trae todos
-- los permisos para anon y authenticated; sin escritura desde afuera.
revoke all on interno.curso_lecciones from public, anon, authenticated;
revoke all on public.certificados from anon;
revoke insert, update, delete, truncate, references, trigger on public.certificados from authenticated;
grant select on public.certificados to authenticated;
revoke execute on function interno.lecciones_hechas(uuid, text) from public, anon, authenticated;
revoke execute on function public.emitir_certificado(uuid, text) from public, anon;
grant execute on function public.emitir_certificado(uuid, text) to authenticated;
revoke execute on function public.anular_certificado(text) from public, anon;
grant execute on function public.anular_certificado(text) to authenticated;
revoke execute on function public.certificado_publico(text) from public;
grant execute on function public.certificado_publico(text) to anon, authenticated;