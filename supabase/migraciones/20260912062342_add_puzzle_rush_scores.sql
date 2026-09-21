-- Mejor racha personal de cada alumno/profesor en "Racha táctica" (Juegos): una fila
-- por usuario, con su récord de aciertos seguidos. Se muestra como logro público en el
-- panel principal (clases.html) para que toda la clase vea quién tiene la racha más larga.
create table public.puzzle_rush_scores (
  student_id uuid primary key references public.profiles(id) on delete cascade,
  best_streak integer not null default 0 check (best_streak >= 0),
  achieved_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.puzzle_rush_scores is 'Mejor racha de cada usuario en "Racha táctica" (Juegos) — un logro público visible en el panel principal.';

alter table public.puzzle_rush_scores enable row level security;

-- Es un logro público a propósito ("para que todos lo vean"): cualquier usuario
-- autenticado puede leer el récord de cualquier otro, igual que profiles/game_state.
create policy puzzle_rush_scores_select_authenticated on public.puzzle_rush_scores
  for select to authenticated using (true);

-- Cada quien solo puede escribir su propia fila.
create policy puzzle_rush_scores_insert_own on public.puzzle_rush_scores
  for insert to authenticated with check (auth.uid() = student_id);

create policy puzzle_rush_scores_update_own on public.puzzle_rush_scores
  for update to authenticated using (auth.uid() = student_id) with check (auth.uid() = student_id);
