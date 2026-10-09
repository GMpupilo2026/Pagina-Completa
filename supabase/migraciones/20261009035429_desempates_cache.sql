-- La caché de la Edge Function desempates-chess-results («Desempates
-- explicados», herramientas-arbitraje.html): lo último que se leyó de cada
-- torneo de chess-results (su clasificación y las partidas ronda a ronda de
-- cada jugador). Mismo patrón que seleccion_cache (migración
-- 20261008193213_herramientas_arbitraje.sql): solo la usa la función, con la
-- clave de servicio, para no pedirle a chess-results una lectura por persona
-- mirando el mismo torneo.
--
-- El candado de la herramienta («desempates») ya lo pone tengo_herramienta(),
-- que no distingue por herramienta en la tabla: no hace falta tocar
-- licencias_herramientas para sumar esta.
--
-- Ver «Herramientas de arbitraje» en docs/decisiones/juegos-y-torneos.md.

create table public.desempates_cache (
  clave text primary key check (clave ~ '^(s\d{1,2}\.)?chess-results\.com/\d{1,9}$'),
  datos jsonb not null,
  leido_en timestamptz not null default now()
);
comment on table public.desempates_cache is
  'Lo que la Edge Function desempates-chess-results leyó de cada torneo de chess-results (servidor/tnr): la clasificación y las partidas ronda a ronda de cada jugador. Solo la usa la función (service role).';
alter table public.desempates_cache enable row level security;
revoke all on public.desempates_cache from public, anon, authenticated;
