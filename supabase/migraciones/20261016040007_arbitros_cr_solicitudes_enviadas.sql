-- Herramienta «Árbitros de Costa Rica»: el seguimiento de una solicitud de
-- título revisada en «Revisar normas antes de mandarlas». Al mandarla se
-- marca «enviada» y queda la foto de lo que dijo la revisión (prediccion y
-- normas); cuando el Consejo de FIDE resuelve, se anota el resultado y por
-- qué. Así se ve si la revisión acertó y dónde corregir las reglas (ver «El
-- seguimiento: lo que dijo la revisión y lo que resolvió FIDE» en
-- docs/decisiones/juegos-y-torneos.md). Mismos permisos que
-- arbitros_cr_normas_revision: quien la marcó con la licencia, y quien
-- administra ve todo.

create table public.arbitros_cr_solicitudes_enviadas (
  id uuid primary key default gen_random_uuid(),
  creada_por uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  creada timestamptz not null default now(),
  fide_id integer not null,
  cual text not null check (cual in ('af', 'ai')),
  enviada date not null,
  prediccion text not null check (prediccion in ('lista', 'casi', 'todavia')),
  normas jsonb not null default '[]'::jsonb check (jsonb_typeof(normas) = 'array'),
  resultado text not null default 'pendiente' check (resultado in ('pendiente', 'aprobada', 'rechazada')),
  consejo text not null default '' check (length(consejo) <= 120),
  motivo text not null default '' check (length(motivo) <= 1000)
);
comment on table public.arbitros_cr_solicitudes_enviadas is
  'Las solicitudes de título (cual: af o ai) del árbitro fide_id que se mandaron después de revisarlas: la fecha, lo que dijo la revisión (prediccion: lista, casi o todavia; normas: la foto de cada norma y su veredicto) y lo que resolvió FIDE (resultado, consejo, motivo).';
create unique index arbitros_cr_solicitudes_enviadas_una_por_dia
  on public.arbitros_cr_solicitudes_enviadas (creada_por, fide_id, cual, enviada);
create index arbitros_cr_solicitudes_enviadas_creada_por_idx on public.arbitros_cr_solicitudes_enviadas (creada_por);

alter table public.arbitros_cr_solicitudes_enviadas enable row level security;
revoke all on public.arbitros_cr_solicitudes_enviadas from public, anon, authenticated;
grant select, insert, update, delete on public.arbitros_cr_solicitudes_enviadas to authenticated;

create policy arbitros_cr_solicitudes_enviadas_ver on public.arbitros_cr_solicitudes_enviadas
  for select to authenticated
  using ((creada_por = (select auth.uid()) and (select public.tengo_herramienta('arbitros-cr')))
         or (select public.soy_admin()));
create policy arbitros_cr_solicitudes_enviadas_marcar on public.arbitros_cr_solicitudes_enviadas
  for insert to authenticated
  with check (creada_por = (select auth.uid()) and (select public.tengo_herramienta('arbitros-cr')));
create policy arbitros_cr_solicitudes_enviadas_cambiar on public.arbitros_cr_solicitudes_enviadas
  for update to authenticated
  using (creada_por = (select auth.uid()) and (select public.tengo_herramienta('arbitros-cr')))
  with check (creada_por = (select auth.uid()) and (select public.tengo_herramienta('arbitros-cr')));
create policy arbitros_cr_solicitudes_enviadas_borrar on public.arbitros_cr_solicitudes_enviadas
  for delete to authenticated
  using ((creada_por = (select auth.uid()) and (select public.tengo_herramienta('arbitros-cr')))
         or (select public.soy_admin()));