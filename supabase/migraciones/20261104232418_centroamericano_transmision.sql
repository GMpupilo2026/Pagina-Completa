-- Centroamericano 2026: el encargado de TRANSMISIÓN, con su propio QR, ve todos los tableros electrónicos en vivo
-- y recibe un aviso muy visible cuando un tablero tiene un problema (se desconectó, el reloj se detuvo, se apagó o
-- quedó mal configurado, una jugada que el tablero no registró, las tablas por repetición o por las 50/75 jugadas,
-- un mate sin resultado, los jugadores que no son los de chess-results…). Lo pidió el dueño el 4/11/2026.
-- Ver «El encargado de transmisión (Centroamericano)» en docs/decisiones/juegos-y-torneos.md.
--
-- 1. centroamericano_tx_enlaces: como los de Fair Play, el árbitro principal (herramienta «mesa-arbitro») crea uno
--    por encargado de transmisión. El encargado entra SIN CUENTA a centroamericano-transmision.html#<token>; la
--    Edge Function centroamericano-transmision valida el token. Reparte acceso: lleva auditoría.
--
-- 2. centroamericano_tx_tableros: «en este tablero electrónico se juega, en realidad, la mesa N de chess-results».
--    Si la organización cambia a alguien de tablero (o la computadora de LiveChess quedó con el pareo viejo), el
--    encargado lo corrige eligiendo la mesa de los emparejamientos ya leídos de chess-results: los nombres salen de
--    ahí, no se escriben a mano. Queda listo para que la tablet del árbitro de ESA mesa siga recibiendo la partida
--    en vivo (falta que centroamericano-mesas-vivo la lea). Un índice único impide que una mesa quede en dos tableros. Sin políticas
--    ni permisos para anon y authenticated: la escribe y la lee solo la Edge Function, con la clave de servicio.
--
-- 3. centroamericano_tx_atendidas: «Ya lo revisé» de cada aviso (una clave por tablero, ronda, tipo y jugada),
--    compartido entre el principal y los encargados, con quién y cuándo. Misma regla: solo la Edge Function.
--
-- Sin ningún `drop`.

-- ---------------------------------------------------------------- 1. los enlaces de los encargados
create table public.centroamericano_tx_enlaces (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  nombre text not null check (length(btrim(nombre)) between 1 and 80),
  vence timestamptz not null,
  revocada boolean not null default false,
  creada_por uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  creada timestamptz not null default now(),
  ultimo_uso timestamptz
);
comment on table public.centroamericano_tx_enlaces is
  'El enlace (QR) de un encargado de transmisión del Centroamericano: su token al azar, su nombre, cuándo vence y si se apagó. Sin cuenta: el token lo valida la Edge Function centroamericano-transmision. Lo crea y lo apaga el árbitro principal (herramienta mesa-arbitro).';
alter table public.centroamericano_tx_enlaces enable row level security;
revoke all on public.centroamericano_tx_enlaces from public, anon, authenticated;
grant select on public.centroamericano_tx_enlaces to authenticated;
grant insert (nombre, vence) on public.centroamericano_tx_enlaces to authenticated;
grant update (nombre, vence, revocada) on public.centroamericano_tx_enlaces to authenticated;
create policy centroamericano_tx_enlaces_ver on public.centroamericano_tx_enlaces
  for select to authenticated using ((select public.tengo_herramienta('mesa-arbitro')));
create policy centroamericano_tx_enlaces_crear on public.centroamericano_tx_enlaces
  for insert to authenticated with check (creada_por = (select auth.uid()) and (select public.tengo_herramienta('mesa-arbitro')));
create policy centroamericano_tx_enlaces_cambiar on public.centroamericano_tx_enlaces
  for update to authenticated using ((select public.tengo_herramienta('mesa-arbitro'))) with check ((select public.tengo_herramienta('mesa-arbitro')));
create index centroamericano_tx_enlaces_creada_por_idx on public.centroamericano_tx_enlaces (creada_por);
create trigger auditar after insert or update or delete on public.centroamericano_tx_enlaces
  for each row execute function interno.auditar('nombre', 'vence', 'revocada');

-- ---------------------------------------------------------------- 2. qué mesa se juega en cada tablero
create table public.centroamericano_tx_tableros (
  tnr text not null references public.centroamericano_torneos (tnr) on delete cascade,
  ronda integer not null check (ronda between 1 and 99),
  tablero integer not null check (tablero between 1 and 200),
  mesa integer not null check (mesa between 1 and 9999),
  blancas text not null default '' check (length(blancas) <= 120),
  negras text not null default '' check (length(negras) <= 120),
  por text not null default '' check (length(por) <= 120),
  actualizado timestamptz not null default now(),
  primary key (tnr, ronda, tablero)
);
comment on table public.centroamericano_tx_tableros is
  'En el tablero electrónico N de LiveChess se juega, en esa ronda, la mesa M de chess-results (cuando alguien se cambió de tablero). Los nombres son los de los emparejamientos leídos de chess-results. La escribe y la lee solo la Edge Function centroamericano-transmision.';
create unique index centroamericano_tx_tableros_mesa_unica on public.centroamericano_tx_tableros (tnr, ronda, mesa);
alter table public.centroamericano_tx_tableros enable row level security;
revoke all on public.centroamericano_tx_tableros from public, anon, authenticated;

-- ---------------------------------------------------------------- 3. los avisos ya revisados
create table public.centroamericano_tx_atendidas (
  clave text primary key check (length(clave) between 3 and 200),
  quien text not null default '' check (length(quien) <= 120),
  nota text not null default '' check (length(nota) <= 300),
  en timestamptz not null default now()
);
comment on table public.centroamericano_tx_atendidas is
  '«Ya lo revisé» de un aviso de la transmisión (tnr|ronda|tablero|tipo|jugada), con quién y cuándo. Solo la Edge Function centroamericano-transmision.';
alter table public.centroamericano_tx_atendidas enable row level security;
revoke all on public.centroamericano_tx_atendidas from public, anon, authenticated;
