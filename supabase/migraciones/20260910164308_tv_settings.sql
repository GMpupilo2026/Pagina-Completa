-- Página TV: torneo de Lichess (batalla por equipos) destacado en la página pública.
-- Tabla "singleton" (una sola fila, id siempre true) con el torneo que el profesor quiere
-- mostrar; cualquier visitante puede leerla, solo el profesor puede cambiarla.
create table if not exists tv_settings (
  id boolean primary key default true,
  lichess_tournament_id text,
  note text,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id),
  constraint tv_settings_singleton check (id)
);

insert into tv_settings (id) values (true) on conflict (id) do nothing;

alter table tv_settings enable row level security;

create policy tv_settings_select_public on tv_settings
  for select using (true);

create policy tv_settings_update_profesor on tv_settings
  for update using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'profesor')
  ) with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'profesor')
  );

alter publication supabase_realtime add table tv_settings;