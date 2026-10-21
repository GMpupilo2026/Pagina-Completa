-- La prueba de estilo como tarea (entreno/estilo.html).
--
-- El profe la pide desde Tareas, como el diagnóstico: una vez, sin cantidad.
-- Se cumple con una prueba guardada en estilo_pruebas DESPUÉS de la tarea,
-- no desde training_progress: la fila la escribe el alumno solo para sí y la
-- hora la pone la base, así que no hay un registro aparte que se pueda dar
-- por hecho sin rendirla. tareas_con_avance() es SECURITY INVOKER: la cuenta
-- la ve quien ya puede ver la prueba (el alumno, su profe, quien lo supervisa
-- y administración). Ver «La prueba de estilo como tarea» en
-- docs/decisiones/entrenamiento.md.

create or replace function public.tareas_con_avance(p_alumno uuid default null::uuid, p_profesor uuid default null::uuid, p_pendientes boolean default false, p_limite integer default null::integer)
 returns table(id uuid, profesor_id uuid, profesor_nombre text, alumno_id uuid, alumno_nombre text, titulo text, instrucciones text, vence_at timestamp with time zone, disponible_desde timestamp with time zone, created_at timestamp with time zone, items jsonb, renglones integer, cumplidos integer, situacion text)
 language sql
 stable
 set search_path to 'public'
as $function$
with base as (
  select t.* from public.tareas t
  where (p_alumno   is null or t.alumno_id   = p_alumno)
    and (p_profesor is null or t.profesor_id = p_profesor)
),
-- MATERIALIZED: sin esto, en el plan genérico de la función `hecho` se
-- recalcula en cada lugar que lo usa (15 785 subconsultas en vez de 340, ~6 s).
avance as materialized (
  select
    i.*,
    b.id as t_id,
    case
      -- El cuestionario: cada vez que lo contestó, guardado por la base.
      when i.material_slug = 'cuestionario' then (
        select count(*) from public.cuestionario_intentos ci where ci.tarea_item_id = i.id)

      -- La prueba de estilo: cada prueba guardada DESPUÉS de que el profe la
      -- pide (la hora la pone la base). Como el diagnóstico, es una medición:
      -- una de hace meses no cumple la tarea nueva.
      when i.material_slug = 'estilo' then (
        select count(*) from public.estilo_pruebas ep
        where ep.alumno_id = b.alumno_id and ep.created_at >= b.created_at)

      when i.meta_tipo = 'completar' then (case when i.completada_at is not null then 1 else 0 end)::bigint

      when i.meta_tipo = 'cantidad' then (
        select count(distinct coalesce(
                 tp.detail->>'puzzle_id', tp.detail->>'lesson_id',
                 tp.detail->>'set_id',    tp.detail->>'linea_id',
                 tp.detail->>'nivel_id',  tp.detail->>'diagrama',
                 tp.id::text))
        from public.training_progress tp
        where tp.student_id = b.alumno_id
          and tp.activity = any(i.actividades)
          and (i.filtro_clave is null
               or tp.detail->>'theme'    = i.filtro_clave
               or tp.detail->>'category' = i.filtro_clave
               or tp.detail->>'linea_id' = i.filtro_clave)
          -- El diagnóstico es una medición: solo vale el rendido DESPUÉS de
          -- que el profe lo pide. Uno de hace meses daría la tarea por hecha
          -- el día que nace.
          and (tp.activity <> 'diagnostico' or tp.created_at >= b.created_at)
      )

      -- CENFO: cada ejercicio de esas actividades hecho desde que se asignó la
      -- tarea vale como mínimo 2 minutos (ver minutos_minimos_por_ejercicio).
      when i.meta_tipo = 'minutos' then greatest(coalesce((
        select floor(m.minutos)::bigint
        from public.minutos_por_tramos((
          select array_agg((i.id::text, pa.joined_at, pa.left_at)::public.tramo_crudo)
          from public.platform_activity_log pa
          where pa.student_id = b.alumno_id
            and pa.activity = any(i.actividades)
            and pa.joined_at >= b.created_at
        )) m
        limit 1), 0),
        (select floor(public.minutos_minimos_por_ejercicio(pg.grupo) * count(tp.id))::bigint
         from public.training_progress tp
         join public.profiles pg on pg.id = tp.student_id
         where tp.student_id = b.alumno_id
           and tp.activity = any(i.actividades)
           and tp.created_at >= b.created_at
         group by pg.grupo))
    end as hecho,
    -- Cómo le fue: el primer intento (el que vale como nota: después ya vio
    -- las correctas), el mejor y cuántos lleva.
    case when i.material_slug = 'cuestionario' then (
      select jsonb_build_object(
               'intentos', count(*),
               'total',    (array_agg(ci.total    order by ci.created_at))[1],
               'primero',  (array_agg(ci.aciertos order by ci.created_at))[1],
               'mejor',    max(ci.aciertos))
      from public.cuestionario_intentos ci
      where ci.tarea_item_id = i.id
      having count(*) > 0)
    end as cuestionario
  from public.tarea_items i
  join base b on b.id = i.tarea_id
),
marcado as (
  select a.*,
         (case when a.meta_tipo = 'completar' then a.hecho >= 1
               else a.hecho >= a.meta_cantidad end) as cumplido
  from avance a
),
resumen as (
  select m.t_id,
         jsonb_agg(jsonb_build_object(
           'id',             m.id,
           'orden',          m.orden,
           'material_tipo',  m.material_tipo,
           'material_slug',  m.material_slug,
           'material_label', m.material_label,
           'material_href',  m.material_href,
           'filtro_clave',   m.filtro_clave,
           'filtro_label',   m.filtro_label,
           'leccion',        m.leccion,
           'meta_tipo',      m.meta_tipo,
           'meta_cantidad',  m.meta_cantidad,
           'hecho',          m.hecho,
           'cumplido',       m.cumplido,
           'cuestionario',   m.cuestionario
         ) order by m.orden, m.id) as items,
         count(*)                           as renglones,
         count(*) filter (where m.cumplido) as cumplidos
  from marcado m
  group by m.t_id
),
final as (
  select
    b.id, b.profesor_id, pp.full_name as profesor_nombre,
    b.alumno_id, pa.full_name as alumno_nombre,
    b.titulo, b.instrucciones, b.vence_at, b.disponible_desde, b.created_at,
    coalesce(r.items, '[]'::jsonb)      as items,
    coalesce(r.renglones, 0)::integer   as renglones,
    coalesce(r.cumplidos, 0)::integer   as cumplidos,
    case
      when b.disponible_desde > now() then 'programada'
      when coalesce(r.renglones,0) > 0 and r.cumplidos >= r.renglones then 'completada'
      when b.vence_at < now() then 'vencida'
      else 'pendiente'
    end as situacion
  from base b
  left join resumen r on r.t_id = b.id
  left join public.profiles pp on pp.id = b.profesor_id
  left join public.profiles pa on pa.id = b.alumno_id
)
select * from final
where not p_pendientes or situacion <> 'completada'
order by vence_at
limit p_limite;
$function$;