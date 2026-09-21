
-- v2 seguía recursando (42P17): equipo_bajo_mi_coordinacion() es SECURITY
-- DEFINER de un dueño con BYPASSRLS, pero eso no alcanzó para evitar que sus
-- propias consultas a equipo_alumnos/equipo_entrenadores volvieran a evaluar
-- la política de esas tablas dentro del mismo plan. La forma sin ambigüedad
-- de cortar esto en Postgres es `set row_security = off` en la función: así
-- CUALQUIER tabla que consulte adentro queda sin RLS durante esa llamada,
-- sin depender de si el rol dueño bypassea o no.
--
-- De paso se junta todo en UNA función (puede_ver_equipo), para que ninguna
-- política de las tres tablas tenga que hacer un EXISTS crudo contra otra
-- tabla con RLS -- eso es lo otro que puede disparar la recursión.

create or replace function public.equipo_bajo_mi_coordinacion(p_equipo uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
set row_security to off
as $$
  select p_equipo is not null
     and exists (select 1 from public.equipos e where e.id = p_equipo)
     and not exists (
       select 1 from public.equipo_alumnos ea
        where ea.equipo_id = p_equipo
          and not public.bajo_mi_coordinacion(ea.alumno_id)
     )
     and not exists (
       select 1 from public.equipo_entrenadores ee
        where ee.equipo_id = p_equipo
          and not public.bajo_mi_coordinacion(ee.teacher_id)
     );
$$;

create or replace function public.puede_ver_equipo(p_equipo uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
set row_security to off
as $$
  select
    (public.soy_coordinador() and public.equipo_bajo_mi_coordinacion(p_equipo))
    or exists (select 1 from public.equipo_entrenadores ee
                where ee.equipo_id = p_equipo and ee.teacher_id = auth.uid())
    or exists (select 1 from public.equipo_alumnos ea
                where ea.equipo_id = p_equipo and ea.alumno_id = auth.uid());
$$;

drop policy if exists equipos_select on public.equipos;
create policy equipos_select on public.equipos
  for select to authenticated
  using (public.puede_ver_equipo(id));

drop policy if exists equipo_alumnos_select on public.equipo_alumnos;
create policy equipo_alumnos_select on public.equipo_alumnos
  for select to authenticated
  using (public.puede_ver_equipo(equipo_id));

drop policy if exists equipo_entrenadores_select on public.equipo_entrenadores;
create policy equipo_entrenadores_select on public.equipo_entrenadores
  for select to authenticated
  using (public.puede_ver_equipo(equipo_id));
