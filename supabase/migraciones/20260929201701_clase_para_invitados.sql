-- La clase vista por invitados sin cuenta: un enlace que comparte el profe.
--
-- Quien tiene el enlace escribe su nombre, acepta la privacidad y ve el
-- tablero de la clase en pantalla completa, sin poder tocar nada: sigue lo
-- que mira el profe (game_state.vista), con sus flechas y círculos. La idea
-- es que conozca la clase y quiera una cuenta.
--
-- EL PERMISO LO DA LA BASE. El invitado no tiene auth.uid(): no puede leer
-- game_state por la RLS (ni por Realtime). Todo pasa por tres funciones
-- SECURITY DEFINER que reciben el token del enlace y el secreto del invitado
-- (su sha256 es lo único que se guarda), y cada vez vuelven a mirar que el
-- enlace siga vigente, que la clase esté abierta y que el invitado no esté
-- bloqueado. Solo sale el tablero: nada del chat, ni de los alumnos, ni el
-- nombre del alumno cuya respuesta se muestra (vista.respuesta).
--
-- SALIRSE DE LA PANTALLA: como en el examen. La primera vez queda anotada y se
-- le advierte; la segunda, el invitado queda bloqueado (bloqueado_at) y
-- clase_invitado_ver ya no le devuelve el tablero. Al profe le llega cada
-- salida por Realtime (clase_espectadores está en la publicación, filtrada por
-- owner_id). Volver a entrar desde la misma conexión con otro nombre tampoco
-- sirve: la IP de cada invitado queda en interno (no la ve nadie) y un
-- bloqueado cierra la entrada a esa IP en ese enlace.
--
-- EL FRENO: entrar crea una fila sin cuenta, así que pasa por
-- interno.frenar_envio_publico (tipo 'invitado'), y además hay un cupo de 40
-- invitados mirando a la vez por enlace.
--
-- Ver «La clase vista por invitados sin cuenta» en docs/decisiones/clase-en-vivo.md.

-- ------------------------------------------------------------- las tablas

create table public.clase_enlaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique default translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_'),
  creado_at timestamptz not null default now(),
  apagado_at timestamptz
);
-- Un solo enlace vigente por profe: «Cambiar el enlace» apaga el de antes.
create unique index clase_enlaces_uno_vigente on public.clase_enlaces (owner_id) where apagado_at is null;
comment on table public.clase_enlaces is
  'El enlace con que un profe deja ver su clase a invitados sin cuenta. Solo lo escriben clase_enlace_* (security definer).';

create table public.clase_espectadores (
  id uuid primary key default gen_random_uuid(),
  enlace_id uuid not null references public.clase_enlaces(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 2 and 40),
  secreto_hash text not null unique,
  privacidad_version text not null check (interno.version_legal_valida(privacidad_version)),
  privacidad_aceptada_en timestamptz not null default now(),
  entro_at timestamptz not null default now(),
  visto_at timestamptz not null default now(),
  salidas integer not null default 0,
  ultima_salida_at timestamptz,
  bloqueado_at timestamptz
);
create index clase_espectadores_owner on public.clase_espectadores (owner_id, entro_at desc);
create index clase_espectadores_enlace on public.clase_espectadores (enlace_id);
comment on table public.clase_espectadores is
  'Invitados sin cuenta mirando la clase por su enlace: nombre, salidas de la pantalla y si quedaron bloqueados. Solo la escriben clase_invitado_* y clase_enlace_* (security definer).';

-- La IP de cada invitado: solo para no dejar volver a quien quedó bloqueado.
-- En interno, que no se expone: ni el profe la ve.
create table interno.clase_espectadores_ip (
  espectador_id uuid primary key references public.clase_espectadores(id) on delete cascade,
  enlace_id uuid not null,
  ip text not null
);
create index clase_espectadores_ip_enlace on interno.clase_espectadores_ip (enlace_id, ip);
alter table interno.clase_espectadores_ip enable row level security;
revoke all on interno.clase_espectadores_ip from public, anon, authenticated;

alter table public.clase_enlaces enable row level security;
alter table public.clase_espectadores enable row level security;
revoke all on public.clase_enlaces, public.clase_espectadores from public, anon, authenticated;
grant select on public.clase_enlaces to authenticated;
-- El hash del secreto no sale ni para el profe: con columnas explícitas.
grant select (id, enlace_id, owner_id, nombre, entro_at, visto_at, salidas, ultima_salida_at, bloqueado_at)
  on public.clase_espectadores to authenticated;

create policy clase_enlaces_select on public.clase_enlaces for select to authenticated
  using (owner_id = (select auth.uid()));
create policy clase_espectadores_select on public.clase_espectadores for select to authenticated
  using (owner_id = (select auth.uid()));

alter publication supabase_realtime add table public.clase_espectadores;

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
    -- Entrar a mirar una clase por su enlace de invitado (ámbito: el enlace).
    -- Un grupo puede entrar desde la misma red (un aula); cada entrada nueva
    -- con otro nombre gasta cupo, así que volver a entrar una y otra vez se
    -- frena.
    when 'invitado'   then tope_ip := 30; tope_correo := null; periodo_correo := null;              tope_total := 150;
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

