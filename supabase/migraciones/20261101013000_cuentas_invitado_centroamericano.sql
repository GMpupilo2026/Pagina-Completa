-- Las cuentas de invitado del Centroamericano 2026: 5 días de la Academia que
-- cualquiera se abre sola desde centroamericano-2026.html, del 1 al 9 de
-- noviembre, sin que intervenga quien administra, y que se cierran solas.
--
-- Lo pidió el dueño del sitio: que quien entra a la página del torneo pueda
-- probar la Academia por su cuenta esos días, y llevar el control de esas
-- cuentas aparte. Es la prueba gratis de siempre (pruebas_gratis, ver «La
-- prueba gratis de 3 días») con tres diferencias, y por eso va en la MISMA
-- tabla: así acceso_vigente() la corta sin cambiar una línea.
--
--   1. Dura 5 días, no 3.
--   2. La abre la persona, no administración: la Edge Function
--      `cuenta-invitado` no pide sesión. Por eso lleva freno (tipo
--      'cuenta_evento') y las FECHAS LAS DECIDE LA BASE, no la página: fuera
--      del 1 al 9 de noviembre (hora de Costa Rica) las dos funciones de abajo
--      rechazan, llame quien llame.
--   3. Queda marcada: `origen = 'centroamericano-2026'`. Es la lista de
--      «cuentas de invitado» de administración y la cuenta de cuántas salieron
--      del torneo.
--
-- Ver «Las cuentas de invitado del Centroamericano» en
-- docs/decisiones/cobros-acceso-y-tienda.md.

-- ---- la marca de origen ----
alter table public.pruebas_gratis add column origen text;
alter table public.pruebas_gratis add constraint pruebas_gratis_origen_conocido
  check (origen is null or origen in ('centroamericano-2026'));
comment on column public.pruebas_gratis.origen is
  'null: la prueba de 3 días que crea administración. ''centroamericano-2026'': cuenta de invitado de 5 días que la persona se abrió sola desde centroamericano-2026.html (cuenta_invitado_activar).';

-- ---- las fechas, en un solo lugar ----
-- Recibe el día para poder probarla con cualquier fecha; las funciones le
-- pasan el de hoy en hora de Costa Rica.
create or replace function interno.cuentas_invitado_abiertas(p_hoy date)
 returns boolean
 language sql
 immutable
 set search_path to ''
as $function$
  select coalesce(p_hoy between date '2026-11-01' and date '2026-11-09', false);
$function$;
revoke execute on function interno.cuentas_invitado_abiertas(date) from public, anon, authenticated;

-- ---- el freno, con el tipo nuevo ----
-- Topes de 'cuenta_evento': 20 por IP en una hora y 150 en total por hora. Más
-- holgado que 'prueba' (3 por IP) a propósito: en el Gimnasio Nacional media
-- sala sale a internet por la MISMA IP (el wifi del lugar o el mismo
-- operador), y la cuenta es de una persona que decide si sigue; lo que se
-- frena es un script, no una familia.
create or replace function interno.frenar_envio_publico(p_tipo text, p_ambito text, p_correo text, p_ip text DEFAULT NULL::text)
 returns text
 language plpgsql
 set search_path to 'public'
as $function$
declare
  cab jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_ip text := nullif(btrim(coalesce(
                 p_ip,
                 cab->>'cf-connecting-ip',
                 cab->>'x-real-ip',
                 split_part(cab->>'x-forwarded-for', ',', 1))), '');
  v_correo text := nullif(lower(btrim(coalesce(p_correo, ''))), '');
  v_ambito text := left(coalesce(p_ambito, ''), 200);
  -- Topes: por IP en una hora, por correo en el período, total por hora.
  tope_ip int;  tope_correo int;  periodo_correo interval;  tope_total int;
