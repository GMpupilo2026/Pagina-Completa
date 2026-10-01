-- El cuestionario como tarea: el alumno lo contesta en su casa, a su ritmo
-- (cuestionario-tarea.html), y el profe ve cuánto sacó en «Tareas enviadas».
-- Ver «El cuestionario como tarea» en docs/decisiones/seguimiento-del-alumno.md.
--
-- Un renglón de tarea con material_slug 'cuestionario' y el id del cuestionario
-- en filtro_clave. El problema es que la opción correcta vive en
-- public.cuestionarios, que el alumno no puede leer. Así que:
--
--   1. public.cuestionario_intentos: cada vez que lo contesta, con lo que
--      eligió y cuántas acertó. Nadie la escribe desde afuera: la llena
--      contestar_cuestionario_de_tarea(), que es quien califica.
--   2. cuestionario_de_tarea(p_item): las preguntas SIN la correcta, al alumno
--      de esa tarea y a nadie más.
--   3. contestar_cuestionario_de_tarea(p_item, p_respuestas): califica en la
--      base, guarda el intento y recién ahí devuelve cuáles eran las correctas.
--   4. tareas_con_avance(): un renglón de cuestionario se cumple con un intento
--      (contado desde cuestionario_intentos, no desde training_progress, que el
--      alumno sí puede escribir), y trae el resultado para el profe.

-- 1. Los intentos -------------------------------------------------------------
create table if not exists public.cuestionario_intentos (
  id uuid primary key default gen_random_uuid(),
  tarea_item_id uuid not null references public.tarea_items(id) on delete cascade,
  alumno_id uuid not null references public.profiles(id) on delete cascade,
  -- Si el profe borra el cuestionario, el intento (el acta) se queda.
  cuestionario_id uuid references public.cuestionarios(id) on delete set null,
  respuestas jsonb not null,
  aciertos integer not null,
  total integer not null,
  created_at timestamptz not null default now(),
  -- Un CHECK que da NULL cuenta como aprobado: van envueltos en coalesce.
  constraint cuestionario_intentos_cuenta check (coalesce(total between 1 and 50 and aciertos between 0 and total, false)),
  constraint cuestionario_intentos_respuestas check (coalesce(jsonb_typeof(respuestas) = 'array'
    and jsonb_array_length(respuestas) = total, false))
);
create index if not exists cuestionario_intentos_item_idx
  on public.cuestionario_intentos (tarea_item_id, created_at);

alter table public.cuestionario_intentos enable row level security;

-- Lo ve quien ve el renglón de la tarea: el alumno, el profe que la mandó,
-- quien administra y quien supervisa (la RLS de tarea_items → tareas). El
-- conjunto se arma una vez, no fila por fila.
drop policy if exists cuestionario_intentos_select on public.cuestionario_intentos;
create policy cuestionario_intentos_select on public.cuestionario_intentos for select
  using (tarea_item_id in (select i.id from public.tarea_items i));
-- Sin políticas de escritura: solo la escribe contestar_cuestionario_de_tarea().

revoke all on public.cuestionario_intentos from anon, authenticated;
grant select on public.cuestionario_intentos to authenticated;

-- El renglón y su cuestionario, si quien pregunta es el alumno de esa tarea y
-- la tarea ya se destapó. El cuestionario tiene que ser uno listo o del mismo
-- profe que mandó la tarea: un id ajeno puesto a mano en filtro_clave no le
-- abre al alumno el cuestionario de otro profe.
create or replace function interno.cuestionario_del_renglon(p_item uuid)
returns table(item_id uuid, cuestionario_id uuid, titulo text, preguntas jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, c.id, c.titulo, c.preguntas
  from public.tarea_items i
  join public.tareas t on t.id = i.tarea_id
  join public.cuestionarios c on c.id::text = i.filtro_clave
  where i.id = p_item
    and i.material_slug = 'cuestionario'
    and t.alumno_id = (select auth.uid())
    and t.disponible_desde <= now()
    and (c.listo or c.profesor_id = t.profesor_id);
$$;
revoke execute on function interno.cuestionario_del_renglon(uuid) from public, anon, authenticated;

-- 2. Las preguntas, sin la correcta -------------------------------------------
create or replace function public.cuestionario_de_tarea(p_item uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
begin
  select * into r from interno.cuestionario_del_renglon(p_item);
  if r.item_id is null then
    raise exception 'Este cuestionario no está en ninguna de tus tareas.' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'titulo', r.titulo,
    'preguntas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'texto', p->>'texto',
               'opciones', p->'opciones',
               'fen', p->>'fen') order by n)
      from jsonb_array_elements(r.preguntas) with ordinality as x(p, n)), '[]'::jsonb));