-- ------------------------------------------------------------- el profe

-- El enlace vigente del profe (lo crea si no hay). Con p_nuevo, apaga el de
-- antes —y con él a todos sus invitados— y crea otro. Devuelve { token }.
create or replace function public.clase_enlace_obtener(p_nuevo boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_token text;
begin
  if not coalesce((select p.role = 'profesor' from profiles p where p.id = v_uid), false) then
    raise exception 'Solo quien da la clase puede compartirla.' using errcode = '42501';
  end if;
  if coalesce(p_nuevo, false) then
    perform public.clase_enlace_apagar();
  end if;
  select token into v_token from clase_enlaces where owner_id = v_uid and apagado_at is null;
  if v_token is null then
    insert into clase_enlaces (owner_id) values (v_uid) returning token into v_token;
  end if;
  return jsonb_build_object('token', v_token);
end;
$function$;

-- Apaga el enlace vigente: nadie más entra y quien estaba mirando deja de ver.
-- Los invitados de ese enlace se borran (su nombre ya no hace falta).
create or replace function public.clase_enlace_apagar()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_ids uuid[];
begin
  if v_uid is null then
    raise exception 'Hace falta una sesión.' using errcode = '42501';
  end if;
  with a as (
    update clase_enlaces set apagado_at = now()
     where owner_id = v_uid and apagado_at is null
    returning id)
  select array_agg(id) into v_ids from a;
  if v_ids is not null then
    delete from clase_espectadores where enlace_id = any(v_ids);
  end if;
end;
$function$;

-- El profe saca a un invitado: queda bloqueado como si hubiera salido dos veces.
create or replace function public.clase_enlace_sacar(p_espectador uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  update clase_espectadores set bloqueado_at = coalesce(bloqueado_at, now())
   where id = p_espectador and owner_id = auth.uid();
end;
$function$;

-- ------------------------------------------------------------- el invitado

-- Lo que la página muestra antes de pedir el nombre: de quién es la clase y si
-- está abierta. Un enlace apagado o inventado da { valido: false }.
create or replace function public.clase_invitado_info(p_token text)
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select coalesce(
    (select jsonb_build_object('valido', true,
              'profesor', coalesce(nullif(btrim(p.full_name), ''), 'Tu profe'),
              'abierta', public.clase_abierta_de(e.owner_id))
       from clase_enlaces e join profiles p on p.id = e.owner_id
      where e.token = p_token and e.apagado_at is null),
    jsonb_build_object('valido', false));
$function$;

-- Entrar a mirar. Devuelve { secreto, nombre, profesor } o { error }.
create or replace function public.clase_invitado_entrar(p_token text, p_nombre text, p_privacidad text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  cab jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_ip text := nullif(btrim(coalesce(cab->>'cf-connecting-ip', cab->>'x-real-ip',
                 split_part(cab->>'x-forwarded-for', ',', 1))), '');
  v_nombre text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  v_enlace clase_enlaces%rowtype;
  v_freno text;
  v_secreto text;
  v_id uuid;
begin
  select * into v_enlace from clase_enlaces where token = p_token and apagado_at is null;
  if not found then
    return jsonb_build_object('error', 'Este enlace ya no sirve. Pídele a tu profe el enlace nuevo.');
  end if;
  if char_length(v_nombre) not between 2 and 40 then
    return jsonb_build_object('error', 'Escribe tu nombre (de 2 a 40 letras): tu profe lo va a ver.');
  end if;
  if not coalesce(interno.version_legal_valida(p_privacidad), false) then
    return jsonb_build_object('error', 'Para entrar tienes que aceptar la Política de privacidad.');
  end if;
  -- Quien quedó bloqueado no vuelve a entrar desde la misma conexión.
  if v_ip is not null and exists (
       select 1 from interno.clase_espectadores_ip i
         join clase_espectadores s on s.id = i.espectador_id
        where i.enlace_id = v_enlace.id and i.ip = v_ip and s.bloqueado_at is not null) then
    return jsonb_build_object('error', 'Desde esta conexión ya se salió de la clase dos veces: no se puede volver a entrar. Crea tu cuenta para seguir las clases.');
  end if;
  v_freno := interno.frenar_envio_publico('invitado', v_enlace.id::text, null);
  if v_freno is not null then
    return jsonb_build_object('error', v_freno);
  end if;
  if (select count(*) from clase_espectadores
       where enlace_id = v_enlace.id and bloqueado_at is null and visto_at > now() - interval '1 minute') >= 40 then
    return jsonb_build_object('error', 'La clase ya tiene 40 invitados mirando, que es el cupo. Intenta de nuevo en un rato.');
  end if;

  -- Lo de invitados de hace más de dos días ya no sirve para nada.
  delete from clase_espectadores where owner_id = v_enlace.owner_id and entro_at < now() - interval '2 days';

  v_secreto := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');
  insert into clase_espectadores (enlace_id, owner_id, nombre, secreto_hash, privacidad_version)
  values (v_enlace.id, v_enlace.owner_id, v_nombre, encode(extensions.digest(v_secreto, 'sha256'), 'hex'), p_privacidad)
  returning id into v_id;
  if v_ip is not null then
    insert into interno.clase_espectadores_ip (espectador_id, enlace_id, ip) values (v_id, v_enlace.id, v_ip);
  end if;
  return jsonb_build_object('secreto', v_secreto, 'nombre', v_nombre,
    'profesor', (select coalesce(nullif(btrim(full_name), ''), 'Tu profe') from profiles where id = v_enlace.owner_id));
end;
$function$;

-- Lo que ve el invitado ahora. { estado } es:
--   'fuera'      el secreto no es de este enlace (o el profe lo cambió);
--   'bloqueado'  salió dos veces de la pantalla o el profe lo sacó;
--   'esperando'  la clase no está abierta;
--   'ok'         con { tablero } y sus { salidas }.
create or replace function public.clase_invitado_ver(p_token text, p_secreto text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_esp clase_espectadores%rowtype;
  v_gs game_state%rowtype;
  v_vista jsonb;
begin
  select s.* into v_esp
    from clase_espectadores s join clase_enlaces e on e.id = s.enlace_id
   where e.token = p_token and e.apagado_at is null
     and s.secreto_hash = encode(extensions.digest(coalesce(p_secreto, ''), 'sha256'), 'hex');
  if not found then
    return jsonb_build_object('estado', 'fuera');
  end if;
  if v_esp.bloqueado_at is not null then
    return jsonb_build_object('estado', 'bloqueado', 'salidas', v_esp.salidas);
  end if;
  -- «Sigue mirando», para la lista del profe: una vez cada 20 s basta, y así
  -- Realtime no le manda un aviso por cada vuelta de cada invitado.
  if v_esp.visto_at < now() - interval '20 seconds' then
    update clase_espectadores set visto_at = now() where id = v_esp.id;
  end if;
  if not public.clase_abierta_de(v_esp.owner_id) then
    return jsonb_build_object('estado', 'esperando', 'salidas', v_esp.salidas);
  end if;
  select * into v_gs from game_state where owner_id = v_esp.owner_id;
  -- Solo el tablero. De la vista se quita de quién es la respuesta mostrada.
  v_vista := case when jsonb_typeof(v_gs.vista) = 'object' then v_gs.vista - 'respuesta' else null end;
  return jsonb_build_object('estado', 'ok', 'salidas', v_esp.salidas, 'tablero', jsonb_build_object(
    'start_fen', v_gs.start_fen,
    'moves', coalesce(v_gs.moves, '[]'::jsonb),
    'vista', v_vista,
    'arrows', coalesce(v_gs.arrows, '[]'::jsonb),
    'circles', coalesce(v_gs.circles, '[]'::jsonb),
    'pieces_hidden', coalesce(v_gs.pieces_hidden, false)));
end;
$function$;

-- El invitado se salió de la pantalla. La primera vez queda anotada; la
-- segunda, queda bloqueado. Dos avisos seguidos (blur y visibilitychange de la
-- misma salida) cuentan una vez. Devuelve { salidas, bloqueado } o { estado: 'fuera' }.
create or replace function public.clase_invitado_salio(p_token text, p_secreto text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_esp clase_espectadores%rowtype;
begin
  select s.* into v_esp
    from clase_espectadores s join clase_enlaces e on e.id = s.enlace_id
   where e.token = p_token and e.apagado_at is null
     and s.secreto_hash = encode(extensions.digest(coalesce(p_secreto, ''), 'sha256'), 'hex')
   for update of s;
  if not found then
    return jsonb_build_object('estado', 'fuera');
  end if;
  if v_esp.bloqueado_at is null
     and (v_esp.ultima_salida_at is null or v_esp.ultima_salida_at < now() - interval '3 seconds') then
    update clase_espectadores
       set salidas = salidas + 1,
           ultima_salida_at = now(),
           bloqueado_at = case when salidas + 1 >= 2 then now() end
     where id = v_esp.id
    returning * into v_esp;
  end if;
  return jsonb_build_object('salidas', v_esp.salidas, 'bloqueado', v_esp.bloqueado_at is not null);
end;
$function$;

-- Las del invitado las llama cualquiera con la clave pública; las del profe,
-- solo con sesión.
revoke execute on function public.clase_enlace_obtener(boolean), public.clase_enlace_apagar(),
  public.clase_enlace_sacar(uuid) from public, anon;
grant execute on function public.clase_enlace_obtener(boolean), public.clase_enlace_apagar(),
  public.clase_enlace_sacar(uuid) to authenticated;
revoke execute on function public.clase_invitado_info(text), public.clase_invitado_entrar(text, text, text),
  public.clase_invitado_ver(text, text), public.clase_invitado_salio(text, text) from public;
grant execute on function public.clase_invitado_info(text), public.clase_invitado_entrar(text, text, text),
  public.clase_invitado_ver(text, text), public.clase_invitado_salio(text, text) to anon, authenticated;
