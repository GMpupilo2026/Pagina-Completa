
-- Perfiles de usuario (profesor / alumno)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'alumno' check (role in ('profesor','alumno')),
  full_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Cualquier usuario autenticado puede leer todos los perfiles (para saber quién es el profesor, mostrar nombres, etc.)
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

-- Un usuario solo puede actualizar su propio perfil (y no puede cambiar su propio rol vía esto; el rol lo gestiona el backend)
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Tabla del estado del tablero en vivo (una sola fila global para la clase)
create table public.game_state (
  id int primary key default 1,
  fen text not null default 'start',
  last_move text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);

insert into public.game_state (id, fen) values (1, 'start');

alter table public.game_state enable row level security;

-- Cualquier usuario autenticado puede ver el tablero
create policy "game_state_select_authenticated"
  on public.game_state for select
  to authenticated
  using (true);

-- Solo el profesor puede actualizar el tablero
create policy "game_state_update_profesor"
  on public.game_state for update
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor')
  );

-- Trigger: crear fila en profiles automáticamente cuando se crea un usuario en auth.users
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'alumno')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Habilitar realtime en game_state para que los alumnos reciban los movimientos en vivo
alter publication supabase_realtime add table public.game_state;
