-- Herramienta «Árbitros de Costa Rica» (arbitros-cr.html): los torneos de
-- chess-results.com, además de los de FIDE.
--
--   arbitros_cr.solo_chess_results  la persona no figura como árbitro en
--                        ningún torneo de FIDE: se la encontró, con su ID
--                        FIDE, en los torneos de chess-results.
--   arbitros_cr_cr       un torneo de la federación de Costa Rica en
--                        chess-results (clave = su número, tnrNNN.aspx).
--   arbitros_cr_cr_cargos  quién fue qué en cada uno: ap (árbitro principal),
--                        adj (adjunto principal), arb (árbitro), dir
--                        (director del torneo) u org (organizador).
--
-- El mismo candado que las tablas de FIDE: solo lee quien tiene la
-- herramienta, con tengo_herramienta(); sin política de escritura (se llena
-- desde la base con lo que arma herramientas/arbitros-cr.py). Ver «Árbitros
-- de Costa Rica en chess-results» en docs/decisiones/juegos-y-torneos.md.

alter table public.arbitros_cr add column solo_chess_results boolean not null default false;

create table public.arbitros_cr_cr (
  clave integer primary key check (clave > 0),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 200),
  inicio date not null,
  fin date,
  lugar text not null default '' check (char_length(lugar) <= 200),
  control text not null default '' check (char_length(control) <= 200),
  rondas smallint not null default 0 check (rondas >= 0),
  jugadores integer not null default 0 check (jugadores >= 0)
);
comment on table public.arbitros_cr_cr is
  'Torneos de la federación de Costa Rica en chess-results con algún árbitro de Costa Rica, para la herramienta arbitros-cr. El nombre llega cortado a 50 letras (así lo da el buscador). Solo la lee quien tiene la herramienta.';

create table public.arbitros_cr_cr_cargos (
  clave integer not null references public.arbitros_cr_cr (clave) on delete cascade,
  fide_id integer not null references public.arbitros_cr (fide_id) on delete cascade,
  rol text not null check (rol in ('ap', 'adj', 'arb', 'dir', 'org')),
  primary key (clave, fide_id, rol)
);
create index arbitros_cr_cr_cargos_fide_id on public.arbitros_cr_cr_cargos (fide_id);
comment on table public.arbitros_cr_cr_cargos is
  'Quién fue qué en cada torneo de chess-results (arbitros-cr): ap árbitro principal, adj adjunto principal, arb árbitro, dir director, org organizador. Solo la lee quien tiene la herramienta.';

do $$
declare t text;
begin
  foreach t in array array['arbitros_cr_cr', 'arbitros_cr_cr_cargos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.tengo_herramienta(''arbitros-cr'')))',
                   t || '_con_herramienta', t);
  end loop;
end $$;
