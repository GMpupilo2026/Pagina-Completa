-- Los tres formularios que se llenan SIN cuenta escribían en la base sin nada
-- que frenara a un script: responder_formulario (formulario.html),
-- registrar_arbitraje_publico (nivel-de-arbitraje.html) y solicitar_academia
-- (unirse.html). Con la clave pública, que está en el HTML, cualquiera podía
-- llenar miles de respuestas o solicitudes en un minuto, y no daba ningún error:
-- simplemente aparecían.
--
-- El freno va en la base, no en la página, porque la página se salta desde la
-- consola. Cuenta los envíos que ya pasaron la validación (una respuesta que
-- rebota por un campo vacío no gasta cupo) y los compara contra tres topes:
--   · por conexión (IP): el que para a un script desde una sola máquina.
--     Generoso a propósito: un colegio entero sale a internet por UNA IP, y una
--     clase haciendo el examen de arbitraje o una reunión de padres llenando la
--     inscripción son muchos envíos legítimos seguidos desde la misma.
--   · por correo, donde lo hay: la misma persona mandando lo mismo.
--   · total, por formulario: el techo si alguien cambia de IP en cada envío.
-- Hoy el pico real es 12 respuestas en una hora en un mismo formulario.
--
-- La IP sale de las cabeceras que PostgREST deja en request.headers. Si no
-- llega ninguna, NO se cuenta por IP: juntar a todo el mundo en un mismo cupo
-- de "desconocida" sería frenar a los que sí son personas. Los otros dos topes
-- siguen valiendo.

create table if not exists interno.envios_publicos (
  id      bigint generated always as identity primary key,
  tipo    text not null,           -- 'formulario' | 'arbitraje' | 'solicitud'
  ambito  text not null default '',-- el id del formulario; vacío en los otros
  ip      text,
  correo  text,
  creado  timestamptz not null default now()
);
create index if not exists envios_publicos_tipo_ambito on interno.envios_publicos (tipo, ambito, creado);
create index if not exists envios_publicos_ip          on interno.envios_publicos (tipo, ip, creado) where ip is not null;
create index if not exists envios_publicos_correo      on interno.envios_publicos (tipo, correo, creado) where correo is not null;
create index if not exists envios_publicos_creado      on interno.envios_publicos (creado);

alter table interno.envios_publicos enable row level security;
revoke all on interno.envios_publicos from public, anon, authenticated;

