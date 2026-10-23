-- «Torneos en Pareo Integral»: la lista pública de 50 en 50, con la búsqueda
-- y los filtros hechos en la base. Lo pidió el dueño del sitio (la 8 de una
-- lista de propuestas): antes la página se bajaba la tabla entera (de mil en
-- mil) y filtraba en el navegador, y con un año de torneos publicados eso son
-- miles de filas en cada visita.
--
-- public.pareo_lista devuelve una página de GRUPOS, no de filas: los torneos
-- de un mismo evento y un mismo día van juntos en una fila que se despliega,
-- y una página que cortara un evento por la mitad lo mostraría partido. Cada
-- parte (los próximos, del más cercano; los jugados, del más reciente) se
-- pide por separado y con su «Ver más».
--
-- SECURITY INVOKER: la lee anon con la RLS de siempre (lo oculto no sale), y
-- el sello «Verificado» se mira en pareo_organizadores con su propia RLS.
-- El ritmo (clásico, rápido, relámpago) lo deduce el navegador al publicar
-- (js/ritmo-control.js, la única copia de esa cuenta) y viaja en
-- datos->ritmoTipo, que la Edge Function vuelve a limpiar.
--
-- Ver «Torneos en Pareo Integral: la lista de 50 en 50» en
-- docs/decisiones/juegos-y-torneos.md.

-- Lo que compara la búsqueda: sin tildes, en mayúsculas y con un espacio
-- entre palabras, como clave() en js/torneos-pareo-pagina.js.
create or replace function public.pareo_clave(p text)
returns text
language sql immutable parallel safe set search_path = '' as $$
  select btrim(regexp_replace(upper(translate(coalesce(p, ''),
    'áéíóúüñàèìòùâêîôûäëïöçÁÉÍÓÚÜÑÀÈÌÒÙÂÊÎÔÛÄËÏÖÇ',
    'aeiouunaeiouaeiouaeiocAEIOUUNAEIOUAEIOUAEIOC')), '\s+', ' ', 'g'));
$$;
grant execute on function public.pareo_clave(text) to anon, authenticated;

--   p_parte: 'proximos' | 'resultados'
--   p_desde / p_cuantos: qué grupos (de 1 a 100 por página)
--   p_ritmo: 'clasico' | 'rapido' | 'blitz'; p_elo: 'fide' | 'nacional' |
--   'no' | 'sin' (los que no dan Elo y los que no lo dijeron)
-- Devuelve { filas: [...], grupos: N, torneos: N }: los totales son de lo
-- que coincide, para el «Ver más» y para «12 de 340 torneos».
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
       and (coalesce(p_lugar, '') = '' or m.lugar = p_lugar)
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
revoke all on function public.pareo_lista(text, integer, integer, text, text, text, text, boolean, boolean, boolean) from public;
grant execute on function public.pareo_lista(text, integer, integer, text, text, text, text, boolean, boolean, boolean) to anon, authenticated;

-- Lo que la portada necesita entero, aunque la lista venga por páginas:
-- cuántos torneos hay publicados y los lugares, para el filtro.
create or replace function public.pareo_lista_resumen()
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'total', (select count(*) from public.pareo_publicados),
    'lugares', coalesce((select jsonb_agg(l order by l) from (select distinct lugar as l from public.pareo_publicados where coalesce(lugar, '') <> '') x), '[]'::jsonb));
$$;
revoke all on function public.pareo_lista_resumen() from public;
grant execute on function public.pareo_lista_resumen() to anon, authenticated;

create index pareo_publicados_fecha_idx on public.pareo_publicados (fecha desc);
