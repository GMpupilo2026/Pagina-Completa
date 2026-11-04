-- La inscripción del Metropolitano 2026: un envío sin `modo` (la forma vieja,
-- de una sola persona) dejaba `v_grupo_modo` en NULL, y con eso `es_delegado`
-- NULL, que la tabla rechaza. Lo encontró la prueba impersonando a `anon`
-- después de aplicar 20261104070000_metropolitano_grupos_roles. La página
-- siempre manda `modo`, así que no le pasó a nadie. Es la misma función, con
-- el `coalesce`.

create or replace function public.metropolitano_inscribir(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  hoy date := (now() at time zone 'America/Costa_Rica')::date;
  -- coalesce: sin `modo` (la forma vieja, de una persona) es individual, no NULL.
  v_grupo_modo boolean := coalesce(p->>'modo', '') = 'grupo';
  v_personas jsonb;
  v_metodo text := nullif(p->>'pago_metodo', '');
  v_comp text := nullif(p->>'comprobante', '');
  v_delegacion text := nullif(btrim(coalesce(p->>'delegacion', '')), '');
  v_grupo uuid;
  v_correo_envio text;
  x jsonb;
  r jsonb;
  calc jsonb[] := '{}';
  i int := 0;
  n int;
  v_total numeric := 0;
  v_freno text;
  v_numero int;
  salida jsonb := '[]'::jsonb;
  quien text;
begin
  if jsonb_typeof(p) is distinct from 'object' or length(p::text) > 200000 then
    return jsonb_build_object('ok', false, 'error', 'La inscripción llegó con un formato inválido.');
  end if;
  if hoy > date '2026-12-26' then
    return jsonb_build_object('ok', false, 'error', 'La inscripción del Metropolitano 2026 ya cerró.');
  end if;

  -- La forma vieja (una persona suelta en p) se lee como una sola.
  v_personas := case when jsonb_typeof(p->'personas') = 'array' then p->'personas' else jsonb_build_array(p) end;
  n := jsonb_array_length(v_personas);
  if n = 0 or n > 80 then
    return jsonb_build_object('ok', false, 'error', 'Un envío lleva de 1 a 80 personas.');
  end if;
  if v_grupo_modo then
    if v_delegacion is null then
      return jsonb_build_object('ok', false, 'error', 'Falta el nombre de la delegación.');
    end if;
    if not coalesce((v_personas->0->>'es_delegado')::boolean, false) then
      return jsonb_build_object('ok', false, 'error', 'La primera persona de un grupo es su delegado.');
    end if;
    v_grupo := gen_random_uuid();
  elsif n > 1 then
    return jsonb_build_object('ok', false, 'error', 'Para inscribir a varias personas, usa la inscripción de grupo.');
  end if;
  v_correo_envio := lower(btrim(coalesce(v_personas->0->>'correo', '')));

  -- Cada persona, con su mensaje si algo falla.
  for x in select * from jsonb_array_elements(v_personas) loop
    i := i + 1;
    quien := case when n > 1 then 'Persona ' || i || ' (' || btrim(coalesce(x->>'nombre', '') || ' ' || coalesce(x->>'apellidos', '')) || '): ' else '' end;
    begin
      r := interno.metropolitano_persona(x, hoy, v_metodo, i = 1);
    exception when raise_exception then
      return jsonb_build_object('ok', false, 'error', quien || sqlerrm, 'persona', i);
    end;
    calc := calc || r;
    v_total := v_total + (r->>'monto')::numeric;
  end loop;

  -- El pago: un solo comprobante por el total.
  if v_total > 0 then
    if v_metodo is null or v_metodo not in ('colones', 'dolares', 'paypal', 'sinpe') then
      return jsonb_build_object('ok', false, 'error', 'Elige cómo pagaste.');
    end if;
    if v_comp is null or v_comp !~ '^comprobante/[a-z0-9-]{8,64}/[A-Za-z0-9._-]{1,70}\.(jpg|png|webp|pdf)$'
       or not exists (select 1 from storage.objects o where o.bucket_id = 'metropolitano-2026' and o.name = v_comp) then
      return jsonb_build_object('ok', false, 'error', 'Falta el comprobante de pago.');
    end if;
  else
    v_metodo := null; v_comp := null;
  end if;

  if not coalesce((p->>'validado')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'Revisa el resumen y confirma que los datos están bien.');
  end if;
  if not (coalesce((p->>'acepta_datos')::boolean, false) and coalesce((p->>'acepta_imagen')::boolean, false)
          and coalesce((p->>'acepta_reglamento')::boolean, false)) then
    return jsonb_build_object('ok', false, 'error', 'Falta aceptar las condiciones del final.');
  end if;

  -- El freno: el de los formularios con su ámbito (un envío, aunque sea de un
  -- grupo), y por correo (una familia inscribe a varios con el mismo, pero no
  -- a veinte en envíos sueltos).
  if not v_grupo_modo and (select count(*) from public.metropolitano_inscripciones m
        where lower(m.correo) = v_correo_envio and m.creado > now() - interval '1 day') >= 8 then
    return jsonb_build_object('ok', false, 'error', 'Ya recibimos varias inscripciones con este correo hoy. Para inscribir a muchos, usa la inscripción de grupo.');
  end if;
  v_freno := interno.frenar_envio_publico('formulario', 'metropolitano-2026', v_correo_envio);
  if v_freno is not null then
    return jsonb_build_object('ok', false, 'error', v_freno);
  end if;

  i := 0;
  begin
    for x in select * from jsonb_array_elements(v_personas) loop
      i := i + 1;
      r := calc[i];
      insert into public.metropolitano_inscripciones (
        rol, es_delegado, grupo, delegacion, acepta_publicidad,
        fide_id, sin_fide, nombre, apellidos, sexo, nacimiento, nacionalidad, pais_residencia, federacion,
        documento_tipo, documento, correo, telefono, club, titulo, elo_estandar, elo_rapido, elo_blitz,
        torneos, clasico, responsable, emergencia,
        hospedaje, hospedaje_desde, hospedaje_hasta, habitacion, acompanantes,
        comidas, comidas_desde, comidas_hasta, dieta, viaje, condicion, accesibilidad, factura,
        pago_metodo, pago_referencia, pago_fecha, monto_usd, monto_crc, comprobante, foto,
        acepta_datos, acepta_imagen, acepta_reglamento, validado_en, pago_estado)
      values (
        r->>'rol', v_grupo_modo and i = 1, v_grupo, v_delegacion, coalesce((x->>'acepta_publicidad')::boolean, false),
        r->>'fide_id', (r->>'sin_fide')::boolean, btrim(x->>'nombre'), btrim(x->>'apellidos'), x->>'sexo', (r->>'nacimiento')::date,
        btrim(coalesce(x->>'nacionalidad', '')), btrim(coalesce(x->>'pais_residencia', '')),
        -- Sin ID FIDE también se guarda su federación: si no es CRC, el trámite
        -- lo hace su propia federación.
        nullif(upper(btrim(coalesce(x->>'federacion', ''))), ''),
        x->>'documento_tipo', btrim(x->>'documento'), r->>'correo',
        btrim(coalesce(nullif(x->>'telefono', ''), p#>>'{personas,0,telefono}', '')),
        nullif(btrim(coalesce(x->>'club', '')), ''), r->>'titulo', (r->>'elo')::int,
        case when (r->>'sin_fide')::boolean then null else nullif(nullif(x->>'elo_rapido', '')::int, 0) end,
        case when (r->>'sin_fide')::boolean then null else nullif(nullif(x->>'elo_blitz', '')::int, 0) end,
        array(select jsonb_array_elements_text(r->'torneos')), r->>'clasico',
        case when (r->>'edad')::int < 18 then x->'responsable' end, x->'emergencia',
        (r->>'hospedaje')::boolean,
        case when (r->>'hospedaje')::boolean then (x->>'hospedaje_desde')::date end,
        case when (r->>'hospedaje')::boolean then (x->>'hospedaje_hasta')::date end,
        case when (r->>'hospedaje')::boolean then nullif(x->>'habitacion', '') end,
        case when (r->>'hospedaje')::boolean then least(greatest(coalesce(nullif(x->>'acompanantes', '')::int, 0), 0), 6) else 0 end,
        array(select jsonb_array_elements_text(r->'comidas')),
        case when jsonb_array_length(r->'comidas') > 0 then (x->>'comidas_desde')::date end,
        case when jsonb_array_length(r->'comidas') > 0 then (x->>'comidas_hasta')::date end,
        nullif(btrim(coalesce(x->>'dieta', '')), ''),
        case when jsonb_typeof(x->'viaje') = 'object' then x->'viaje' end,
        array(select jsonb_array_elements_text(r->'condicion')), nullif(btrim(coalesce(x->>'accesibilidad', '')), ''),
        case when i = 1 and jsonb_typeof(coalesce(p->'factura', x->'factura')) = 'object' then coalesce(p->'factura', x->'factura') end,
        v_metodo, nullif(btrim(coalesce(p->>'pago_referencia', '')), ''),
        case when v_total > 0 then nullif(p->>'pago_fecha', '')::date end,
        (r->>'monto')::numeric, round((r->>'monto')::numeric * 460)::int, v_comp, r->>'foto',
        true, true, true, now(),
        case when (r->>'monto')::numeric > 0 then 'por_revisar' else 'no_aplica' end)
      returning numero into v_numero;
      salida := salida || jsonb_build_object('codigo', 'MET-' || lpad(v_numero::text, 4, '0'), 'numero', v_numero,
        'nombre', btrim(x->>'nombre') || ' ' || btrim(x->>'apellidos'), 'monto_usd', (r->>'monto')::numeric);
    end loop;
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'persona', i, 'error',
        case when n > 1 then 'Persona ' || i || ': ' else '' end
        || 'ya hay una inscripción con este ID FIDE o este documento (o está dos veces en este grupo). Si hay que corregir algo, escribe a metropolitano@fcacostarica.com.');
    when check_violation or invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
      return jsonb_build_object('ok', false, 'persona', i, 'error',
        case when n > 1 then 'Persona ' || i || ': ' else '' end || 'revisa los datos: alguno no tiene el formato esperado.');
  end;

  return jsonb_build_object('ok', true, 'grupo', v_grupo, 'personas', salida,
    'codigo', salida->0->>'codigo', 'numero', (salida->0->>'numero')::int,
    'monto_usd', v_total, 'monto_crc', round(v_total * 460)::int);
exception
  -- Un número o una fecha que no se puede leer (escrito a mano desde la
  -- consola) no debe dar un error crudo.
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    return jsonb_build_object('ok', false, 'error', 'Revisa los datos: alguno no tiene el formato esperado.');
end;
$$;
revoke execute on function public.metropolitano_inscribir(jsonb) from public;
grant execute on function public.metropolitano_inscribir(jsonb) to anon, authenticated;
