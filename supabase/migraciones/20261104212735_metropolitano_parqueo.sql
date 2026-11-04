-- Metropolitano 2026: el parqueo. Administración decide si se ofrece, cuánto
-- cuesta y cuántos espacios hay (metropolitano_parqueo, una sola fila, con su
-- bitácora); quien se inscribe marca «Necesita parqueo» y escribe la placa del
-- vehículo, que es la que entra. Se paga con la inscripción (el IVA, si pide
-- factura, también), una placa es un espacio (índice único entre las
-- inscripciones activas) y, cuando se llenan los cupos, la página deja de
-- ofrecerlo y la base no deja pasar ninguno más, tampoco con dos envíos a la
-- vez (la fila del parqueo se bloquea al contar). Ver «El parqueo» en
-- docs/decisiones/cuentas-y-formularios.md.

create table public.metropolitano_parqueo (
  id              boolean primary key default true check (id),
  precio_usd      numeric(8,2) not null default 0 check (precio_usd >= 0 and precio_usd <= 500),
  cupos           int not null default 0 check (cupos >= 0 and cupos <= 5000),
  activo          boolean not null default false,
  actualizado     timestamptz not null default now(),
  actualizado_por uuid references public.profiles(id) on delete set null
);
insert into public.metropolitano_parqueo (id) values (true);
alter table public.metropolitano_parqueo enable row level security;
create policy metropolitano_parqueo_ver on public.metropolitano_parqueo for select to authenticated
  using ((select public.soy_admin()));
-- Nadie la escribe desde afuera: la escribe metropolitano_parqueo_configurar.
-- (Una tabla nueva nace con todos los permisos, TRUNCATE incluido, que se salta la RLS.)
revoke all on table public.metropolitano_parqueo from anon;
revoke insert, update, delete, truncate, references, trigger on table public.metropolitano_parqueo from authenticated;
grant select on table public.metropolitano_parqueo to authenticated;
create trigger auditar after insert or delete or update on public.metropolitano_parqueo
  for each row execute function interno.auditar('precio_usd', 'cupos', 'activo');

alter table public.metropolitano_inscripciones
  add column parqueo boolean not null default false,
  add column placa text check (placa ~ '^[A-Z0-9]{2,10}$'),
  add column parqueo_usd numeric(8,2) not null default 0 check (parqueo_usd >= 0),
  add constraint metropolitano_parqueo_con_placa check (not parqueo or placa is not null);
-- Una placa, un espacio, entre las inscripciones activas (anular libera la placa).
create unique index metropolitano_una_placa on public.metropolitano_inscripciones (placa)
  where placa is not null and estado = 'activa';

-- Los espacios ya tomados: los de las inscripciones activas cuyo pago no se rechazó.
create or replace function interno.metropolitano_parqueo_usados()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.metropolitano_inscripciones m
   where m.parqueo and m.estado = 'activa' and m.pago_estado <> 'rechazado';
$$;
revoke execute on function interno.metropolitano_parqueo_usados() from public, anon, authenticated;

-- Para la página de inscripción (sin cuenta): si se ofrece, su precio y
-- cuántos espacios quedan. Sin cupos, «disponible» es falso y la página no lo muestra.
create or replace function public.metropolitano_parqueo_ver()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.metropolitano_parqueo%rowtype;
  v_quedan int;
begin
  select * into v from public.metropolitano_parqueo where id;
  v_quedan := greatest(coalesce(v.cupos, 0) - interno.metropolitano_parqueo_usados(), 0);
  return jsonb_build_object('disponible', coalesce(v.activo, false) and v_quedan > 0,
    'precio_usd', case when coalesce(v.activo, false) and v_quedan > 0 then v.precio_usd end,
    'quedan', case when coalesce(v.activo, false) then v_quedan end);
end;
$$;
revoke execute on function public.metropolitano_parqueo_ver() from public;
grant execute on function public.metropolitano_parqueo_ver() to anon, authenticated;

