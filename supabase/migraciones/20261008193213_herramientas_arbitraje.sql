-- Herramientas de arbitraje: las licencias, la caché de chess-results y las
-- selecciones guardadas.
--
-- herramientas-arbitraje.html muestra al público lo que hacen las
-- herramientas; para usarlas hace falta una LICENCIA. La genera quien
-- administra (licencias.html), con un código «AI-XXXX-XXXX-XXXX» que entrega a
-- quien la compró, o ya puesta en una cuenta. Quien la recibe la activa con su
-- cuenta y desde ese momento corren sus días. Quien administra tiene todas las
-- herramientas sin licencia y controla todas las licencias: revocar,
-- reactivar, cambiar el vencimiento, soltarla de la cuenta o borrarla.
--
-- EL CANDADO ES LA BASE: `tengo_herramienta()` lo pregunta la Edge Function
-- seleccion-chess-results con el token de quien llama, así que sin licencia
-- vigente no se lee ningún torneo aunque la página se abra desde la consola.
--
-- licencias_herramientas reparte acceso: no tiene política de escritura (la
-- escriben las funciones de abajo) y lleva el trigger de la bitácora.
--
-- Ver «Herramientas de arbitraje» en docs/decisiones/juegos-y-torneos.md.

-- ---- las licencias ----
create table public.licencias_herramientas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo ~ '^AI-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$'),
  herramienta text not null check (herramienta ~ '^[a-z0-9-]{2,40}$'),
  dias integer check (dias is null or dias between 1 and 3660),
  nota text check (nota is null or char_length(nota) <= 200),
  persona_id uuid references public.profiles(id) on delete set null,
  activada_en timestamptz,
  vence timestamptz,
  revocada boolean not null default false,
  creada_por uuid references public.profiles(id) on delete set null,
  creada_en timestamptz not null default now()
);
comment on table public.licencias_herramientas is
  'Licencias de las herramientas de arbitraje (herramientas-arbitraje.html). herramienta = el id de js/herramientas-arbitraje.js o «todas». dias corren desde la activación; null = sin vencimiento. Solo la escriben licencias_generar(), licencias_cambiar() y canjear_licencia().';
create index licencias_herramientas_persona_idx on public.licencias_herramientas (persona_id);
create index licencias_herramientas_creada_por_idx on public.licencias_herramientas (creada_por);

alter table public.licencias_herramientas enable row level security;
revoke all on public.licencias_herramientas from public, anon, authenticated;
grant select on public.licencias_herramientas to authenticated;
create policy licencias_herramientas_ver on public.licencias_herramientas
  for select to authenticated
  using (persona_id = (select auth.uid()) or (select public.soy_admin()));

create trigger auditar after insert or update or delete on public.licencias_herramientas
  for each row execute function interno.auditar();

