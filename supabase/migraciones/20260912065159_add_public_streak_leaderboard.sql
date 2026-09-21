-- Ranking público de "Demuestra tu nivel" (demuestra-tu-nivel.html): página SIN login,
-- cualquier visitante escribe un nombre y juega la misma racha de 10 segundos que
-- Racha táctica en Academia. Cada corrida terminada con al menos 1 acierto se guarda
-- como una fila (append-only, no hay cuenta real detrás del nombre) y el top 10 por
-- racha es lo que se muestra en el ranking. Los límites del check evitan que alguien
-- desde la consola del navegador mande un valor absurdo (no hay forma de verificar del
-- lado del servidor que la racha reportada es real sin rehacer todo el juego ahí, así
-- que esto es una traba razonable, no una garantía total — aceptable para un ranking
-- de entretenimiento, no para dinero real ni nada por el estilo).
create table public.public_streak_leaderboard (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(trim(display_name)) between 1 and 24),
  best_streak integer not null check (best_streak >= 1 and best_streak <= 2000),
  created_at timestamptz not null default now()
);

comment on table public.public_streak_leaderboard is 'Ranking público (sin login) de "Demuestra tu nivel" — cada fila es una corrida terminada, append-only.';

create index public_streak_leaderboard_best_streak_idx on public.public_streak_leaderboard (best_streak desc);

alter table public.public_streak_leaderboard enable row level security;

-- Público de verdad: lo puede leer cualquiera, con sesión o sin ella.
create policy public_streak_leaderboard_select_all on public.public_streak_leaderboard
  for select to anon, authenticated using (true);

-- Cualquiera (sin login) puede agregar su resultado — los checks de la tabla ya acotan
-- el nombre y la racha. Sin política de UPDATE/DELETE para anon: las filas no se pueden
-- alterar ni borrar una vez guardadas.
create policy public_streak_leaderboard_insert_all on public.public_streak_leaderboard
  for insert to anon, authenticated with check (true);