begin
  case p_tipo
    when 'formulario' then tope_ip := 40; tope_correo := null; periodo_correo := null;              tope_total := 300;
    when 'arbitraje'  then tope_ip := 40; tope_correo := 10;   periodo_correo := interval '1 hour'; tope_total := 200;
    when 'solicitud'  then tope_ip := 5;  tope_correo := 3;    periodo_correo := interval '1 day';  tope_total := 30;
    when 'prueba'     then tope_ip := 3;  tope_correo := null; periodo_correo := null;              tope_total := 40;
    when 'encuesta'   then tope_ip := 40; tope_correo := null; periodo_correo := null;              tope_total := 300;
    when 'quiniela'   then tope_ip := 40; tope_correo := 5;    periodo_correo := interval '1 day';  tope_total := 500;
    when 'invitado'   then tope_ip := 30; tope_correo := null; periodo_correo := null;              tope_total := 150;
    -- Espacio de consultas (herramientas-arbitraje.html): cada una llama a la
    -- IA, así que el tope existe para proteger el gasto, no solo para parar un
    -- script. Diez por IP en una hora alcanza de sobra para una familia o un
    -- club haciendo varias preguntas seguidas; cinco por correo al día frena
    -- probar la misma dirección una y otra vez.
    when 'arbitraje_consulta' then tope_ip := 10; tope_correo := 5; periodo_correo := interval '1 day'; tope_total := 80;
    -- Las cuentas de invitado del Centroamericano (cuenta_invitado_frenar).
    when 'cuenta_evento' then tope_ip := 20; tope_correo := null; periodo_correo := null;           tope_total := 150;
    else raise exception 'tipo de envío desconocido: %', p_tipo;
  end case;

  -- Dos envíos a la vez del mismo tipo no se cuentan uno al otro por fuera.
  perform pg_advisory_xact_lock(hashtext('envios_publicos:' || p_tipo));

  if v_ip is not null and (select count(*) from interno.envios_publicos
        where tipo = p_tipo and ip = v_ip and creado > now() - interval '1 hour') >= tope_ip then
    return 'Llegaron demasiados envíos seguidos desde tu conexión. Espera un rato e intenta de nuevo.';
  end if;

  if v_correo is not null and tope_correo is not null and (select count(*) from interno.envios_publicos
        where tipo = p_tipo and correo = v_correo and creado > now() - periodo_correo) >= tope_correo then
    return 'Ya recibimos varios envíos con este correo. Espera un rato antes de mandar otro.';
  end if;

  if (select count(*) from interno.envios_publicos
        where tipo = p_tipo and ambito = v_ambito and creado > now() - interval '1 hour') >= tope_total then
    return 'Este formulario está recibiendo demasiados envíos en este momento. Intenta de nuevo en una hora.';
  end if;

  insert into interno.envios_publicos (tipo, ambito, ip, correo)
  values (p_tipo, v_ambito, v_ip, v_correo);

  -- Lo de hace más de dos días ya no cuenta para ningún tope.
  delete from interno.envios_publicos where creado < now() - interval '2 days';
  return null;
end;
$function$;
revoke execute on function interno.frenar_envio_publico(text, text, text, text) from public, anon, authenticated;

-- ---- las dos funciones que llama la Edge Function (solo la service role) ----
-- ANTES de crear la cuenta: fechas y freno. Devuelve null si se puede, o el
-- texto que se le muestra a la persona.
create or replace function public.cuenta_invitado_frenar(p_ip text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not interno.cuentas_invitado_abiertas((now() at time zone 'America/Costa_Rica')::date) then
    return 'Las cuentas gratis del Centroamericano se abren solo del 1 al 9 de noviembre de 2026.';
  end if;
  return interno.frenar_envio_publico('cuenta_evento', 'centroamericano-2026', null,
                                      nullif(left(btrim(coalesce(p_ip, '')), 64), ''));
end;
$function$;
revoke execute on function public.cuenta_invitado_frenar(text) from public, anon, authenticated;
grant execute on function public.cuenta_invitado_frenar(text) to service_role;

-- DESPUÉS de crear la cuenta (bloqueada): la marca como invitado por 5 días y
-- devuelve cuándo vence, LEÍDO de la fila guardada. Igual que
-- prueba_gratis_activar(): solo una cuenta de alumno creada hace menos de 10
-- minutos y con la aceptación legal; además, vuelve a mirar las fechas.
create or replace function public.cuenta_invitado_activar(
  p_alumno uuid, p_nombre text, p_ip text, p_privacidad text, p_terminos text)
 returns timestamptz
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_vence timestamptz;
begin
  if not interno.cuentas_invitado_abiertas((now() at time zone 'America/Costa_Rica')::date) then
    raise exception 'Las cuentas gratis del Centroamericano se abren solo del 1 al 9 de noviembre de 2026.' using errcode = '42501';
  end if;
  if not coalesce(interno.version_legal_valida(p_privacidad) and interno.version_legal_valida(p_terminos), false) then
    raise exception 'Falta aceptar la Política de privacidad y los Términos.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p
                  where p.id = p_alumno and p.role = 'alumno' and not coalesce(p.is_admin, false)
                    and p.created_at > now() - interval '10 minutes') then
    raise exception 'Esa no es una cuenta de invitado recién creada.' using errcode = '42501';
  end if;

  update public.profiles set full_name = left(btrim(p_nombre), 80) where id = p_alumno;
  insert into public.pruebas_gratis (alumno_id, vence, ip, privacidad_version, terminos_version, origen)
  values (p_alumno, now() + interval '5 days', nullif(left(btrim(coalesce(p_ip, '')), 64), ''),
          p_privacidad, p_terminos, 'centroamericano-2026');

  select g.vence into v_vence from public.pruebas_gratis g where g.alumno_id = p_alumno;
  return v_vence;
