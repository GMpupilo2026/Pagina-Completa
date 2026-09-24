-- El consentimiento queda guardado en la base (Ley 8968, art. 5): quién
-- aceptó, cuándo y QUÉ versión de la Política de privacidad o de los
-- Términos. La hora la pone el servidor (now()), no el navegador.
--
-- Y lo exige la base, no la pantalla: sin versión aceptada, las tres
-- funciones rechazan el envío. Una casilla que se salta desde la consola no
-- sirve de prueba de nada. Ver «El consentimiento queda guardado» en
-- docs/decisiones/legal.md.
--
-- Las filas anteriores quedan en null: se enviaron antes de que existieran
-- las páginas legales.

-- ---- columnas ----
alter table public.solicitudes_academia
  add column privacidad_version text,
  add column privacidad_aceptada_en timestamptz,
  add column terminos_version text,
  add column terminos_aceptados_en timestamptz,
  add constraint solicitudes_academia_privacidad_completa
    check ((privacidad_version is null) = (privacidad_aceptada_en is null)),
  add constraint solicitudes_academia_terminos_completos
    check ((terminos_version is null) = (terminos_aceptados_en is null));

alter table public.formulario_respuestas
  add column privacidad_version text,
  add column privacidad_aceptada_en timestamptz,
  add constraint formulario_respuestas_privacidad_completa
    check ((privacidad_version is null) = (privacidad_aceptada_en is null));

comment on column public.solicitudes_academia.privacidad_version is
  'Versión (AAAA-MM-DD) de privacidad.html que se aceptó al enviar; la hora está en privacidad_aceptada_en. Null: enviada antes del 2026-09-24.';
comment on column public.solicitudes_academia.terminos_version is
  'Versión (AAAA-MM-DD) de terminos.html que se aceptó al elegir el plan; la hora está en terminos_aceptados_en.';
comment on column public.formulario_respuestas.privacidad_version is
  'Versión (AAAA-MM-DD) de privacidad.html que se aceptó al responder; la hora está en privacidad_aceptada_en. Null: respondida antes del 2026-09-24.';

-- ---- la regla de la versión, una sola copia ----
-- Una fecha AAAA-MM-DD real y que no pase de mañana (margen por la zona
-- horaria del navegador). No se compara con
-- «la vigente»: eso sería una segunda copia de js/legal-version.js que
-- alguien olvida cambiar, y el día que no coincidan se rechazaría todo.
create or replace function interno.version_legal_valida(p text)
 returns boolean
 language plpgsql
 stable
 set search_path to ''
as $function$
begin
  if p is null or p !~ '^\d{4}-\d{2}-\d{2}$' then
    return false;
  end if;
  return p::date <= (now() at time zone 'America/Costa_Rica')::date + 1;
exception when others then
  return false;   -- 2026-02-31 y compañía
end;
$function$;
revoke all on function interno.version_legal_valida(text) from public, anon, authenticated;

-- ---- solicitar_academia: igual que antes, más la aceptación ----
-- Cambia la firma, así que se borra la vieja: con CREATE OR REPLACE
-- quedarían las dos y PostgREST no sabría a cuál llamar.
drop function public.solicitar_academia(text, text, text, text, text);
create or replace function public.solicitar_academia(p_nombre text, p_email text, p_telefono text DEFAULT NULL::text, p_edad_nivel text DEFAULT NULL::text, p_mensaje text DEFAULT NULL::text, p_version_privacidad text DEFAULT NULL::text)
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
  if not coalesce(interno.version_legal_valida(p_version_privacidad), false) then
    return jsonb_build_object('ok', false, 'error', 'Falta aceptar la Política de privacidad');
  end if;
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

  insert into public.solicitudes_academia
    (nombre, email, telefono, edad_nivel, mensaje, privacidad_version, privacidad_aceptada_en)
  values (nombre, lower(email), telefono, edad_nivel, mensaje, p_version_privacidad, now());

  return jsonb_build_object('ok', true);
end;
$function$;
-- Los mismos permisos que tenía: es la API de unirse.html, sin sesión.
grant execute on function public.solicitar_academia(text, text, text, text, text, text) to anon, authenticated, service_role;

-- ---- elegir_plan: igual que antes, más la aceptación de los Términos ----
drop function public.elegir_plan(uuid, text);
create or replace function public.elegir_plan(p_id uuid, p_plan text, p_version_terminos text DEFAULT NULL::text, p_version_privacidad text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  fila public.solicitudes_academia%rowtype;
begin
  if not coalesce(interno.version_legal_valida(p_version_terminos)
                  and interno.version_legal_valida(p_version_privacidad), false) then
    return jsonb_build_object('ok', false, 'error', 'Falta aceptar los Términos y condiciones');
  end if;
  if p_plan not in ('plataforma', 'grupal', 'individual') then
    return jsonb_build_object('ok', false, 'error', 'Plan inválido');
  end if;

  select * into fila from public.solicitudes_academia where id = p_id;
  if fila.id is null then
    return jsonb_build_object('ok', false, 'error', 'No se encontró esa solicitud');
  end if;
  if fila.estado <> 'rechazada' then
    return jsonb_build_object('ok', false, 'error', 'Este enlace ya no es válido');
  end if;
  if fila.plan_elegido is not null then
    return jsonb_build_object('ok', false, 'error', 'Ya habías elegido un plan', 'plan', fila.plan_elegido);
  end if;

  -- La casilla de elegir-plan.html acepta los Términos Y la privacidad. La
  -- privacidad ya aceptada al pedir información no se pisa: vale la primera.
  update public.solicitudes_academia
     set plan_elegido = p_plan, plan_elegido_en = now(),
         terminos_version = p_version_terminos, terminos_aceptados_en = now(),
         privacidad_aceptada_en = coalesce(privacidad_aceptada_en, now()),
         privacidad_version = coalesce(privacidad_version, p_version_privacidad)
   where id = p_id;

  return jsonb_build_object('ok', true, 'plan', p_plan);
end;
$function$;
grant execute on function public.elegir_plan(uuid, text, text, text) to anon, authenticated, service_role;

-- ---- responder_formulario: igual que antes, más la aceptación ----
drop function public.responder_formulario(text, jsonb);
create or replace function public.responder_formulario(p_slug text, p_respuestas jsonb, p_version_privacidad text DEFAULT NULL::text)
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
  if not coalesce(interno.version_legal_valida(p_version_privacidad), false) then
    return jsonb_build_object('ok', false, 'error', 'Falta aceptar el uso de los datos (la casilla de la Política de privacidad).');
  end if;
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

  insert into public.formulario_respuestas
    (formulario_id, respuestas, alumno_id, privacidad_version, privacidad_aceptada_en)
  values (f.id, limpias, auth.uid(), p_version_privacidad, now());

  return jsonb_build_object('ok', true);
end;
$function$;
-- Los mismos permisos que tenía: sin public, con anon y authenticated.
revoke all on function public.responder_formulario(text, jsonb, text) from public;
grant execute on function public.responder_formulario(text, jsonb, text) to anon, authenticated, service_role;
