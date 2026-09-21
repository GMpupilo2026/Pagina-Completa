-- El plan de entrenamiento existe desde hace meses: se genera solo desde el
-- diagnostico, se ensena entero en Informes y tiene su boton de compartir. Y
-- `training_plans` tiene CERO filas. O sea que ningun alumno tiene plan, y
-- ningun informe a la casa puede ensenar uno.
--
-- Nada avisaba de eso, porque un cero que no se pinta en ninguna parte no lo ve
-- nadie. El panel del profesor ya cuenta lo que hay que perseguir --alumnos sin
-- entrenar, tareas vencidas--, asi que estos dos numeros van ahi:
--
--   con_diagnostico : cuantos de sus alumnos lo rindieron. Sin diagnostico no
--                     hay plan posible, asi que es el primer cuello.
--   con_plan        : a cuantos les COMPARTIO el plan. Sin compartir no lo ve
--                     ni el alumno ni su casa, asi que un plan guardado y no
--                     compartido cuenta como que no existe.
--
-- SECURITY INVOKER como el resto de las de informes: quien es alumno de quien
-- lo decide la RLS y no hay un solo filtro de profesor escrito acá.

drop function if exists public.panel_profesor();

create function public.panel_profesor()
returns table(alumnos integer, activos_7d integer, tareas_pendientes integer,
              tareas_vencidas integer, clases_30d integer,
              con_diagnostico integer, con_plan integer)
language sql
stable
set search_path to 'public'
as $function$
  select
    (select count(*)::int
       from profiles p
      where p.role = 'alumno'),
    (select count(distinct tp.student_id)::int
       from training_progress tp
      where tp.created_at >= now() - interval '7 days'),
    (select count(*)::int
       from tareas t
      where t.profesor_id = auth.uid()
        and t.estado = 'pendiente'),
    (select count(*)::int
       from tareas t
      where t.profesor_id = auth.uid()
        and t.estado = 'pendiente'
        and t.vence_at < now()),
    (select count(*)::int
       from class_sessions cs
      where cs.created_by = auth.uid()
        and cs.started_at >= now() - interval '30 days'),
    -- El diagnóstico vigente lo resuelve informes_diagnosticos_alumnos(), que
    -- ya mira training_progress y el espejo training_state: contarlo por
    -- separado aquí daría otro número que Informes para el mismo alumno.
    (select count(*)::int
       from public.informes_diagnosticos_alumnos() d
      where d.detalle is not null),
    (select count(*)::int
       from training_plans tpl
       join profiles p on p.id = tpl.student_id and p.role = 'alumno'
      where tpl.shared);
$function$;

revoke execute on function public.panel_profesor() from public;
grant execute on function public.panel_profesor() to authenticated;