-- La ficha de los JDN 2027 se puede mandar sin cuenta (jdn.html): la Edge
-- Function jdn-drive la pasa por el freno de los envíos públicos ANTES de
-- tocar el Drive. Ver «La ficha de los JDN 2027» en
-- docs/decisiones/cuentas-y-formularios.md.
--
-- Usa el freno de los formularios (interno.frenar_envio_publico, tipo
-- 'formulario', ámbito 'jdn-2027'), que anota cada envío con su IP y su
-- correo, y le suma topes propios, más estrictos: cada ficha son cuatro
-- archivos en el Drive de la academia. Una familia inscribe a dos o tres
-- hijos y un entrenador a su grupo desde la misma red; más que esto en una
-- hora no es una delegación.
--   por conexión: 15 por hora   por correo: 8 por día   en total: 60 por hora
--
-- La IP la manda la Edge Function (la saca de la petición): llama con la
-- service role, y las cabeceras que vería PostgREST serían las suyas.

create or replace function public.jdn_frenar(p_ip text, p_correo text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_ip text := nullif(btrim(coalesce(p_ip, '')), '');
  v_correo text := nullif(lower(btrim(coalesce(p_correo, ''))), '');
begin
  -- El mismo candado que toma el freno de los formularios: dos envíos a la
  -- vez no se cuentan uno al otro por fuera.
  perform pg_advisory_xact_lock(hashtext('envios_publicos:formulario'));

  if v_ip is not null and (select count(*) from interno.envios_publicos
        where tipo = 'formulario' and ambito = 'jdn-2027' and ip = v_ip
          and creado > now() - interval '1 hour') >= 15 then
    return 'Llegaron demasiadas fichas seguidas desde tu conexión. Espera un rato e intenta de nuevo.';
  end if;

  if v_correo is not null and (select count(*) from interno.envios_publicos
        where tipo = 'formulario' and ambito = 'jdn-2027' and correo = v_correo
          and creado > now() - interval '1 day') >= 8 then
    return 'Ya recibimos varias fichas con este correo hoy. Si necesitas mandar más, escríbele a la academia.';
  end if;

  if (select count(*) from interno.envios_publicos
        where tipo = 'formulario' and ambito = 'jdn-2027'
          and creado > now() - interval '1 hour') >= 60 then
    return 'Este formulario está recibiendo demasiadas fichas en este momento. Intenta de nuevo en una hora.';
  end if;

  -- El tope por IP de todos los formularios, y la anotación de este envío.
  return interno.frenar_envio_publico('formulario', 'jdn-2027', v_correo, v_ip);
end;
$$;
revoke all on function public.jdn_frenar(text, text) from public, anon, authenticated;