-- «Torneos en Pareo Integral»: el mismo jugador en todos sus torneos, el
-- ranking del año, la ficha de cada colegio o club, la provincia de cada
-- torneo, los torneos de ajedrezcostarica.com sin repetir los que ya están
-- publicados acá, y los avisos por correo a quien sigue a un jugador. Lo
-- pidió el dueño del sitio.
--
-- De dónde sale cada cosa:
--   - `datos.jugadores[].ident`: la huella del ID FIDE (HMAC con el secreto
--     pareo_identidad_secreto), que pone la Edge Function pareo-publicar. El
--     ID FIDE no se guarda nunca.
--   - `datos.resumen`: el puesto, los puntos y el rendimiento de cada
--     jugador, como los calcula quien publica (js/pareo/publicar.js).
--   - `datos.provincia`: la que elige quien organiza; si no la dijo, se
--     deduce del lugar (pareo_provincia).
--
-- Todo lo que se lee es SECURITY INVOKER sobre pareo_publicados: la RLS
-- esconde los torneos ocultos también acá. Las suscripciones no se leen
-- desde afuera: las escribe y las lee solo la función, con la service role.
--
-- Ver «Torneos en Pareo Integral: el mismo jugador en todos sus torneos» y
-- las secciones que siguen en docs/decisiones/juegos-y-torneos.md.

-- ---- el secreto de la huella ----
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'pareo_identidad_secreto') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'pareo_identidad_secreto');
  end if;
end;
$$;

create or replace function public.secreto_pareo_identidad()
returns text language sql stable security definer set search_path to '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'pareo_identidad_secreto';
$$;
revoke all on function public.secreto_pareo_identidad() from public, anon, authenticated;
grant execute on function public.secreto_pareo_identidad() to service_role;

