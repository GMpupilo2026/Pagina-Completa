-- La inscripción del Metropolitano 2026, segunda parte (lo pidió el dueño
-- del sitio):
--   · se inscriben jugadores, entrenadores, acompañantes y delegados (`rol`);
--   · un DELEGADO inscribe a un grupo entero en un solo envío: él primero
--     (`es_delegado`) y después cada integrante, todos con el mismo `grupo` y
--     el nombre de la `delegacion`, y un solo pago por el total;
--   · cada persona autoriza (o no) que su nombre y su foto se usen en la
--     publicidad del torneo (`acepta_publicidad`). Es aparte del aviso de las
--     bases sobre las fotos del evento, y no es obligatorio.
--
-- public.metropolitano_inscribir(p) recibe ahora `personas` (una en la
-- inscripción individual, varias en la de grupo); un envío con la forma vieja
-- (los datos de una persona sueltos en `p`) se sigue leyendo como una sola.
-- Cada persona la valida y la cobra interno.metropolitano_persona(), con las
-- MISMAS reglas que js/metropolitano-reglas.js (lo compara
-- herramientas/verificar-metropolitano.js). Si una persona del grupo tiene un
-- error, no se guarda nadie: el mensaje dice cuál es.
--
-- Ver «La inscripción del Metropolitano 2026» en
-- docs/decisiones/cuentas-y-formularios.md.

alter table public.metropolitano_inscripciones
  add column rol text not null default 'jugador' check (rol in ('jugador', 'entrenador', 'acompanante', 'delegado')),
  add column es_delegado boolean not null default false,
  add column grupo uuid,
  add column delegacion text check (length(delegacion) <= 100),
  add column acepta_publicidad boolean not null default false,
  alter column correo drop not null,
  add constraint metropolitano_jugador_juega check (rol <> 'jugador' or cardinality(torneos) > 0);

create index metropolitano_por_grupo on public.metropolitano_inscripciones (grupo) where grupo is not null;

-- Lo que se audita, también el rol (decide si paga) y el grupo.
create or replace trigger auditar after insert or update or delete on public.metropolitano_inscripciones
  for each row execute function interno.auditar('pago_estado', 'estado', 'monto_usd', 'torneos', 'rol', 'grupo');

-- ---------------------------------------------------------------- una persona
-- Valida a una persona y calcula lo que paga. Devuelve los valores ya limpios
-- para el insert, o lanza una excepción con el mensaje para quien inscribe
-- (código 'P0001'; metropolitano_inscribir la atrapa). `p_correo_obligatorio`
-- es falso para los integrantes de un grupo: se le escribe al delegado.
create or replace function interno.metropolitano_persona(x jsonb, hoy date, v_metodo text, p_correo_obligatorio boolean)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_rol text := coalesce(nullif(x->>'rol', ''), 'jugador');
  v_torneos text[];
  v_clasico text;
  v_nac date;
  v_edad int;
  v_elo int;
  v_titulo text := nullif(upper(btrim(coalesce(x->>'titulo', ''))), '');
  v_sin_fide boolean := coalesce((x->>'sin_fide')::boolean, false);
  v_fide text := nullif(btrim(coalesce(x->>'fide_id', '')), '');
  v_correo text := nullif(lower(btrim(coalesce(x->>'correo', ''))), '');
  v_foto text := coalesce(x->>'foto', '');
  v_hosp boolean := coalesce((x->>'hospedaje')::boolean, false);
  v_comidas text[];
  v_condicion text[];
  v_total numeric := 0;
  v_monto numeric;
  v_gratis boolean;
  v_recargo boolean;
  v_senior boolean;
  t text;
