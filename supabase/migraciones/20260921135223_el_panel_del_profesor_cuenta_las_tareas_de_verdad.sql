-- El panel del profesor contaba las tareas por `tareas.estado`, que es una
-- columna SIN USO: la situación de una tarea (pendiente/vencida/completada) la
-- calcula `tareas_con_avance()` a partir de sus renglones, igual que
-- `cobros_vista`, y `estado` nunca vale 'vencida'. Medido con los datos de hoy:
-- dos tareas que el alumno YA terminó salían contadas como pendientes Y
-- vencidas, o sea que el único número que le pide al profesor hacer algo venía
-- inflado, sin que nada fallara.
--
-- Y se suman dos columnas que el panel necesita para decirle a un profesor
-- nuevo por dónde empezar: cuántas tareas ha puesto EN TOTAL (que no es lo
-- mismo que cuántas están pendientes — con todas hechas, las pendientes son
-- cero igual que si no hubiera puesto ninguna) y cuántas clases ha dado desde
-- siempre (`clases_30d` no distingue "nunca" de "este mes no").
drop function if exists public.panel_profesor();

create function public.panel_profesor()
returns table(
  alumnos integer,
  activos_7d integer,
  tareas_pendientes integer,
  tareas_vencidas integer,
  tareas_puestas integer,
  clases_30d integer,
  clases_dadas integer,
  con_diagnostico integer,
  con_plan integer)
language sql
stable
set search_path to 'public'
as $function$
  with mias as (
    -- El filtro de profesor va ESCRITO, como antes: la política de `tareas`
    -- deja ver también las de quien administra, y lo que el panel dice es
    -- "las tareas que TÚ mandaste", no las de toda la plataforma.
    select f.situacion from public.tareas_con_avance(null, auth.uid()) f
  )
  select
    (select count(*)::int
       from profiles p
      where p.role = 'alumno'),
    (select count(distinct tp.student_id)::int
       from training_progress tp
      where tp.created_at >= now() - interval '7 days'),
    (select count(*)::int from mias where situacion <> 'completada'),
    (select count(*)::int from mias where situacion =  'vencida'),
    (select count(*)::int
       from tareas t
      where t.profesor_id = auth.uid()),
    (select count(*)::int
       from class_sessions cs
      where cs.created_by = auth.uid()
        and cs.started_at >= now() - interval '30 days'),
    (select count(*)::int
       from class_sessions cs
      where cs.created_by = auth.uid()),
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

revoke execute on function public.panel_profesor() from public, anon;
grant  execute on function public.panel_profesor() to authenticated;