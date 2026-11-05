-- Metropolitano 2026: el árbitro en la lista de roles de cada persona (se inscribe
-- como el entrenador: el ID FIDE si tiene, no juega ni paga). Ver «El árbitro» en
-- docs/decisiones/cuentas-y-formularios.md.
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
  if v_rol not in ('jugador', 'entrenador', 'acompanante', 'delegado', 'arbitro') then
    raise exception 'Elige si es jugador, entrenador, árbitro, acompañante o delegado.';
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
  -- Senior se cuenta por AÑO (lo decidió la FCA): desde el 1 de enero, quien
  -- cumple 65 en 2026, o sea, nacidos en 1961 o antes.
  v_senior := 2026 - extract(year from v_nac) >= 65;
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