end;
$$;
revoke execute on function public.cuestionario_de_tarea(uuid) from public, anon;
grant execute on function public.cuestionario_de_tarea(uuid) to authenticated;

-- 3. Contestar: califica la base ----------------------------------------------
create or replace function public.contestar_cuestionario_de_tarea(p_item uuid, p_respuestas jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  r record;
  v_total integer;
  v_aciertos integer;
  v_intentos integer;
begin
  -- El mismo candado que entrenar: sin el acceso vigente no se registra nada.
  if not coalesce(public.acceso_vigente(), false) then
    raise exception 'Tu acceso a la plataforma no está vigente.' using errcode = 'P0001';
  end if;
  select * into r from interno.cuestionario_del_renglon(p_item);
  if r.item_id is null then
    raise exception 'Este cuestionario no está en ninguna de tus tareas.' using errcode = 'P0001';
  end if;

  v_total := jsonb_array_length(r.preguntas);
  if v_total = 0 then
    raise exception 'El cuestionario no tiene preguntas.' using errcode = 'P0001';
  end if;
  -- Una respuesta por pregunta: el número de la opción, o null si la dejó en blanco.
  if coalesce(jsonb_typeof(p_respuestas) <> 'array' or jsonb_array_length(p_respuestas) <> v_total, true) then
    raise exception 'Las respuestas no coinciden con las preguntas.' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_respuestas) with ordinality as a(v, n)
    join jsonb_array_elements(r.preguntas) with ordinality as q(p, m) on m = n
    -- Un CASE y no un OR: el OR no promete evaluar en orden, y convertir a
    -- número un texto revienta.
    where case
      when jsonb_typeof(v) = 'null' then false
      when jsonb_typeof(v) <> 'number' then true
      when (v #>> '{}')::numeric <> floor((v #>> '{}')::numeric) then true
      else (v #>> '{}')::numeric < 0
        or (v #>> '{}')::numeric >= coalesce(jsonb_array_length(p->'opciones'), 0)
    end
  ) then
    raise exception 'Hay una respuesta que no es ninguna de las opciones.' using errcode = 'P0001';
  end if;

  -- Tope de cordura: repetirlo está bien, mil veces no.
  select count(*) into v_intentos from public.cuestionario_intentos where tarea_item_id = r.item_id;
  if v_intentos >= 20 then
    raise exception 'Ya lo contestaste 20 veces.' using errcode = 'P0001';
  end if;

  select count(*) into v_aciertos
  from jsonb_array_elements(p_respuestas) with ordinality as a(v, n)
  join jsonb_array_elements(r.preguntas) with ordinality as q(p, m) on m = n
  where jsonb_typeof(v) = 'number'
    and jsonb_typeof(p->'correcta') = 'number'
    and (v #>> '{}')::integer = (p->>'correcta')::integer;

  insert into public.cuestionario_intentos (tarea_item_id, alumno_id, cuestionario_id, respuestas, aciertos, total)
  values (r.item_id, (select auth.uid()), r.cuestionario_id, p_respuestas, v_aciertos, v_total);

  -- Recién con el intento guardado se dicen las correctas.
  return jsonb_build_object(
    'aciertos', v_aciertos,
    'total', v_total,
    'intento', v_intentos + 1,
    'correctas', (select jsonb_agg(p->'correcta' order by n)
                  from jsonb_array_elements(r.preguntas) with ordinality as x(p, n)));
end;
$$;
revoke execute on function public.contestar_cuestionario_de_tarea(uuid, jsonb) from public, anon;
grant execute on function public.contestar_cuestionario_de_tarea(uuid, jsonb) to authenticated;

-- 4. El avance de la tarea ----------------------------------------------------
-- Igual a la de 20260930043210 salvo el renglón de cuestionario: `hecho` son
-- los intentos y el renglón trae `cuestionario` (el primero, el mejor y
-- cuántos), que es lo que el profe viene a ver.
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