-- Devuelve NULL si el envío pasa (y lo anota), o el mensaje para quien envía.
-- No es SECURITY DEFINER: la llaman las tres funciones de arriba, que sí lo
-- son y ya corren como su dueño. Desde afuera no se puede llamar.
create or replace function interno.frenar_envio_publico(p_tipo text, p_ambito text, p_correo text)
returns text
language plpgsql
set search_path = public
as $$
declare
  cab jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_ip text := nullif(btrim(coalesce(
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
$$;
revoke execute on function interno.frenar_envio_publico(text, text, text) from public, anon, authenticated;

-- ---- responder_formulario: igual que antes, con el freno antes del insert ----
CREATE OR REPLACE FUNCTION public.responder_formulario(p_slug text, p_respuestas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  f record;
  campo jsonb;
  clave text;
  valor jsonb;
  texto text;
  limpias jsonb := '{}'::jsonb;
  n_opciones int;
  ruta text;
  freno text;
begin
  if jsonb_typeof(p_respuestas) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'error', 'Respuestas con formato inválido');
  end if;
  -- Techo de cordura: nadie llena 20 KB a mano.
  if length(p_respuestas::text) > 20000 then
    return jsonb_build_object('ok', false, 'error', 'La respuesta es demasiado larga');
  end if;

  select * into f from public.formularios
   where slug = p_slug and abierto and (cierra_el is null or cierra_el > now());
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Este formulario ya no está recibiendo respuestas');
  end if;

  -- Se recorre el formulario, no lo que mandaron: así una clave inventada no
  -- se guarda, y un campo obligatorio que falte se dice con su nombre.
  for campo in select * from jsonb_array_elements(f.campos) loop
    clave := campo->>'id';
    if coalesce(clave, '') = '' then continue; end if;
    valor := p_respuestas->clave;

    if valor is null or valor = 'null'::jsonb
       or (jsonb_typeof(valor) = 'string' and btrim(valor #>> '{}') = '')
       or (jsonb_typeof(valor) = 'array' and jsonb_array_length(valor) = 0) then
      if coalesce((campo->>'requerido')::boolean, false) then
        return jsonb_build_object('ok', false,
          'error', 'Falta llenar: ' || coalesce(campo->>'etiqueta', clave));
      end if;
      continue;
    end if;

    if campo->>'tipo' in ('imagen', 'archivo') then
      -- Un adjunto es la RUTA de un archivo ya subido, y tiene que ser de ESTE
      -- formulario y existir de verdad: si no, una respuesta podría apuntar al
      -- archivo de otro formulario o a uno que no está. La ruta es
      -- <formulario>/<id>/<nombre>.<ext>; una pregunta de imagen solo admite
      -- imágenes.
      if jsonb_typeof(valor) <> 'array' or jsonb_array_length(valor) > 5 then
        return jsonb_build_object('ok', false, 'error', 'Archivos inválidos en: ' || coalesce(campo->>'etiqueta', clave));
      end if;
      for ruta in select jsonb_array_elements_text(valor) loop
        if ruta !~ ('^' || f.id::text || '/[a-z0-9-]{8,64}/[A-Za-z0-9._-]{1,70}\.('
                    || case when campo->>'tipo' = 'imagen' then 'jpg|png|webp'
                            else 'jpg|png|webp|pdf|doc|docx|xls|xlsx' end || ')$')
           or not exists (select 1 from storage.objects o
                           where o.bucket_id = 'formulario-adjuntos' and o.name = ruta) then
          return jsonb_build_object('ok', false, 'error', 'Un archivo no se subió bien en: ' || coalesce(campo->>'etiqueta', clave));
        end if;
      end loop;
    elsif jsonb_typeof(valor) = 'array' then
      n_opciones := jsonb_array_length(valor);
      if n_opciones > 30 then
        return jsonb_build_object('ok', false, 'error', 'Demasiadas opciones marcadas en: ' || coalesce(campo->>'etiqueta', clave));
      end if;
      if exists (select 1 from jsonb_array_elements_text(valor) t where length(t) > 300) then
        return jsonb_build_object('ok', false, 'error', 'Una opción es demasiado larga en: ' || coalesce(campo->>'etiqueta', clave));
      end if;
    elsif jsonb_typeof(valor) in ('string', 'number', 'boolean') then
      texto := valor #>> '{}';
      if length(texto) > 2000 then
        return jsonb_build_object('ok', false,
          'error', 'Respuesta demasiado larga en: ' || coalesce(campo->>'etiqueta', clave));
      end if;
    else
      return jsonb_build_object('ok', false, 'error', 'Respuesta con formato inválido en: ' || coalesce(campo->>'etiqueta', clave));
    end if;

    limpias := limpias || jsonb_build_object(clave, valor);
  end loop;

  -- El tope es por formulario: uno inundado no frena a los demás.
  freno := interno.frenar_envio_publico('formulario', f.id::text, null);
  if freno is not null then
    return jsonb_build_object('ok', false, 'error', freno);
  end if;

  insert into public.formulario_respuestas (formulario_id, respuestas, alumno_id)
  values (f.id, limpias, auth.uid());

  return jsonb_build_object('ok', true);
end;
$function$;

-- ---- registrar_arbitraje_publico ----
CREATE OR REPLACE FUNCTION public.registrar_arbitraje_publico(p_nombre text, p_email text, p_porcentaje integer, p_nivel text, p_detalle jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_id     uuid;
  freno    text;
begin
  if length(v_nombre) < 2 or length(v_nombre) > 120 then
    raise exception 'El nombre no es válido.' using errcode = '22023';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(v_email) > 160 then
    raise exception 'El correo no es válido.' using errcode = '22023';
  end if;
  if p_detalle is null or pg_column_size(p_detalle) > 60000 then
    raise exception 'El detalle no es válido.' using errcode = '22023';
  end if;

  freno := interno.frenar_envio_publico('arbitraje', '', v_email);
  if freno is not null then
    raise exception '%', freno using errcode = '54000';
  end if;

  insert into public.arbitrajes_publicos (nombre, email, porcentaje, nivel, detalle)
  values (v_nombre, v_email,
          greatest(0, least(100, coalesce(p_porcentaje, 0))),
          left(coalesce(p_nivel, ''), 80),
          p_detalle)
  returning id into v_id;

  return v_id;
end;
$function$;

-- ---- solicitar_academia ----
CREATE OR REPLACE FUNCTION public.solicitar_academia(p_nombre text, p_email text, p_telefono text DEFAULT NULL::text, p_edad_nivel text DEFAULT NULL::text, p_mensaje text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  nombre text := btrim(coalesce(p_nombre, ''));
  email text := btrim(coalesce(p_email, ''));
  telefono text := nullif(btrim(coalesce(p_telefono, '')), '');
  edad_nivel text := nullif(btrim(coalesce(p_edad_nivel, '')), '');
  mensaje text := nullif(btrim(coalesce(p_mensaje, '')), '');
  freno text;
begin
  if nombre = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta el nombre');
  end if;
  if length(nombre) > 200 then
    return jsonb_build_object('ok', false, 'error', 'El nombre es demasiado largo');
  end if;
  if email = '' or email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'El correo no es válido');
  end if;
  if length(email) > 254 then
    return jsonb_build_object('ok', false, 'error', 'El correo es demasiado largo');
  end if;
  if telefono is not null and length(telefono) > 60 then
    return jsonb_build_object('ok', false, 'error', 'El teléfono es demasiado largo');
  end if;
  if edad_nivel is not null and length(edad_nivel) > 200 then
    return jsonb_build_object('ok', false, 'error', 'Ese campo es demasiado largo');
  end if;
  if mensaje is not null and length(mensaje) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'El mensaje es demasiado largo');
  end if;

  freno := interno.frenar_envio_publico('solicitud', '', email);
  if freno is not null then
    return jsonb_build_object('ok', false, 'error', freno);
  end if;

  insert into public.solicitudes_academia (nombre, email, telefono, edad_nivel, mensaje)
  values (nombre, lower(email), telefono, edad_nivel, mensaje);

  return jsonb_build_object('ok', true);
end;
$function$;