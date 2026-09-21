-- ============================================================================
-- La tanda diaria: generar los cobros del periodo y mandar los recordatorios.
--
-- Mismo patrón que los informes a encargados: la Edge Function corre con
-- verify_jwt en false (el disparador no trae sesión de persona), así que a
-- cambio exige un secreto que vive en el Vault y que la propia función vuelve
-- a leer con la service role para compararlo. El secreto lo genera esta
-- migración con gen_random_bytes y no queda escrito en ninguna parte.
-- ============================================================================

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'tanda_cobros_secreto') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'tanda_cobros_secreto');
  end if;
end $$;

create or replace function public.secreto_tanda_cobros()
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'tanda_cobros_secreto';
$$;
revoke all on function public.secreto_tanda_cobros() from anon, authenticated;

create or replace function public.disparar_recordatorios_cobro()
returns void language plpgsql security definer set search_path = '' as $$
declare
  secreto text;
begin
  select decrypted_secret into secreto
    from vault.decrypted_secrets where name = 'tanda_cobros_secreto';
  if secreto is null or secreto = '' then
    raise warning 'No hay secreto de tanda: no se mandaron los recordatorios de cobro.';
    return;
  end if;
  perform net.http_post(
    url := 'https://bgtijpimpcokxatxxbki.supabase.co/functions/v1/cobros-recordatorios',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Authorization', 'Bearer ' || secreto),
    body := jsonb_build_object('action', 'tanda'),
    timeout_milliseconds := 120000
  );
end;
$$;
revoke all on function public.disparar_recordatorios_cobro() from anon, authenticated;

-- 11:30 UTC = 5:30 de la mañana en Costa Rica: los cobros del periodo quedan
-- emitidos antes de que salgan los recordatorios (12:30 UTC) y los informes
-- a la casa (13:00 UTC).
select cron.schedule('cobros-generar', '30 11 * * *',
                     $cron$select public.generar_cobros(current_date);$cron$);
select cron.schedule('cobros-recordatorios', '30 12 * * *',
                     $cron$select public.disparar_recordatorios_cobro();$cron$);
