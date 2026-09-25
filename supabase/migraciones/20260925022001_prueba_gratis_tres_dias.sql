-- La prueba gratis de 3 días: una cuenta sin correo que se cierra sola.
--
-- Quien quiere probar la Academia escribe su nombre y una contraseña en
-- prueba-gratis.html y entra: se le arma un usuario del dominio sin buzón
-- (alumno.ajedrez-integral.com), como a los alumnos sin correo. La cuenta la
-- crea la Edge Function `prueba-gratis` (service role), que llama a las dos
-- funciones de abajo: el freno ANTES de crear la cuenta y la activación
-- DESPUÉS.
--
-- EL CANDADO ES LA MISMA PREGUNTA DE SIEMPRE, `acceso_vigente()`, y NO depende
-- del interruptor `acceso_config.exigido`. Con el interruptor apagado, una
-- cuenta de alumno sin paquete entra para siempre; una de prueba no: a las 72
-- horas de creada, `acceso_vigente()` le contesta false, y con eso se le
-- cierran las políticas restrictivas, los tres triggers y el candado de los
-- cursos en el worker. Si después compra, basta con meterla en un paquete: con
-- un paquete vigente vuelve a entrar, con el mismo usuario y su progreso.
--
-- Ver «La prueba gratis de 3 días» en docs/decisiones/cobros-acceso-y-tienda.md.

-- ---- la tabla ----
create table public.pruebas_gratis (
  alumno_id uuid primary key references public.profiles(id) on delete cascade,
  empieza timestamptz not null default now(),
  vence timestamptz not null,
  ip text,
  privacidad_version text not null,
  terminos_version text not null,
  aceptado_en timestamptz not null default now(),
  constraint pruebas_gratis_vence_despues check (vence > empieza)
);
comment on table public.pruebas_gratis is
  'Cuentas creadas por la prueba gratis (prueba-gratis.html). acceso_vigente() les cierra la Academia en `vence` aunque acceso_config.exigido esté apagado, salvo que tengan un paquete vigente. Solo la escribe prueba_gratis_activar() (service role).';

alter table public.pruebas_gratis enable row level security;
revoke all on public.pruebas_gratis from public, anon, authenticated;
grant select on public.pruebas_gratis to authenticated;
-- Quien administra las ve todas (para saber a quién ofrecerle la cuenta); la
-- persona, la suya. Nadie escribe desde el navegador.
create policy pruebas_gratis_ver on public.pruebas_gratis
  for select to authenticated
  using (alumno_id = (select auth.uid()) or (select public.soy_admin()));

-- ---- el freno, ahora con la IP que le pasa quien llama ----
-- Desde una Edge Function, `request.headers` trae la IP de la función, no la
-- de la persona: la función la lee de SU petición y la manda aquí. Sin p_ip
-- se comporta exactamente igual que antes. Se borra y se vuelve a crear
-- porque cambia la firma: con dos versiones, una llamada de tres argumentos
-- sería ambigua.
drop function interno.frenar_envio_publico(text, text, text);
create function interno.frenar_envio_publico(p_tipo text, p_ambito text, p_correo text, p_ip text default null)
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
    -- Cada prueba es una cuenta nueva con 3 días de Academia: el tope por IP
    -- es chico. Un colegio sale por una sola IP, pero la prueba es de una
    -- persona que decide si compra, no de un grupo (el grupo se arma con un
    -- paquete).
    when 'prueba'     then tope_ip := 3;  tope_correo := null; periodo_correo := null;              tope_total := 40;
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

-- ---- las dos funciones que llama la Edge Function ----
create or replace function public.prueba_gratis_frenar(p_ip text)
 returns text
 language sql
 security definer
 set search_path to 'public'
as $function$
  select interno.frenar_envio_publico('prueba', 'prueba', null, nullif(left(btrim(coalesce(p_ip, '')), 64), ''));
$function$;
revoke execute on function public.prueba_gratis_frenar(text) from public, anon, authenticated;
grant execute on function public.prueba_gratis_frenar(text) to service_role;

