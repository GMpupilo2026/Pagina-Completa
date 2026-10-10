-- El freno de la Edge Function «pareo-elo-nacional» (Pareo Integral busca el
-- Elo Nacional de una lista de jugadores, sin cuenta). Mismo patrón que
-- jde_frenar() y jdn_frenar(): no hay tabla propia —no se guarda nada de lo
-- que se busca ni quién lo buscó—, solo este freno antes de salir a buscar en
-- ajedrezcostarica.com, para que un pedido no se repita sin límite.
--
-- Solo hay IP, nunca correo: Pareo Integral no pide ningún dato de quien
-- organiza.
--   por conexión: 6 pedidos por hora   en total: 60 por hora
create or replace function public.pareo_elo_frenar(p_ip text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_ip text := nullif(btrim(coalesce(p_ip, '')), '');
begin
  perform pg_advisory_xact_lock(hashtext('envios_publicos:formulario'));

  if v_ip is not null and (select count(*) from interno.envios_publicos
        where tipo = 'formulario' and ambito = 'pareo-elo-nacional' and ip = v_ip
          and creado > now() - interval '1 hour') >= 6 then
    return 'Ya buscaste varias veces en la última hora. Espera un rato e intenta de nuevo.';
  end if;

  if (select count(*) from interno.envios_publicos
        where tipo = 'formulario' and ambito = 'pareo-elo-nacional'
          and creado > now() - interval '1 hour') >= 60 then
    return 'Esta búsqueda está recibiendo demasiados pedidos en este momento. Intenta de nuevo en una hora.';
  end if;

  return interno.frenar_envio_publico('formulario', 'pareo-elo-nacional', null, v_ip);
end;
$$;
revoke all on function public.pareo_elo_frenar(text) from public, anon, authenticated;
