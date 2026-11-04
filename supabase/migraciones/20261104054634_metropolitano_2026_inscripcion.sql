-- La inscripción del XLVII Torneo Internacional Metropolitano 2026 (FCA):
-- inscripcion-metropolitano.html (pública, sin cuenta) y
-- metropolitano-inscritos.html (quien administra).
--
-- El público no toca la tabla: escribe con public.metropolitano_inscribir(),
-- que vuelve a calcular TODO lo que la página ya le dijo a la persona —en qué
-- torneo puede jugar, cuánto paga, si todavía se recibe— con las mismas cifras
-- de js/metropolitano-reglas.js (herramientas/verificar-metropolitano.js
-- compara las dos copias). La página se salta desde la consola; esto no.
--
-- La foto tamaño pasaporte y el comprobante van a un bucket privado: el
-- público solo SUBE (y solo mientras se recibe), y solo administración lee.
--
-- Ver «La inscripción del Metropolitano 2026» en
-- docs/decisiones/cuentas-y-formularios.md.

create table public.metropolitano_inscripciones (
  id                uuid primary key default gen_random_uuid(),
  numero            integer generated always as identity unique,
  creado            timestamptz not null default now(),
  -- Quién es
  fide_id           text check (fide_id ~ '^[0-9]{4,10}$'),
  sin_fide          boolean not null default false,
  nombre            text not null check (length(nombre) between 1 and 80),
  apellidos         text not null check (length(apellidos) between 1 and 80),
  sexo              text not null check (sexo in ('m', 'f')),
  nacimiento        date not null,
  nacionalidad      text not null check (length(nacionalidad) between 2 and 60),
  pais_residencia   text not null check (length(pais_residencia) between 2 and 60),
  federacion        text check (federacion ~ '^[A-Z]{3}$'),
  documento_tipo    text not null check (documento_tipo in ('cedula', 'dimex', 'pasaporte', 'otro')),
  documento         text not null check (length(documento) between 4 and 30),
  correo            text not null check (correo ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' and length(correo) <= 120),
  telefono          text not null check (length(telefono) between 7 and 25),
  club              text check (length(club) <= 100),
  titulo            text check (titulo in ('GM', 'IM', 'WGM', 'FM', 'WIM', 'CM', 'WFM', 'WCM')),
  elo_estandar      integer check (elo_estandar between 100 and 3500),
  elo_rapido        integer check (elo_rapido between 100 and 3500),
  elo_blitz         integer check (elo_blitz between 100 and 3500),
  -- Qué juega
  torneos           text[] not null,
  clasico           text check (clasico in ('A', 'B', 'U14')),
  -- Quién responde
  responsable       jsonb,                       -- solo menores de 18: nombre, documento, parentesco, teléfono, correo
  emergencia        jsonb not null,              -- nombre, parentesco, teléfono
  -- Logística
  hospedaje         boolean not null default false,
  hospedaje_desde   date,
  hospedaje_hasta   date,
  habitacion        text check (habitacion in ('individual', 'doble', 'compartida')),
  acompanantes      integer not null default 0 check (acompanantes between 0 and 6),
  comidas           text[] not null default '{}',
  comidas_desde     date,
  comidas_hasta     date,
  dieta             text check (length(dieta) <= 300),
  viaje             jsonb,                       -- llegada, salida, vuelo, traslado
  condicion         text[] not null default '{}',-- sordo, ciego (premios de las bases), silla
  accesibilidad     text check (length(accesibilidad) <= 300),
  factura           jsonb,                       -- a nombre de quién, si la pide
  -- El pago (lo que se le dijo que pagara al inscribirse: es el acta)
  pago_metodo       text check (pago_metodo in ('colones', 'dolares', 'paypal', 'sinpe')),
  pago_referencia   text check (length(pago_referencia) <= 60),
  pago_fecha        date,
  monto_usd         numeric(8, 2) not null,
  monto_crc         integer not null,
  comprobante       text,
  foto              text not null,
  -- Lo que aceptó y validó
  acepta_datos      boolean not null check (acepta_datos),
  acepta_imagen     boolean not null check (acepta_imagen),
  acepta_reglamento boolean not null check (acepta_reglamento),
  validado_en       timestamptz not null,
  -- Lo que revisa la organización
  pago_estado       text not null default 'por_revisar' check (pago_estado in ('por_revisar', 'verificado', 'rechazado', 'no_aplica')),
  estado            text not null default 'activa' check (estado in ('activa', 'anulada')),
  nota_organizacion text check (length(nota_organizacion) <= 500),
  revisado_por      uuid references public.profiles(id) on delete set null,
  revisado_en       timestamptz,
  check (fide_id is not null or sin_fide),
  check (not hospedaje or (hospedaje_desde is not null and hospedaje_hasta is not null and hospedaje_desde < hospedaje_hasta))
);

-- Lo que no puede pasar dos veces lo garantiza un índice, no un if.
create unique index metropolitano_un_fide on public.metropolitano_inscripciones (fide_id)
  where fide_id is not null and estado = 'activa';
create unique index metropolitano_un_documento on public.metropolitano_inscripciones (documento_tipo, upper(documento), lower(nacionalidad))
  where estado = 'activa';
create index metropolitano_por_correo on public.metropolitano_inscripciones (lower(correo), creado);

alter table public.metropolitano_inscripciones enable row level security;
revoke all on public.metropolitano_inscripciones from public, anon;
revoke insert, update, delete on public.metropolitano_inscripciones from authenticated;

create policy metropolitano_ver on public.metropolitano_inscripciones
  for select to authenticated using ((select public.soy_admin()));

-- Cuánto se cobra y si el pago se dio por bueno es dinero: queda anotado.
create trigger auditar after insert or update or delete on public.metropolitano_inscripciones
  for each row execute function interno.auditar('pago_estado', 'estado', 'monto_usd', 'torneos');

-- ---------------------------------------------------------------- archivos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('metropolitano-2026', 'metropolitano-2026', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Se reciben archivos mientras se recibe alguna inscripción (el blitz es el
-- último en cerrar). El día es el de Costa Rica.
create or replace function public.metropolitano_recibe()
returns boolean
language sql stable
set search_path = public
as $$
  select (now() at time zone 'America/Costa_Rica')::date <= date '2026-12-26';
$$;
revoke execute on function public.metropolitano_recibe() from public;
grant execute on function public.metropolitano_recibe() to anon, authenticated;

create policy metropolitano_subir on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'metropolitano-2026'
              and (storage.foldername(name))[1] in ('foto', 'comprobante')
              and public.metropolitano_recibe());

create policy metropolitano_leer on storage.objects
  for select to authenticated
  using (bucket_id = 'metropolitano-2026' and (select public.soy_admin()));

-- ---------------------------------------------------------------- inscribir
create or replace function public.metropolitano_inscribir(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  hoy date := (now() at time zone 'America/Costa_Rica')::date;
  t text;
  v_torneos text[];
  v_clasico text;
  v_nac date;
  v_edad int;
  v_elo int;
  v_titulo text := nullif(upper(btrim(coalesce(p->>'titulo', ''))), '');
  v_sin_fide boolean := coalesce((p->>'sin_fide')::boolean, false);
  v_fide text := nullif(btrim(coalesce(p->>'fide_id', '')), '');
  v_correo text := lower(btrim(coalesce(p->>'correo', '')));
  v_metodo text := nullif(p->>'pago_metodo', '');
  v_foto text := coalesce(p->>'foto', '');
  v_comp text := nullif(p->>'comprobante', '');
  v_comidas text[];
  v_condicion text[];
  v_total numeric := 0;
  v_monto numeric;
  v_gratis boolean;
  v_recargo boolean;
  v_senior boolean;
  v_freno text;
  v_id uuid;
  v_numero int;
  v_hosp boolean := coalesce((p->>'hospedaje')::boolean, false);
begin
  if jsonb_typeof(p) is distinct from 'object' or length(p::text) > 12000 then
    return jsonb_build_object('ok', false, 'error', 'La inscripción llegó con un formato inválido.');
  end if;
  if hoy > date '2026-12-26' then
    return jsonb_build_object('ok', false, 'error', 'La inscripción del Metropolitano 2026 ya cerró.');
  end if;

  -- Los torneos: a lo sumo un clásico (se juegan a la vez) y el blitz aparte.
  if jsonb_typeof(p->'torneos') is distinct from 'array' then
    return jsonb_build_object('ok', false, 'error', 'Elige al menos un torneo.');
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_torneos from jsonb_array_elements_text(p->'torneos') x;
  if cardinality(v_torneos) = 0 or not (v_torneos <@ array['A', 'B', 'U14', 'BLITZ']) then
    return jsonb_build_object('ok', false, 'error', 'Elige al menos un torneo.');
  end if;
  if (select count(*) from unnest(v_torneos) x where x <> 'BLITZ') > 1 then
    return jsonb_build_object('ok', false, 'error', 'Solo se puede jugar un torneo clásico: A, B y U14 se juegan a la vez.');
  end if;
  select x into v_clasico from unnest(v_torneos) x where x <> 'BLITZ';
  if v_clasico is not null and hoy > date '2026-12-20' then
    return jsonb_build_object('ok', false, 'error', 'La inscripción de los torneos clásicos cerró el 20 de diciembre. Todavía puedes inscribirte en el blitz.');
  end if;

  -- Quién es
  if v_sin_fide then
    v_fide := null;
  elsif v_fide is null or v_fide !~ '^[0-9]{4,10}$' then
    return jsonb_build_object('ok', false, 'error', 'Elige tu nombre en la lista de FIDE, o marca que no tienes ID FIDE.');
  end if;
  begin
    v_nac := (p->>'nacimiento')::date;
  exception when others then
    v_nac := null;
  end;
  if v_nac is null or v_nac < date '1920-01-01' or v_nac > date '2022-12-31' then
    return jsonb_build_object('ok', false, 'error', 'Revisa la fecha de nacimiento.');
  end if;
  v_edad := extract(year from age(date '2026-12-26', v_nac));
  if btrim(coalesce(p->>'nombre', '')) = '' or btrim(coalesce(p->>'apellidos', '')) = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta el nombre completo.');
  end if;
  if btrim(coalesce(p->>'documento', '')) = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta el número de documento.');
  end if;
  if v_correo !~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' or v_correo like '%@alumno.ajedrez-integral.com' then
    return jsonb_build_object('ok', false, 'error', 'Revisa el correo electrónico.');
  end if;
  if v_edad < 18 and (btrim(coalesce(p#>>'{responsable,nombre}', '')) = '' or btrim(coalesce(p#>>'{responsable,telefono}', '')) = '') then
    return jsonb_build_object('ok', false, 'error', 'Es menor de edad: faltan los datos de la persona responsable.');
  end if;
  if btrim(coalesce(p#>>'{emergencia,nombre}', '')) = '' or btrim(coalesce(p#>>'{emergencia,telefono}', '')) = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta el contacto para una emergencia.');
  end if;

  -- En qué puede jugar (mismas reglas que js/metropolitano-reglas.js).
  v_elo := case when v_sin_fide then null else nullif(nullif(p->>'elo_estandar', '')::int, 0) end;
  if v_clasico = 'A' and (v_elo is null or v_elo < 1900) then
    return jsonb_build_object('ok', false, 'error', 'El Metropolitano A pide 1900 o más de Elo FIDE estándar.');
  end if;
  if v_clasico = 'B' and v_elo is not null and v_elo >= 1900 then
    return jsonb_build_object('ok', false, 'error', 'El Metropolitano B es para menos de 1900 de Elo FIDE estándar.');
  end if;
  if v_clasico = 'U14' and extract(year from v_nac) < 2012 then
    return jsonb_build_object('ok', false, 'error', 'El Metropolitano U14 es para nacidos desde el 1 de enero de 2012.');
  end if;
  if v_sin_fide then v_titulo := null; end if;
  if v_titulo is not null and v_titulo not in ('GM', 'IM', 'WGM', 'FM', 'WIM', 'CM', 'WFM', 'WCM') then
    v_titulo := null;
  end if;

  -- Hospedaje y comidas: fechas alrededor del torneo.
  if v_hosp then
    if (p->>'hospedaje_desde') is null or (p->>'hospedaje_hasta') is null
       or (p->>'hospedaje_desde')::date >= (p->>'hospedaje_hasta')::date
       or (p->>'hospedaje_desde')::date < date '2026-12-20' or (p->>'hospedaje_hasta')::date > date '2027-01-03' then
      return jsonb_build_object('ok', false, 'error', 'Revisa las fechas del hospedaje: entre el 20 de diciembre y el 3 de enero, y la salida después de la llegada.');
    end if;
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_comidas
    from jsonb_array_elements_text(coalesce(p->'comidas', '[]'::jsonb)) x;
  if not (v_comidas <@ array['desayuno', 'almuerzo', 'cena']) then
    return jsonb_build_object('ok', false, 'error', 'Revisa las comidas elegidas.');
  end if;
  if cardinality(v_comidas) > 0 and ((p->>'comidas_desde') is null or (p->>'comidas_hasta') is null
       or (p->>'comidas_desde')::date > (p->>'comidas_hasta')::date
       or (p->>'comidas_desde')::date < date '2026-12-20' or (p->>'comidas_hasta')::date > date '2027-01-03') then
    return jsonb_build_object('ok', false, 'error', 'Revisa los días de la alimentación.');
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_condicion
    from jsonb_array_elements_text(coalesce(p->'condicion', '[]'::jsonb)) x;
  if not (v_condicion <@ array['sordo', 'ciego', 'silla']) then
    return jsonb_build_object('ok', false, 'error', 'Revisa la condición marcada.');
  end if;

  -- Cuánto paga (las bases: recargo del 30 % del 17 al 20 en los clásicos,
  -- 10 % menos a mayores de 65 en los clásicos, gratis GM, IM y WGM).
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

  -- El pago y los archivos: rutas ya subidas a este bucket, que existen.
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
  if v_foto !~ '^foto/[a-z0-9-]{8,64}/[A-Za-z0-9._-]{1,70}\.(jpg|png|webp)$'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'metropolitano-2026' and o.name = v_foto) then
    return jsonb_build_object('ok', false, 'error', 'Falta la foto tamaño pasaporte.');
  end if;

  if not coalesce((p->>'validado')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'Revisa tu resumen y confirma que los datos están bien.');
  end if;
  if not (coalesce((p->>'acepta_datos')::boolean, false) and coalesce((p->>'acepta_imagen')::boolean, false)
          and coalesce((p->>'acepta_reglamento')::boolean, false)) then
    return jsonb_build_object('ok', false, 'error', 'Falta aceptar las condiciones del final.');
  end if;

  -- El freno: el de los formularios con su ámbito, y por correo (una familia
  -- inscribe a varios con el mismo, pero no a veinte).
  if (select count(*) from public.metropolitano_inscripciones i
        where lower(i.correo) = v_correo and i.creado > now() - interval '1 day') >= 8 then
    return jsonb_build_object('ok', false, 'error', 'Ya recibimos varias inscripciones con este correo hoy. Escríbenos a metropolitano@fcacostarica.com.');
  end if;
  v_freno := interno.frenar_envio_publico('formulario', 'metropolitano-2026', v_correo);
  if v_freno is not null then
    return jsonb_build_object('ok', false, 'error', v_freno);
  end if;

  begin
    insert into public.metropolitano_inscripciones (
      fide_id, sin_fide, nombre, apellidos, sexo, nacimiento, nacionalidad, pais_residencia, federacion,
      documento_tipo, documento, correo, telefono, club, titulo, elo_estandar, elo_rapido, elo_blitz,
      torneos, clasico, responsable, emergencia,
      hospedaje, hospedaje_desde, hospedaje_hasta, habitacion, acompanantes,
      comidas, comidas_desde, comidas_hasta, dieta, viaje, condicion, accesibilidad, factura,
      pago_metodo, pago_referencia, pago_fecha, monto_usd, monto_crc, comprobante, foto,
      acepta_datos, acepta_imagen, acepta_reglamento, validado_en, pago_estado)
    values (
      v_fide, v_sin_fide, btrim(p->>'nombre'), btrim(p->>'apellidos'), p->>'sexo', v_nac,
      btrim(p->>'nacionalidad'), btrim(p->>'pais_residencia'),
      case when v_sin_fide then null else nullif(upper(btrim(coalesce(p->>'federacion', ''))), '') end,
      p->>'documento_tipo', btrim(p->>'documento'), v_correo, btrim(p->>'telefono'),
      nullif(btrim(coalesce(p->>'club', '')), ''), v_titulo, v_elo,
      case when v_sin_fide then null else nullif(nullif(p->>'elo_rapido', '')::int, 0) end,
      case when v_sin_fide then null else nullif(nullif(p->>'elo_blitz', '')::int, 0) end,
      v_torneos, v_clasico,
      case when v_edad < 18 then p->'responsable' end, p->'emergencia',
      v_hosp,
      case when v_hosp then (p->>'hospedaje_desde')::date end,
      case when v_hosp then (p->>'hospedaje_hasta')::date end,
      case when v_hosp then nullif(p->>'habitacion', '') end,
      case when v_hosp then least(greatest(coalesce(nullif(p->>'acompanantes', '')::int, 0), 0), 6) else 0 end,
      v_comidas,
      case when cardinality(v_comidas) > 0 then (p->>'comidas_desde')::date end,
      case when cardinality(v_comidas) > 0 then (p->>'comidas_hasta')::date end,
      nullif(btrim(coalesce(p->>'dieta', '')), ''),
      case when jsonb_typeof(p->'viaje') = 'object' then p->'viaje' end,
      v_condicion, nullif(btrim(coalesce(p->>'accesibilidad', '')), ''),
      case when jsonb_typeof(p->'factura') = 'object' then p->'factura' end,
      v_metodo, nullif(btrim(coalesce(p->>'pago_referencia', '')), ''),
      case when v_total > 0 then nullif(p->>'pago_fecha', '')::date end,
      v_total, round(v_total * 460)::int, v_comp, v_foto,
      true, true, true, now(),
      case when v_total > 0 then 'por_revisar' else 'no_aplica' end)
    returning id, numero into v_id, v_numero;
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'error',
        'Ya hay una inscripción con este ID FIDE o este documento. Si hay que corregir algo, escribe a metropolitano@fcacostarica.com.');
    when check_violation or invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
      return jsonb_build_object('ok', false, 'error', 'Revisa los datos: alguno no tiene el formato esperado.');
  end;

  return jsonb_build_object('ok', true, 'numero', v_numero,
    'codigo', 'MET-' || lpad(v_numero::text, 4, '0'),
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

-- ---------------------------------------------------------------- revisar
-- Quien administra da por bueno (o no) el pago y anula una inscripción.
create or replace function public.metropolitano_revisar(p_id uuid, p_pago_estado text, p_estado text, p_nota text)
returns public.metropolitano_inscripciones
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.metropolitano_inscripciones;
begin
  if not coalesce(public.soy_admin(), false) then
    raise exception 'Solo quien administra revisa las inscripciones del Metropolitano.' using errcode = '42501';
  end if;
  if p_pago_estado not in ('por_revisar', 'verificado', 'rechazado', 'no_aplica') or p_estado not in ('activa', 'anulada') then
    raise exception 'Estado inválido.';
  end if;
  update public.metropolitano_inscripciones
     set pago_estado = p_pago_estado, estado = p_estado,
         nota_organizacion = nullif(btrim(coalesce(p_nota, '')), ''),
         revisado_por = auth.uid(), revisado_en = now()
   where id = p_id;
  if not found then
    raise exception 'No existe esa inscripción.';
  end if;
  -- Se vuelve a leer: lo que quedó es lo que se devuelve.
  select * into v from public.metropolitano_inscripciones where id = p_id;
  return v;
end;
$$;
revoke execute on function public.metropolitano_revisar(uuid, text, text, text) from public, anon;
grant execute on function public.metropolitano_revisar(uuid, text, text, text) to authenticated;
