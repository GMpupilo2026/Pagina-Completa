-- Metropolitano 2026: las inscripciones (foto, comprobante, tiquete,
-- pasaporte y una ficha con los datos) pasan a un Drive ordenado por torneo y
-- por delegación. Lo hace la Edge Function metropolitano-drive con un Apps
-- Script de la dueña del Drive (documentos/metropolitano-2026/puente-drive.gs),
-- como los JDN y el Centroamericano. Ver «Las inscripciones en el Drive» en
-- docs/decisiones/cuentas-y-formularios.md.

-- Qué ya pasó al Drive y qué falló (se reintenta).
alter table public.metropolitano_inscripciones
  add column if not exists drive_en timestamptz,
  add column if not exists drive_error text;

-- La dirección y el secreto del Apps Script, y el aviso con que la base llama
-- a la función: en la bóveda, solo para service_role.
create or replace function public.metropolitano_drive_leer()
returns table (url text, secreto text, aviso text)
language sql stable security definer set search_path = '' as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'metropolitano_drive_url'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'metropolitano_drive_secreto'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'metropolitano_drive_aviso');
$$;
revoke all on function public.metropolitano_drive_leer() from public, anon, authenticated;
grant execute on function public.metropolitano_drive_leer() to service_role;

create or replace function public.metropolitano_drive_guardar(p_url text, p_secreto text)
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
  select id into v_id from vault.secrets where name = 'metropolitano_drive_url';
  if v_id is null then perform vault.create_secret(p_url, 'metropolitano_drive_url');
  else perform vault.update_secret(v_id, p_url); end if;
  select id into v_id from vault.secrets where name = 'metropolitano_drive_secreto';
  if v_id is null then perform vault.create_secret(p_secreto, 'metropolitano_drive_secreto');
  else perform vault.update_secret(v_id, p_secreto); end if;
end;
$$;
revoke all on function public.metropolitano_drive_guardar(text, text) from public, anon, authenticated;
grant execute on function public.metropolitano_drive_guardar(text, text) to service_role;

-- El aviso: un secreto que solo conocen la base y la función, para que la
-- llamada de cada 10 minutos no necesite la sesión de nadie.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'metropolitano_drive_aviso') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'metropolitano_drive_aviso');
  end if;
end;
$$;

-- Cada 10 minutos: si el Drive está conectado y hay inscripciones sin pasar,
-- le avisa a la función (pg_net, sin esperar la respuesta).
create or replace function interno.metropolitano_drive_tocar()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_aviso text;
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'metropolitano_drive_url') then return; end if;
  if not exists (select 1 from public.metropolitano_inscripciones where drive_en is null and estado = 'activa') then return; end if;
  select decrypted_secret into v_aviso from vault.decrypted_secrets where name = 'metropolitano_drive_aviso';
  perform net.http_post(
    url := 'https://bgtijpimpcokxatxxbki.supabase.co/functions/v1/metropolitano-drive',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-aviso', v_aviso),
    body := jsonb_build_object('accion', 'enviar'),
    timeout_milliseconds := 150000);
end;
$$;
revoke all on function interno.metropolitano_drive_tocar() from public, anon, authenticated;

select cron.schedule('metropolitano-drive', '*/10 * * * *', $$select interno.metropolitano_drive_tocar()$$);
