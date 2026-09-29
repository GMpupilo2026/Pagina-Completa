-- Una justificación ACEPTADA cuenta como falta justificada en la asistencia.
--
-- Ver «Las faltas justificadas en la asistencia» en
-- docs/decisiones/seguimiento-del-alumno.md.
--
-- Lo que se deriva de otras filas no se guarda: no hay columna «justificada» en
-- class_attendance ni un contador en ninguna parte. Se CUENTA: las clases
-- cerradas de sus profesores que caen (en hora de Costa Rica) dentro de una
-- justificación aceptada y a las que no fue. Si la justificación se acepta
-- tarde, se cambia de parecer o una clase se corrige después, el número sale
-- bien solo.
--
-- INVOKER: lo que cuenta cada quien lo decide la RLS de justificaciones,
-- clases y asistencia, igual que informes_resumen_alumnos() y
-- reporte_actividades(), que son las cuentas con las que se compara.
create or replace function public.faltas_justificadas(p_desde date default null, p_hasta date default null)
returns table (student_id uuid, full_name text, grupo text, clases_justificadas integer)
language sql stable security invoker
set search_path = public
as $$
  with j as (
    select ja.student_id, ja.fecha_desde, ja.fecha_hasta
      from public.justificaciones_ausencia ja
     where ja.estado = 'aceptada'
       and (p_hasta is null or ja.fecha_desde <= p_hasta)
       and (p_desde is null or ja.fecha_hasta >= p_desde)
  ),
  c as (
    select cs.id, cs.created_by, (cs.started_at at time zone 'America/Costa_Rica')::date as dia
      from public.class_sessions cs
     where cs.ended_at is not null
       and (p_desde is null or (cs.started_at at time zone 'America/Costa_Rica')::date >= p_desde)
       and (p_hasta is null or (cs.started_at at time zone 'America/Costa_Rica')::date <= p_hasta)
  )
  select j.student_id, p.full_name, p.grupo, count(distinct c.id)::int
    from j
    join c on c.dia between j.fecha_desde and j.fecha_hasta
          -- Solo las clases de SUS profesores: la clase de otro grupo el mismo
          -- día no es una clase a la que faltó.
          and c.created_by in (select interno.profesores_de(j.student_id))
    left join public.profiles p on p.id = j.student_id
   where not exists (select 1 from public.class_attendance ca
                      where ca.session_id = c.id and ca.student_id = j.student_id)
   group by j.student_id, p.full_name, p.grupo;
$$;
revoke execute on function public.faltas_justificadas(date, date) from public, anon;
grant execute on function public.faltas_justificadas(date, date) to authenticated;