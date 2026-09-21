-- Diagnósticos de nivel hechos desde fuera del panel (visitantes sin cuenta).
-- Los alumnos registrados siguen guardando el suyo en training_progress; esta
-- tabla es solo para quien hace la prueba pública, y en Informes se muestran
-- aparte. Cualquiera puede insertar (la prueba es pública); solo el profesor o
-- un administrador pueden leer.
create table if not exists public.diagnosticos_publicos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 120),
  email text check (email is null or char_length(email) <= 200),
  telefono text check (telefono is null or char_length(telefono) <= 40),
  elo integer check (elo is null or (elo between 100 and 3500)),
  elo_tipo text check (elo_tipo is null or elo_tipo in ('fide','nacional','online','estimado')),
  porcentaje integer check (porcentaje is null or (porcentaje between 0 and 100)),
  nivel text,
  detalle jsonb not null,
  atendido boolean not null default false
);
comment on table public.diagnosticos_publicos is 'Resultados del diagnóstico de nivel hecho por visitantes (sin cuenta). Los alumnos registrados guardan el suyo en training_progress.';

alter table public.diagnosticos_publicos enable row level security;

drop policy if exists diagnosticos_publicos_insert on public.diagnosticos_publicos;
create policy diagnosticos_publicos_insert on public.diagnosticos_publicos
  for insert to anon, authenticated
  with check (pg_column_size(detalle) < 60000);

drop policy if exists diagnosticos_publicos_select on public.diagnosticos_publicos;
create policy diagnosticos_publicos_select on public.diagnosticos_publicos
  for select to authenticated
  using (
    (select my_profile.is_admin from my_profile() my_profile(role, is_admin, teacher_id))
    or (select my_profile.role from my_profile() my_profile(role, is_admin, teacher_id)) = 'profesor'
  );

drop policy if exists diagnosticos_publicos_update on public.diagnosticos_publicos;
create policy diagnosticos_publicos_update on public.diagnosticos_publicos
  for update to authenticated
  using (
    (select my_profile.is_admin from my_profile() my_profile(role, is_admin, teacher_id))
    or (select my_profile.role from my_profile() my_profile(role, is_admin, teacher_id)) = 'profesor'
  )
  with check (true);

grant insert on public.diagnosticos_publicos to anon, authenticated;
grant select, update on public.diagnosticos_publicos to authenticated;