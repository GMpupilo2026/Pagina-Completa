-- Los casos del VAR para el curso de árbitros (arbitraje.html, «Casos del
-- VAR»): un pedazo de video de una partida de verdad —el que el árbitro bajó
-- de la cámara de la mesa con «Guardar este pedazo para el acta»—, con una
-- pregunta («¿Qué decides tú?»), sus opciones, la respuesta, el porqué y el
-- artículo de las Leyes. Ver «Los casos del VAR para el curso de árbitros» en
-- docs/decisiones/juegos-y-torneos.md.
--
-- Son videos de partidas de menores: cuando se graba ya se cuenta con los
-- permisos (lo dijo el dueño), y aun así los ven SOLO profesores y quien
-- administra, igual que el examen de arbitraje; los sube y los borra solo
-- quien administra. El video va en un bucket PRIVADO: se pide con una
-- dirección firmada que dura una hora.
create table if not exists public.arbitraje_casos_var (
  id          uuid        primary key default gen_random_uuid(),
  creado_por  uuid        default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  titulo      text        not null check (char_length(btrim(titulo)) between 1 and 120),
  pregunta    text        not null check (char_length(btrim(pregunta)) between 1 and 500),
  opciones    text[]      not null check (cardinality(opciones) between 2 and 4),
  correcta    smallint    not null check (correcta >= 0 and correcta < 4),
  explicacion text        not null check (char_length(btrim(explicacion)) between 1 and 1500),
  articulo    text        not null check (char_length(btrim(articulo)) between 1 and 60),
  video       text        not null check (video ~ '^[0-9a-f-]{36}\.(webm|mp4|mov)$'),
  desde       numeric     not null default 0 check (desde >= 0 and desde < 3600),
  check (correcta < cardinality(opciones))
);
create index if not exists arbitraje_casos_var_fecha_idx on public.arbitraje_casos_var (created_at desc);
alter table public.arbitraje_casos_var enable row level security;

create policy arbitraje_casos_var_select on public.arbitraje_casos_var for select to authenticated
  using ((select is_admin from public.my_profile()) or (select role from public.my_profile()) = 'profesor');
create policy arbitraje_casos_var_insert on public.arbitraje_casos_var for insert to authenticated
  with check (coalesce((select is_admin from public.my_profile()), false));
create policy arbitraje_casos_var_update on public.arbitraje_casos_var for update to authenticated
  using (coalesce((select is_admin from public.my_profile()), false))
  with check (coalesce((select is_admin from public.my_profile()), false));
create policy arbitraje_casos_var_delete on public.arbitraje_casos_var for delete to authenticated
  using (coalesce((select is_admin from public.my_profile()), false));

-- Los videos: <id del caso>.<webm|mp4|mov>, hasta 30 MB (un minuto del VAR pesa unos 5).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('arbitraje-var', 'arbitraje-var', false, 31457280, array['video/webm', 'video/mp4', 'video/quicktime'])
on conflict (id) do nothing;

create policy arbitraje_var_select on storage.objects for select to authenticated
  using (bucket_id = 'arbitraje-var'
         and ((select is_admin from public.my_profile()) or (select role from public.my_profile()) = 'profesor'));
create policy arbitraje_var_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'arbitraje-var' and coalesce((select is_admin from public.my_profile()), false));
create policy arbitraje_var_delete on storage.objects for delete to authenticated
  using (bucket_id = 'arbitraje-var' and coalesce((select is_admin from public.my_profile()), false));
