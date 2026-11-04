-- Los tableros electrónicos del Centroamericano por LiveChess Cloud, SIN atraso, para los árbitros.
--
-- La organización de los tableros DGT pasó un enlace del visor de LiveChess Cloud por categoría
-- (view.livechesscloud.com/#<id>): ahí cada partida sale en vivo, con el reloj después de cada jugada. La
-- transmisión pública de Lichess va con 15 min de atraso por juego limpio; este enlace NO tiene atraso, así que no
-- se publica: queda en esta tabla, sin políticas ni permisos para anon y authenticated, y solo la lee la Edge
-- Function centroamericano-mesas-vivo con la clave de servicio, que a cada tablet le da SOLO sus mesas. La
-- organización la llena desde centroamericano-mesas.html (pegando la tabla de la organización de tableros), por la
-- misma función, que pide la herramienta «mesa-arbitro».
--
-- Una fila por torneo de chess-results (tnr): el id del torneo en LiveChess y los tableros que transmite («1-5»).
-- Ver «Los tableros por LiveChess, sin atraso» en docs/decisiones/juegos-y-torneos.md. Sin ningún `drop`.
create table public.centroamericano_livechess (
  tnr text primary key references public.centroamericano_torneos (tnr) on delete cascade,
  torneo_id uuid not null,
  tableros text not null default '' check (tableros ~ '^[0-9 ,-]{0,40}$'),
  actualizado timestamptz not null default now(),
  por text not null default '' check (length(por) <= 120)
);
alter table public.centroamericano_livechess enable row level security;
revoke all on public.centroamericano_livechess from public, anon, authenticated;
