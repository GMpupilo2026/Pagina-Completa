-- La verificación en dos pasos (TOTP). Ver «La verificación en dos pasos» en
-- docs/decisiones/permisos-y-roles.md.

-- ¿Esta sesión cumple? Sí si no hay sesión (anon), si ya pasó el segundo paso
-- (aal2) o si la cuenta no la tiene activada. Solo contesta sobre uno mismo.
create or replace function interno.verificacion_al_dia()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is null
      or coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
      or not exists (
           select 1 from auth.mfa_factors f
            where f.user_id = (select auth.uid()) and f.status = 'verified');
$$;
revoke execute on function interno.verificacion_al_dia() from public, anon;
grant execute on function interno.verificacion_al_dia() to authenticated, service_role;

-- El candado de la API: PostgREST lo corre antes de cada pedido (tablas y
-- funciones). Lo corren anon, authenticated y service_role, así que los tres
-- tienen que poder ejecutarlo: sin eso se cae la API entera.
create or replace function public.antes_de_cada_pedido()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not interno.verificacion_al_dia() then
    raise exception using
      errcode = '42501',
      message = 'Falta el segundo paso de la verificación: vuelve a entrar y escribe el código de tu app.',
      hint = 'verificacion_en_dos_pasos';
  end if;
end;
$$;
grant execute on function public.antes_de_cada_pedido() to anon, authenticated, service_role;

-- Lo que NO pasa por PostgREST: Realtime (lee con la RLS de cada tabla) y
-- Storage (la RLS de storage.objects). Ahí va una política restrictiva.
do $$
declare t text;
begin
  for t in select tablename from pg_publication_tables
            where pubname = 'supabase_realtime' and schemaname = 'public'
  loop
    execute format(
      'create policy verificacion_en_dos_pasos on public.%I as restrictive for all to authenticated
         using ((select interno.verificacion_al_dia())) with check ((select interno.verificacion_al_dia()))', t);
  end loop;
end $$;

create policy verificacion_en_dos_pasos on storage.objects as restrictive for all to authenticated
  using ((select interno.verificacion_al_dia())) with check ((select interno.verificacion_al_dia()));

-- Quién la tiene activada: para la revisión de accesos de quien administra.
create or replace function public.personas_con_dos_pasos()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct f.user_id from auth.mfa_factors f
   where f.status = 'verified' and public.soy_admin();
$$;
revoke execute on function public.personas_con_dos_pasos() from public, anon;
grant execute on function public.personas_con_dos_pasos() to authenticated;

-- Quitársela a quien perdió el celular. Solo quien administra, y entrando
-- con su PROPIO código: con una contraseña robada de administración no se
-- desarma la de nadie.
create or replace function public.quitar_verificacion_en_dos_pasos(p_persona uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if not coalesce(public.soy_admin() and (select auth.jwt()) ->> 'aal' = 'aal2', false) then
    raise exception 'Solo quien administra, entrando con su propio código, puede quitarle la verificación a otra persona.'
      using errcode = '42501';
  end if;
  if p_persona = (select auth.uid()) then
    raise exception 'La tuya se quita desde Configuración.';
  end if;
  delete from auth.mfa_factors where user_id = p_persona;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.quitar_verificacion_en_dos_pasos(uuid) from public, anon;
grant execute on function public.quitar_verificacion_en_dos_pasos(uuid) to authenticated;