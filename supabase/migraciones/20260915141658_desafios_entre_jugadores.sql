-- Desafíos entre personas conectadas: alguien reta, el otro acepta y recién ahí
-- nace la partida. Hasta hoy solo el profesor podía crear partidas (la política
-- game_rooms_insert exige role = 'profesor'), así que la partida se crea con una
-- función SECURITY DEFINER que comprueba que hay un desafío aceptado de verdad.
create table if not exists public.desafios (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  de_id uuid not null references auth.users(id) on delete cascade,
  para_id uuid not null references auth.users(id) on delete cascade,
  modalidad text not null,
  estado text not null default 'pendiente',
  room_id uuid references public.game_rooms(id) on delete set null,
  respondido_at timestamptz,
  constraint desafios_distintos check (de_id <> para_id),
  constraint desafios_estado check (estado in ('pendiente', 'aceptado', 'rechazado', 'cancelado')),
  constraint desafios_modalidad check (modalidad in
    ('estandar','crazyhouse','cartas','duelo','niebla','abrazos','camaleon','ciegas'))
);

comment on table public.desafios is
  'Retos entre jugadores conectados (juegos.html). Quien reta inserta uno pendiente; quien lo recibe acepta y la función aceptar_desafio() crea la partida en game_rooms.';

create index if not exists desafios_para_pendiente on public.desafios (para_id, estado, created_at desc);
create index if not exists desafios_de_pendiente   on public.desafios (de_id, estado, created_at desc);

alter table public.desafios enable row level security;

create policy desafios_select on public.desafios
  for select to authenticated
  using (
    auth.uid() = de_id
    or auth.uid() = para_id
    or (select is_admin from public.my_profile())
    or exists (select 1 from public.profiles p
               where p.id in (desafios.de_id, desafios.para_id) and p.teacher_id = auth.uid())
  );

create policy desafios_insert on public.desafios
  for insert to authenticated
  with check (
    de_id = auth.uid()
    and estado = 'pendiente'
    and room_id is null
    and public.pueden_jugar_entre_si(de_id, para_id)
  );

create policy desafios_update on public.desafios
  for update to authenticated
  using (auth.uid() = para_id or auth.uid() = de_id)
  with check (auth.uid() = para_id or auth.uid() = de_id);