-- ---- la provincia ----
-- La que diga el lugar: un trozo (entre comas, puntos, paréntesis…) que sea
-- el nombre de una provincia o de un cantón, o el nombre de una provincia en
-- cualquier parte («Polideportivo de Cartago»). Si salen dos provincias, o
-- ninguna, no se adivina: ''. «San Isidro de El General» no es el cantón San
-- Isidro (de Heredia): por eso los cantones se comparan con el trozo entero.
create or replace function public.pareo_provincia(p_lugar text)
returns text
language sql immutable parallel safe set search_path = '' as $$
  with cantones(c, p) as (values
    ('SAN JOSE','San José'),('ESCAZU','San José'),('DESAMPARADOS','San José'),('PURISCAL','San José'),('TARRAZU','San José'),
    ('ASERRI','San José'),('MORA','San José'),('GOICOECHEA','San José'),('SANTA ANA','San José'),('ALAJUELITA','San José'),
    ('VAZQUEZ DE CORONADO','San José'),('CORONADO','San José'),('ACOSTA','San José'),('TIBAS','San José'),('MORAVIA','San José'),
    ('MONTES DE OCA','San José'),('TURRUBARES','San José'),('DOTA','San José'),('CURRIDABAT','San José'),('PEREZ ZELEDON','San José'),
    ('LEON CORTES','San José'),('LEON CORTES CASTRO','San José'),
    ('ALAJUELA','Alajuela'),('SAN RAMON','Alajuela'),('GRECIA','Alajuela'),('SAN MATEO','Alajuela'),('ATENAS','Alajuela'),
    ('NARANJO','Alajuela'),('PALMARES','Alajuela'),('POAS','Alajuela'),('OROTINA','Alajuela'),('SAN CARLOS','Alajuela'),
    ('ZARCERO','Alajuela'),('SARCHI','Alajuela'),('UPALA','Alajuela'),('LOS CHILES','Alajuela'),('GUATUSO','Alajuela'),('RIO CUARTO','Alajuela'),
    ('CARTAGO','Cartago'),('PARAISO','Cartago'),('LA UNION','Cartago'),('JIMENEZ','Cartago'),('TURRIALBA','Cartago'),
    ('ALVARADO','Cartago'),('OREAMUNO','Cartago'),('EL GUARCO','Cartago'),
    ('HEREDIA','Heredia'),('BARVA','Heredia'),('SANTO DOMINGO','Heredia'),('SANTA BARBARA','Heredia'),('SAN RAFAEL','Heredia'),
    ('SAN ISIDRO','Heredia'),('BELEN','Heredia'),('FLORES','Heredia'),('SAN PABLO','Heredia'),('SARAPIQUI','Heredia'),
    ('LIBERIA','Guanacaste'),('NICOYA','Guanacaste'),('SANTA CRUZ','Guanacaste'),('BAGACES','Guanacaste'),('CARRILLO','Guanacaste'),
    ('CANAS','Guanacaste'),('ABANGARES','Guanacaste'),('TILARAN','Guanacaste'),('NANDAYURE','Guanacaste'),('LA CRUZ','Guanacaste'),('HOJANCHA','Guanacaste'),
    ('PUNTARENAS','Puntarenas'),('ESPARZA','Puntarenas'),('BUENOS AIRES','Puntarenas'),('MONTES DE ORO','Puntarenas'),('OSA','Puntarenas'),
    ('QUEPOS','Puntarenas'),('AGUIRRE','Puntarenas'),('GOLFITO','Puntarenas'),('COTO BRUS','Puntarenas'),('PARRITA','Puntarenas'),
    ('CORREDORES','Puntarenas'),('GARABITO','Puntarenas'),('MONTEVERDE','Puntarenas'),('PUERTO JIMENEZ','Puntarenas'),
    ('LIMON','Limón'),('POCOCI','Limón'),('SIQUIRRES','Limón'),('TALAMANCA','Limón'),('MATINA','Limón'),('GUACIMO','Limón')),
  provincias(c, p) as (values ('SAN JOSE','San José'),('ALAJUELA','Alajuela'),('CARTAGO','Cartago'),('HEREDIA','Heredia'),
    ('GUANACASTE','Guanacaste'),('PUNTARENAS','Puntarenas'),('LIMON','Limón')),
  trozos as (
    select btrim(x) as t from regexp_split_to_table(public.pareo_clave(p_lugar), '[,;.()/]| - ') as x where btrim(x) <> ''
  ),
  por_trozo as (
    select p from cantones where c in (select t from trozos)
    union select p from provincias where c in (select t from trozos)
  ),
  en_el_texto as (
    select p from provincias where (' ' || regexp_replace(public.pareo_clave(p_lugar), '[^A-Z0-9 ]', ' ', 'g') || ' ') like '% ' || c || ' %'
  ),
  cual as (
    select coalesce(
      (select min(p) from por_trozo having count(distinct p) = 1),
      (select min(p) from en_el_texto having count(distinct p) = 1),
      '') as p
  )
  select p from cual;
$$;
grant execute on function public.pareo_provincia(text) to anon, authenticated;

