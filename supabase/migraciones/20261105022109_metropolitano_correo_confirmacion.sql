-- Metropolitano 2026: el correo de confirmación de cada inscripción. Lo manda
-- la Edge Function metropolitano-correo (verify_jwt en false), que la base
-- llama apenas se guarda una inscripción (el trigger, por pg_net: la llamada
-- sale solo si la transacción termina bien) y cada 10 minutos para reintentar
-- lo que no salió, hasta 3 intentos. La función trae el secreto
-- `metropolitano_correo_aviso` de la bóveda en `x-aviso` y solo puede mandar
-- lo pendiente. Dos llamadas a la vez no mandan dos veces: la función «toma»
-- las filas con un update (confirmacion_tomado) antes de mandar, y una tomada
-- hace menos de 5 minutos no la vuelve a tomar nadie. Ver «Los correos de confirmación» en
-- docs/decisiones/cuentas-y-formularios.md.

alter table public.metropolitano_inscripciones
  add column confirmacion_en timestamptz,
  add column confirmacion_error text,
  add column confirmacion_intentos int not null default 0,
  add column confirmacion_tomado timestamptz;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'metropolitano_correo_aviso') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'metropolitano_correo_aviso');
  end if;
end;
$$;

-- Para la función (con la clave de servicio): el secreto con que la llama la base.
create or replace function public.metropolitano_correo_aviso()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'metropolitano_correo_aviso';
$$;
revoke execute on function public.metropolitano_correo_aviso() from public, anon, authenticated;
grant execute on function public.metropolitano_correo_aviso() to service_role;

-- Si hay algo pendiente, le avisa a la función (pg_net, sin esperar la respuesta).
create or replace function interno.metropolitano_correo_tocar()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_aviso text;
begin
  if not exists (select 1 from public.metropolitano_inscripciones
                  where confirmacion_en is null and estado = 'activa' and confirmacion_intentos < 3) then
    return;
  end if;
  select decrypted_secret into v_aviso from vault.decrypted_secrets where name = 'metropolitano_correo_aviso';
  perform net.http_post(
    url := 'https://bgtijpimpcokxatxxbki.supabase.co/functions/v1/metropolitano-correo',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-aviso', v_aviso),
    body := jsonb_build_object('accion', 'enviar'),
    timeout_milliseconds := 120000);
end;
$$;
revoke all on function interno.metropolitano_correo_tocar() from public, anon, authenticated;

-- Una vez por envío: la función de inscribir mete a cada persona de una
-- delegación con su propio insert, así que el trigger marca la transacción y
-- solo la primera vez encola el pedido (pg_net lo manda cuando termina bien).
create or replace function interno.metropolitano_correo_avisa()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('metropolitano.correo_avisado', true), '') = '1' then
    return null;
  end if;
  perform set_config('metropolitano.correo_avisado', '1', true);
  perform interno.metropolitano_correo_tocar();
  return null;
end;
$$;
revoke all on function interno.metropolitano_correo_avisa() from public, anon, authenticated;
create trigger metropolitano_correo_avisa after insert on public.metropolitano_inscripciones
  for each statement execute function interno.metropolitano_correo_avisa();

select cron.schedule('metropolitano-correo', '*/10 * * * *', $$select interno.metropolitano_correo_tocar()$$);