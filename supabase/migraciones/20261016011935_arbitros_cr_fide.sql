-- Herramienta «Árbitros de Costa Rica» (arbitros-cr.html): lo que dice FIDE
-- de cada árbitro, aparte de sus torneos.
--
--   - La lista oficial de árbitros de la Comisión de Árbitros de FIDE
--     (List_of_Arbiters.pdf): el título (IA, FA o NA), si está inactivo (la
--     marca «i»), la categoría y la licencia. Quien no figura en ella no es
--     árbitro de FIDE.
--   - La fecha exacta en que se le aprobó el título de AF (y el de AI): la
--     reunión del Consejo de FIDE que lo aprobó, según el informe de la
--     Comisión a esa reunión. Desde ese día, sus torneos cuentan para AI y ya
--     no para AF.
--
-- Va en una tabla aparte de arbitros_cr porque herramientas/arbitros-cr.py
-- la borra y la vuelve a llenar; esta la llena herramientas/arbitros-cr/
-- lista-fide.py desde herramientas/datos/arbitros-cr-lista-fide.json. Sin
-- clave foránea: el árbitro puede faltar en una y estar en la otra.
-- Ver «Lo que dice FIDE de cada árbitro» en docs/decisiones/juegos-y-torneos.md.

create table public.arbitros_cr_fide (
  fide_id integer primary key check (fide_id > 0),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 120),
  titulo text not null check (titulo in ('IA', 'FA', 'NA')),
  inactivo boolean not null default false,
  categoria text not null default '' check (categoria ~ '^[A-D]?$'),
  licencia text not null default '' check (char_length(licencia) <= 10),
  af_fecha date,
  af_consejo text not null default '' check (char_length(af_consejo) <= 160),
  ia_fecha date,
  ia_consejo text not null default '' check (char_length(ia_consejo) <= 160),
  lista date not null
);
comment on table public.arbitros_cr_fide is
  'Árbitros de Costa Rica en la lista oficial de árbitros de FIDE (título, inactivo, categoría, licencia; lista: la fecha de publicación) y la fecha exacta en que el Consejo de FIDE les aprobó el AF y el AI, para la herramienta arbitros-cr. Solo la lee quien tiene la herramienta.';

alter table public.arbitros_cr_fide enable row level security;
revoke all on public.arbitros_cr_fide from anon;
revoke insert, update, delete, truncate on public.arbitros_cr_fide from authenticated;
grant select on public.arbitros_cr_fide to authenticated;
create policy arbitros_cr_fide_con_herramienta on public.arbitros_cr_fide for select to authenticated
  using ((select public.tengo_herramienta('arbitros-cr')));
