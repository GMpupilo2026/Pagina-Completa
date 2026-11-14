-- Pareo Integral: los torneos guardados en la cuenta, para abrirlos en
-- cualquier computadora.
--
-- Pedido del dueño (noviembre de 2026): «todo lo que haga dentro de mi usuario
-- en las herramientas… si yo me meto en otra computadora, se carga toda esa
-- información». Hasta ahora cada torneo vivía solo en el navegador donde se
-- hizo (localStorage), y en otra computadora «Mis torneos» salía vacío.
--
-- Es OPCIONAL y con consentimiento: los torneos traen nombres y fechas de
-- nacimiento de menores, y hasta ahora no salían de la computadora. Quien lo
-- activa acepta (con la casilla y el enlace a privacidad.html) que se guarden
-- en la base; la aceptación queda en pareo_nube_cuentas, con su fecha.
--
--  - pareo_nube_cuentas: una fila por cuenta que lo activó (consentido_en).
--    Sin fila, la base no acepta ningún torneo de esa cuenta.
--  - pareo_nube_torneos: cada torneo de cada cuenta, con el mismo id que tiene
--    en el navegador (`t…`) y el torneo entero en `datos` (el mismo JSON que
--    guarda localStorage). `version` sube con cada cambio: quien guarda dice
--    sobre qué versión trabajó, y si otra computadora guardó antes, la base
--    contesta `conflicto` en vez de pisarlo (la página guarda lo suyo como
--    copia). Un torneo quitado queda como `borrado` (sin datos), para que las
--    demás computadoras lo quiten también y no lo vuelvan a subir.
--
-- Solo la cuenta dueña ve y escribe lo suyo: RLS con (select auth.uid()).
-- Nadie más, tampoco administración (son datos de terceros que esa persona
-- organiza, como lo que tenía en su computadora). Escribir pide además el
-- consentimiento y la licencia de Pareo (tengo_herramienta('pareo')); leer lo
-- propio no pide licencia: si vence, sus torneos se le siguen pudiendo bajar.
-- Las funciones son SECURITY INVOKER: la RLS decide.
--
-- No va en la bitácora de auditoría: no reparte permisos, accesos ni dinero.
-- Se borra con la cuenta (on delete cascade).
--
-- Ver «Pareo Integral: los torneos en la cuenta» en
-- docs/decisiones/juegos-y-torneos.md.

create table public.pareo_nube_cuentas (
  persona_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  consentido_en timestamptz not null default now()
);

comment on table public.pareo_nube_cuentas is
  'Las cuentas que activaron «Guardar mis torneos en mi cuenta» en Pareo Integral, con la fecha en que aceptaron (consentimiento: los torneos traen datos de menores). Sin fila, la base no acepta torneos de esa cuenta. Ver docs/decisiones/juegos-y-torneos.md.';

alter table public.pareo_nube_cuentas enable row level security;
revoke all on public.pareo_nube_cuentas from public, anon, authenticated;
grant select, insert, delete on public.pareo_nube_cuentas to authenticated;

create policy pareo_nube_cuentas_ver on public.pareo_nube_cuentas
  for select to authenticated using (persona_id = (select auth.uid()));
create policy pareo_nube_cuentas_activar on public.pareo_nube_cuentas
  for insert to authenticated with check (persona_id = (select auth.uid()) and public.tengo_herramienta('pareo'));
create policy pareo_nube_cuentas_apagar on public.pareo_nube_cuentas
  for delete to authenticated using (persona_id = (select auth.uid()));

create table public.pareo_nube_torneos (
  dueno uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  nombre text not null default '' check (char_length(nombre) <= 300),
  evento jsonb check (evento is null or jsonb_typeof(evento) = 'object'),
  datos jsonb check (datos is null or (jsonb_typeof(datos) = 'object' and pg_column_size(datos) <= 8000000)),
  version integer not null default 1 check (version > 0),
  borrado boolean not null default false,
  actualizado timestamptz not null default now(),
  primary key (dueno, id),
  constraint pareo_nube_torneos_borrado check (borrado = (datos is null))
);

comment on table public.pareo_nube_torneos is
  'Los torneos de Pareo Integral guardados en la cuenta de quien organiza (el mismo JSON que guarda el navegador), para abrirlos en cualquier computadora. Solo los ve y escribe su dueño. `version` sube con cada cambio; `borrado` deja la marca de un torneo quitado. Ver docs/decisiones/juegos-y-torneos.md.';
