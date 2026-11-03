-- La hora REAL en que empezó cada ronda, categoría por categoría, marcada por el ÁRBITRO.
--
-- Antes la organización marcaba una sola hora por ronda (centroamericano_inicios_ronda). Pero cada categoría puede
-- empezar a una hora distinta, y quien lo sabe es el árbitro que está en la sala. Ahora el árbitro toca «Inició la
-- ronda» en su tablet (o escribe la hora si avisa tarde) y desde ahí corre el tiempo de espera de SU categoría.
--
-- Una fila por torneo (categoría) y ronda. La escribe SOLO la Edge Function centroamericano-mesa (el árbitro no tiene
-- cuenta), así que la tabla no tiene permisos de escritura; la organización la lee por su política, solo para verla.
-- La tabla vieja (centroamericano_inicios_ronda) y su función se quedan como estaban: ya nada las usa.

create table public.centroamericano_inicios_torneo (
  tnr text not null,
  ronda integer not null check (ronda between 1 and 99),
  inicio timestamptz not null,
  asignacion_id uuid references public.centroamericano_asignaciones(id) on delete set null,
  arbitro text not null default '',
  puesto_en timestamptz not null default now(),
  primary key (tnr, ronda)
);
comment on table public.centroamericano_inicios_torneo is
  'La hora real en que empezó cada ronda de cada categoría del Centroamericano (la marca su árbitro). Si no hay fila, vale la del calendario. La escribe solo la Edge Function centroamericano-mesa.';

alter table public.centroamericano_inicios_torneo enable row level security;
revoke all on public.centroamericano_inicios_torneo from public, anon, authenticated;
grant select on public.centroamericano_inicios_torneo to authenticated;
create policy centroamericano_inicios_torneo_ver on public.centroamericano_inicios_torneo
  for select to authenticated using ((select public.tengo_herramienta('mesa-arbitro')));
