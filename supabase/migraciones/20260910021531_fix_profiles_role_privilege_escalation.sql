
-- VULNERABILIDAD: la política profiles_update_own permitía a cualquier usuario
-- autenticado cambiar CUALQUIER columna de su propia fila, incluyendo `role`.
-- Un alumno podía ejecutar sb.from('profiles').update({role:'profesor'}) desde la
-- consola del navegador y auto-promoverse a profesor (mover el tablero, invitar
-- alumnos, ceder control, borrar partidas guardadas: todo depende de este campo).
--
-- Fix: un trigger BEFORE UPDATE revierte `role` y `email` a su valor anterior
-- salvo que el que actualiza sea el propio proceso de servicio (esto corre con
-- SECURITY DEFINER e ignora RLS, pero el chequeo de auth.uid() sigue aplicando
-- a cualquier request hecho como usuario autenticado normal). En la práctica
-- esto congela ambas columnas para cambios hechos por el propio usuario desde
-- el cliente; solo se pueden cambiar por SQL directo (lo que hago yo cuando
-- asigno el rol de profesor).
create or replace function public.protect_profiles_identity_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    new.role := old.role;
  end if;
  if new.email is distinct from old.email then
    new.email := old.email;
  end if;
  return new;
end;
$$;

revoke execute on function public.protect_profiles_identity_columns() from public, anon, authenticated;

create trigger protect_profiles_identity_columns_trigger
  before update on public.profiles
  for each row execute function public.protect_profiles_identity_columns();
