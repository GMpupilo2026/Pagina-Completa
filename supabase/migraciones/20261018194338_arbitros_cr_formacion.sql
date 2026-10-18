-- Herramienta «Árbitros de Costa Rica» (arbitros-cr.html): la categoría
-- nacional y los cursos de cada árbitro, para lo que pide el Reglamento para
-- Árbitros de la Federación Costarricense de Ajedrez (2025) y desde afuera no
-- se ve: desde cuándo tiene su categoría (C, B o A; arts. 12 y 14, un año con
-- ella y las normas posteriores), los cursos básico, intermedio y de programa
-- de pareo con sus horas y su nota (arts. 10, 12, 14 y 16) y los de
-- actualización (art. 19: inactivo sin uno en dos años). Ver «La categoría y
-- los cursos de cada árbitro» en docs/decisiones/juegos-y-torneos.md.
--
-- La leen quienes tienen la herramienta; la escribe solo quien administra (es
-- el registro oficial: nadie con la licencia puede darse un curso). fide_id no
-- es clave foránea a arbitros_cr a propósito: esa tabla se borra y se vuelve a
-- llenar en cada carga.

create table public.arbitros_cr_formacion (
  id uuid primary key default gen_random_uuid(),
  fide_id integer not null,
  tipo text not null check (tipo in ('categoria', 'basico', 'intermedio', 'pareo', 'actualizacion')),
  categoria text check (categoria in ('A', 'B', 'C')),
  fecha date not null,
  horas numeric(5,1) check (horas is null or (horas > 0 and horas <= 500)),
  nota numeric(5,2) check (nota is null or (nota >= 0 and nota <= 100)),
  detalle text not null default '' check (length(detalle) <= 200),
  creada_por uuid default auth.uid() references public.profiles(id) on delete set null,
  creada timestamptz not null default now(),
  -- La categoría va solo en las filas de categoría, y ahí es obligatoria; las horas, solo en los cursos.
  constraint arbitros_cr_formacion_categoria check ((tipo = 'categoria') = (categoria is not null)),
  constraint arbitros_cr_formacion_horas check (tipo <> 'categoria' or (horas is null and nota is null))
);
comment on table public.arbitros_cr_formacion is
  'La categoría nacional (tipo categoria: desde qué fecha tiene la C, B o A) y los cursos (basico, intermedio, pareo, actualizacion: fecha en que terminó, horas, nota en %) de cada árbitro fide_id, según el Reglamento para Árbitros de la Federación Costarricense de Ajedrez. La leen quienes tienen la herramienta arbitros-cr; la escribe solo quien administra.';
create unique index arbitros_cr_formacion_una_categoria on public.arbitros_cr_formacion (fide_id, categoria) where tipo = 'categoria';
create index arbitros_cr_formacion_fide_idx on public.arbitros_cr_formacion (fide_id);

alter table public.arbitros_cr_formacion enable row level security;
revoke all on public.arbitros_cr_formacion from public, anon, authenticated;
grant select, insert, update, delete on public.arbitros_cr_formacion to authenticated;

create policy arbitros_cr_formacion_ver on public.arbitros_cr_formacion for select to authenticated
  using ((select public.tengo_herramienta('arbitros-cr')) or (select public.soy_admin()));
create policy arbitros_cr_formacion_agregar on public.arbitros_cr_formacion for insert to authenticated
  with check ((select public.soy_admin()));
create policy arbitros_cr_formacion_cambiar on public.arbitros_cr_formacion for update to authenticated
  using ((select public.soy_admin())) with check ((select public.soy_admin()));
create policy arbitros_cr_formacion_borrar on public.arbitros_cr_formacion for delete to authenticated
  using ((select public.soy_admin()));
