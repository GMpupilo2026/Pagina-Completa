
-- Se baja de 7 a 4 días el umbral de "sin entrenar" en panel_profesor() (Tu
-- semana, clases.html) e informes_inactivos() (la lista en informes.html),
-- para que ambos sigan contando exactamente lo mismo.
create or replace function public.panel_profesor()
 returns table(alumnos integer, activos_7d integer, tareas_pendientes integer, tareas_vencidas integer, tareas_puestas integer, clases_30d integer, clases_dadas integer, con_diagnostico integer, con_plan integer)
 language sql
 stable
 set search_path to 'public'
as $function$
  with mias as (
    select f.situacion from public.tareas_con_avance(null, auth.uid()) f
  )
  select
    (select count(*)::int
       from profiles p
      where p.role = 'alumno'),
    (select count(distinct tp.student_id)::int
       from training_progress tp
      where tp.created_at >= now() - interval '4 days'),
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
    (select count(*)::int
       from public.informes_diagnosticos_alumnos() d
      where d.detalle is not null),
    (select count(*)::int
       from training_plans tpl
       join profiles p on p.id = tpl.student_id and p.role = 'alumno'
      where tpl.shared);
$function$;

create or replace function public.informes_inactivos(p_dias integer default 4)
returns table(id uuid, full_name text, email text, grupo text, ultima_actividad timestamptz)
language sql
stable
set search_path to 'public'
as $$
  select p.id, p.full_name, p.email, p.grupo, ua.ultima
  from public.profiles p
  left join (
    select tp.student_id, max(tp.created_at) as ultima
    from public.training_progress tp
    group by tp.student_id
  ) ua on ua.student_id = p.id
  where p.role = 'alumno'
    and (ua.ultima is null or ua.ultima < now() - (greatest(coalesce(p_dias, 4), 0) || ' days')::interval)
  order by ua.ultima asc nulls first,
           coalesce(nullif(p.full_name, ''), p.email) collate "es-CR-x-icu";
$$;
