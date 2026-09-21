-- ===== Torneos: inscripción de alumnos, rondas automáticas, trofeos =====
--
-- Modelo de confianza: igual al resto de "Juegos" (game_rooms) — el cliente
-- calcula emparejamientos y resultados con js/torneo-engine.js, la base solo
-- exige que cada fila pertenezca a quien corresponde (RLS). Visibilidad
-- deliberadamente "de salón de clase": cualquier alumno del mismo profesor
-- ve los torneos de ese profesor (para poder inscribirse y seguir el
-- avance), no solo sus propias partidas — a diferencia de game_rooms, que sí
-- es estrictamente privado entre los dos jugadores de esa partida puntual.

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  format text not null check (format in ('swiss','elimination','round_robin')),
  variant text not null default 'standard' check (variant in ('standard','crazyhouse','cartas','duelo','niebla')),
  status text not null default 'registration' check (status in ('registration','in_progress','finished')),
  total_rounds integer,
  current_round integer not null default 0,
  initial_seconds integer,
  increment_seconds integer not null default 0,
  winner_ids jsonb not null default '[]'::jsonb,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table public.tournament_registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player_id uuid not null references public.profiles(id),
  registered_at timestamptz not null default now(),
  unique (tournament_id, player_id)
);

create table public.tournament_rounds (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_number integer not null,
  status text not null default 'pending' check (status in ('pending','finished')),
  created_at timestamptz not null default now(),
  unique (tournament_id, round_number)
);

create table public.tournament_pairings (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.tournament_rounds(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  board_number integer not null,
  white_id uuid references public.profiles(id),
  black_id uuid references public.profiles(id),
  is_bye boolean not null default false,
  game_room_id uuid references public.game_rooms(id),
  result text check (result in ('white','black','draw')),
  needs_manual_advance boolean not null default false,
  advance_id uuid references public.profiles(id),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

-- Salón de la fama, público (igual que public_streak_leaderboard): una fila
-- por campeón y torneo (puede haber más de un campeón si hay empate en la
-- cima al terminar Suizo o Todos contra todos — ver js/torneo-engine.js).
-- El nombre queda copiado al momento de terminar el torneo (no se hace JOIN
-- en vivo contra profiles) para que esta tabla pueda ser de verdad pública
-- sin exponer la tabla de perfiles a nadie no autenticado.
create table public.public_tournament_champions (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments(id) on delete set null,
  tournament_name text not null,
  format text not null,
  variant text not null,
  display_name text not null,
  finished_at timestamptz not null default now()
);

alter table public.tournaments enable row level security;
alter table public.tournament_registrations enable row level security;
alter table public.tournament_rounds enable row level security;
alter table public.tournament_pairings enable row level security;
alter table public.public_tournament_champions enable row level security;

-- ---------- tournaments ----------
create policy tournaments_select on public.tournaments for select
  using (
    created_by = auth.uid()
    or (select is_admin from my_profile())
    or exists (select 1 from public.profiles st where st.id = auth.uid() and st.teacher_id = tournaments.created_by)
  );

create policy tournaments_insert on public.tournaments for insert
  with check (
    ((select role from my_profile()) = 'profesor' or (select is_admin from my_profile()))
    and created_by = auth.uid()
  );

create policy tournaments_update on public.tournaments for update
  using (
    created_by = auth.uid()
    or (select is_admin from my_profile())
    or exists (select 1 from public.tournament_registrations r where r.tournament_id = tournaments.id and r.player_id = auth.uid())
  )
  with check (
    created_by = auth.uid()
    or (select is_admin from my_profile())
    or exists (select 1 from public.tournament_registrations r where r.tournament_id = tournaments.id and r.player_id = auth.uid())
  );

create policy tournaments_delete on public.tournaments for delete
  using (created_by = auth.uid() or (select is_admin from my_profile()));

-- ---------- tournament_registrations ----------
create policy tournament_registrations_select on public.tournament_registrations for select
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_registrations.tournament_id
        and (
          t.created_by = auth.uid()
          or (select is_admin from my_profile())
          or exists (select 1 from public.profiles st where st.id = auth.uid() and st.teacher_id = t.created_by)
        )
    )
  );