-- Marca la cuenta recién creada como prueba y devuelve cuándo vence, LEÍDO de
-- la fila guardada. Rechaza lo que no sea una cuenta de alumno nueva: no sirve
-- para ponerle fecha de corte a un alumno que ya existía.
create or replace function public.prueba_gratis_activar(
  p_alumno uuid, p_nombre text, p_ip text, p_privacidad text, p_terminos text)
 returns timestamptz
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_vence timestamptz;
begin
  if not coalesce(interno.version_legal_valida(p_privacidad) and interno.version_legal_valida(p_terminos), false) then
    raise exception 'Falta aceptar la Política de privacidad y los Términos.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p
                  where p.id = p_alumno and p.role = 'alumno' and not coalesce(p.is_admin, false)
                    and p.created_at > now() - interval '10 minutes') then
    raise exception 'Esa no es una cuenta de prueba recién creada.' using errcode = '42501';
  end if;

  update public.profiles set full_name = left(btrim(p_nombre), 80) where id = p_alumno;
  insert into public.pruebas_gratis (alumno_id, vence, ip, privacidad_version, terminos_version)
  values (p_alumno, now() + interval '3 days', nullif(left(btrim(coalesce(p_ip, '')), 64), ''), p_privacidad, p_terminos);

  select g.vence into v_vence from public.pruebas_gratis g where g.alumno_id = p_alumno;
  return v_vence;
end;
$function$;
revoke execute on function public.prueba_gratis_activar(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.prueba_gratis_activar(uuid, text, text, text, text) to service_role;

-- ---- el candado ----
-- La prueba se pregunta ANTES que el interruptor: vale esté encendido o no.
-- Con un paquete vigente, la prueba ya no importa (compró).
create or replace function public.acceso_vigente()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
 set row_security to 'off'
as $function$
  select case
    when auth.uid() is null then true
    when not exists (select 1 from public.profiles pr
                      where pr.id = auth.uid() and pr.role = 'alumno' and not coalesce(pr.is_admin, false)) then true
    when exists (select 1 from public.pruebas_gratis g where g.alumno_id = auth.uid()) then
      exists (select 1 from public.pruebas_gratis g where g.alumno_id = auth.uid() and g.vence > now())
      or exists (
        select 1 from public.paquete_alumnos pa
          join public.paquetes_acceso p on p.id = pa.paquete_id
         where pa.alumno_id = auth.uid()
           and p.vigente_desde <= (now() at time zone 'America/Costa_Rica')::date
           and p.vigente_hasta >= (now() at time zone 'America/Costa_Rica')::date)
    when not coalesce((select c.exigido from public.acceso_config c where c.id), false) then true
    else exists (
      select 1 from public.paquete_alumnos pa
        join public.paquetes_acceso p on p.id = pa.paquete_id
       where pa.alumno_id = auth.uid()
         and p.vigente_desde <= (now() at time zone 'America/Costa_Rica')::date
         and p.vigente_hasta >= (now() at time zone 'America/Costa_Rica')::date)
  end;
$function$;

-- mi_acceso() dice además «prueba» (con `vence` y las horas que quedan) o
-- «prueba_vencida». Con un paquete vigente sigue diciendo «paquete».
create or replace function public.mi_acceso()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v_rol text; v_admin boolean; v_exigido boolean; v_hoy date := (now() at time zone 'America/Costa_Rica')::date;
        v_hasta date; v_nombre text; v_vigente boolean := public.acceso_vigente(); v_prueba timestamptz;
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
  select g.vence into v_prueba from public.pruebas_gratis g where g.alumno_id = auth.uid();
  if v_prueba is not null then
    return jsonb_build_object('vigente', v_vigente,
      'motivo', case when v_prueba > now() then 'prueba' else 'prueba_vencida' end,
      'exigido', v_exigido, 'vence', v_prueba,
      'horas', greatest(0, ceil(extract(epoch from (v_prueba - now())) / 3600))::int);
  end if;
  return jsonb_build_object('vigente', v_vigente,
    'motivo', case when not v_exigido then 'sin_exigir' when v_hasta is null then 'sin_paquete' else 'vencido' end,
    'exigido', v_exigido, 'hasta', v_hasta, 'paquete', v_nombre);
end $function$;
