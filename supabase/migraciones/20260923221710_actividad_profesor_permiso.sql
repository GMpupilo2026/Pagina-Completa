-- actividad_profesor() con el permiso envuelto en coalesce, como las del
-- detalle mensual. Sin usuario (auth.uid() nulo) la condición daba NULL en vez
-- de false y el `if not (...)` no rechazaba. El resto del cuerpo, igual.

CREATE OR REPLACE FUNCTION public.actividad_profesor(p_profesor uuid, p_periodo date)
 RETURNS TABLE(alumnos integer, alumnos_activos integer, ejercicios_alumnos integer, clases_en_linea integer, clases_presenciales integer, minutos_clase integer, asistencias integer, tareas_puestas integer, tareas_completadas integer, tareas_vencidas integer, examenes_puestos integer, examenes_rendidos integer, nota_promedio numeric, notas_bitacora integer, planes_nuevos integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
#variable_conflict use_column
declare
  v_mes   date        := date_trunc('month', p_periodo)::date;
  v_desde timestamptz := v_mes::timestamp at time zone 'America/Costa_Rica';
  v_hasta timestamptz := (v_mes + interval '1 month')::timestamp at time zone 'America/Costa_Rica';
begin
  if p_profesor is null or p_periodo is null or not coalesce(
       p_profesor = auth.uid()
       or public.supervisado_por_mi(p_profesor)
       or coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false), false) then
    raise exception 'No supervisas a esa persona.' using errcode = '42501';
  end if;
  return query
  with al as (
    select distinct a.x as id
      from public.alumnos_de(p_profesor) a(x)
      join public.profiles p on p.id = a.x and p.role = 'alumno'
  ),
  ses as (
    select cs.id, cs.modalidad,
           least(extract(epoch from (coalesce(cs.ended_at, least(now(), v_hasta)) - cs.started_at)) / 60, 600) as mins
      from public.class_sessions cs
     where cs.created_by = p_profesor and cs.started_at >= v_desde and cs.started_at < v_hasta
  ),
  tar as (
    select f.situacion from public.tareas_con_avance(null, p_profesor) f
     where f.created_at >= v_desde and f.created_at < v_hasta
  ),
  exa as (
    select e.estado, e.nota from public.examenes e
     where e.profesor_id = p_profesor and e.created_at >= v_desde and e.created_at < v_hasta
  )
  select
    (select count(*)::int from al),
    (select count(distinct tp.student_id)::int from public.training_progress tp
      where tp.student_id in (select al.id from al) and tp.created_at >= v_desde and tp.created_at < v_hasta),
    (select count(*)::int from public.training_progress tp
      where tp.student_id in (select al.id from al) and tp.created_at >= v_desde and tp.created_at < v_hasta),
    (select count(*)::int from ses where ses.modalidad is distinct from 'presencial'),
    (select count(*)::int from ses where ses.modalidad = 'presencial'),
    (select coalesce(round(sum(greatest(ses.mins, 0))), 0)::int from ses),
    (select count(*)::int from public.class_attendance ca where ca.session_id in (select ses.id from ses)),
    (select count(*)::int from tar),
    (select count(*)::int from tar where tar.situacion = 'completada'),
    (select count(*)::int from tar where tar.situacion = 'vencida'),
    (select count(*)::int from exa),
    (select count(*)::int from exa where exa.estado in ('entregado', 'congelado')),
    (select round(avg(exa.nota), 2) from exa where exa.estado in ('entregado', 'congelado')),
    (select count(*)::int from public.notas_alumno n
      where n.profesor_id = p_profesor and n.created_at >= v_desde and n.created_at < v_hasta),
    (select count(*)::int from public.planes_clase pc
      where pc.profesor_id = p_profesor and pc.created_at >= v_desde and pc.created_at < v_hasta);
end;
$function$;
