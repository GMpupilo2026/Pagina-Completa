
-- Ajuste: el freeze de role/email solo debe aplicar cuando la actualización viene
-- de un request autenticado normal (auth.uid() resuelto desde el JWT vía PostgREST).
-- Cuando yo cambio el rol directamente por SQL como administrador (sin JWT de
-- usuario en la sesión), auth.uid() es NULL y el cambio debe poder pasar.
create or replace function public.protect_profiles_identity_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is not null then
    if new.role is distinct from old.role then
      new.role := old.role;
    end if;
    if new.email is distinct from old.email then
      new.email := old.email;
    end if;
  end if;
  return new;
end;
$$;