-- ---- la lista, con la provincia ----
-- La misma de 20261023152708 (y la misma firma): cada fila trae además su
-- provincia, y p_lugar filtra también por provincia (el filtro «Lugar» de la
-- portada ofrece las siete provincias además de los lugares escritos).
create or replace function public.pareo_lista(
  p_parte text,
  p_desde integer default 0,
  p_cuantos integer default 50,
  p_buscar text default '',
  p_ritmo text default '',
  p_lugar text default '',
  p_elo text default '',
  p_abierta boolean default false,
  p_curso boolean default false,
  p_verificado boolean default false)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with hoy as (select (now() at time zone 'America/Costa_Rica')::date as d),
  base as (
    select p.id, p.nombre, p.evento, p.lugar, p.fecha, p.rondas, p.rondas_total, p.jugadores, p.actualizado, p.organizador_id,
           p.datos->>'ritmo' as ritmo, p.datos->>'fechaFin' as fin, p.datos->>'federacion' as fed,
           p.datos->>'sistema' as sistema, p.datos->>'tipo' as tipo, p.datos->'inscripcion' as inscripcion,
           p.datos->>'validoElo' as elo, nullif(p.datos->>'ritmoTipo', '') as ritmo_tipo,
           coalesce(nullif(p.datos->>'provincia', ''), public.pareo_provincia(p.lugar)) as provincia,
           (coalesce(p.jugadores, 0) = 0 or p.fecha > (select d from hoy)) as proximo
      from public.pareo_publicados p
  ),
  marcados as (
    select b.*,
           (not b.proximo and coalesce(b.rondas_total, 0) > 0 and coalesce(b.rondas, 0) < b.rondas_total
             and coalesce(nullif(b.fin, ''), b.fecha::text, '') >= ((select d from hoy) - 1)::text) as en_curso,
           (coalesce((b.inscripcion->>'abierta')::boolean, false)
             and (coalesce(b.inscripcion->>'hasta', '') = '' or b.inscripcion->>'hasta' >= (select d from hoy)::text)) as inscribe,
           case when coalesce(b.evento, '') <> '' then b.evento || '|' || coalesce(b.fecha::text, '') else b.id::text end as grupo
      from base b
  ),
  cuales as (
    select m.* from marcados m
     where m.proximo = (p_parte = 'proximos')
       and (public.pareo_clave(p_buscar) = ''
            or position(public.pareo_clave(p_buscar) in public.pareo_clave(concat_ws(' ', m.nombre, m.evento, m.lugar))) > 0)
       and (coalesce(p_ritmo, '') = '' or m.ritmo_tipo = p_ritmo)
       and (coalesce(p_lugar, '') = '' or m.lugar = p_lugar or m.provincia = p_lugar)
       and (coalesce(p_elo, '') = ''
            or (p_elo = 'sin' and coalesce(m.elo, '') not in ('fide', 'nacional'))
            or m.elo = p_elo)
       and (not coalesce(p_abierta, false) or m.inscribe)
       and (not coalesce(p_curso, false) or m.en_curso)
       and (not coalesce(p_verificado, false)
            or exists (select 1 from public.pareo_organizadores o where o.id = m.organizador_id and o.verificado))
  ),
  grupos as (
    select c.grupo, min(c.fecha) as fecha from cuales c group by c.grupo
  ),
  pagina as (
    select g.grupo from grupos g
     order by case when p_parte = 'proximos' then g.fecha end asc nulls last,
              case when p_parte <> 'proximos' then g.fecha end desc nulls last,
              g.grupo collate "C"
     offset greatest(coalesce(p_desde, 0), 0)
     limit least(greatest(coalesce(p_cuantos, 50), 1), 100)
  )
  select jsonb_build_object(
    'filas', coalesce((select jsonb_agg(to_jsonb(c) - 'proximo' - 'grupo' - 'inscribe' order by c.fecha, c.nombre)
                         from cuales c where c.grupo in (select grupo from pagina)), '[]'::jsonb),
    'grupos', (select count(*) from grupos),
    'torneos', (select count(*) from cuales));
$$;

-- Y el resumen de la portada: además, cuántos torneos próximos hay en cada
-- provincia (para «Por provincia»).
create or replace function public.pareo_lista_resumen()
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with hoy as (select (now() at time zone 'America/Costa_Rica')::date as d),
  proximos as (
    select coalesce(nullif(p.datos->>'provincia', ''), public.pareo_provincia(p.lugar)) as provincia
      from public.pareo_publicados p
     where coalesce(p.jugadores, 0) = 0 or p.fecha > (select d from hoy)
  )
  select jsonb_build_object(
    'total', (select count(*) from public.pareo_publicados),
    'lugares', coalesce((select jsonb_agg(l order by l) from (select distinct lugar as l from public.pareo_publicados where coalesce(lugar, '') <> '') x), '[]'::jsonb),
    'provincias', coalesce((select jsonb_object_agg(provincia, n) from (select provincia, count(*) as n from proximos where provincia <> '' group by provincia) y), '{}'::jsonb));
$$;

-- ---- dos nombres del mismo torneo ----
-- Las palabras que cuentan de un nombre (sin «torneo», «de», «ajedrez»…).
create or replace function public.pareo_palabras(p text)
returns text[]
language sql immutable parallel safe set search_path = '' as $$
  select coalesce(array_agg(distinct w), '{}') from regexp_split_to_table(public.pareo_clave(p), '[^A-Z0-9]+') as w
   where char_length(w) >= 3 and w not in ('TORNEO', 'DEL', 'LOS', 'LAS', 'PARA', 'CON', 'UNA', 'AJEDREZ', 'CHESS');
