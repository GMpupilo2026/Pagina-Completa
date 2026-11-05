-- Centroamericano 2026, el encargado de transmisión: el historial de los avisos y el aviso al árbitro de la mesa.
-- Lo pidió el dueño el 5/11 (mejoras 2 y 4). Ver «El encargado de transmisión (Centroamericano)» en
-- docs/decisiones/juegos-y-torneos.md.
--
-- Los avisos de los tableros los calcula la pantalla (chess.js), así que la base no sabía cuándo apareció cada uno:
-- solo cuándo alguien tocó «Ya lo revisé». centroamericano_tx_historial guarda la PRIMERA vez que una pantalla vio
-- cada aviso (la misma clave estable de centroamericano_tx_atendidas: tnr|ronda|tablero|tipo|jugada), con su texto,
-- y, si el encargado se lo mandó al árbitro de la mesa («Avisar al árbitro»), a quién y qué avisos
-- (centroamericano_avisos, los mismos de la organización: el árbitro los ve en su tablet con «Entendido»). De ahí
-- sale el informe de la ronda en PDF: qué pasó, a qué hora, a quién se avisó, si lo leyó, quién lo revisó y cuánto
-- tardó. Que un aviso se registre una sola vez lo asegura la clave primaria (`on conflict do nothing`).
--
-- Sin políticas ni permisos para anon y authenticated: la escribe y la lee solo la Edge Function
-- centroamericano-transmision, con la clave de servicio. Sin ningún `drop`.
create table public.centroamericano_tx_historial (
  clave text primary key check (length(clave) between 3 and 200),
  tnr text not null references public.centroamericano_torneos (tnr) on delete cascade,
  ronda integer not null check (ronda between 0 and 99),
  tablero integer not null check (tablero between 0 and 200),
  mesa integer check (mesa between 1 and 9999),
  tipo text not null check (tipo ~ '^[a-z_0-9]{2,40}$'),
  nivel text not null check (nivel in ('urgente', 'revisar')),
  titulo text not null default '' check (length(titulo) <= 120),
  texto text not null default '' check (length(texto) <= 800),
  visto timestamptz not null default now(),
  visto_por text not null default '' check (length(visto_por) <= 120),
  avisado_en timestamptz,
  avisado_por text not null default '' check (length(avisado_por) <= 120),
  avisado_a text not null default '' check (length(avisado_a) <= 300),
  avisos uuid[] not null default '{}'
);
comment on table public.centroamericano_tx_historial is
  'Cada aviso de la pantalla de transmisión del Centroamericano, la primera vez que se vio (y si se le avisó al árbitro de la mesa: a quién y con qué avisos de centroamericano_avisos). Para el informe de la ronda. Solo la Edge Function centroamericano-transmision.';
create index centroamericano_tx_historial_ronda_idx on public.centroamericano_tx_historial (tnr, ronda);
alter table public.centroamericano_tx_historial enable row level security;
revoke all on public.centroamericano_tx_historial from public, anon, authenticated;
