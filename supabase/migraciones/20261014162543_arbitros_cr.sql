-- Herramienta «Árbitros de Costa Rica en FIDE» (arbitros-cr.html).
--
-- Los torneos valorados por FIDE en que arbitró cada árbitro de Costa Rica,
-- con su cargo, y si cada torneo cumple las condiciones de una norma de
-- Árbitro FIDE (AF) y de Árbitro Internacional (AI) según el reglamento
-- B.06.1 vigente desde el 1 de marzo de 2026 (herramientas/normas_arbitro.py).
--
--   arbitros_cr          un árbitro: su ID FIDE, su nombre y su título.
--   arbitros_cr_torneos  un torneo de FIDE, con lo que pide una norma y el
--                        resultado ya evaluado (af_*, ai_*).
--   arbitros_cr_cargos   quién fue qué en cada torneo (principal, adjunto,
--                        árbitro, de pareos, asistente).
--
-- EL CANDADO ES LA BASE: solo lee quien tiene la herramienta (licencia
-- vigente de 'arbitros-cr' o de 'todas', o administración), con
-- tengo_herramienta(). No hay política de escritura: se llena desde la base
-- con lo leído de ratings.fide.com (herramientas/arbitros-cr.py arma el SQL).
-- Ver «Árbitros de Costa Rica en FIDE» en docs/decisiones/juegos-y-torneos.md.

create table public.arbitros_cr (
  fide_id integer primary key check (fide_id > 0),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 120),
  federacion text not null default 'CRC' check (federacion ~ '^[A-Z]{3}$'),
  titulo text not null default '' check (titulo in ('', 'IA', 'FA', 'AN')),
  titulo_detalle text not null default '' check (char_length(titulo_detalle) <= 200)
);
comment on table public.arbitros_cr is
  'Árbitros de Costa Rica que figuran en torneos valorados por FIDE, para la herramienta arbitros-cr. titulo: IA, FA o AN según su perfil de FIDE (vacío si no lo dice). Solo la lee quien tiene la herramienta.';

create table public.arbitros_cr_torneos (
  id integer primary key check (id > 0),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 200),
  ciudad text not null default '' check (char_length(ciudad) <= 120),
  pais text not null default '' check (char_length(pais) <= 60),
  inicio date not null,
  fin date,
  sistema text not null default '' check (sistema in ('', 's', 'r', 'd', 't', 'k')),
  ritmo text not null default '' check (ritmo in ('', 'Standard', 'Rapid', 'Blitz')),
  jugadores smallint not null default 0 check (jugadores >= 0),
  con_elo smallint not null default 0 check (con_elo >= 0),
  contados smallint not null default 0 check (contados >= 0),
  rondas smallint not null default 0 check (rondas >= 0),
  federaciones smallint not null default 0 check (federaciones >= 0),
  valorado text not null default '' check (char_length(valorado) <= 40),
  af_estado text not null check (af_estado in ('si', 'una', 'opcion', 'revisar', 'no')),
  af_detalle text not null default '' check (char_length(af_detalle) <= 400),
  ai_estado text not null check (ai_estado in ('si', 'una', 'opcion', 'revisar', 'no')),
  ai_detalle text not null default '' check (char_length(ai_detalle) <= 400)
);
comment on table public.arbitros_cr_torneos is
  'Torneos de FIDE con árbitros de Costa Rica, para la herramienta arbitros-cr. af_*/ai_*: si el torneo cumple las condiciones de una norma de AF/AI (B.06.1, 1/3/2026) y por qué. Solo la lee quien tiene la herramienta.';

create table public.arbitros_cr_cargos (
  torneo_id integer not null references public.arbitros_cr_torneos (id) on delete cascade,
  fide_id integer not null references public.arbitros_cr (fide_id) on delete cascade,
  cargo text not null check (cargo in ('Chief', 'Dep. Chief', 'Arbiter', 'Pairings', 'Assistant')),
  primary key (torneo_id, fide_id, cargo)
);
create index arbitros_cr_cargos_fide_id on public.arbitros_cr_cargos (fide_id);
comment on table public.arbitros_cr_cargos is
  'Cargo de cada árbitro de Costa Rica en cada torneo de FIDE (arbitros-cr). Solo la lee quien tiene la herramienta.';

do $$
declare t text;
begin
  foreach t in array array['arbitros_cr', 'arbitros_cr_torneos', 'arbitros_cr_cargos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.tengo_herramienta(''arbitros-cr'')))',
                   t || '_con_herramienta', t);
  end loop;
end $$;
