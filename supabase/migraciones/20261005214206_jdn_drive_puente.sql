-- La ficha de los JDN 2027: la dirección del Apps Script que guarda en el
-- Drive (herramientas/jdn-drive.gs) y su secreto, en la bóveda. Los lee y los
-- escribe solo la Edge Function jdn-drive, con la service role, después de
-- comprobar que quien llama administra (y entró con su segundo paso). Ver
-- «La ficha de los JDN 2027» en docs/decisiones/cuentas-y-formularios.md.

create or replace function public.jdn_drive_leer()
returns table (url text, secreto text)
language sql stable security definer set search_path = '' as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'jdn_drive_url'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'jdn_drive_secreto');
$$;
revoke all on function public.jdn_drive_leer() from public, anon, authenticated;

create or replace function public.jdn_drive_guardar(p_url text, p_secreto text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if coalesce(p_url, '') !~ '^https://script\.google\.com/macros/s/[A-Za-z0-9_-]{20,}/exec$' then
    raise exception 'La dirección no es la de una aplicación web de Apps Script' using errcode = '22023';
  end if;
  if length(coalesce(p_secreto, '')) < 32 then
    raise exception 'El secreto es demasiado corto' using errcode = '22023';
  end if;
  -- Se pisan: volver a conectar (otra implementación, otro secreto) es justo
  -- para lo que existe esta función.
  select id into v_id from vault.secrets where name = 'jdn_drive_url';
  if v_id is null then perform vault.create_secret(p_url, 'jdn_drive_url');
  else perform vault.update_secret(v_id, p_url); end if;
  select id into v_id from vault.secrets where name = 'jdn_drive_secreto';
  if v_id is null then perform vault.create_secret(p_secreto, 'jdn_drive_secreto');
  else perform vault.update_secret(v_id, p_secreto); end if;
end;
$$;
revoke all on function public.jdn_drive_guardar(text, text) from public, anon, authenticated;