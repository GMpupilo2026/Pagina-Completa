-- El Blitz del Centroamericano en la página pública, directo de LiveChess y SIN atraso (lo decidió el dueño el 7/11).
--
-- Hasta hoy, los enlaces de LiveChess (centroamericano_livechess) no se publicaban: no tienen atraso y la transmisión
-- pública de Lichess va con 15 minutos por juego limpio. El 7/11 el dueño pidió que la página del torneo
-- (centroamericano-2026.html, «Partidas en vivo») muestre el Blitz desde LiveChess en vez de Lichess, «que se siga
-- viendo igual», y eligió SIN atraso, sabiendo el riesgo (alguien afuera podría pasarle jugadas del motor a un
-- jugador). El clásico sigue con Lichess y su atraso.
--
-- Por eso la publicación es por torneo y explícita: la columna `publico` (por omisión, false), que solo se cambia con
-- SQL. La organización vuelve a guardar sus enlaces desde centroamericano-mesas.html sin tocarla (el upsert de
-- centroamericano-mesas-vivo no la nombra). centroamericano_livechess_publico() da, a cualquiera, el id de LiveChess
-- y los tableros SOLO de los torneos marcados (ni de prueba ni archivados); el navegador de quien mira le pide las
-- partidas directo a LiveChess (js/livechess-transmision.js). Ver «El Blitz, directo de LiveChess y sin atraso» en
-- docs/decisiones/juegos-y-torneos.md. Sin ningún `drop`.
alter table public.centroamericano_livechess add column publico boolean not null default false;

comment on column public.centroamericano_livechess.publico is
  'true: el enlace sale en la página pública del torneo, SIN atraso (centroamericano_livechess_publico). Solo con SQL.';

create or replace function public.centroamericano_livechess_publico()
returns table (tnr text, nombre text, categoria text, rama text, ritmo text, torneo_id uuid, tableros text)
language sql stable security definer set search_path = ''
as $$
  select t.tnr, t.nombre, t.categoria, t.rama, t.ritmo, l.torneo_id, l.tableros
  from public.centroamericano_livechess l
  join public.centroamericano_torneos t on t.tnr = l.tnr
  where l.publico and not t.prueba and not t.archivado
  order by t.orden;
$$;
revoke execute on function public.centroamericano_livechess_publico() from public;
grant execute on function public.centroamericano_livechess_publico() to anon, authenticated;

-- Los seis del Blitz (U08 a U18), los que pidió el dueño.
update public.centroamericano_livechess l set publico = true
from public.centroamericano_torneos t
where t.tnr = l.tnr and t.ritmo = 'blitz' and not t.prueba;