end;
$function$;
revoke execute on function public.cuenta_invitado_activar(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.cuenta_invitado_activar(uuid, text, text, text, text) to service_role;

-- ---- mi_acceso(): la prueba dice de dónde salió y cuántos días eran ----
-- Para que el panel no diga «Tu prueba gratis de 3 días terminó» a una cuenta
-- de 5. `origen` y `dias_total` se suman a lo que ya devolvía; nada cambia
-- para los demás motivos.
create or replace function public.mi_acceso()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v_rol text; v_admin boolean; v_exigido boolean; v_hoy date := (now() at time zone 'America/Costa_Rica')::date;
        v_hasta date; v_nombre text; v_vigente boolean := public.acceso_vigente(); v_prueba timestamptz;
        v_temporal timestamptz; v_detalle text; v_empieza timestamptz; v_origen text;
begin
  select role, is_admin into v_rol, v_admin from public.profiles where id = auth.uid();
  select exigido into v_exigido from public.acceso_config where id;
  v_exigido := coalesce(v_exigido, false);
  if v_rol is null then
    return jsonb_build_object('vigente', v_vigente, 'motivo', 'sin_perfil', 'exigido', v_exigido);
  end if;
  if coalesce(v_admin, false) or v_rol <> 'alumno' then
    return jsonb_build_object('vigente', v_vigente, 'motivo', 'equipo', 'exigido', v_exigido);
  end if;
  select p.vigente_hasta, p.nombre into v_hasta, v_nombre
    from public.paquete_alumnos pa join public.paquetes_acceso p on p.id = pa.paquete_id
   where pa.alumno_id = auth.uid() and p.vigente_desde <= v_hoy
   order by p.vigente_hasta desc limit 1;
  if v_hasta is not null and v_hasta >= v_hoy then
    return jsonb_build_object('vigente', v_vigente, 'motivo', 'paquete', 'exigido', v_exigido,
      'hasta', v_hasta, 'dias', v_hasta - v_hoy, 'paquete', v_nombre);
  end if;
  select t.vence, t.detalle into v_temporal, v_detalle from public.cuentas_temporales t where t.persona_id = auth.uid();
  if v_temporal is not null then
    return jsonb_build_object('vigente', v_vigente,
      'motivo', case when v_temporal > now() then 'temporal' else 'temporal_vencida' end,
      'exigido', v_exigido, 'vence', v_temporal, 'detalle', v_detalle,
      'dias', greatest(0, (v_temporal at time zone 'America/Costa_Rica')::date - v_hoy));
  end if;
  select g.vence, g.empieza, g.origen into v_prueba, v_empieza, v_origen from public.pruebas_gratis g where g.alumno_id = auth.uid();
  if v_prueba is not null then
    return jsonb_build_object('vigente', v_vigente,
      'motivo', case when v_prueba > now() then 'prueba' else 'prueba_vencida' end,
      'exigido', v_exigido, 'vence', v_prueba,
      'horas', greatest(0, ceil(extract(epoch from (v_prueba - now())) / 3600))::int,
      'origen', v_origen,
      'dias_total', round(extract(epoch from (v_prueba - v_empieza)) / 86400)::int);
  end if;
  return jsonb_build_object('vigente', v_vigente,
    'motivo', case when not v_exigido then 'sin_exigir' when v_hasta is null then 'sin_paquete' else 'vencido' end,
    'exigido', v_exigido, 'hasta', v_hasta, 'paquete', v_nombre);
end $function$;