$$;
-- Parecidos: comparten al menos dos palabras y, o una lista cabe en la otra,
-- o comparten al menos la mitad de todas. El mismo día y el mismo ritmo los
-- pide torneos_externos_lista(): solos, dos nombres parecidos no bastan.
create or replace function public.pareo_parecidos(a text, b text)
returns boolean
language sql immutable parallel safe set search_path = '' as $$
  with x as (select public.pareo_palabras(a) as pa, public.pareo_palabras(b) as pb),
  y as (select pa, pb,
               (select count(*) from (select unnest(pa) intersect select unnest(pb)) i) as comunes,
               (select count(*) from (select unnest(pa) union select unnest(pb)) u) as todas
          from x)
  select comunes >= 2 and (pa <@ pb or pb <@ pa or comunes::numeric / greatest(todas, 1) >= 0.5) from y;
$$;
grant execute on function public.pareo_palabras(text) to anon, authenticated;
grant execute on function public.pareo_parecidos(text, text) to anon, authenticated;

-- Los torneos de ajedrezcostarica.com, cada uno con el torneo de Pareo
-- Integral que es el mismo (mismo día y nombre parecido), si lo hay: la
-- portada y el calendario no lo muestran dos veces.
create or replace function public.torneos_externos_lista()
returns table (id_externo integer, titulo text, inicio timestamptz, fin timestamptz, provincia text, lugar text, ritmo text,
               minutos smallint, incremento smallint, elo text, precio numeric, moneda text, modalidad text, formato text,
               organizador text, inscripcion_abierta boolean, url text, repetido_de uuid)
language sql stable security invoker set search_path = '' as $$
  select e.id_externo, e.titulo, e.inicio, e.fin, e.provincia, e.lugar, e.ritmo, e.minutos, e.incremento, e.elo, e.precio, e.moneda,
         e.modalidad, e.formato, e.organizador, e.inscripcion_abierta, e.url,
         (select p.id from public.pareo_publicados p
           where e.inicio is not null and p.fecha = (e.inicio at time zone 'America/Costa_Rica')::date
             and (e.ritmo = '' or coalesce(p.datos->>'ritmoTipo', '') = '' or e.ritmo = p.datos->>'ritmoTipo')
             and (public.pareo_parecidos(p.nombre, e.titulo) or public.pareo_parecidos(p.evento, e.titulo)
                  or public.pareo_parecidos(concat_ws(' ', p.evento, p.nombre), e.titulo))
           order by p.actualizado desc limit 1) as repetido_de
    from public.torneos_externos e
   order by e.inicio nulls last
   limit 200;
$$;
revoke all on function public.torneos_externos_lista() from public;
grant execute on function public.torneos_externos_lista() to anon, authenticated;

-- ---- los torneos de un jugador ----
-- Donde aparece con la misma huella o con el mismo nombre (sin tildes ni
-- mayúsculas): la página decide, con las huellas, si son la misma persona.
create or replace function public.pareo_torneos_de(p_nombre text, p_ident text default '')
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.fecha desc nulls last, x.actualizado desc), '[]'::jsonb) from (
    select p.id, p.nombre, p.evento, p.lugar, p.fecha, p.rondas, p.rondas_total, p.jugadores, p.actualizado, p.organizador_id, p.datos
      from public.pareo_publicados p
     where exists (select 1 from jsonb_array_elements(p.datos->'jugadores') j
                    where (coalesce(p_ident, '') <> '' and j->>'ident' = p_ident)
                       or (public.pareo_clave(p_nombre) <> '' and public.pareo_clave(j->>'nombre') = public.pareo_clave(p_nombre)))
     order by p.fecha desc nulls last, p.actualizado desc
     limit 100) x;
$$;
revoke all on function public.pareo_torneos_de(text, text) from public;
grant execute on function public.pareo_torneos_de(text, text) to anon, authenticated;

-- ---- cada jugador en cada torneo individual, con su resumen ----
-- La «persona»: su huella; si no tiene, la única huella que lleva ese nombre
-- en algún torneo; si son dos personas distintas con el mismo nombre, o no
-- hay huella, el nombre ('n:…').
create or replace function public.pareo_resultados()
returns table (torneo uuid, fecha date, torneo_nombre text, evento text, jugador text, nombre text, ident text, clave text,
               institucion text, categoria text, puesto integer, de integer, puntos numeric, rondas integer,
               g integer, e integer, p integer, pe integer, rp integer, cambio numeric, persona text)
