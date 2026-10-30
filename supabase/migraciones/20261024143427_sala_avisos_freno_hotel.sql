-- El freno de las altas de «Avisarme en este celular» (centroamericano-2026.html)
-- con más lugar por conexión: una delegación entera se aloja en el mismo hotel
-- y sale a internet por la misma IP del wifi, así que 10 aparatos nuevos por
-- hora desde una conexión se llenaban con una sola delegación. Ahora son 40;
-- el tope total (300 por hora) sigue igual.
--
-- Solo cuentan los aparatos NUEVOS: desde esta versión de la función
-- sala-jugadores, un aparato que ya estaba y cambia su lista no pasa por acá.
--
-- Ver «Seguir a mis jugadores y los avisos en el celular» en
-- docs/decisiones/juegos-y-torneos.md.

create or replace function public.sala_avisos_frenar(p_ip text)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_ip text := nullif(btrim(coalesce(p_ip, '')), '');
begin
  perform pg_advisory_xact_lock(hashtext('envios_publicos:sala-avisos'));
  if v_ip is not null and (select count(*) from interno.envios_publicos
        where tipo = 'sala' and ambito = 'avisos' and ip = v_ip
          and creado > now() - interval '1 hour') >= 40 then
    return 'Ya se activaron muchos avisos seguidos desde tu conexión. Espera un rato e intenta de nuevo.';
  end if;
  if (select count(*) from interno.envios_publicos
        where tipo = 'sala' and ambito = 'avisos'
          and creado > now() - interval '1 hour') >= 300 then
    return 'Se están activando demasiados avisos en este momento. Intenta de nuevo en una hora.';
  end if;
  insert into interno.envios_publicos (tipo, ambito, ip, correo) values ('sala', 'avisos', v_ip, null);
  return null;
end;
$$;
revoke all on function public.sala_avisos_frenar(text) from public, anon, authenticated;
grant execute on function public.sala_avisos_frenar(text) to service_role;