-- La migración anterior revocaba el execute de estas cuatro funciones solo de
-- `anon`, siguiendo el patrón de `bajo_mi_coordinacion()`/`equipo_docente()` —
-- pero ese patrón deja un hueco: Postgres le da EXECUTE a PUBLIC a toda
-- función nueva, y revocarlo solo de `anon` no le quita lo que `anon` hereda
-- de PUBLIC. Comprobado con datos reales: `has_function_privilege('anon', …)`
-- seguía dando `true` para las cuatro, igual que ya lo da (sin que nadie lo
-- hubiera corregido) para `bajo_mi_coordinacion` y `equipo_docente`.
--
-- Ninguna de las cuatro es explotable así como estaba —cada una devuelve
-- false/vacío cuando `auth.uid()` es nulo, que es como llega `anon`—, pero
-- `soy_coordinador()` ya muestra la forma correcta: revocar de PUBLIC (lo que
-- de paso le quita a `anon` lo heredado) y volver a darle el execute a
-- `authenticated`, que es quien de verdad lo necesita para las políticas de
-- RLS.
revoke execute on function public.soy_dueno_del_formulario(uuid) from public;
revoke execute on function public.formulario_compartido_conmigo(uuid) from public;
revoke execute on function public.es_coordinador_de(uuid) from public;
revoke execute on function public.coordinadores_disponibles() from public;

grant execute on function public.soy_dueno_del_formulario(uuid) to authenticated;
grant execute on function public.formulario_compartido_conmigo(uuid) to authenticated;
grant execute on function public.es_coordinador_de(uuid) to authenticated;
grant execute on function public.coordinadores_disponibles() to authenticated;