-- Para administración: cómo está y cuántos ya se tomaron.
create or replace function public.metropolitano_parqueo_estado()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.metropolitano_parqueo%rowtype;
begin
  if not coalesce(public.soy_admin(), false) then
    raise exception 'Solo administración ve el parqueo.';
  end if;
  select * into v from public.metropolitano_parqueo where id;
  return jsonb_build_object('precio_usd', v.precio_usd, 'cupos', v.cupos, 'activo', v.activo,
    'usados', interno.metropolitano_parqueo_usados(), 'actualizado', v.actualizado);
end;
$$;
revoke execute on function public.metropolitano_parqueo_estado() from public, anon;
grant execute on function public.metropolitano_parqueo_estado() to authenticated;

-- Para administración: el precio, los cupos y si se ofrece. Los cupos no
-- pueden quedar por debajo de los ya tomados.
create or replace function public.metropolitano_parqueo_configurar(p_precio numeric, p_cupos int, p_activo boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usados int;
begin
  if not coalesce(public.soy_admin(), false) then
    raise exception 'Solo administración configura el parqueo.';
  end if;
  if p_precio is null or p_precio < 0 or p_precio > 500 then
    raise exception 'El precio va de $0 a $500.';
  end if;
  if p_cupos is null or p_cupos < 0 or p_cupos > 5000 then
    raise exception 'Los espacios van de 0 a 5000.';
  end if;
  perform 1 from public.metropolitano_parqueo where id for update;
  v_usados := interno.metropolitano_parqueo_usados();
  if p_cupos < v_usados then
    raise exception 'Ya hay % espacios tomados: los cupos no pueden ser menos.', v_usados;
  end if;
  update public.metropolitano_parqueo
     set precio_usd = round(p_precio, 2), cupos = p_cupos, activo = coalesce(p_activo, false),
         actualizado = now(), actualizado_por = auth.uid()
   where id;
  return public.metropolitano_parqueo_estado();
end;
$$;
revoke execute on function public.metropolitano_parqueo_configurar(numeric, int, boolean) from public, anon;
grant execute on function public.metropolitano_parqueo_configurar(numeric, int, boolean) to authenticated;

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
  v_con_iva boolean := false;
  v_fac jsonb;
  v_base numeric;
  v_iva numeric;
  j int;
  v_ac int;
  v_version text;
  v_tit boolean;
  v_cod text;
  v_pct int;
  v_codigos text[] := '{}';
  v_id uuid;
  v_mal boolean;
  v_placa text;
  v_placas text[] := '{}';
  v_parq public.metropolitano_parqueo%rowtype;
  v_parq_leido boolean := false;
  v_usados int;
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
    -- Los titulados que no pagan (GM, IM y WGM) reciben de la organización el
    -- hospedaje y la alimentación: no se les piden. A todos se les piden los
    -- días de llegada y de salida (para la organización); si vienen de otro
    -- país, además el número de vuelo, la foto del tiquete y del pasaporte, y
    -- un correo y un teléfono para coordinar. La foto, como a todos, la pide
    -- interno.metropolitano_persona (va en el gafete).
    v_tit := r->>'rol' = 'jugador' and r->>'titulo' in ('GM', 'IM', 'WGM') and x->>'origen' = 'cr';
    if v_tit then
      v_mal := case when jsonb_typeof(x->'viaje') is distinct from 'object'
                     or coalesce(x#>>'{viaje,llegada}', '') !~ '^(2026-12|2027-01)-[0-3][0-9]$'
                     or coalesce(x#>>'{viaje,salida}', '') !~ '^(2026-12|2027-01)-[0-3][0-9]$' then true
                   else (x#>>'{viaje,salida}')::date <= (x#>>'{viaje,llegada}')::date end;
      if v_mal then
        return jsonb_build_object('ok', false, 'persona', i, 'error', quien || 'faltan el día en que llega al Estadio Nacional y el día en que sale.');
      end if;
    end if;
    v_tit := r->>'rol' = 'jugador' and r->>'titulo' in ('GM', 'IM', 'WGM') and x->>'origen' = 'fuera';
    if v_tit then
      -- (un CASE en una variable: el OR de SQL no garantiza el orden, y la
      -- fecha se lee solo si tiene forma de fecha; dentro de un IF, el THEN
      -- del CASE cortaría la condición)
      v_mal := case when jsonb_typeof(x->'viaje') is distinct from 'object'
                     or coalesce(x#>>'{viaje,llegada}', '') !~ '^(2026-12|2027-01)-[0-3][0-9]$'
                     or coalesce(x#>>'{viaje,salida}', '') !~ '^(2026-12|2027-01)-[0-3][0-9]$'
                     or length(btrim(coalesce(x#>>'{viaje,vuelo}', ''))) < 3 then true
                   else (x#>>'{viaje,salida}')::date <= (x#>>'{viaje,llegada}')::date end;
      if v_mal then
        return jsonb_build_object('ok', false, 'persona', i, 'error', quien || 'faltan los datos del vuelo: el día de llegada, el de salida y el número de vuelo.');
      end if;
      if coalesce(x->>'tiquete', '') !~ '^documento/[a-z0-9-]{8,64}/[A-Za-z0-9._-]{1,70}\.(jpg|png|webp|pdf)$'
         or not exists (select 1 from storage.objects o where o.bucket_id = 'metropolitano-2026' and o.name = x->>'tiquete') then
        return jsonb_build_object('ok', false, 'persona', i, 'error', quien || 'falta la foto del tiquete aéreo.');
      end if;
      if coalesce(x->>'pasaporte', '') !~ '^documento/[a-z0-9-]{8,64}/[A-Za-z0-9._-]{1,70}\.(jpg|png|webp|pdf)$'
         or not exists (select 1 from storage.objects o where o.bucket_id = 'metropolitano-2026' and o.name = x->>'pasaporte') then
        return jsonb_build_object('ok', false, 'persona', i, 'error', quien || 'falta la foto del pasaporte.');
      end if;
      if coalesce(r->>'correo', '') = '' or length(regexp_replace(coalesce(x->>'telefono', ''), '[^0-9]', '', 'g')) < 7 then
        return jsonb_build_object('ok', false, 'persona', i, 'error', quien || 'faltan su correo y su teléfono, para coordinar el viaje.');
      end if;
    end if;
    -- El hospedaje es en habitación compartida: hay que aceptarlo, y cada
    -- acompañante que se anota con la persona lleva sus datos.
    if (r->>'hospedaje')::boolean then
      if coalesce(x->>'habitacion', '') not in ('compartida', 'organizacion') then
        return jsonb_build_object('ok', false, 'persona', i, 'error', quien || 'elige con quién compartir la habitación: no hay habitaciones individuales.');
      end if;
      if not coalesce((x->>'acepta_compartir')::boolean, false) then
        return jsonb_build_object('ok', false, 'persona', i, 'error', quien || 'falta aceptar que la habitación es compartida.');
      end if;
      v_ac := least(greatest(coalesce(nullif(x->>'acompanantes', '')::int, 0), 0), 6);
      if v_ac > 0 and (jsonb_typeof(x->'acompanantes_detalle') is distinct from 'array'
          or jsonb_array_length(x->'acompanantes_detalle') <> v_ac
          or exists (select 1 from jsonb_array_elements(x->'acompanantes_detalle') a
                      where jsonb_typeof(a) is distinct from 'object'
                         or length(btrim(coalesce(a->>'nombre', ''))) < 5
                         or length(btrim(coalesce(a->>'documento', ''))) < 4
                         or coalesce(a->>'nacimiento', '') !~ '^(19|20)[0-9]{2}-[01][0-9]-[0-3][0-9]$')) then
        return jsonb_build_object('ok', false, 'persona', i, 'error', quien || 'faltan los datos de cada acompañante: nombre completo, documento y fecha de nacimiento.');
      end if;
    end if;
    -- El código de descuento (lo genera administración, vale una sola vez):
    -- baja el monto de esta persona en su porcentaje; con 100 %, no paga.
    -- Las mismas cuentas que js/metropolitano-reglas.js (precio, `descuento`).
    v_cod := nullif(upper(btrim(coalesce(x->>'codigo', ''))), '');
    if v_cod is not null then
      if v_cod = any (v_codigos) then
        return jsonb_build_object('ok', false, 'persona', i, 'error', quien || 'el código ' || v_cod || ' ya está en otra persona de esta inscripción: vale una sola vez.');
      end if;
      select c.porcentaje into v_pct from public.metropolitano_codigos c
       where c.codigo = v_cod and not c.anulado and c.usado_por is null;
      if v_pct is null then
        return jsonb_build_object('ok', false, 'persona', i, 'error', quien || 'el código ' || v_cod || ' no existe, ya se usó o fue anulado.');
      end if;
      if (r->>'monto')::numeric <= 0 then
        return jsonb_build_object('ok', false, 'persona', i, 'error', quien || 'esta inscripción no tiene costo: el código no hace falta.');
      end if;
      v_codigos := v_codigos || v_cod;
      r := r || jsonb_build_object('monto', (r->>'monto')::numeric - round((r->>'monto')::numeric * v_pct / 100.0, 2),
                                   'codigo', v_cod, 'descuento', v_pct);
    end if;
    -- El parqueo: lo ofrece administración con su precio y sus cupos
    -- (metropolitano_parqueo); se paga con la inscripción, después del código
    -- de descuento (el código es de la inscripción, no del parqueo), y el
    -- vehículo que entra es el de la placa. Una placa, un espacio: ni dos
    -- veces en el envío ni en otra inscripción activa.
    if coalesce((x->>'parqueo')::boolean, false) then
      if not v_parq_leido then
        -- La fila se bloquea: dos envíos a la vez no se pasan del cupo.
        select * into v_parq from public.metropolitano_parqueo where id for update;
        v_parq_leido := true;
      end if;
      if not coalesce(v_parq.activo, false) then
        return jsonb_build_object('ok', false, 'persona', i, 'error', quien || 'el parqueo ya no está disponible: quita «Necesita parqueo».');
      end if;
      v_placa := nullif(upper(regexp_replace(coalesce(x->>'placa', ''), '[^A-Za-z0-9]', '', 'g')), '');
      if v_placa is null or v_placa !~ '^[A-Z0-9]{2,10}$' then
        return jsonb_build_object('ok', false, 'persona', i, 'error', quien || 'falta la placa del vehículo (de 2 a 10 letras y números).');
      end if;
      if v_placa = any (v_placas) then
        return jsonb_build_object('ok', false, 'persona', i, 'error', quien || 'la placa ' || v_placa || ' ya está en otra persona de esta inscripción: es un espacio por vehículo.');
      end if;
      if exists (select 1 from public.metropolitano_inscripciones m where m.placa = v_placa and m.estado = 'activa') then
        return jsonb_build_object('ok', false, 'persona', i, 'error', quien || 'la placa ' || v_placa || ' ya tiene parqueo en otra inscripción.');
      end if;
      v_placas := v_placas || v_placa;
      r := r || jsonb_build_object('monto', (r->>'monto')::numeric + v_parq.precio_usd, 'parqueo', true, 'placa', v_placa, 'parqueo_usd', v_parq.precio_usd);
    end if;
    calc := calc || r;
    v_total := v_total + (r->>'monto')::numeric;
  end loop;
  -- Los cupos, contados con la fila del parqueo ya bloqueada.
  if cardinality(v_placas) > 0 then
    v_usados := interno.metropolitano_parqueo_usados();
    if v_usados + cardinality(v_placas) > v_parq.cupos then
      return jsonb_build_object('ok', false, 'error',
        case when v_usados >= v_parq.cupos then 'Ya no quedan espacios de parqueo: quita «Necesita parqueo» para mandar la inscripción.'
             else 'Solo quedan ' || (v_parq.cupos - v_usados) || ' espacios de parqueo y esta inscripción pide ' || cardinality(v_placas) || '.' end);
    end if;
  end if;
  -- El texto de la exoneración que se aceptó: el de los nacionales no pide
  -- seguro de viaje; si en el envío viene alguien de otro país, sí.
  v_version := case when exists (select 1 from jsonb_array_elements(v_personas) e where e->>'origen' = 'fuera')
                    then 'metropolitano-2026-v2-con-extranjeros' else 'metropolitano-2026-v2-nacionales' end;

  -- La factura electrónica: si la pide (y hay algo que cobrar), sus datos
  -- se validan como los pide Hacienda y el IVA del 13 % lo asume quien se
  -- inscribe, persona por persona y redondeado a céntimos, igual que
  -- js/metropolitano-reglas.js.
  if v_total > 0 and jsonb_typeof(p->'factura') = 'object' then
    begin
      v_fac := interno.metropolitano_factura(p->'factura');
    exception when raise_exception then
      return jsonb_build_object('ok', false, 'error', 'Factura electrónica: ' || sqlerrm);
    end;
    v_con_iva := true;
    v_total := 0;
    for j in 1 .. n loop
      v_base := (calc[j]->>'monto')::numeric;
      v_total := v_total + v_base + round(v_base * 0.13, 2);
    end loop;
  end if;

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
  -- La póliza de seguro y la exoneración de responsabilidad: obligatorias,
  -- y se guarda la versión del texto que se aceptó.
  if not (coalesce((p->>'acepta_datos')::boolean, false) and coalesce((p->>'acepta_imagen')::boolean, false)
          and coalesce((p->>'acepta_reglamento')::boolean, false) and coalesce((p->>'acepta_seguro')::boolean, false)) then
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
      v_base := (r->>'monto')::numeric;
      v_iva := case when v_con_iva then round(v_base * 0.13, 2) else 0 end;
      insert into public.metropolitano_inscripciones (
        iva_usd, acepta_seguro, exoneracion_version, nombre_fide, provincia, canton, origen, acepta_compartir, acompanantes_detalle, tiquete, pasaporte,
        codigo_descuento, descuento_pct, parqueo, placa, parqueo_usd,
        rol, es_delegado, grupo, delegacion, acepta_publicidad,
        fide_id, sin_fide, nombre, apellidos, sexo, nacimiento, nacionalidad, pais_residencia, federacion,
        documento_tipo, documento, correo, telefono, club, titulo, elo_estandar, elo_rapido, elo_blitz,
        torneos, clasico, responsable, emergencia,
        hospedaje, hospedaje_desde, hospedaje_hasta, habitacion, acompanantes,
        comidas, comidas_desde, comidas_hasta, dieta, viaje, condicion, accesibilidad, factura,
        pago_metodo, pago_referencia, pago_fecha, monto_usd, monto_crc, comprobante, foto,
        acepta_datos, acepta_imagen, acepta_reglamento, validado_en, pago_estado)
      values (
        v_iva, true, v_version,
        -- El nombre tal como lo trajo la búsqueda en FIDE, para comprobarlo
        -- en su perfil: lo de quien viene de afuera no se puede cambiar en la
        -- página, pero la página no es un candado.
        case when (r->>'sin_fide')::boolean then null else left(nullif(btrim(coalesce(x->>'nombre_fide', '')), ''), 160) end,
        -- De dónde viene quien vive en Costa Rica (para las estadísticas): la
        -- provincia y el cantón de la División Territorial; de afuera, nada.
        left(nullif(btrim(coalesce(x->>'provincia', '')), ''), 40), left(nullif(btrim(coalesce(x->>'canton', '')), ''), 60),
        case when x->>'origen' in ('cr', 'fuera') then x->>'origen' end,
        (r->>'hospedaje')::boolean and coalesce((x->>'acepta_compartir')::boolean, false),
        -- Los acompañantes que no se inscriben aparte, con lo justo de cada uno.
        case when (r->>'hospedaje')::boolean and jsonb_typeof(x->'acompanantes_detalle') = 'array' and jsonb_array_length(x->'acompanantes_detalle') > 0 then
          (select jsonb_agg(jsonb_build_object('nombre', left(btrim(a->>'nombre'), 100), 'documento', left(btrim(a->>'documento'), 30),
                  'nacimiento', a->>'nacimiento', 'parentesco', left(btrim(coalesce(a->>'parentesco', '')), 40)))
             from jsonb_array_elements(x->'acompanantes_detalle') a) end,
        -- El tiquete y el pasaporte, de los titulados que vienen de afuera (ya comprobados arriba).
        case when r->>'rol' = 'jugador' and r->>'titulo' in ('GM', 'IM', 'WGM') and x->>'origen' = 'fuera' then x->>'tiquete' end,
        case when r->>'rol' = 'jugador' and r->>'titulo' in ('GM', 'IM', 'WGM') and x->>'origen' = 'fuera' then x->>'pasaporte' end,
        r->>'codigo', (r->>'descuento')::int,
        coalesce((r->>'parqueo')::boolean, false), r->>'placa', coalesce((r->>'parqueo_usd')::numeric, 0),
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
        case when i = 1 then v_fac end,
        v_metodo, nullif(btrim(coalesce(p->>'pago_referencia', '')), ''),
        case when v_total > 0 then nullif(p->>'pago_fecha', '')::date end,
        v_base + v_iva, round((v_base + v_iva) * 460)::int, v_comp, r->>'foto',
        true, true, true, now(),
        case when v_base + v_iva > 0 then 'por_revisar' else 'no_aplica' end)
      returning id, numero into v_id, v_numero;
      -- El código queda gastado, atado a esta inscripción. Si otro envío lo
      -- usó entre la lectura y aquí, no cambia ninguna fila: se deshace todo.
      if r->>'codigo' is not null then
        update public.metropolitano_codigos set usado_por = v_id, usado_en = now()
         where codigo = r->>'codigo' and usado_por is null and not anulado;
        if not found then
          raise exception using errcode = 'unique_violation';
        end if;
      end if;
      salida := salida || jsonb_build_object('codigo', 'MET-' || lpad(v_numero::text, 4, '0'), 'numero', v_numero,
        'nombre', btrim(x->>'nombre') || ' ' || btrim(x->>'apellidos'), 'monto_usd', v_base + v_iva, 'iva_usd', v_iva);
    end loop;
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'persona', i, 'error',
        case when n > 1 then 'Persona ' || i || ': ' else '' end
        || 'ya hay una inscripción con este ID FIDE o este documento (o está dos veces en este grupo), o su código de descuento ya se usó, o su placa ya tiene parqueo. Si hay que corregir algo, escribe a metropolitano@fcacostarica.com.');
    when check_violation or invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
      return jsonb_build_object('ok', false, 'persona', i, 'error',
        case when n > 1 then 'Persona ' || i || ': ' else '' end || 'revisa los datos: alguno no tiene el formato esperado.');
  end;

  return jsonb_build_object('ok', true, 'grupo', v_grupo, 'personas', salida,
    'codigo', salida->0->>'codigo', 'numero', (salida->0->>'numero')::int,
    'monto_usd', v_total, 'monto_crc', round(v_total * 460)::int, 'con_iva', v_con_iva);
exception
  -- Un número o una fecha que no se puede leer (escrito a mano desde la
  -- consola) no debe dar un error crudo.
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    return jsonb_build_object('ok', false, 'error', 'Revisa los datos: alguno no tiene el formato esperado.');
end;
$$;
revoke execute on function public.metropolitano_inscribir(jsonb) from public;
grant execute on function public.metropolitano_inscribir(jsonb) to anon, authenticated;