-- Rol de administrador: aparte (una bandera booleana), no un tercer valor de
-- "role" — así "profesor"/"alumno" (que ya se usa por todo el sitio para el
-- modo de dar clase) no cambia, y quien administra puede seguir dando clases
-- con su mismo rol de siempre.
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- "único que pueda ingresar al panel": lo garantiza la propia base de datos,
-- no solo la interfaz — como mucho una fila puede tener is_admin = true.
create unique index if not exists profiles_single_admin_idx
  on public.profiles ((is_admin))
  where is_admin;

-- La cuenta actual (única "profesor" de la plataforma) pasa a ser también
-- la administradora del nuevo panel.
update public.profiles set is_admin = true where email = 'oscaranguloweb@gmail.com';

-- Amplía el trigger que ya protegía "role" y "email" de que cualquiera se
-- los cambie a sí mismo (RLS solo exige auth.uid() = id, sin restringir
-- columnas) para que "is_admin" tenga la misma protección: nadie puede
-- autoascenderse a administrador actualizando su propia fila desde el
-- cliente. Las funciones de Supabase (service role) sí pueden cambiarlo —
-- auth.uid() es null en ese contexto — que es como el panel hace el cambio real.
create or replace function public.protect_profiles_identity_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is not null then
    if new.role is distinct from old.role then
      new.role := old.role;
    end if;
    if new.email is distinct from old.email then
      new.email := old.email;
    end if;
    if new.is_admin is distinct from old.is_admin then
      new.is_admin := old.is_admin;
    end if;
  end if;
  return new;
end;
$$;
