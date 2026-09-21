-- El panel de la Academia (clases.html) le muestra a quien da clase lo que le
-- toca a ÉL: cuántos alumnos tiene, cuántos no han entrenado esta semana, y
-- cuántas de las tareas que mandó siguen sin hacerse. Antes veía su propio
-- progreso de ejercicios 4x4 (en cero, porque no es alumno).
--
-- La cuenta la hace la base y no el navegador, por lo de siempre: contar
-- "alumnos distintos con actividad" pide bajarse training_progress, y PostgREST
-- corta la respuesta a partir de cierta cantidad de filas SIN dar ningún error.
--
-- SECURITY INVOKER a propósito, igual que las funciones de informes: quién ve a
-- quién lo sigue decidiendo la RLS de cada tabla, y por eso acá no hay ni un
-- filtro de profesor sobre profiles ni sobre training_progress. Un profesor
-- recibe sus alumnos; quien administra, todos.
--
-- Las tareas SÍ llevan `profesor_id = auth.uid()` escrito: la política de
-- `tareas` deja ver también las de quien administra, y lo que el panel dice es
-- "las tareas que TÚ mandaste", no las de toda la plataforma.
create or replace function public.panel_profesor()
returns table (
  alumnos integer,
  activos_7d integer,
  tareas_pendientes integer,
  tareas_vencidas integer,
  clases_30d integer
)
language sql
security invoker
stable
set search_path = public
as $$
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
        and cs.started_at >= now() - interval '30 days');
$$;

revoke execute on function public.panel_profesor() from anon;
grant execute on function public.panel_profesor() to authenticated;