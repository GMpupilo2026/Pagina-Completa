-- La foto de perfil: cada persona sube la suya y se ve donde antes iba su
-- inicial (el panel, la burbuja de conectados, Configuración). Ver «La foto de
-- perfil» en docs/decisiones/permisos-y-roles.md.

alter table public.profiles
  add column if not exists foto_path text,
  add column if not exists foto_privacidad_version text,
  add column if not exists foto_aceptada_en timestamptz;

-- La ruta es SIEMPRE de la carpeta de la persona, con un nombre al azar: el
-- nombre cambia con cada foto, así una foto vieja guardada en la caché del
-- navegador nunca se hace pasar por la nueva.
alter table public.profiles drop constraint if exists profiles_foto_path_check;
alter table public.profiles add constraint profiles_foto_path_check
  check (foto_path is null or foto_path ~ ('^' || id::text || '/foto-[a-z0-9]{12,40}\.(jpg|webp)$'));

create index if not exists profiles_foto_path_idx on public.profiles (foto_path) where foto_path is not null;

-- El bucket es PRIVADO, a diferencia del logo de una academia: son fotos de
-- personas, muchas menores de edad. Se ven con una dirección firmada que dura
-- una hora, y solo quien ya puede ver el perfil la consigue.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-perfil', 'fotos-perfil', false, 307200, array['image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 307200,
  allowed_mime_types = array['image/jpeg', 'image/webp'];

-- Cada quien sube solo a su carpeta.
drop policy if exists fotos_perfil_insert on storage.objects;
create policy fotos_perfil_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos-perfil'
              and (storage.foldername(name))[1] = ((select auth.uid()))::text);

-- Lee lo suyo, y la foto VIGENTE de un perfil que puede ver: la subconsulta
-- pasa por la RLS de profiles, así que es la misma pregunta que «¿veo a esta
-- persona?» (y las academias siguen siendo privadas). Una foto vieja que se
-- reemplazó ya no la lee nadie más.
drop policy if exists fotos_perfil_select on storage.objects;
create policy fotos_perfil_select on storage.objects for select to authenticated
  using (bucket_id = 'fotos-perfil'
         and ((storage.foldername(name))[1] = ((select auth.uid()))::text
              or exists (select 1 from public.profiles p where p.foto_path = objects.name)));

-- Borra lo suyo; quien administra, cualquiera (para quitar una foto que no va).
drop policy if exists fotos_perfil_delete on storage.objects;
create policy fotos_perfil_delete on storage.objects for delete to authenticated
  using (bucket_id = 'fotos-perfil'
         and ((storage.foldername(name))[1] = ((select auth.uid()))::text
              or (select public.soy_admin())));

-- La foto solo se cambia por las funciones de abajo: guardar exige que el
-- archivo exista y que se acepte la política de privacidad. Un update directo
-- se revierte en silencio, como las columnas de identidad.
create or replace function interno.profiles_foto_por_funcion()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if auth.uid() is not null
     and coalesce(current_setting('ajedrez.guardando_foto', true), '') <> 'si' then
    new.foto_path := old.foto_path;
    new.foto_privacidad_version := old.foto_privacidad_version;
    new.foto_aceptada_en := old.foto_aceptada_en;
  end if;
  return new;
end;
$$;
revoke execute on function interno.profiles_foto_por_funcion() from public, anon, authenticated;

drop trigger if exists profiles_foto_por_funcion on public.profiles;
create trigger profiles_foto_por_funcion before update on public.profiles
  for each row execute function interno.profiles_foto_por_funcion();

-- Guardar mi foto: ya subida a mi carpeta, y con la política aceptada.
-- Devuelve la ruta que QUEDÓ (se vuelve a leer la fila).
create or replace function public.guardar_mi_foto(p_ruta text, p_version_privacidad text)
returns text language plpgsql security definer set search_path to 'public' as $$
declare
  yo uuid := auth.uid();
  v_ruta text := btrim(coalesce(p_ruta, ''));
  v_quedo text;
begin
  if yo is null then
    raise exception 'Entra con tu cuenta para subir tu foto.' using errcode = '42501';
  end if;
  if not coalesce(interno.version_legal_valida(p_version_privacidad), false) then
    raise exception 'Para subir tu foto, acepta la Política de privacidad.';
  end if;
  if v_ruta !~ ('^' || yo::text || '/foto-[a-z0-9]{12,40}\.(jpg|webp)$') then
    raise exception 'Esa foto no está en tu carpeta.' using errcode = '42501';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'fotos-perfil' and o.name = v_ruta) then
    raise exception 'La foto no terminó de subirse. Vuelve a elegirla.';
  end if;
  perform set_config('ajedrez.guardando_foto', 'si', true);
  update public.profiles
     set foto_path = v_ruta,
         foto_privacidad_version = p_version_privacidad,
         foto_aceptada_en = now()
   where id = yo;
  perform set_config('ajedrez.guardando_foto', '', true);
  select foto_path into v_quedo from public.profiles where id = yo;
  return v_quedo;
end;
$$;
revoke execute on function public.guardar_mi_foto(text, text) from public, anon;
grant execute on function public.guardar_mi_foto(text, text) to authenticated;

-- Quitar una foto: la propia, o cualquiera si administra. Devuelve la ruta que
-- tenía, para que la página borre el archivo.
create or replace function public.quitar_foto(p_persona uuid)
returns text language plpgsql security definer set search_path to 'public' as $$
declare
  v_vieja text;
begin
  if not coalesce(p_persona = auth.uid() or public.soy_admin(), false) then
    raise exception 'Solo la persona o quien administra quita su foto.' using errcode = '42501';
  end if;
  select foto_path into v_vieja from public.profiles where id = p_persona;
  perform set_config('ajedrez.guardando_foto', 'si', true);
  update public.profiles set foto_path = null where id = p_persona;
  perform set_config('ajedrez.guardando_foto', '', true);
  return v_vieja;
end;
$$;
revoke execute on function public.quitar_foto(uuid) from public, anon;
grant execute on function public.quitar_foto(uuid) to authenticated;
