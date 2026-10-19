-- Herramienta «Árbitros de Costa Rica» (arbitros-cr.html): lo que cada árbitro
-- hizo en un seminario de FIDE además de los que ya trae arbitros_cr_fide
-- (que solo tiene a quienes están en la lista de árbitros de FIDE y solo los
-- que aprobaron): quién fue conferencista, asistente u organizador, y los
-- seminarios aprobados de quien no está en esa lista. Sale de los informes de
-- cada seminario que publica la Comisión de Árbitros (arbiters.fide.com/news/…).
-- Ver «Conferencistas, asistentes y seminarios de quien no está en la lista»
-- en docs/decisiones/juegos-y-torneos.md.
--
-- La leen quienes tienen la herramienta; la escribe solo quien administra.
-- fide_id no es clave foránea a arbitros_cr a propósito: esa tabla se borra y
-- se vuelve a llenar en cada carga.

create table public.arbitros_cr_seminario_roles (
  fide_id integer not null,
  rol text not null check (rol in ('aprobo', 'conferencista', 'asistente', 'organizador')),
  tipo text not null check (tipo in ('FA', 'IA')),
  seminario text not null check (length(seminario) between 3 and 120),
  fecha date not null,
  informe text not null check (informe ~ '^https://arbiters\.fide\.com/news/[0-9]+$'),
  detalle text not null default '' check (length(detalle) <= 120),
  primary key (fide_id, informe, rol)
);
comment on table public.arbitros_cr_seminario_roles is
  'Lo que hizo cada árbitro de Costa Rica (fide_id) en un seminario de FIDE de AF (FA) o de AI (IA), según el informe del seminario: conferencista, asistente (detalle: local, del programa de formación…), organizador, o aprobó (solo de quien no está en la lista de árbitros de FIDE: los demás están en arbitros_cr_fide.seminarios). fecha: el día en que terminó. La leen quienes tienen la herramienta arbitros-cr; la escribe solo quien administra.';

alter table public.arbitros_cr_seminario_roles enable row level security;
revoke all on public.arbitros_cr_seminario_roles from public, anon, authenticated;
grant select, insert, update, delete on public.arbitros_cr_seminario_roles to authenticated;

create policy arbitros_cr_seminario_roles_ver on public.arbitros_cr_seminario_roles for select to authenticated
  using ((select public.tengo_herramienta('arbitros-cr')) or (select public.soy_admin()));
create policy arbitros_cr_seminario_roles_agregar on public.arbitros_cr_seminario_roles for insert to authenticated
  with check ((select public.soy_admin()));
create policy arbitros_cr_seminario_roles_cambiar on public.arbitros_cr_seminario_roles for update to authenticated
  using ((select public.soy_admin())) with check ((select public.soy_admin()));
create policy arbitros_cr_seminario_roles_borrar on public.arbitros_cr_seminario_roles for delete to authenticated
  using ((select public.soy_admin()));

-- De los 827 informes de seminarios de AF (2010-2026) y los 28 de seminarios
-- de AI (2024-2026), leídos en octubre de 2026.
insert into public.arbitros_cr_seminario_roles (fide_id, rol, tipo, seminario, fecha, informe, detalle) values
  -- Betzy Fallas Marín no está en la lista de árbitros de FIDE.
  (6500986, 'aprobo', 'FA', '11th Internet Based Oct 2011 (WOM)', '2011-10-09', 'https://arbiters.fide.com/news/387', ''),
  -- Carolina Muñoz Solís.
  (6500579, 'conferencista', 'FA', '234th Internet Based Aug 2026 (CCA)', '2026-08-31', 'https://arbiters.fide.com/news/11244', ''),
  (6500579, 'conferencista', 'IA', '25th IACS Internet Based May 2026 (ARB)', '2026-05-17', 'https://arbiters.fide.com/news/11001', 'con Laurent Freyd (FRA)'),
  (6500579, 'conferencista', 'FA', '215th Internet Based Jan 2026 (CRC)', '2026-01-12', 'https://arbiters.fide.com/news/10729', ''),
  (6500579, 'conferencista', 'IA', '22nd IACS Internet Based Jan 2026 (ARB)', '2026-01-11', 'https://arbiters.fide.com/news/10719', 'con Gopakumar M S (IND)'),
  (6500579, 'conferencista', 'FA', '209th Internet Based Dec 2025 (CCA)', '2025-12-21', 'https://arbiters.fide.com/news/10650', ''),
  (6500579, 'conferencista', 'IA', '18th IACS Internet Based Aug 2025 (ARB)', '2025-09-09', 'https://arbiters.fide.com/news/10237', 'con Panagiotis Nikolopoulos (GRE)'),
  (6500579, 'conferencista', 'FA', '189th Internet Based Jun 2025 (CCA)', '2025-06-29', 'https://arbiters.fide.com/news/10138', ''),
  (6500579, 'conferencista', 'IA', '8th IACS Budapest Sep 2024 (ARB)', '2024-09-18', 'https://arbiters.fide.com/news/9545', 'con Laurent Freyd (FRA)'),
  (6500579, 'asistente', 'FA', '163rd Internet Based Aug 2024 (CCA)', '2024-09-01', 'https://arbiters.fide.com/news/9460', ''),
  (6500579, 'asistente', 'FA', '147th Internet Based Dec 2023 (CCA)', '2023-12-10', 'https://arbiters.fide.com/news/8829', 'del Programa de Formación de Conferencistas'),
  (6500579, 'asistente', 'FA', '122nd Internet Based Nov 2022 (PUR)', '2022-11-27', 'https://arbiters.fide.com/news/8036', 'local'),
  -- Oscar Angulo Cubero.
  (6501435, 'asistente', 'FA', '215th Internet Based Jan 2026 (CRC)', '2026-01-12', 'https://arbiters.fide.com/news/10729', 'local'),
  -- Stanley Gómez Huertas.
  (6502849, 'organizador', 'FA', '53rd Internet Based Sep 2017 (CRC)', '2017-09-24', 'https://arbiters.fide.com/news/2385', 'técnico');
