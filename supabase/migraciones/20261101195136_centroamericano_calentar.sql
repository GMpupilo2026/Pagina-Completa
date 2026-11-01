-- La función centroamericano-mesa «caliente» durante el torneo.
--
-- POR QUÉ: una función de Supabase que lleva rato sin recibir pedidos se apaga, y el primer pedido paga el arranque.
-- Con 15 a 20 tablets pidiendo a la vez después de un rato quieto, en la prueba contra producción 3 de 20 pedidos
-- dieron «BOOT_ERROR» (la función no alcanzó a arrancar). La tablet ya reintenta sola, pero es mejor que casi no pase:
-- cada minuto, durante el horario del torneo, la base le manda unos pedidos livianos en paralelo (acción «calentar»,
-- que no toca la base ni chess-results) para tener varias copias de la función arrancadas.
--
-- Solo del 1 al 9 de noviembre de 2026 y de 6:00 a 22:00 hora de Costa Rica; fuera de eso no hace nada (y se
-- puede apagar con cron.unschedule('centroamericano-calentar')). No lleva ninguna clave: el pedido no pide nada.

create function interno.centroamericano_calentar()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_hora int := extract(hour from (now() at time zone 'America/Costa_Rica'));
  i int;
begin
  if now() < timestamptz '2026-11-01 00:00:00-06' or now() > timestamptz '2026-11-10 00:00:00-06' then return; end if;
  if v_hora < 6 or v_hora >= 22 then return; end if;
  for i in 1..8 loop
    perform net.http_post(
      url := 'https://bgtijpimpcokxatxxbki.supabase.co/functions/v1/centroamericano-mesa',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('action', 'calentar'),
      timeout_milliseconds := 8000);
  end loop;
end;
$$;
revoke all on function interno.centroamericano_calentar() from public, anon, authenticated;

select cron.schedule('centroamericano-calentar', '* * * * *', $$select interno.centroamericano_calentar()$$);