language sql stable security invoker set search_path = '' as $$
  with base as (
    select t.id as torneo, t.fecha, t.nombre as torneo_nombre, t.evento, j->>'id' as jugador, j->>'nombre' as nombre,
           nullif(j->>'ident', '') as ident, public.pareo_clave(j->>'nombre') as clave,
           coalesce(j->>'institucion', '') as institucion, coalesce(j->>'categoria', '') as categoria,
           (r->>'puesto')::integer as puesto, jsonb_array_length(t.datos->'resumen') as de,
           (r->>'puntos')::numeric as puntos, (r->>'rondas')::integer as rondas,
           (r->>'g')::integer as g, (r->>'e')::integer as e, (r->>'p')::integer as p, coalesce((r->>'pe')::integer, 0) as pe,
           (r->>'rp')::integer as rp, (r->>'cambio')::numeric as cambio
      from public.pareo_publicados t
      cross join lateral jsonb_array_elements(coalesce(t.datos->'jugadores', '[]'::jsonb)) j
      join lateral jsonb_array_elements(coalesce(t.datos->'resumen', '[]'::jsonb)) r on r->>'id' = j->>'id'
     where coalesce(t.datos->>'tipo', '') <> 'equipos'
  ),
  unica as (
    select b.clave, min(b.ident) as ident from base b where b.ident is not null group by b.clave having count(distinct b.ident) = 1
  )
  select b.*, coalesce('i:' || b.ident, 'i:' || u.ident, 'n:' || b.clave) as persona
    from base b left join unica u on u.clave = b.clave;
$$;
revoke all on function public.pareo_resultados() from public;
grant execute on function public.pareo_resultados() to anon, authenticated;

-- ---- el ranking del año ----
--   p_anio: el año (0 = todos); p_orden: 'torneos' | 'rendimiento' | 'elo' | 'podios'
--   p_categoria, p_institucion: escritas como en los torneos (sin tildes ni mayúsculas).
-- El rendimiento es el promedio de los de cada torneo, pesado por las
-- partidas contra rivales con Elo, y solo con 9 de esas partidas o más.
create or replace function public.pareo_ranking(p_anio integer default 0, p_orden text default 'torneos',
                                                p_categoria text default '', p_institucion text default '')
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with todo as (select * from public.pareo_resultados()),
  del_anio as (
    select * from todo where coalesce(p_anio, 0) = 0 or extract(year from fecha) = p_anio
  ),
  cuales as (
    select * from del_anio
     where (public.pareo_clave(p_categoria) = '' or public.pareo_clave(categoria) = public.pareo_clave(p_categoria))
       and (public.pareo_clave(p_institucion) = '' or public.pareo_clave(institucion) = public.pareo_clave(p_institucion))
  ),
  por_persona as (
    select persona,
           (array_agg(nombre order by fecha desc nulls last))[1] as nombre,
           (array_agg(ident order by fecha desc nulls last) filter (where ident is not null))[1] as ident,
           (array_agg(institucion order by fecha desc nulls last))[1] as institucion,
           (array_agg(categoria order by fecha desc nulls last))[1] as categoria,
           count(distinct torneo) as torneos, sum(g + e + p) as partidas, sum(puntos) as puntos,
           sum(g) as g, sum(e) as e, sum(p) as p, count(*) filter (where puesto <= 3) as podios,
           sum(pe) filter (where rp is not null) as pe,
           round(sum(rp * pe) filter (where rp is not null) / nullif(sum(pe) filter (where rp is not null), 0)) as rp,
           round(sum(cambio) filter (where cambio is not null), 1) as cambio
      from cuales group by persona
  ),
  ordenados as (
    select * from por_persona
     where case p_orden when 'rendimiento' then coalesce(pe, 0) >= 9 and rp is not null
                        when 'elo' then cambio is not null
                        else true end
     order by case p_orden when 'rendimiento' then rp when 'elo' then cambio when 'podios' then podios else torneos end desc nulls last,
              torneos desc, puntos desc, nombre
     limit 100
  )
  select jsonb_build_object(
    'filas', coalesce((select jsonb_agg(to_jsonb(o)) from ordenados o), '[]'::jsonb),
    'anios', coalesce((select jsonb_agg(a order by a desc) from (select distinct extract(year from fecha)::integer as a from todo where fecha is not null) x), '[]'::jsonb),
    'categorias', coalesce((select jsonb_agg(c order by c) from (select distinct categoria as c from del_anio where categoria <> '' limit 60) y), '[]'::jsonb));
