-- «Mandarme la bitácora por correo»: el árbitro que concluyó sus labores puede pedir que la bitácora en PDF le llegue a su correo.
-- Esta tabla SOLO cuenta los envíos de cada enlace (para ponerles tope): NO guarda el correo ni el documento. La escribe únicamente la
-- Edge Function centroamericano-mesa (clave de servicio); sin permisos ni políticas para nadie más.

create table public.centroamericano_correos_bitacora (
  id uuid primary key default gen_random_uuid(),
  asignacion_id uuid not null references public.centroamericano_asignaciones(id) on delete cascade,
  enviado_en timestamptz not null default now()
);
comment on table public.centroamericano_correos_bitacora is
  'Cuántas veces cada enlace pidió la bitácora por correo (solo para el tope). No guarda el correo. La escribe solo la Edge Function centroamericano-mesa.';
alter table public.centroamericano_correos_bitacora enable row level security;
revoke all on public.centroamericano_correos_bitacora from public, anon, authenticated;
create index centroamericano_correos_bitacora_asignacion_idx on public.centroamericano_correos_bitacora (asignacion_id, enviado_en desc);
