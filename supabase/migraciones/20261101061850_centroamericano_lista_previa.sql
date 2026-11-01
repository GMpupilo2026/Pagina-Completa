-- Centroamericano 2026: la lista previa de cada ronda. Antes de guardar resultados de una
-- ronda, cada árbitro aprueba paso a paso (1) los relojes, puestos y programados como dicen
-- las bases (90 minutos con 30 segundos por jugada desde el inicio) y (2) los tableros,
-- revisados con las piezas bien puestas. La aprobación la anota la Edge Function
-- centroamericano-mesa y la hace cumplir al guardar (409 si falta). La organización ve cuántos
-- pasos lleva cada árbitro. Ver «Terminar la ronda, planillas y respaldo» en
-- docs/decisiones/juegos-y-torneos.md.

create table public.centroamericano_listas (
  asignacion_id uuid not null references public.centroamericano_asignaciones(id) on delete cascade,
  ronda integer not null check (ronda between 1 and 99),
  paso text not null check (paso in ('relojes', 'tableros')),
  aprobada_en timestamptz not null default now(),
  primary key (asignacion_id, ronda, paso)
);
comment on table public.centroamericano_listas is
  'Los pasos de la lista previa de una ronda que el árbitro ya aprobó (relojes, tableros). Sin los dos, centroamericano-mesa no guarda resultados de esa ronda. Se escribe solo desde la función, con la hora de la base.';

alter table public.centroamericano_listas enable row level security;
revoke all on public.centroamericano_listas from public, anon, authenticated;
grant select on public.centroamericano_listas to authenticated;
create policy centroamericano_listas_ver on public.centroamericano_listas
  for select to authenticated using ((select public.tengo_herramienta('mesa-arbitro')));

-- La organización ve las fotos de las planillas (el bucket es privado: las sube la función).
create policy centroamericano_planillas_fotos on storage.objects
  for select to authenticated
  using (bucket_id = 'centroamericano-planillas' and (select public.tengo_herramienta('mesa-arbitro')));