$$;
revoke all on function public.pareo_ranking(integer, text, text, text) from public;
grant execute on function public.pareo_ranking(integer, text, text, text) to anon, authenticated;

-- ---- la ficha de un colegio o club ----
create or replace function public.pareo_institucion(p_nombre text)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with suyos as (
    select * from public.pareo_resultados()
     where public.pareo_clave(p_nombre) <> '' and public.pareo_clave(institucion) = public.pareo_clave(p_nombre)
  )
  select case when not exists (select 1 from suyos) then null else jsonb_build_object(
    'nombre', (select institucion from suyos group by institucion order by count(*) desc, institucion limit 1),
    'jugadores', coalesce((select jsonb_agg(to_jsonb(x) order by x.torneos desc, x.podios desc, x.nombre) from (
        select persona, (array_agg(nombre order by fecha desc nulls last))[1] as nombre,
               (array_agg(ident order by fecha desc nulls last) filter (where ident is not null))[1] as ident,
               count(distinct torneo) as torneos, count(*) filter (where puesto <= 3) as podios, min(puesto) as mejor,
               sum(puntos) as puntos
          from suyos group by persona limit 300) x), '[]'::jsonb),
    'torneos', coalesce((select jsonb_agg(to_jsonb(x) order by x.fecha desc nulls last) from (
        select torneo as id, min(torneo_nombre) as nombre, min(evento) as evento, min(fecha) as fecha, count(*) as cuantos,
               min(puesto) as mejor, min(de) as de
          from suyos group by torneo order by min(fecha) desc nulls last limit 200) x), '[]'::jsonb),
    'podios', coalesce((select jsonb_agg(to_jsonb(x) order by x.fecha desc nulls last, x.puesto) from (
        select torneo as id, torneo_nombre as torneo, fecha, nombre, persona, puesto
          from suyos where puesto <= 3 order by fecha desc nulls last limit 100) x), '[]'::jsonb),
    'anios', coalesce((select jsonb_agg(to_jsonb(x) order by x.anio desc) from (
        select extract(year from fecha)::integer as anio, count(distinct torneo) as torneos, count(distinct persona) as jugadores,
               count(*) filter (where puesto <= 3) as podios
          from suyos where fecha is not null group by 1) x), '[]'::jsonb)
  ) end;
$$;
revoke all on function public.pareo_institucion(text) from public;
grant execute on function public.pareo_institucion(text) to anon, authenticated;

