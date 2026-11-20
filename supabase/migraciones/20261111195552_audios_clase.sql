create or replace function interno.puedo_poner_audios(p_academia uuid)
returns boolean
language sql stable security definer
set search_path = public
set row_security = off
as $$
  select coalesce(
    (select coalesce(x.is_admin, false) from public.profiles x where x.id = auth.uid())
    or exists (select 1 from public.academias a where a.id = p_academia and a.supervisor_id = auth.uid())
    or exists (select 1 from public.academia_miembros m join public.profiles p on p.id = m.persona_id
                where m.academia_id = p_academia and m.persona_id = auth.uid() and p.role = 'profesor'),
    false);
$$;
revoke execute on function interno.puedo_poner_audios(uuid) from public, anon;
grant execute on function interno.puedo_poner_audios(uuid) to authenticated, service_role;

create table if not exists public.audios_clase (
  id            uuid        primary key default gen_random_uuid(),
  academia_id   uuid        not null references public.academias (id) on delete cascade,
  fecha         date        not null,
  hora          time,
  titulo        text        not null check (char_length(btrim(titulo)) between 1 and 120),
  archivo       text        not null unique
                            check (archivo ~ '^[0-9a-f-]{36}/[A-Za-z0-9_.-]{1,120}\.mp3$'
                                   and split_part(archivo, '/', 1) = academia_id::text),
  duracion_seg  integer     check (duracion_seg between 1 and 86400),
  bytes         bigint      check (bytes between 1 and 52428800),
  transcripcion text        check (char_length(transcripcion) <= 300000),
  con_transcripcion boolean generated always as (transcripcion is not null) stored,
  puesto_por    uuid        default auth.uid() references public.profiles (id) on delete set null,
  puesto_en     timestamptz not null default now()
);
create unique index if not exists audios_clase_una_por_clase
  on public.audios_clase (academia_id, fecha, hora) nulls not distinct;
create index if not exists audios_clase_academia_fecha on public.audios_clase (academia_id, fecha desc);
alter table public.audios_clase enable row level security;

create policy audios_clase_select on public.audios_clase for select to authenticated
  using (academia_id in (select interno.academias_de((select auth.uid())))
         or (select public.soy_admin()));
create policy audios_clase_insert on public.audios_clase for insert to authenticated
  with check (interno.puedo_poner_audios(academia_id) and puesto_por = (select auth.uid()));
create policy audios_clase_update on public.audios_clase for update to authenticated
  using (interno.puedo_poner_audios(academia_id))
  with check (interno.puedo_poner_audios(academia_id));
create policy audios_clase_delete on public.audios_clase for delete to authenticated
  using (interno.puedo_poner_audios(academia_id));

grant select, insert, update, delete on public.audios_clase to authenticated;
revoke all on public.audios_clase from anon;

create or replace function public.mis_academias_audios()
returns table (id uuid, nombre text)
language sql stable security definer
set search_path = public
set row_security = off
as $$
  select a.id, a.nombre::text from public.academias a
   where interno.puedo_poner_audios(a.id)
   order by a.nombre;
$$;
revoke execute on function public.mis_academias_audios() from public, anon;
grant execute on function public.mis_academias_audios() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audios-clase', 'audios-clase', false, 52428800, array['audio/mpeg'])
on conflict (id) do nothing;

create policy audios_clase_objetos_select on storage.objects for select to authenticated
  using (bucket_id = 'audios-clase'
         and ((storage.foldername(name))[1] in (select interno.academias_de((select auth.uid()))::text)
              or (select public.soy_admin())));
create policy audios_clase_objetos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'audios-clase'
              and case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                       then interno.puedo_poner_audios(((storage.foldername(name))[1])::uuid)
                       else false end);
create policy audios_clase_objetos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'audios-clase'
         and case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then interno.puedo_poner_audios(((storage.foldername(name))[1])::uuid)
                  else false end);
