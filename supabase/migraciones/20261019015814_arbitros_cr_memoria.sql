-- Herramienta «Árbitros de Costa Rica» (arbitros-cr.html): los árbitros que
-- fallecieron, para que su nombre lleve el lazo de «En memoria» en la lista y
-- en la ficha. Ver «En memoria» en docs/decisiones/juegos-y-torneos.md.
--
-- La leen quienes tienen la herramienta; la escribe solo quien administra.
-- fide_id no es clave foránea a arbitros_cr a propósito: esa tabla se borra y
-- se vuelve a llenar en cada carga.

create table public.arbitros_cr_memoria (
  fide_id integer primary key,
  nota text not null default '' check (length(nota) <= 200),
  creada_por uuid default auth.uid() references public.profiles(id) on delete set null,
  creada timestamptz not null default now()
);
comment on table public.arbitros_cr_memoria is
  'Los árbitros de Costa Rica que fallecieron (fide_id): su nombre lleva el lazo de «En memoria» en arbitros-cr.html. La leen quienes tienen la herramienta arbitros-cr; la escribe solo quien administra.';

alter table public.arbitros_cr_memoria enable row level security;
revoke all on public.arbitros_cr_memoria from public, anon, authenticated;
grant select, insert, update, delete on public.arbitros_cr_memoria to authenticated;

create policy arbitros_cr_memoria_ver on public.arbitros_cr_memoria for select to authenticated
  using ((select public.tengo_herramienta('arbitros-cr')) or (select public.soy_admin()));
create policy arbitros_cr_memoria_agregar on public.arbitros_cr_memoria for insert to authenticated
  with check ((select public.soy_admin()));
create policy arbitros_cr_memoria_cambiar on public.arbitros_cr_memoria for update to authenticated
  using ((select public.soy_admin())) with check ((select public.soy_admin()));
create policy arbitros_cr_memoria_borrar on public.arbitros_cr_memoria for delete to authenticated
  using ((select public.soy_admin()));

-- Betzy Fallas Marín (lo pidió el dueño en octubre de 2026).
insert into public.arbitros_cr_memoria (fide_id, nota) values (6500986, '');
