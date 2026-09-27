-- La quiniela de resultados de una sala de torneo.
--
-- Quien administra la enciende por sala (salas_torneo.quiniela). Cualquiera,
-- sin cuenta, se anota con su nombre y su correo y pronostica el resultado de
-- cada partida transmitida (gana blancas, tablas, gana negras) antes de que
-- empiece. Cada acierto suma un punto; la tabla de aciertos se CALCULA, no se
-- guarda (quiniela_tabla()).
--
-- CÓMO SE SABE QUÉ PARTIDAS HAY Y CUÁNDO CIERRAN: las copia de Lichess la Edge
-- Function quiniela (quiniela_partidas), como mucho una vez cada 45 segundos
-- por sala, cuando alguien mira o pronostica. Una partida se cierra cuando
-- empieza su ronda (cierra_en, el startsAt de Lichess), cuando ya tiene
-- jugadas o cuando ya tiene resultado. Eso lo decide quiniela_pronosticar(),
-- en la base: la página no puede reabrir una partida.
--
-- QUIÉN VE QUÉ: estas tablas no las lee nadie desde el navegador (ni anon ni
-- authenticated tienen permiso), salvo quien administra, que ve los nombres,
-- los correos y los pronósticos de sus salas para poder avisarle a quien gane.
-- La página pública recibe de la Edge Function solo los nombres y los
-- aciertos: el correo no se publica nunca.
--
-- EL TOKEN: al anotarse, la persona recibe un código al azar que queda en su
-- navegador; con él cambia sus pronósticos. En la base se guarda solo su
-- sha256. Un correo se anota una vez por sala (índice único), y el freno de
-- envíos sin cuenta (interno.frenar_envio_publico, tipo 'quiniela') pone topes
-- por IP, por correo y por sala.
--
-- EL CONSENTIMIENTO: la versión de la política de privacidad aceptada y la
-- hora, como los demás formularios (interno.version_legal_valida).
--
-- Ver «La quiniela de resultados» en docs/decisiones/juegos-y-torneos.md.

alter table public.salas_torneo
  add column quiniela boolean not null default false,
  add column quiniela_sincronizada_en timestamptz;

create table public.quiniela_partidas (
  sala_id uuid not null references public.salas_torneo(id) on delete cascade,
  partida_id text not null check (partida_id ~ '^[A-Za-z0-9]{8}$'),
  ronda_id text not null,
  ronda_nombre text not null default '',
  ronda_orden integer not null default 0,
  mesa integer not null default 0,
  blancas text not null default '',
  negras text not null default '',
  empezada boolean not null default false,
  cierra_en timestamptz,
  resultado text check (resultado in ('1-0', '½-½', '0-1')),
  actualizado_en timestamptz not null default now(),
  primary key (sala_id, partida_id)
);
comment on table public.quiniela_partidas is
  'Las partidas de Lichess de una sala con quiniela, copiadas por la Edge Function quiniela. Solo la escribe esa función (service role).';