begin
  if v_rol not in ('jugador', 'entrenador', 'acompanante', 'delegado') then
    raise exception 'Elige si es jugador, entrenador, acompañante o delegado.';
  end if;

  -- Los torneos: solo juegan los jugadores; a lo sumo un clásico y el blitz.
  if v_rol = 'jugador' then
    if jsonb_typeof(x->'torneos') is distinct from 'array' then
      raise exception 'Elige al menos un torneo.';
    end if;
    select coalesce(array_agg(distinct e), '{}') into v_torneos from jsonb_array_elements_text(x->'torneos') e;
    if cardinality(v_torneos) = 0 or not (v_torneos <@ array['A', 'B', 'U14', 'BLITZ']) then
      raise exception 'Elige al menos un torneo.';
    end if;
    if (select count(*) from unnest(v_torneos) e where e <> 'BLITZ') > 1 then
      raise exception 'Solo se puede jugar un torneo clásico: A, B y U14 se juegan a la vez.';
    end if;
    select e into v_clasico from unnest(v_torneos) e where e <> 'BLITZ';
    if v_clasico is not null and hoy > date '2026-12-20' then
      raise exception 'La inscripción de los torneos clásicos cerró el 20 de diciembre. Todavía se puede inscribir en el blitz.';
    end if;
  else
    v_torneos := '{}';
    v_clasico := null;
  end if;

  -- Quién es. El ID FIDE lo pide el jugador; el entrenador lo pone si tiene.
  if v_sin_fide or (v_rol <> 'jugador' and v_fide is null) then
    v_fide := null; v_sin_fide := true;
  elsif v_fide is null or v_fide !~ '^[0-9]{4,10}$' then
    raise exception 'Elige su nombre en la lista de FIDE, o marca que no tiene ID FIDE.';
  end if;
  begin
    v_nac := (x->>'nacimiento')::date;
  exception when others then
    v_nac := null;
  end;
  if v_nac is null or v_nac < date '1920-01-01' or v_nac > date '2022-12-31' then
    raise exception 'Revisa la fecha de nacimiento.';
  end if;
  v_edad := extract(year from age(date '2026-12-26', v_nac));
  if btrim(coalesce(x->>'nombre', '')) = '' or btrim(coalesce(x->>'apellidos', '')) = '' then
    raise exception 'Falta el nombre completo.';
  end if;
  if x->>'sexo' is null or x->>'sexo' not in ('m', 'f') then
    raise exception 'Falta el sexo.';
  end if;
  if btrim(coalesce(x->>'documento', '')) = '' then
    raise exception 'Falta el número de documento.';
  end if;
  if (v_correo is null and p_correo_obligatorio)
     or (v_correo is not null and (v_correo !~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' or v_correo like '%@alumno.ajedrez-integral.com')) then
    raise exception 'Revisa el correo electrónico.';
  end if;
  if v_edad < 18 and (btrim(coalesce(x#>>'{responsable,nombre}', '')) = '' or btrim(coalesce(x#>>'{responsable,telefono}', '')) = '') then
    raise exception 'Es menor de edad: faltan los datos de la persona responsable.';
  end if;
  if btrim(coalesce(x#>>'{emergencia,nombre}', '')) = '' or btrim(coalesce(x#>>'{emergencia,telefono}', '')) = '' then
    raise exception 'Falta el contacto para una emergencia.';
  end if;

  -- En qué puede jugar (mismas reglas que js/metropolitano-reglas.js).
  v_elo := case when v_sin_fide then null else nullif(nullif(x->>'elo_estandar', '')::int, 0) end;
  if v_clasico = 'A' and (v_elo is null or v_elo < 1900) then
    raise exception 'El Metropolitano A pide 1900 o más de Elo FIDE estándar.';
  end if;
  if v_clasico = 'B' and v_elo is not null and v_elo >= 1900 then
    raise exception 'El Metropolitano B es para menos de 1900 de Elo FIDE estándar.';
  end if;
  if v_clasico = 'U14' and extract(year from v_nac) < 2012 then
    raise exception 'El Metropolitano U14 es para nacidos desde el 1 de enero de 2012.';
  end if;
  if v_sin_fide then v_titulo := null; end if;
  if v_titulo is not null and v_titulo not in ('GM', 'IM', 'WGM', 'FM', 'WIM', 'CM', 'WFM', 'WCM') then
    v_titulo := null;
  end if;

  -- Hospedaje y comidas: fechas alrededor del torneo.
  if v_hosp then
    if (x->>'hospedaje_desde') is null or (x->>'hospedaje_hasta') is null
       or (x->>'hospedaje_desde')::date >= (x->>'hospedaje_hasta')::date
       or (x->>'hospedaje_desde')::date < date '2026-12-20' or (x->>'hospedaje_hasta')::date > date '2027-01-03' then
      raise exception 'Revisa las fechas del hospedaje: entre el 20 de diciembre y el 3 de enero, y la salida después de la llegada.';
    end if;
  end if;
  select coalesce(array_agg(distinct e), '{}') into v_comidas
    from jsonb_array_elements_text(coalesce(x->'comidas', '[]'::jsonb)) e;
  if not (v_comidas <@ array['desayuno', 'almuerzo', 'cena']) then
    raise exception 'Revisa las comidas elegidas.';
  end if;
  if cardinality(v_comidas) > 0 and ((x->>'comidas_desde') is null or (x->>'comidas_hasta') is null
       or (x->>'comidas_desde')::date > (x->>'comidas_hasta')::date
       or (x->>'comidas_desde')::date < date '2026-12-20' or (x->>'comidas_hasta')::date > date '2027-01-03') then
    raise exception 'Revisa los días de la alimentación.';
  end if;
  select coalesce(array_agg(distinct e), '{}') into v_condicion
    from jsonb_array_elements_text(coalesce(x->'condicion', '[]'::jsonb)) e;
  if not (v_condicion <@ array['sordo', 'ciego', 'silla']) then
    raise exception 'Revisa la condición marcada.';
  end if;

  -- La foto (va en el gafete): una ruta ya subida a este bucket, que existe.
  if v_foto !~ '^foto/[a-z0-9-]{8,64}/[A-Za-z0-9._-]{1,70}\.(jpg|png|webp)$'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'metropolitano-2026' and o.name = v_foto) then
    raise exception 'Falta la foto tamaño pasaporte.';
  end if;

  -- Cuánto paga (las bases: recargo del 30 % del 17 al 20 en los clásicos,
  -- 10 % menos a mayores de 65 en los clásicos, gratis GM, IM y WGM). Solo
  -- pagan los jugadores.
  v_gratis := v_titulo in ('GM', 'IM', 'WGM');
  v_recargo := hoy > date '2026-12-16' and hoy <= date '2026-12-20';
  v_senior := extract(year from age(date '2026-12-26', v_nac)) >= 65;
  foreach t in array v_torneos loop
    v_monto := case t
      when 'A' then case when v_metodo = 'paypal' then 79.88 else 75 end
      when 'B' then case when v_metodo = 'paypal' then 47.93 else 45 end
      when 'U14' then case when v_metodo = 'paypal' then 37.28 else 35 end
      when 'BLITZ' then case when v_metodo = 'paypal' then 12.78 else 12 end end;
    if t <> 'BLITZ' and v_recargo then v_monto := v_monto * 1.30; end if;
    if t <> 'BLITZ' and v_senior then v_monto := v_monto * 0.90; end if;
    if v_gratis then v_monto := 0; end if;
    v_total := v_total + round(v_monto, 2);
  end loop;

  return jsonb_build_object(
    'rol', v_rol, 'torneos', to_jsonb(v_torneos), 'clasico', v_clasico, 'nacimiento', v_nac, 'edad', v_edad,
    'elo', v_elo, 'titulo', v_titulo, 'sin_fide', v_sin_fide, 'fide_id', v_fide, 'correo', v_correo,
    'comidas', to_jsonb(v_comidas), 'condicion', to_jsonb(v_condicion), 'hospedaje', v_hosp,
    'foto', v_foto, 'monto', v_total);
end;
$$;
revoke execute on function interno.metropolitano_persona(jsonb, date, text, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------- inscribir
create or replace function public.metropolitano_inscribir(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  hoy date := (now() at time zone 'America/Costa_Rica')::date;
  v_grupo_modo boolean := p->>'modo' = 'grupo';
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
        case when (r->>'sin_fide')::boolean then null else nullif(upper(btrim(coalesce(x->>'federacion', ''))), '') end,
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
