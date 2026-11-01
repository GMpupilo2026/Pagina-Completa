-- Centroamericano 2026: la última lectura de chess-results de cada torneo, compartida.
--
-- Con 15 a 20 árbitros, cada tablet le preguntaba a chess-results por su cuenta (entrar, elegir el
-- torneo, recargar: unas 4 visitas por lectura). Esta tabla guarda lo último que se leyó de cada
-- torneo para que las lecturas de «ver mis mesas», anotar presencia o un tiempo, y subir una foto
-- usen esa copia mientras sea reciente, y para que, si chess-results se cae o tarda, el árbitro
-- siga trabajando con lo último que se leyó (la pantalla le dice de cuándo es).
--
--   - Una fila por torneo. `leyendo_hasta` es el «turno» de quien está leyendo: solo uno por
--     torneo a la vez, los demás esperan su resultado en vez de hacer sus propias visitas.
--   - Guardar un resultado y finalizar la ronda NO usan esta copia: leen chess-results en fresco
--     (al guardar, la copia se pone al día con lo que se leyó de vuelta).
--   - Solo la lee y la escribe la Edge Function con la clave de servicio: ni anon ni authenticated.
--   - No va en la copia de seguridad: se vuelve a llenar sola en la primera lectura.

create table public.centroamericano_lecturas (
  tnr text primary key references public.centroamericano_torneos(tnr),
  ronda integer not null default 0 check (ronda between 0 and 99),
  torneo text not null default '' check (length(torneo) <= 200),
  mesas jsonb not null default '[]'::jsonb,
  leida timestamptz not null default 'epoch',
  leyendo_hasta timestamptz
);
comment on table public.centroamericano_lecturas is
  'La última lectura de la ronda abierta de cada torneo (mesas con sus jugadores y resultados), compartida entre los árbitros para no multiplicar las visitas a chess-results. La escribe solo centroamericano-mesa / centroamericano-clave.';
alter table public.centroamericano_lecturas enable row level security;
revoke all on public.centroamericano_lecturas from public, anon, authenticated;
