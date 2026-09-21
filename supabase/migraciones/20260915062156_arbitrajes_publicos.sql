-- Resultados del examen de arbitraje hecho por visitantes del sitio (sin cuenta).
-- Mismo patrón que diagnosticos_publicos: cualquiera puede dejar el suyo,
-- solo profesores y administración pueden leerlos y responderlos.
create table if not exists public.arbitrajes_publicos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nombre text not null,
  email text not null,
  porcentaje integer,
  nivel text,
  detalle jsonb not null,
  revisado boolean not null default false,
  retroalimentacion text,
  revisado_at timestamptz,
  revisado_por uuid references auth.users(id) on delete set null
);

comment on table public.arbitrajes_publicos is
  'Resultados del examen de arbitraje hecho por visitantes desde nivel-de-arbitraje.html (sin cuenta). Profesores y administración los revisan y les escriben una retroalimentación desde arbitraje.html.';

create index if not exists arbitrajes_publicos_pendientes
  on public.arbitrajes_publicos (revisado, created_at desc);

alter table public.arbitrajes_publicos enable row level security;

-- Cualquiera puede dejar su resultado, con nombre y correo de verdad y sin
-- mandar un detalle desmedido.
create policy arbitrajes_publicos_insert on public.arbitrajes_publicos
  for insert to anon, authenticated
  with check (
    pg_column_size(detalle) < 60000
    and length(btrim(nombre)) between 2 and 120
    and length(btrim(email)) between 5 and 160
    and email like '%@%.%'
    and revisado = false
    and retroalimentacion is null
  );

-- Leer y responder: solo profesores y administración.
create policy arbitrajes_publicos_select on public.arbitrajes_publicos
  for select to authenticated
  using (
    (select is_admin from public.my_profile())
    or (select role from public.my_profile()) = 'profesor'
  );

create policy arbitrajes_publicos_update on public.arbitrajes_publicos
  for update to authenticated
  using (
    (select is_admin from public.my_profile())
    or (select role from public.my_profile()) = 'profesor'
  )
  with check (true);