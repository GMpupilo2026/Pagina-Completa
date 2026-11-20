-- recuperar-acceso solo tenía el freno por cuenta (un enlace por minuto, con
-- recovery_sent_at). Sin tope por IP, un bucle cada 61 s manda ~1440 correos
-- al día a una familia y, como cada enlace nuevo anula el anterior, mata el
-- enlace legítimo antes de que lo abran; con muchas cuentas conocidas gasta el
-- cupo de Resend. Este freno cuenta los intentos por IP y en total (en
-- interno.envios_publicos, tipo 'recuperar'). La IP la pone el worker desde
-- cf-connecting-ip (no se falsifica); sin IP, solo cuenta el total.
create or replace function public.recuperar_acceso_frenar(p_ip text)
returns boolean
language plpgsql security definer set search_path to ''
as $$
declare
  v_ip text := nullif(btrim(coalesce(p_ip, '')), '');
begin
  perform pg_advisory_xact_lock(hashtext('envios_publicos:recuperar'));
  -- 10 por hora por IP: de sobra para quien de verdad olvidó su contraseña.
  if v_ip is not null and (select count(*) from interno.envios_publicos
        where tipo = 'recuperar' and ip = v_ip
          and creado > now() - interval '1 hour') >= 10 then
    return true;
  end if;
  -- 100 por hora en total: corta el bombardeo desde muchas IP.
  if (select count(*) from interno.envios_publicos
        where tipo = 'recuperar'
          and creado > now() - interval '1 hour') >= 100 then
    return true;
  end if;
  insert into interno.envios_publicos (tipo, ambito, ip, correo) values ('recuperar', 'recuperar', v_ip, null);
  return false;
end;
$$;

revoke all on function public.recuperar_acceso_frenar(text) from public, anon, authenticated;
grant execute on function public.recuperar_acceso_frenar(text) to service_role;
