-- Herramienta «Árbitros de Costa Rica» (arbitros-cr.html), dos cosas más:
--
--   - En arbitros_cr_fide, el historial de cada árbitro en los informes de la
--     Comisión de Árbitros al Consejo de FIDE (desde 2023): sus solicitudes
--     de título (veredicto, motivo y los torneos que mandó) y los seminarios
--     de AF y de AI que aprobó. Lo llena herramientas/arbitros-cr/
--     lista-fide.py desde herramientas/datos/arbitros-cr-lista-fide.json.
--   - arbitros_cr_sin_id: las celdas de árbitro de chess-results (torneos de
--     Costa Rica) en que no se reconoce a nadie de la lista, para
--     identificarlos. La llena herramientas/arbitros-cr/por-identificar.py.
--
-- Solo las lee quien tiene la herramienta. Ver «La ruta al título, el
-- historial, la actividad y los que faltan» en docs/decisiones/juegos-y-torneos.md.

alter table public.arbitros_cr_fide
  add column solicitudes jsonb not null default '[]' check (jsonb_typeof(solicitudes) = 'array'),
  add column seminarios jsonb not null default '[]' check (jsonb_typeof(seminarios) = 'array');
comment on column public.arbitros_cr_fide.solicitudes is
  'Sus solicitudes de título en los informes de la Comisión de Árbitros (desde 2023): [{titulo, fecha, consejo, veredicto, motivo, torneos[], fuente}].';
comment on column public.arbitros_cr_fide.seminarios is
  'Los seminarios de AF o de AI que aprobó según esos informes: [{tipo, seminario, mes, fecha?, fuente}]. La norma de seminario vale cuatro años (B.06.1, 5.3.2).';

create table public.arbitros_cr_sin_id (
  texto text primary key check (char_length(btrim(texto)) between 1 and 200),
  roles text[] not null check (roles <@ array['ap', 'adj', 'arb']::text[]),
  torneos integer not null check (torneos > 0),
  primero date not null,
  ultimo date not null,
  claves integer[] not null default '{}',
  ids text[] not null default '{}'
);
comment on table public.arbitros_cr_sin_id is
  'Celdas de árbitro (principal, adjunto, árbitros) de torneos de Costa Rica en chess-results en que la herramienta arbitros-cr no reconoce a nadie de la lista, con cuántos torneos, desde y hasta cuándo, hasta cinco claves de ejemplo y los ID que trae la celda. Solo la lee quien tiene la herramienta.';

alter table public.arbitros_cr_sin_id enable row level security;
revoke all on public.arbitros_cr_sin_id from anon;
revoke insert, update, delete, truncate on public.arbitros_cr_sin_id from authenticated;
grant select on public.arbitros_cr_sin_id to authenticated;
create policy arbitros_cr_sin_id_con_herramienta on public.arbitros_cr_sin_id for select to authenticated
  using ((select public.tengo_herramienta('arbitros-cr')));
