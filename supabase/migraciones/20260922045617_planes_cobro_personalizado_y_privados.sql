-- Un plan "personalizado" es un cobro armado a mano para UN alumno, desde la
-- ficha "Quién paga qué" de cobros.html, sin pasar por el catálogo de planes.
-- Sigue siendo una fila de planes_cobro -- generar_cobros(), cobros_resumen()
-- y el resto de la tubería no cambian -- pero se marca para que la ficha
-- "Planes" y el selector de "Poner a un alumno en un plan" no la ofrezcan
-- como si fuera un plan reutilizable.
alter table public.planes_cobro
  add column if not exists personalizado boolean not null default false;

comment on column public.planes_cobro.personalizado is
  'true si nació como un cobro a mano para un solo alumno (ficha Quién paga qué), no como plan del catálogo.';

-- Los planes también son privados por coordinador, igual que cobros, pagos,
-- suscripciones, cobros_contacto, avisos_cobro y datos_facturacion. Antes
-- quedaban afuera a propósito porque eran "tarifas de la Academia, no de un
-- alumno" -- pero un plan de beca o de sede sí es dato de una familia
-- concreta, y una coordinadora no tiene por qué ver las de otra.
drop policy if exists planes_lee_coordinacion on public.planes_cobro;
create policy planes_lee_coordinacion on public.planes_cobro
  for select to authenticated using (public.bajo_mi_coordinacion(creado_por));

drop policy if exists planes_escribe_coordinacion on public.planes_cobro;
create policy planes_escribe_coordinacion on public.planes_cobro
  for all to authenticated
  using (public.soy_coordinador() and public.bajo_mi_coordinacion(creado_por))
  with check (public.soy_coordinador() and public.bajo_mi_coordinacion(creado_por));