comment on column public.pareo_nube_torneos.id is
  'El id del torneo en el navegador (pareo_torneo_v1_<id>): el mismo en todas las computadoras.';
comment on column public.pareo_nube_torneos.version is
  'Sube con cada cambio. Quien guarda dice sobre qué versión trabajó; si no es la última, pareo_nube_guardar contesta conflicto en vez de pisarla.';
comment on column public.pareo_nube_torneos.borrado is
  'Torneo quitado (sin datos): las demás computadoras lo quitan también y no lo vuelven a subir.';

alter table public.pareo_nube_torneos enable row level security;
revoke all on public.pareo_nube_torneos from public, anon, authenticated;
grant select, insert, update, delete on public.pareo_nube_torneos to authenticated;

create policy pareo_nube_torneos_ver on public.pareo_nube_torneos
  for select to authenticated using (dueno = (select auth.uid()));
create policy pareo_nube_torneos_crear on public.pareo_nube_torneos
  for insert to authenticated with check (
    dueno = (select auth.uid())
    and exists (select 1 from public.pareo_nube_cuentas c where c.persona_id = (select auth.uid()))
    and public.tengo_herramienta('pareo'));
create policy pareo_nube_torneos_cambiar on public.pareo_nube_torneos
  for update to authenticated using (dueno = (select auth.uid())) with check (
    dueno = (select auth.uid())
    and exists (select 1 from public.pareo_nube_cuentas c where c.persona_id = (select auth.uid()))
    and public.tengo_herramienta('pareo'));
create policy pareo_nube_torneos_quitar on public.pareo_nube_torneos
  for delete to authenticated using (dueno = (select auth.uid()));

-- ¿La cuenta lo tiene activado? (y desde cuándo)
create or replace function public.pareo_nube_estado()
 returns jsonb
 language sql
 stable security invoker
 set search_path to ''
as $function$
  select jsonb_build_object(
    'activa', c.persona_id is not null,
    'consentido_en', c.consentido_en)
    from (select 1) uno
    left join public.pareo_nube_cuentas c on c.persona_id = (select auth.uid());
$function$;
revoke execute on function public.pareo_nube_estado() from public, anon;
grant execute on function public.pareo_nube_estado() to authenticated;

-- Activarlo: queda la aceptación con su fecha. Pide la licencia (la política).
create or replace function public.pareo_nube_activar()
 returns jsonb
 language plpgsql
 security invoker
 set search_path to ''
as $function$
begin
  if (select auth.uid()) is null then raise exception 'Hace falta iniciar sesión'; end if;
  if not coalesce(public.tengo_herramienta('pareo'), false) then
    raise exception 'Hace falta la licencia de Pareo Integral';
  end if;
  insert into public.pareo_nube_cuentas (persona_id) values ((select auth.uid()))
    on conflict (persona_id) do nothing;
  return public.pareo_nube_estado();
end;
$function$;
revoke execute on function public.pareo_nube_activar() from public, anon;
grant execute on function public.pareo_nube_activar() to authenticated;

-- Apagarlo: la base deja de aceptar torneos. Con p_borrar, además se borran
-- todos los que había en la cuenta (los de cada navegador quedan ahí).
create or replace function public.pareo_nube_apagar(p_borrar boolean)
 returns jsonb
 language plpgsql
 security invoker
 set search_path to ''
as $function$
declare
  n integer := 0;
begin
  if (select auth.uid()) is null then raise exception 'Hace falta iniciar sesión'; end if;
  delete from public.pareo_nube_cuentas where persona_id = (select auth.uid());
  if coalesce(p_borrar, false) then
    delete from public.pareo_nube_torneos where dueno = (select auth.uid());
    get diagnostics n = row_count;
  end if;
  return jsonb_build_object('activa', false, 'borrados', n);
end;
$function$;
revoke execute on function public.pareo_nube_apagar(boolean) from public, anon;
grant execute on function public.pareo_nube_apagar(boolean) to authenticated;

-- La lista de la cuenta, sin los torneos (solo lo que hace falta para saber
-- qué bajar y qué subir). Un solo valor jsonb: PostgREST no la corta en 1000.
create or replace function public.pareo_nube_lista()
 returns jsonb
 language sql
 stable security invoker
 set search_path to ''
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id,
      'nombre', t.nombre,
      'evento', t.evento,
      'version', t.version,
      'borrado', t.borrado,
      'actualizado', floor(extract(epoch from t.actualizado) * 1000)::bigint)
      order by t.actualizado desc), '[]'::jsonb)
    from public.pareo_nube_torneos t
   where t.dueno = (select auth.uid());
