-- Herramienta «Árbitros de Costa Rica» (arbitros-cr.html): la revisión de
-- normas antes de mandar una solicitud de título a FIDE. Quien tiene la
-- licencia de la herramienta sube el certificado de cada norma (PDF o foto) de
-- un árbitro de la lista, elige el torneo de FIDE, el cargo que dice el
-- certificado y quién lo firmó, y la página dice si FIDE la aceptaría y qué
-- le falta, norma por norma y la solicitud entera (ver «La revisión de normas
-- antes de mandarlas» en docs/decisiones/juegos-y-torneos.md).
--
-- Cada certificado lo ven solo quien lo subió y quien administra: llevan
-- firmas y datos personales. torneo_id no es clave foránea a
-- arbitros_cr_torneos a propósito: esa tabla se borra y se vuelve a llenar
-- en cada carga.

create table public.arbitros_cr_normas_revision (
  id uuid primary key default gen_random_uuid(),
  creada_por uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  creada timestamptz not null default now(),
  fide_id integer not null,
  cual text not null check (cual in ('af', 'ai')),
  torneo_id integer not null,
  cargo text not null check (cargo in ('Chief', 'Dep. Chief', 'Arbiter', 'Pairings', 'Assistant')),
  firmante_fide_id integer,
  firmante_nombre text not null default '' check (length(firmante_nombre) <= 120),
  archivo text,
  nombre_archivo text not null default '' check (length(nombre_archivo) <= 200),
  constraint arbitros_cr_normas_revision_archivo_propio
    check (archivo is null or archivo ~ ('^' || creada_por::text || '/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$'))
);
comment on table public.arbitros_cr_normas_revision is
  'Las normas que alguien con la licencia de arbitros-cr sube para revisarlas antes de mandar una solicitud de título (cual: af o ai) del árbitro fide_id. archivo es la ruta del certificado en el bucket privado normas-arbitros. Las ven solo quien las subió y quien administra.';
-- Una norma por torneo en cada revisión: subirla dos veces la contaría doble.
create unique index arbitros_cr_normas_revision_una_por_torneo
  on public.arbitros_cr_normas_revision (creada_por, fide_id, cual, torneo_id);
create index arbitros_cr_normas_revision_creada_por_idx on public.arbitros_cr_normas_revision (creada_por);

alter table public.arbitros_cr_normas_revision enable row level security;
revoke all on public.arbitros_cr_normas_revision from public, anon;
grant select, insert, update, delete on public.arbitros_cr_normas_revision to authenticated;

create policy arbitros_cr_normas_revision_ver on public.arbitros_cr_normas_revision
  for select to authenticated
  using ((creada_por = (select auth.uid()) and (select public.tengo_herramienta('arbitros-cr')))
         or (select public.soy_admin()));
create policy arbitros_cr_normas_revision_subir on public.arbitros_cr_normas_revision
  for insert to authenticated
  with check (creada_por = (select auth.uid()) and (select public.tengo_herramienta('arbitros-cr')));
create policy arbitros_cr_normas_revision_cambiar on public.arbitros_cr_normas_revision
  for update to authenticated
  using (creada_por = (select auth.uid()) and (select public.tengo_herramienta('arbitros-cr')))
  with check (creada_por = (select auth.uid()) and (select public.tengo_herramienta('arbitros-cr')));
create policy arbitros_cr_normas_revision_borrar on public.arbitros_cr_normas_revision
  for delete to authenticated
  using ((creada_por = (select auth.uid()) and (select public.tengo_herramienta('arbitros-cr')))
         or (select public.soy_admin()));

-- Los certificados: bucket PRIVADO, cada quien en su carpeta. Se ven con una
-- dirección firmada; los lee quien los subió y quien administra.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('normas-arbitros', 'normas-arbitros', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

create policy normas_arbitros_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'normas-arbitros'
              and (storage.foldername(name))[1] = ((select auth.uid()))::text
              and (select public.tengo_herramienta('arbitros-cr')));

create policy normas_arbitros_select on storage.objects for select to authenticated
  using (bucket_id = 'normas-arbitros'
         and (((storage.foldername(name))[1] = ((select auth.uid()))::text
               and (select public.tengo_herramienta('arbitros-cr')))
              or (select public.soy_admin())));

create policy normas_arbitros_delete on storage.objects for delete to authenticated
  using (bucket_id = 'normas-arbitros'
         and (((storage.foldername(name))[1] = ((select auth.uid()))::text
               and (select public.tengo_herramienta('arbitros-cr')))
              or (select public.soy_admin())));