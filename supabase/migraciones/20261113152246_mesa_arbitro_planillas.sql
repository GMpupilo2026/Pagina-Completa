create table public.arbitro_planillas (
  id uuid primary key default gen_random_uuid(),
  creada_por uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  subida timestamptz not null default now(),
  tnr text not null check (tnr ~ '^[0-9]{1,7}$'),
  ronda integer not null check (ronda between 1 and 99),
  mesa integer not null check (mesa between 1 and 9999),
  blancas text not null default '' check (length(blancas) <= 120),
  negras text not null default '' check (length(negras) <= 120),
  ruta text not null unique check (ruta ~ '^[0-9a-f-]{36}/[0-9]{1,7}/[0-9a-f-]{36}\.jpg$'),
  bytes integer not null check (bytes between 1 and 8388608),
  check (split_part(ruta, '/', 1) = creada_por::text and split_part(ruta, '/', 2) = tnr)
);
comment on table public.arbitro_planillas is
  'La foto de las dos planillas de una partida (herramienta mesa-arbitro): una fila por foto, de un torneo de chess-results (tnr), ronda y mesa. La imagen está en el bucket privado mesa-arbitro-planillas, en <autor>/<tnr>/<id>.jpg. Solo se agrega: no se edita ni se borra. La hora y el autor los pone la base.';
create index arbitro_planillas_persona_torneo_idx on public.arbitro_planillas (creada_por, tnr, ronda, mesa);

alter table public.arbitro_planillas enable row level security;
revoke all on public.arbitro_planillas from public, anon, authenticated;
grant select on public.arbitro_planillas to authenticated;
grant insert (tnr, ronda, mesa, blancas, negras, ruta, bytes) on public.arbitro_planillas to authenticated;

create policy arbitro_planillas_ver on public.arbitro_planillas
  for select to authenticated
  using ((creada_por = (select auth.uid()) and (select public.tengo_herramienta('mesa-arbitro')))
         or (select public.soy_admin()));
create policy arbitro_planillas_subir on public.arbitro_planillas
  for insert to authenticated
  with check (creada_por = (select auth.uid()) and (select public.tengo_herramienta('mesa-arbitro')));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mesa-arbitro-planillas', 'mesa-arbitro-planillas', false, 8388608, array['image/jpeg'])
on conflict (id) do nothing;

create policy mesa_arbitro_planillas_subir on storage.objects
  for insert to authenticated
  with check (bucket_id = 'mesa-arbitro-planillas'
              and (storage.foldername(name))[1] = ((select auth.uid()))::text
              and (select public.tengo_herramienta('mesa-arbitro')));
create policy mesa_arbitro_planillas_ver on storage.objects
  for select to authenticated
  using (bucket_id = 'mesa-arbitro-planillas'
         and (((storage.foldername(name))[1] = ((select auth.uid()))::text
               and (select public.tengo_herramienta('mesa-arbitro')))
              or (select public.soy_admin())));
