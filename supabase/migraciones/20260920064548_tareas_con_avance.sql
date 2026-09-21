-- El avance, contado por la base.
-- SECURITY INVOKER, como las funciones de informes: quién puede preguntar por
-- quién lo sigue decidiendo la RLS de cada tabla. De regalo, un alumno que la
-- llama recibe solo sus propias tareas, así que su página y la del profesor
-- usan la MISMA función y la cuenta no queda escrita dos veces.
create or replace function public.tareas_con_avance(
  p_alumno     uuid    default null,
  p_profesor   uuid    default null,
  p_pendientes boolean default false
)
returns table (
  id uuid,
  profesor_id uuid,
  profesor_nombre text,
  alumno_id uuid,
  alumno_nombre text,
  titulo text,
  instrucciones text,
  vence_at timestamptz,
  created_at timestamptz,
  items jsonb,
  renglones integer,
  cumplidos integer,
  situacion text
)
language sql
stable
security invoker
set search_path to 'public'
as $$
with base as (
  select t.* from public.tareas t
  where (p_alumno   is null or t.alumno_id   = p_alumno)
    and (p_profesor is null or t.profesor_id = p_profesor)
),
avance as (
  select
    i.*,
    b.id as t_id,
    case i.meta_tipo
      -- Lo que no se puede medir lo dice el alumno.
      when 'completar' then (case when i.completada_at is not null then 1 else 0 end)::bigint

      -- Cuántos ejercicios DISTINTOS resolvió desde que se le mandó la tarea.
      -- "Distintos" y no "filas" porque repetir el mismo ejercicio no es
      -- avanzar; y "desde que se le mandó" porque lo que se pide son diez
      -- ejercicios nuevos, no diez que ya tenía hechos de antes.
      when 'cantidad' then (
        select count(distinct coalesce(
                 tp.detail->>'puzzle_id', tp.detail->>'lesson_id',
                 tp.detail->>'set_id',    tp.detail->>'linea_id',
                 tp.detail->>'nivel_id',  tp.detail->>'diagrama',
                 tp.id::text))
        from public.training_progress tp
        where tp.student_id = b.alumno_id
          and tp.activity = any(i.actividades)
          and tp.created_at >= b.created_at
          and (i.filtro_clave is null
               or tp.detail->>'theme'    = i.filtro_clave
               or tp.detail->>'category' = i.filtro_clave)
      )

      -- Los minutos se cuentan con la MISMA función que los informes (tramos
      -- superpuestos unidos antes de sumar): una tarea que dijera otro número
      -- que Informes sería peor que no tenerla.
      when 'minutos' then coalesce((
        select floor(m.minutos)::bigint
        from public.minutos_por_tramos((
          select array_agg((i.id::text, pa.joined_at, pa.left_at)::public.tramo_crudo)
          from public.platform_activity_log pa
          where pa.student_id = b.alumno_id
            and pa.activity = any(i.actividades)
            and pa.joined_at >= b.created_at
        )) m
        limit 1), 0)
    end as hecho
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
           'cumplido',       m.cumplido
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
    b.titulo, b.instrucciones, b.vence_at, b.created_at,
    coalesce(r.items, '[]'::jsonb)      as items,
    coalesce(r.renglones, 0)::integer   as renglones,
    coalesce(r.cumplidos, 0)::integer   as cumplidos,
    -- Igual que cobros_vista: la situación se calcula, no se guarda.
    -- "vencida" nunca es un estado guardado, porque habría que mantenerlo al
    -- día con un cron y podría contradecir a vence_at.
    case
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
order by vence_at;
$$;

revoke execute on function public.tareas_con_avance(uuid, uuid, boolean) from anon;