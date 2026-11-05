-- «Conversar» en la mesa del árbitro (Centroamericano): una traducción de ida y vuelta entre el árbitro (español) y un jugador (inglés o
-- francés). Esta tabla SOLO cuenta cada traducción de cada enlace (para ponerles tope por minuto, por día y en total) y lo que costó: NO
-- guarda el texto ni la traducción. La escribe únicamente la Edge Function centroamericano-traducir (clave de servicio); sin permisos ni
-- políticas para nadie más.

create table public.centroamericano_traducciones (
  id uuid primary key default gen_random_uuid(),
  asignacion_id uuid not null references public.centroamericano_asignaciones(id) on delete cascade,
  creada timestamptz not null default now(),
  caracteres integer not null default 0,
  tokens_entrada integer,
  tokens_salida integer,
  costo_usd numeric(10, 6),
  ok boolean not null default false
);
comment on table public.centroamericano_traducciones is
  'Cuántas traducciones pidió cada enlace de árbitro y lo que costaron (solo para los topes). No guarda el texto. La escribe solo la Edge Function centroamericano-traducir.';
alter table public.centroamericano_traducciones enable row level security;
revoke all on public.centroamericano_traducciones from public, anon, authenticated;
create index centroamericano_traducciones_asignacion_idx on public.centroamericano_traducciones (asignacion_id, creada desc);
create index centroamericano_traducciones_creada_idx on public.centroamericano_traducciones (creada desc);
