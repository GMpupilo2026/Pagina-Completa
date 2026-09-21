-- Las funciones de trigger no son puntos de entrada: nadie tiene por qué
-- poder llamarlas desde /rest/v1/rpc/. Llamadas fuera de un trigger fallarían
-- igual (no hay TG_OP), pero dejarlas abiertas es descuido, no diseño.
revoke execute on function public.sincronizar_profesor_principal() from public, anon, authenticated;
revoke execute on function public.protect_profiles_identity_columns() from public, anon, authenticated;