create policy tournament_registrations_insert on public.tournament_registrations for insert
  with check (
    player_id = auth.uid()
    and exists (
      select 1 from public.tournaments t
      join public.profiles me on me.id = auth.uid()
      where t.id = tournament_registrations.tournament_id
        and t.status = 'registration'
        and me.teacher_id = t.created_by
    )
    or exists (
      select 1 from public.tournaments t
      where t.id = tournament_registrations.tournament_id
        and (t.created_by = auth.uid() or (select is_admin from my_profile()))
    )
  );

create policy tournament_registrations_delete on public.tournament_registrations for delete
  using (
    (player_id = auth.uid() and exists (select 1 from public.tournaments t where t.id = tournament_registrations.tournament_id and t.status = 'registration'))
    or exists (
      select 1 from public.tournaments t
      where t.id = tournament_registrations.tournament_id
        and t.status = 'registration'
        and (t.created_by = auth.uid() or (select is_admin from my_profile()))
    )
  );

-- ---------- tournament_rounds ----------
create policy tournament_rounds_select on public.tournament_rounds for select
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_rounds.tournament_id
        and (
          t.created_by = auth.uid()
          or (select is_admin from my_profile())
          or exists (select 1 from public.profiles st where st.id = auth.uid() and st.teacher_id = t.created_by)
        )
    )
  );

create policy tournament_rounds_insert on public.tournament_rounds for insert
  with check (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_rounds.tournament_id
        and (t.created_by = auth.uid() or (select is_admin from my_profile()))
    )
  );

create policy tournament_rounds_update on public.tournament_rounds for update
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_rounds.tournament_id
        and (t.created_by = auth.uid() or (select is_admin from my_profile()))
    )
    or exists (
      select 1 from public.tournament_pairings p
      where p.round_id = tournament_rounds.id and (p.white_id = auth.uid() or p.black_id = auth.uid())
    )
  );

-- ---------- tournament_pairings ----------
create policy tournament_pairings_select on public.tournament_pairings for select
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_pairings.tournament_id
        and (
          t.created_by = auth.uid()
          or (select is_admin from my_profile())
          or exists (select 1 from public.profiles st where st.id = auth.uid() and st.teacher_id = t.created_by)
        )
    )
  );

create policy tournament_pairings_insert on public.tournament_pairings for insert
  with check (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_pairings.tournament_id
        and (t.created_by = auth.uid() or (select is_admin from my_profile()))
    )
  );

create policy tournament_pairings_update on public.tournament_pairings for update
  using (
    white_id = auth.uid() or black_id = auth.uid()
    or exists (
      select 1 from public.tournaments t
      where t.id = tournament_pairings.tournament_id
        and (t.created_by = auth.uid() or (select is_admin from my_profile()))
    )
  )
  with check (
    white_id = auth.uid() or black_id = auth.uid()
    or exists (
      select 1 from public.tournaments t
      where t.id = tournament_pairings.tournament_id
        and (t.created_by = auth.uid() or (select is_admin from my_profile()))
    )
  );

-- ---------- public_tournament_champions ----------
-- Igual de abierta que public_streak_leaderboard: cualquier autenticado
-- puede insertar (lo hace el navegador que detecta que el torneo terminó,
-- sin backend que lo valide) — mismo modelo de confianza que ese salón de
-- la fama ya existente, documentado ahí y aquí a propósito.
create policy public_tournament_champions_select on public.public_tournament_champions
  for select to anon, authenticated using (true);

create policy public_tournament_champions_insert on public.public_tournament_champions
  for insert to authenticated with check (true);

create index tournament_registrations_tournament_idx on public.tournament_registrations(tournament_id);
create index tournament_rounds_tournament_idx on public.tournament_rounds(tournament_id);
create index tournament_pairings_round_idx on public.tournament_pairings(round_id);
create index tournament_pairings_tournament_idx on public.tournament_pairings(tournament_id);
create index tournament_pairings_game_room_idx on public.tournament_pairings(game_room_id);