$function$;
revoke execute on function public.pareo_nube_lista() from public, anon;
grant execute on function public.pareo_nube_lista() to authenticated;

-- Bajar unos torneos enteros (hasta 20 por pedido).
create or replace function public.pareo_nube_traer(p_ids text[])
 returns jsonb
 language plpgsql
 stable security invoker
 set search_path to ''
as $function$
begin
  if coalesce(cardinality(p_ids), 0) > 20 then raise exception 'Hasta 20 torneos por pedido'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id,
      'nombre', t.nombre,
      'evento', t.evento,
      'version', t.version,
      'borrado', t.borrado,
      'datos', t.datos,
      'actualizado', floor(extract(epoch from t.actualizado) * 1000)::bigint)), '[]'::jsonb)
    from public.pareo_nube_torneos t
   where t.dueno = (select auth.uid()) and t.id = any (p_ids));
end;
$function$;
revoke execute on function public.pareo_nube_traer(text[]) from public, anon;
grant execute on function public.pareo_nube_traer(text[]) to authenticated;

-- Guardar un torneo sobre la versión que la computadora tenía (0 = nuevo).
-- Si en la cuenta hay una versión más nueva (otra computadora guardó antes),
-- no la pisa: contesta {conflicto, version}.
create or replace function public.pareo_nube_guardar(p_id text, p_nombre text, p_evento jsonb, p_datos jsonb, p_version integer)
 returns jsonb
 language plpgsql
 security invoker
 set search_path to ''
as $function$
declare
  yo uuid := (select auth.uid());
  v integer;
  r public.pareo_nube_torneos;
begin
  if yo is null then raise exception 'Hace falta iniciar sesión'; end if;
  if p_datos is null then raise exception 'Falta el torneo'; end if;
  select t.version into v from public.pareo_nube_torneos t where t.dueno = yo and t.id = p_id for update;
  if not found then
    begin
      insert into public.pareo_nube_torneos (dueno, id, nombre, evento, datos)
        values (yo, p_id, left(coalesce(p_nombre, ''), 300), p_evento, p_datos)
        returning * into r;
    exception when unique_violation then
      select t.version into v from public.pareo_nube_torneos t where t.dueno = yo and t.id = p_id;
      return jsonb_build_object('conflicto', true, 'version', v);
    end;
  elsif v <> coalesce(p_version, 0) then
    return jsonb_build_object('conflicto', true, 'version', v);
  else
    update public.pareo_nube_torneos t
       set nombre = left(coalesce(p_nombre, ''), 300), evento = p_evento, datos = p_datos,
           borrado = false, version = v + 1, actualizado = now()
     where t.dueno = yo and t.id = p_id
    returning * into r;
  end if;
  return jsonb_build_object('ok', true, 'version', r.version,
    'actualizado', floor(extract(epoch from r.actualizado) * 1000)::bigint);
end;
$function$;
revoke execute on function public.pareo_nube_guardar(text, text, jsonb, jsonb, integer) from public, anon;
grant execute on function public.pareo_nube_guardar(text, text, jsonb, jsonb, integer) to authenticated;

-- Quitar un torneo: queda la marca `borrado`, sin los datos. Con la misma
-- regla de versión: si otra computadora lo cambió después, no se quita.
create or replace function public.pareo_nube_borrar(p_id text, p_version integer)
 returns jsonb
 language plpgsql
 security invoker
 set search_path to ''
as $function$
declare
  yo uuid := (select auth.uid());
  v integer;
begin
  if yo is null then raise exception 'Hace falta iniciar sesión'; end if;
  select t.version into v from public.pareo_nube_torneos t where t.dueno = yo and t.id = p_id for update;
  if not found then return jsonb_build_object('ok', true, 'version', 0); end if;
  if v <> coalesce(p_version, 0) then return jsonb_build_object('conflicto', true, 'version', v); end if;
  update public.pareo_nube_torneos t
     set datos = null, evento = null, borrado = true, version = v + 1, actualizado = now()
   where t.dueno = yo and t.id = p_id;
  return jsonb_build_object('ok', true, 'version', v + 1);
end;
$function$;
revoke execute on function public.pareo_nube_borrar(text, integer) from public, anon;
grant execute on function public.pareo_nube_borrar(text, integer) to authenticated;