create table public.quiniela_participantes (
  id uuid primary key default gen_random_uuid(),
  sala_id uuid not null references public.salas_torneo(id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 2 and 60),
  correo text not null check (char_length(correo) <= 200 and correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  token_hash text not null unique,
  privacidad_version text not null check (interno.version_legal_valida(privacidad_version)),
  privacidad_aceptada_en timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index quiniela_participantes_un_correo_por_sala on public.quiniela_participantes (sala_id, lower(correo));
comment on table public.quiniela_participantes is
  'Quien juega la quiniela de una sala: nombre, correo (no se publica) y el sha256 de su código. Solo la escriben las funciones de la quiniela.';

create table public.quiniela_pronosticos (
  participante_id uuid not null references public.quiniela_participantes(id) on delete cascade,
  sala_id uuid not null,
  partida_id text not null,
  pronostico text not null check (pronostico in ('1-0', '½-½', '0-1')),
  actualizado_en timestamptz not null default now(),
  primary key (participante_id, partida_id),
  foreign key (sala_id, partida_id) references public.quiniela_partidas(sala_id, partida_id) on delete cascade
);
create index quiniela_pronosticos_sala on public.quiniela_pronosticos (sala_id, partida_id);

alter table public.quiniela_partidas enable row level security;
alter table public.quiniela_participantes enable row level security;
alter table public.quiniela_pronosticos enable row level security;
revoke all on public.quiniela_partidas, public.quiniela_participantes, public.quiniela_pronosticos from public, anon, authenticated;
grant select on public.quiniela_partidas, public.quiniela_participantes, public.quiniela_pronosticos to authenticated;
create policy quiniela_partidas_admin on public.quiniela_partidas for select to authenticated using ((select public.soy_admin()));
create policy quiniela_participantes_admin on public.quiniela_participantes for select to authenticated using ((select public.soy_admin()));
create policy quiniela_pronosticos_admin on public.quiniela_pronosticos for select to authenticated using ((select public.soy_admin()));

-- ------------------------------------------------------------- el freno

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
    -- Cada prueba es una cuenta nueva con 3 días de Academia: el tope por IP
    -- es chico. Un colegio sale por una sola IP, pero la prueba es de una
    -- persona que decide si compra, no de un grupo (el grupo se arma con un
    -- paquete).
    when 'prueba'     then tope_ip := 3;  tope_correo := null; periodo_correo := null;              tope_total := 40;
    -- La encuesta anónima de un curso: como un formulario. Un grupo entero
    -- puede contestar desde la misma conexión (un aula, una asociación).
    when 'encuesta'   then tope_ip := 40; tope_correo := null; periodo_correo := null;              tope_total := 300;
    -- Anotarse en la quiniela de una sala: el público de un torneo, muchas
    -- veces desde la misma red del lugar. Un correo se anota una vez por sala
    -- (índice único); el tope por correo frena probar correos de a uno.
    when 'quiniela'   then tope_ip := 40; tope_correo := 5;    periodo_correo := interval '1 day';  tope_total := 500;
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

-- ------------------------------------------------------------- anotarse

-- Devuelve { token } o { error }. Solo la llama la Edge Function quiniela
-- (service role), que le pasa la IP de quien se anota.
create or replace function public.quiniela_unirse(p_sala uuid, p_nombre text, p_correo text, p_privacidad text, p_ip text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_nombre text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  v_correo text := lower(btrim(coalesce(p_correo, '')));
  v_freno text;
  v_token text;
begin
  if not exists (select 1 from salas_torneo where id = p_sala and visible and quiniela) then
    return jsonb_build_object('error', 'La quiniela de esta sala no está abierta.');
  end if;
  if char_length(v_nombre) not between 2 and 60 then
    return jsonb_build_object('error', 'Escribe tu nombre (de 2 a 60 letras).');
  end if;
  if char_length(v_correo) > 200 or v_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('error', 'Revisa el correo: tiene que ser como nombre@ejemplo.com.');
  end if;
  if not coalesce(interno.version_legal_valida(p_privacidad), false) then
    return jsonb_build_object('error', 'Para participar tienes que aceptar la Política de privacidad.');
  end if;
  -- El freno antes de mirar si el correo ya está: probar correos de a uno
  -- para saber quién juega también gasta cupo.
  v_freno := interno.frenar_envio_publico('quiniela', p_sala::text, v_correo, p_ip);
  if v_freno is not null then
    return jsonb_build_object('error', v_freno);
  end if;
  if exists (select 1 from quiniela_participantes where sala_id = p_sala and lower(correo) = v_correo) then
    return jsonb_build_object('error', 'Ese correo ya está anotado en esta quiniela. Tus pronósticos se cambian desde el navegador donde te anotaste.');
  end if;
  v_token := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');
  insert into quiniela_participantes (sala_id, nombre, correo, token_hash, privacidad_version)
  values (p_sala, v_nombre, v_correo, encode(extensions.digest(v_token, 'sha256'), 'hex'), p_privacidad);
  return jsonb_build_object('token', v_token, 'nombre', v_nombre);
exception when unique_violation then
  return jsonb_build_object('error', 'Ese correo ya está anotado en esta quiniela. Tus pronósticos se cambian desde el navegador donde te anotaste.');
end;
$function$;

-- ------------------------------------------------------------- pronosticar

-- Una partida está cerrada si ya empezó, si ya tiene resultado o si ya llegó
-- la hora de su ronda. Una sola copia de la regla: la usan pronosticar y lo
-- que ve la página.
create or replace function public.quiniela_cerrada(p_empezada boolean, p_resultado text, p_cierra_en timestamptz)
 returns boolean
 language sql
 stable
 set search_path to ''
as $function$
  select p_empezada or p_resultado is not null or (p_cierra_en is not null and now() >= p_cierra_en);
$function$;

create or replace function public.quiniela_pronosticar(p_sala uuid, p_token text, p_partida text, p_pronostico text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_participante uuid;
  v_partida quiniela_partidas%rowtype;
begin
  select id into v_participante from quiniela_participantes
   where sala_id = p_sala and token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if v_participante is null then
    return jsonb_build_object('error', 'No te encontramos en esta quiniela. Anótate de nuevo con tu nombre y tu correo.');
  end if;
  if p_pronostico not in ('1-0', '½-½', '0-1') then
    return jsonb_build_object('error', 'Ese pronóstico no existe.');
  end if;
  select * into v_partida from quiniela_partidas where sala_id = p_sala and partida_id = p_partida;
  if not found then
    return jsonb_build_object('error', 'Esa partida no es de esta sala.');
  end if;
  if public.quiniela_cerrada(v_partida.empezada, v_partida.resultado, v_partida.cierra_en) then
    return jsonb_build_object('error', 'Esa partida ya empezó: los pronósticos se cerraron.');
  end if;
  insert into quiniela_pronosticos (participante_id, sala_id, partida_id, pronostico)
  values (v_participante, p_sala, p_partida, p_pronostico)
  on conflict (participante_id, partida_id) do update set pronostico = excluded.pronostico, actualizado_en = now();
  return jsonb_build_object('ok', true);
end;
$function$;

-- Quién es el dueño de un token, y sus pronósticos.
create or replace function public.quiniela_yo(p_sala uuid, p_token text)
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object('nombre', p.nombre,
           'pronosticos', coalesce((select jsonb_object_agg(x.partida_id, x.pronostico) from quiniela_pronosticos x where x.participante_id = p.id), '{}'::jsonb))
    from quiniela_participantes p
   where p.sala_id = p_sala and p.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$function$;

-- ------------------------------------------------------------- la tabla

-- Calculada, no guardada. SECURITY INVOKER: quien administra la lee por su
-- RLS (con los correos, para avisarle a quien gane); la Edge Function la lee
-- con el service role y le quita el correo antes de publicarla.
create or replace function public.quiniela_tabla(p_sala uuid)
 returns table (puesto integer, nombre text, correo text, aciertos integer, resueltos integer, pronosticos integer, anotado_en timestamptz)
 language sql
 stable
 security invoker
 set search_path to 'public'
as $function$
  with cuenta as (
    select p.id, p.nombre, p.correo, p.created_at,
           count(x.partida_id) filter (where q.resultado is not null and q.resultado = x.pronostico)::int as aciertos,
           count(x.partida_id) filter (where q.resultado is not null)::int as resueltos,
           count(x.partida_id)::int as pronosticos
      from quiniela_participantes p
      left join quiniela_pronosticos x on x.participante_id = p.id
      left join quiniela_partidas q on q.sala_id = x.sala_id and q.partida_id = x.partida_id
     where p.sala_id = p_sala
     group by p.id, p.nombre, p.correo, p.created_at
  )
  select (rank() over (order by aciertos desc))::int, nombre, correo, aciertos, resueltos, pronosticos, created_at
    from cuenta
   order by aciertos desc, nombre;
$function$;

revoke execute on function public.quiniela_unirse(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.quiniela_pronosticar(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.quiniela_yo(uuid, text) from public, anon, authenticated;
revoke execute on function public.quiniela_tabla(uuid) from public, anon;
grant execute on function public.quiniela_unirse(uuid, text, text, text, text) to service_role;
grant execute on function public.quiniela_pronosticar(uuid, text, text, text) to service_role;
grant execute on function public.quiniela_yo(uuid, text) to service_role;
grant execute on function public.quiniela_tabla(uuid) to authenticated, service_role;