-- ---- seguir a un jugador por correo ----
create table public.pareo_suscripciones (
  id uuid primary key default gen_random_uuid(),
  correo text not null check (char_length(correo) between 5 and 200 and correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  nombre text not null check (char_length(nombre) between 2 and 100),
  clave text not null,
  ident text not null default '' check (ident ~ '^([0-9a-f]{24})?$'),
  confirmada boolean not null default false,
  token_hash text,
  token_vence timestamptz,
  consentimiento timestamptz not null default now(),
  creado timestamptz not null default now()
);
comment on table public.pareo_suscripciones is
  'Quien sigue a un jugador de Torneos en Pareo Integral por correo. Solo la lee y la escribe la Edge Function pareo-publicar (service role); no se manda nada hasta confirmar.';
create unique index pareo_suscripciones_una on public.pareo_suscripciones (correo, clave, ident);
create index pareo_suscripciones_clave_idx on public.pareo_suscripciones (clave) where confirmada;
create index pareo_suscripciones_ident_idx on public.pareo_suscripciones (ident) where confirmada and ident <> '';
alter table public.pareo_suscripciones enable row level security;
revoke all on public.pareo_suscripciones from anon, authenticated;

create table public.pareo_avisos_enviados (
  suscripcion_id uuid not null references public.pareo_suscripciones (id) on delete cascade,
  torneo_id uuid not null references public.pareo_publicados (id) on delete cascade,
  que text not null check (que ~ '^(r[0-9]{1,2}|fin)$'),
  cuando timestamptz not null default now(),
  primary key (suscripcion_id, torneo_id, que)
);
comment on table public.pareo_avisos_enviados is
  'Cada aviso que ya salió (suscripción, torneo, ronda o fin): su clave única hace que ninguno salga dos veces.';
create index pareo_avisos_enviados_torneo_idx on public.pareo_avisos_enviados (torneo_id);
alter table public.pareo_avisos_enviados enable row level security;
revoke all on public.pareo_avisos_enviados from anon, authenticated;

-- Pedir los avisos: guarda (o renueva) la suscripción sin confirmar y
-- devuelve su id para el enlace; null si ya estaba confirmada (no hace falta
-- otro correo) o si ese correo ya sigue a 20 jugadores. Se lleva de paso las
-- que nunca se confirmaron.
create or replace function public.pareo_suscribir(p_correo text, p_nombre text, p_ident text, p_token_hash text, p_vence timestamptz)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_correo text := lower(btrim(coalesce(p_correo, '')));
  v_clave text := public.pareo_clave(p_nombre);
  v_ident text := coalesce(p_ident, '');
  v_id uuid;
  v_confirmada boolean;
begin
  delete from public.pareo_suscripciones where not confirmada and token_vence < now() - interval '7 days';
  select id, confirmada into v_id, v_confirmada from public.pareo_suscripciones
   where correo = v_correo and clave = v_clave and ident = v_ident;
  if v_confirmada then return null; end if;
  if v_id is null and (select count(*) from public.pareo_suscripciones where correo = v_correo) >= 20 then return null; end if;
  insert into public.pareo_suscripciones (correo, nombre, clave, ident, token_hash, token_vence, consentimiento)
  values (v_correo, btrim(p_nombre), v_clave, v_ident, p_token_hash, p_vence, now())
  on conflict (correo, clave, ident) do update set token_hash = excluded.token_hash, token_vence = excluded.token_vence, consentimiento = now()
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.pareo_suscribir(text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.pareo_suscribir(text, text, text, text, timestamptz) to service_role;

-- Quién sigue a alguien de este torneo (confirmado): por la huella si la
-- suscripción la tiene, si no por el nombre.
create or replace function public.pareo_suscriptores_de(p_torneo uuid)
returns table (suscripcion uuid, correo text, jugador text, nombre text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.correo, j->>'id', j->>'nombre'
    from public.pareo_publicados p
    cross join lateral jsonb_array_elements(coalesce(p.datos->'jugadores', '[]'::jsonb)) j
    join public.pareo_suscripciones s on s.confirmada
         and ((s.ident <> '' and j->>'ident' = s.ident) or (s.ident = '' and public.pareo_clave(j->>'nombre') = s.clave))
   where p.id = p_torneo and not p.oculto;
$$;
revoke all on function public.pareo_suscriptores_de(uuid) from public, anon, authenticated;
grant execute on function public.pareo_suscriptores_de(uuid) to service_role;

-- El freno de los correos (20261023172618), con un ámbito más: 'seguir'.
create or replace function public.pareo_correo_frenar(p_ip text, p_ambito text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_ip text := nullif(btrim(coalesce(p_ip, '')), '');
  v_ambito text := coalesce(p_ambito, '');
begin
  if v_ambito not in ('confirmar', 'recuperar', 'sello', 'seguir') then
    return 'Envío desconocido.';
  end if;
  perform pg_advisory_xact_lock(hashtext('envios_publicos:pareo-correo'));
  if v_ip is not null and (select count(*) from interno.envios_publicos
        where tipo = 'pareo' and ambito = v_ambito and ip = v_ip
          and creado > now() - interval '1 hour') >= 5 then
    return 'Ya se mandaron varios correos seguidos desde tu conexión. Espera un rato e intenta de nuevo.';
  end if;
  if (select count(*) from interno.envios_publicos
        where tipo = 'pareo' and ambito = v_ambito
          and creado > now() - interval '1 hour') >= 100 then
    return 'Están saliendo demasiados correos en este momento. Intenta de nuevo en una hora.';
  end if;
  insert into interno.envios_publicos (tipo, ambito, ip, correo) values ('pareo', v_ambito, v_ip, null);
  return null;
end;
$$;
revoke all on function public.pareo_correo_frenar(text, text) from public, anon, authenticated;
