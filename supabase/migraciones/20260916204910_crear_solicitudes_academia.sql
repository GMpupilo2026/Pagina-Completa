-- Bandeja de solicitudes públicas de ingreso a la Academia: alguien interesado
-- llena el formulario público (unirse.html), y quien administra o coordina
-- decide aprobar (crea la cuenta e invita como alumno) o rechazar (le llega un
-- correo aparte invitándolo a elegir un plan pago en elegir-plan.html).
--
-- "eliminar" la petición del pedido original se implementa como
-- estado='rechazada', no como DELETE: se guarda qué pasó (igual que cobros),
-- no se borra el registro — así queda constancia de a quién ya se le escribió
-- y qué plan eligió después.
create table public.solicitudes_academia (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nombre text not null,
  email text not null,
  telefono text,
  edad_nivel text,
  mensaje text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aprobada', 'rechazada')),
  revisado_por uuid references public.profiles(id),
  revisado_en timestamptz,
  plan_elegido text check (plan_elegido in ('plataforma', 'grupal', 'individual')),
  plan_elegido_en timestamptz
);

alter table public.solicitudes_academia enable row level security;

-- Solo quien administra o coordina puede ver y revisar la bandeja — mismo
-- predicado que ya usan las políticas de "formularios".
create policy solicitudes_academia_select on public.solicitudes_academia
  for select using (soy_coordinador());

create policy solicitudes_academia_update on public.solicitudes_academia
  for update using (soy_coordinador());

-- Nadie inserta directo: el formulario público pasa por solicitar_academia()
-- y la elección de plan por elegir_plan(), las dos SECURITY DEFINER más
-- abajo. anon no recibe ningún GRANT de tabla (igual que formularios).
grant select, update on public.solicitudes_academia to authenticated;