-- ¿La cuenta que llama puede usar esta herramienta? Quien administra, todas.
create or replace function public.tengo_herramienta(p_herramienta text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(public.soy_admin(), false) or exists (
    select 1 from public.licencias_herramientas l
     where l.persona_id = auth.uid()
       and not l.revocada
       and l.activada_en is not null
       and l.herramienta in (p_herramienta, 'todas')
       and (l.vence is null or l.vence > now()));
$function$;
revoke execute on function public.tengo_herramienta(text) from public, anon;
grant execute on function public.tengo_herramienta(text) to authenticated;

-- Quien recibió un código lo activa con su cuenta. Un código ya activado por
-- otra cuenta no se puede volver a usar; el mismo dueño lo puede volver a
-- canjear sin que cambie nada.
create or replace function public.canjear_licencia(p_codigo text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_codigo text := upper(regexp_replace(coalesce(p_codigo, ''), '\s', '', 'g'));
  v public.licencias_herramientas;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para activar la licencia.' using errcode = '42501';
  end if;
  if v_codigo !~ '^AI-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$' then
    raise exception 'El código tiene la forma AI-XXXX-XXXX-XXXX.';
  end if;
  select * into v from public.licencias_herramientas where codigo = v_codigo for update;
  if not found then
    raise exception 'Ese código no existe. Revisa que esté bien escrito.';
  end if;
  if v.revocada then
    raise exception 'Esa licencia fue anulada. Escríbele a quien te la dio.';
  end if;
  if v.persona_id is not null and v.persona_id <> auth.uid() then
    raise exception 'Esa licencia ya la activó otra cuenta.';
  end if;
  if v.persona_id is null then
    update public.licencias_herramientas
       set persona_id = auth.uid(),
           activada_en = now(),
           vence = case when dias is null then null else now() + make_interval(days => dias) end
     where id = v.id;
  end if;
  select * into v from public.licencias_herramientas where id = v.id;
  return jsonb_build_object('herramienta', v.herramienta, 'vence', v.vence, 'activada_en', v.activada_en);
end;
$function$;
revoke execute on function public.canjear_licencia(text) from public, anon;
grant execute on function public.canjear_licencia(text) to authenticated;

-- Quien administra genera licencias: sueltas (un código para entregar) o ya
-- puestas en una cuenta (activadas desde hoy).
create or replace function public.licencias_generar(p_herramienta text, p_cantidad integer, p_dias integer, p_nota text, p_persona uuid default null)
 returns setof public.licencias_herramientas
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_codigo text;
  v_id uuid;
  v_hechas integer := 0;
  v_ids uuid[] := '{}';
begin
  if not coalesce(public.soy_admin(), false) then
    raise exception 'Solo quien administra genera licencias.' using errcode = '42501';
  end if;
  if coalesce(p_cantidad, 0) < 1 or p_cantidad > 200 then
    raise exception 'Se generan de 1 a 200 licencias de una vez.';
  end if;
  if p_persona is not null and p_cantidad <> 1 then
    raise exception 'A una cuenta se le pone una licencia por vez.';
  end if;
  if p_persona is not null and not exists (select 1 from public.profiles where id = p_persona) then
    raise exception 'Esa cuenta no existe.';
  end if;
  while v_hechas < p_cantidad loop
    v_codigo := 'AI-' || upper(substr(md5(gen_random_uuid()::text), 1, 4)) || '-'
                      || upper(substr(md5(gen_random_uuid()::text), 1, 4)) || '-'
                      || upper(substr(md5(gen_random_uuid()::text), 1, 4));
    insert into public.licencias_herramientas (codigo, herramienta, dias, nota, persona_id, activada_en, vence, creada_por)
    values (v_codigo, p_herramienta, p_dias, nullif(btrim(coalesce(p_nota, '')), ''),
            p_persona,
            case when p_persona is null then null else now() end,
            case when p_persona is null or p_dias is null then null else now() + make_interval(days => p_dias) end,
            auth.uid())
    on conflict (codigo) do nothing
    returning id into v_id;
    if v_id is not null then
      v_ids := v_ids || v_id;
      v_hechas := v_hechas + 1;
      v_id := null;
    end if;
  end loop;
  return query select * from public.licencias_herramientas where id = any(v_ids) order by creada_en, codigo;
end;
$function$;
revoke execute on function public.licencias_generar(text, integer, integer, text, uuid) from public, anon;
grant execute on function public.licencias_generar(text, integer, integer, text, uuid) to authenticated;

-- El control de quien administra sobre una licencia:
--   revocar | reactivar | soltar (la deja libre para otra cuenta, sin días
--   corridos) | vence (p_vence: la nueva fecha; null = sin vencimiento) | borrar
create or replace function public.licencias_cambiar(p_id uuid, p_accion text, p_vence timestamptz default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not coalesce(public.soy_admin(), false) then
    raise exception 'Solo quien administra cambia licencias.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.licencias_herramientas where id = p_id) then
    raise exception 'Esa licencia no existe.';
  end if;
  case p_accion
    when 'revocar' then update public.licencias_herramientas set revocada = true where id = p_id;
    when 'reactivar' then update public.licencias_herramientas set revocada = false where id = p_id;
    when 'soltar' then update public.licencias_herramientas set persona_id = null, activada_en = null, vence = null where id = p_id;
    when 'vence' then update public.licencias_herramientas set vence = p_vence where id = p_id;
    when 'borrar' then delete from public.licencias_herramientas where id = p_id;
    else raise exception 'Acción desconocida: %', p_accion;
  end case;
end;
$function$;
revoke execute on function public.licencias_cambiar(uuid, text, timestamptz) from public, anon;
grant execute on function public.licencias_cambiar(uuid, text, timestamptz) to authenticated;

-- Todas las licencias con el nombre y el correo de quien la tiene (para
-- licencias.html). Solo quien administra.
create or replace function public.licencias_admin()
 returns table (id uuid, codigo text, herramienta text, dias integer, nota text, persona_id uuid,
                persona_nombre text, persona_correo text, activada_en timestamptz, vence timestamptz,
                revocada boolean, creada_en timestamptz)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if not coalesce(public.soy_admin(), false) then
    raise exception 'Solo quien administra ve todas las licencias.' using errcode = '42501';
  end if;
  return query
    select l.id, l.codigo, l.herramienta, l.dias, l.nota, l.persona_id, p.full_name, p.email,
           l.activada_en, l.vence, l.revocada, l.creada_en
      from public.licencias_herramientas l
      left join public.profiles p on p.id = l.persona_id
     order by l.creada_en desc, l.codigo;
end;
$function$;
revoke execute on function public.licencias_admin() from public, anon;
grant execute on function public.licencias_admin() to authenticated;

-- ---- la caché de chess-results ----
-- Lo último que la Edge Function seleccion-chess-results leyó de cada torneo.
-- Trae años de nacimiento de menores: solo la ve el service role.
create table public.seleccion_cache (
  clave text primary key check (clave ~ '^(s\d{1,2}\.)?chess-results\.com/\d{1,9}$'),
  datos jsonb not null,
  leido_en timestamptz not null default now()
);
comment on table public.seleccion_cache is
  'Lo que la Edge Function seleccion-chess-results leyó de cada torneo de chess-results (servidor/tnr). Solo la usa la función (service role).';
alter table public.seleccion_cache enable row level security;
revoke all on public.seleccion_cache from public, anon, authenticated;

-- ---- las selecciones guardadas ----
-- La configuración de una selección (torneos, rama y ritmo de cada uno, rango
-- de años, cupos y los ajustes a mano del árbitro). La guarda su dueño; un
-- profesor con licencia la abre con el enlace (seleccion_compartida) y la ve
-- en vivo con los mismos ajustes.
create table public.selecciones_arbitraje (
  id uuid primary key default gen_random_uuid(),
  creada_por uuid not null references public.profiles(id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 2 and 120),
  config jsonb not null default '{}'::jsonb check (pg_column_size(config) < 200000),
  creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now()
);
comment on table public.selecciones_arbitraje is
  'Selecciones de seleccion-codicader.html: torneos, opciones y ajustes del árbitro. Las escribe su dueño (con licencia); las abre por enlace quien tenga licencia (seleccion_compartida).';
create index selecciones_arbitraje_creada_por_idx on public.selecciones_arbitraje (creada_por);

alter table public.selecciones_arbitraje enable row level security;
revoke all on public.selecciones_arbitraje from public, anon, authenticated;
grant select, insert, update, delete on public.selecciones_arbitraje to authenticated;
create policy selecciones_arbitraje_ver on public.selecciones_arbitraje
  for select to authenticated
  using (creada_por = (select auth.uid()) or (select public.soy_admin()));
create policy selecciones_arbitraje_crear on public.selecciones_arbitraje
  for insert to authenticated
  with check (creada_por = (select auth.uid()) and (select public.tengo_herramienta('seleccion-codicader')));
create policy selecciones_arbitraje_cambiar on public.selecciones_arbitraje
  for update to authenticated
  using (creada_por = (select auth.uid()) or (select public.soy_admin()))
  with check (creada_por = (select auth.uid()) or (select public.soy_admin()));
create policy selecciones_arbitraje_borrar on public.selecciones_arbitraje
  for delete to authenticated
  using (creada_por = (select auth.uid()) or (select public.soy_admin()));

-- La selección de otra persona, por su enlace: solo con licencia.
create or replace function public.seleccion_compartida(p_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v public.selecciones_arbitraje;
begin
  if not coalesce(public.tengo_herramienta('seleccion-codicader'), false) then
    raise exception 'Tu cuenta no tiene una licencia vigente de esta herramienta.' using errcode = '42501';
  end if;
  select * into v from public.selecciones_arbitraje where id = p_id;
  if not found then
    raise exception 'Esa selección no existe o la borró quien la armó.';
  end if;
  return jsonb_build_object('id', v.id, 'nombre', v.nombre, 'config', v.config,
                            'actualizada_en', v.actualizada_en, 'mia', v.creada_por = auth.uid());
end;
$function$;
revoke execute on function public.seleccion_compartida(uuid) from public, anon;
grant execute on function public.seleccion_compartida(uuid) to authenticated;
