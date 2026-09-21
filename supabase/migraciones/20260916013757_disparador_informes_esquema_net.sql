-- pg_net se instala "en extensions" pero sus funciones viven en el esquema net,
-- que es el que hay que nombrar.
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
  perform net.http_post(
    url := 'https://bgtijpimpcokxatxxbki.supabase.co/functions/v1/informes-encargados',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secreto),
    body := jsonb_build_object('action', 'tanda'),
    timeout_milliseconds := 120000
  );
end;
$$;
revoke execute on function public.disparar_informes_encargados() from public, anon, authenticated;