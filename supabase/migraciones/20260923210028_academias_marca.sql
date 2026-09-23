-- La marca de cada academia: su logo y su color, dentro de la plataforma y en
-- sus formularios públicos. Ver «La marca de cada academia» en CLAUDE.md.

alter table public.academias
  add column if not exists color text,
  add column if not exists logo_path text;

-- El color va de fondo del encabezado con el texto en BLANCO, así que tiene
-- que dar 4.5 de contraste contra el blanco (WCAG AA). Se comprueba acá y no
-- solo en la pantalla: un color elegido a ojo deja el nombre ilegible.
create or replace function public.color_con_texto_blanco(p text)
returns boolean language plpgsql immutable set search_path to '' as $$
declare
  r double precision; g double precision; b double precision; l double precision;
begin
  if p is null or p !~ '^#[0-9a-f]{6}$' then return false; end if;
  r := ('x' || substr(p, 2, 2))::bit(8)::int / 255.0;
  g := ('x' || substr(p, 4, 2))::bit(8)::int / 255.0;
  b := ('x' || substr(p, 6, 2))::bit(8)::int / 255.0;
  r := case when r <= 0.03928 then r / 12.92 else power((r + 0.055) / 1.055, 2.4) end;
  g := case when g <= 0.03928 then g / 12.92 else power((g + 0.055) / 1.055, 2.4) end;
  b := case when b <= 0.03928 then b / 12.92 else power((b + 0.055) / 1.055, 2.4) end;
  l := 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (l + 0.05) >= 4.5;
end;
$$;

alter table public.academias drop constraint if exists academias_color_check;
alter table public.academias add constraint academias_color_check
  check (color is null or public.color_con_texto_blanco(color));
alter table public.academias drop constraint if exists academias_logo_check;
alter table public.academias add constraint academias_logo_check
  check (logo_path is null or logo_path ~ ('^' || id::text || '/logo-[a-z0-9]{6,40}\.(png|jpg|webp)$'));

-- El bucket es PÚBLICO a propósito: un logo es para verse, también en el
-- formulario que se abre sin cuenta. Solo imágenes rasterizadas: un SVG puede
-- llevar código, y abierto por su dirección se ejecutaría.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('academia-marca', 'academia-marca', true, 524288, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 524288,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

-- Quién escribe en la carpeta de una academia: su supervisor o quien administra.
create or replace function public.puede_marcar_academia(p_nombre text)
returns boolean language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_carpeta text := split_part(coalesce(p_nombre, ''), '/', 1);
begin
  if v_carpeta !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.soy_admin() or public.supervisa_academia(v_carpeta::uuid);
end;
$$;

drop policy if exists academia_marca_insert on storage.objects;
create policy academia_marca_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'academia-marca' and public.puede_marcar_academia(name));
drop policy if exists academia_marca_update on storage.objects;
create policy academia_marca_update on storage.objects for update to authenticated
  using (bucket_id = 'academia-marca' and public.puede_marcar_academia(name))
  with check (bucket_id = 'academia-marca' and public.puede_marcar_academia(name));
drop policy if exists academia_marca_delete on storage.objects;
create policy academia_marca_delete on storage.objects for delete to authenticated
  using (bucket_id = 'academia-marca' and public.puede_marcar_academia(name));

-- Guardar la marca: su supervisor o quien administra. El logo tiene que
-- EXISTIR en el bucket: una ruta que no apunta a nada pinta un recuadro roto
-- en cada página de la academia.
create or replace function public.academia_guardar_marca(p_id uuid, p_color text, p_logo_path text)
returns public.academias language plpgsql security definer set search_path to 'public' as $$
declare
  v_fila  public.academias;
  v_color text := nullif(lower(btrim(coalesce(p_color, ''))), '');
  v_logo  text := nullif(btrim(coalesce(p_logo_path, '')), '');
begin
  if not (public.soy_admin() or public.supervisa_academia(p_id)) then
    raise exception 'Solo su supervisor o quien administra cambia la marca.' using errcode = '42501';
  end if;
  if v_color is not null and not public.color_con_texto_blanco(v_color) then
    raise exception 'Ese color es muy claro: el nombre en blanco encima no se leería. Elige uno más oscuro.';
  end if;
  if v_logo is not null and not exists (
       select 1 from storage.objects o where o.bucket_id = 'academia-marca' and o.name = v_logo) then
    raise exception 'El logo no terminó de subirse. Vuelve a elegirlo.';
  end if;
  update public.academias set color = v_color, logo_path = v_logo, updated_at = now()
   where id = p_id returning * into v_fila;
  if not found then raise exception 'Esa academia ya no existe.'; end if;
  return v_fila;
end;
$$;

-- La marca que ve quien llama. Solo si es de UNA academia (miembro o
-- supervisor): con dos no hay forma de saber cuál, y se ve Ajedrez Integral,
-- la misma decisión que el remitente de los correos.
create or replace function public.mi_marca_academia()
returns table(academia_id uuid, nombre text, color text, logo_path text)
language sql stable security definer set search_path to 'public' set row_security to off as $$
  with mias as (
    select m.academia_id as id from public.academia_miembros m where m.persona_id = auth.uid()
    union
    select a.id from public.academias a where a.supervisor_id = auth.uid()
  )
  select a.id, a.nombre, a.color, a.logo_path
    from public.academias a
   where a.id in (select id from mias)
     and (select count(*) from mias) = 1;
$$;

-- Un formulario puede ser de una academia: sale con su marca.
alter table public.formularios
  add column if not exists academia_id uuid references public.academias(id) on delete set null;

-- Solo se le pone una academia de la que uno es (o cualquiera, si administra):
-- sin eso, un coordinador podría vestir su formulario con la marca de otra.
create or replace function public.formularios_academia_propia()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.academia_id is not null
     and (tg_op = 'INSERT' or new.academia_id is distinct from old.academia_id)
     and auth.uid() is not null
     and not (public.soy_admin() or public.supervisa_academia(new.academia_id)
              or public.soy_de_la_academia(new.academia_id)) then
    raise exception 'Ese formulario no puede llevar la marca de una academia de la que no eres.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists formularios_academia_propia on public.formularios;
create trigger formularios_academia_propia before insert or update on public.formularios
  for each row execute function public.formularios_academia_propia();

drop function if exists public.formulario_publico(text);
create function public.formulario_publico(p_slug text)
returns table(id uuid, titulo text, descripcion text, grupo text, campos jsonb, cierra_el timestamptz,
              academia_nombre text, academia_color text, academia_logo text)
language sql stable security definer set search_path to 'public' as $$
  select f.id, f.titulo, f.descripcion, f.grupo, f.campos, f.cierra_el,
         a.nombre, a.color, a.logo_path
  from public.formularios f
  left join public.academias a on a.id = f.academia_id
  where f.slug = p_slug
    and f.abierto
    and (f.cierra_el is null or f.cierra_el > now());
$$;

revoke execute on function public.formulario_publico(text) from public;
grant execute on function public.formulario_publico(text) to anon, authenticated, service_role;

revoke execute on function public.formularios_academia_propia() from public, anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array['public.academia_guardar_marca(uuid,text,text)', 'public.mi_marca_academia()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- Las usan políticas de storage evaluadas también para anon: devuelven false.
grant execute on function public.puede_marcar_academia(text) to anon, authenticated, service_role;
grant execute on function public.color_con_texto_blanco(text) to anon, authenticated, service_role;
