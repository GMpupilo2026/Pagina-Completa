-- El envío automático de los informes a los encargados.
--
-- pg_cron dispara una vez al día y pg_net llama a la Edge Function, que es la
-- que arma el correo y lo manda por Resend. La tanda no la puede disparar
-- cualquiera: va firmada con un secreto que vive en la bóveda (Vault) y que la
-- propia función vuelve a leer para compararlo. Se genera aquí y **nadie lo
-- escribe ni lo ve**: ni siquiera sale en este archivo.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'tanda_informes_secreto') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'tanda_informes_secreto',
      'Firma con la que pg_cron dispara la tanda de informes a encargados.');
  end if;
end $$;

-- La Edge Function la lee con la service role para comparar. A nadie más.
create or replace function public.secreto_tanda_informes()
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'tanda_informes_secreto';
$$;
revoke execute on function public.secreto_tanda_informes() from public, anon, authenticated;
grant execute on function public.secreto_tanda_informes() to service_role;

-- Lo que corre cada día. Si por lo que sea faltara el secreto, no llama a nadie
-- en vez de mandar una petición sin firma que va a rebotar.
create or replace function public.disparar_informes_encargados()
returns void language plpgsql security definer set search_path = '' as $$
declare
  secreto text;
begin
  select decrypted_secret into secreto from vault.decrypted_secrets where name = 'tanda_informes_secreto';
  if secreto is null or secreto = '' then
    raise warning 'No hay secreto de tanda: no se dispararon los informes a encargados.';
    return;
  end if;
  perform extensions.net.http_post(
    url := 'https://bgtijpimpcokxatxxbki.supabase.co/functions/v1/informes-encargados',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secreto),
    body := jsonb_build_object('action', 'tanda'),
    timeout_milliseconds := 120000
  );
end;
$$;
revoke execute on function public.disparar_informes_encargados() from public, anon, authenticated;

-- 13:00 UTC = 7:00 de la mañana en Costa Rica. Corre todos los días; cada
-- encargado recibe el suyo solo cuando le toca según su frecuencia, y de eso se
-- encarga la función.
select cron.unschedule('informes-a-encargados')
where exists (select 1 from cron.job where jobname = 'informes-a-encargados');

select cron.schedule('informes-a-encargados', '0 13 * * *',
                     $$select public.disparar_informes_encargados();$$);