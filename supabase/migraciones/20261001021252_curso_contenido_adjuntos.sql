create table if not exists public.curso_contenido (
  curso      text        not null,
  clase      integer     not null check (clase >= 0),
  datos      jsonb       not null,
  updated_by uuid        default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (curso, clase)
);
alter table public.curso_contenido enable row level security;
create policy curso_contenido_select on public.curso_contenido
  for select to anon, authenticated using (true);
create policy curso_contenido_insert on public.curso_contenido
  for insert to authenticated with check ((select public.soy_admin()));
create policy curso_contenido_update on public.curso_contenido
  for update to authenticated using ((select public.soy_admin())) with check ((select public.soy_admin()));
create policy curso_contenido_delete on public.curso_contenido
  for delete to authenticated using ((select public.soy_admin()));

create table if not exists public.curso_adjuntos (
  id         uuid        primary key default gen_random_uuid(),
  curso      text        not null,
  clase      integer     not null default 0 check (clase >= 0),
  nombre     text        not null,
  path       text        not null unique,
  tipo       text,
  tamano     bigint,
  created_by uuid        default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists curso_adjuntos_curso_clase_idx on public.curso_adjuntos (curso, clase);
alter table public.curso_adjuntos enable row level security;
create policy curso_adjuntos_select on public.curso_adjuntos
  for select to anon, authenticated using (true);
create policy curso_adjuntos_insert on public.curso_adjuntos
  for insert to authenticated with check ((select public.soy_admin()));
create policy curso_adjuntos_update on public.curso_adjuntos
  for update to authenticated using ((select public.soy_admin())) with check ((select public.soy_admin()));
create policy curso_adjuntos_delete on public.curso_adjuntos
  for delete to authenticated using ((select public.soy_admin()));

insert into storage.buckets (id, name, public, file_size_limit)
values ('curso-adjuntos', 'curso-adjuntos', true, 52428800)
on conflict (id) do nothing;

create policy curso_adjuntos_archivos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'curso-adjuntos' and (select public.soy_admin()));
create policy curso_adjuntos_archivos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'curso-adjuntos' and (select public.soy_admin()));
create policy curso_adjuntos_archivos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'curso-adjuntos' and (select public.soy_admin()))
  with check (bucket_id = 'curso-adjuntos' and (select public.soy_admin()));
create policy curso_adjuntos_archivos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'curso-adjuntos' and (select public.soy_admin()));