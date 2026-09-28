-- Informes: los módulos de Entrenamiento que el profesor no veía.
--
-- informes_resumen_alumnos() cuenta 4×4, Aprender, Coordenadas, Practicar,
-- Mates, Táctica, Concentración y Cursos. Ejercicios por tema, Visualización,
-- Tipos de entrenamiento, Aperturas y Precisión posicional no estaban: el
-- alumno practicaba y el profesor solo veía los minutos.
--
-- Es una función aparte y no columnas nuevas de informes_resumen_alumnos():
-- esa la usan también clases, cobros, formularios y subgrupos, y cambiarle el
-- tipo de retorno obliga a borrarla y volverla a crear.
--
-- De dónde sale cada número:
--   visualizacion, temas   ejercicios DISTINTOS en training_progress.
--   con_como_salio         de Temas y Táctica, los que ya guardan si salieron
--                          limpios (detail.limpio, desde #491); limpios, cuántos.
--   tipos_*                del espejo training_state 'tipos_estrellas_v1'
--                          ("tipo:id" → estrellas): con al menos una, y la suma.
--   aperturas_*            'aperturas_srs_v1': líneas empezadas (con «ultimo»)
--                          y firmes (intervalo de 21 días o más).
--   precision_*            'precision_posicional_historial_v1' (las últimas
--                          diez rondas, la más nueva primero): cuántas, y el
--                          porcentaje y la fecha de la última.
--
-- El espejo guarda el texto de localStorage tal cual: json_seguro() devuelve
-- NULL si está roto, y cada tipo se separa en su propio CTE materializado antes
-- de abrirlo (jsonb_each, jsonb_array_length), porque un AND no asegura el orden
-- en que se evalúa y un valor raro tumbaría el informe entero.
--
-- SECURITY INVOKER: cada quien recibe lo que la RLS de training_progress y
-- training_state le deja ver (el alumno lo suyo; el profesor, sus alumnos;
-- administración, todos; quien supervisa, los suyos).
create or replace function public.informes_entreno_modulos()
returns table (
  student_id uuid,
  visualizacion integer,
  temas integer,
  con_como_salio integer,
  limpios integer,
  tipos_ejercicios integer,
  tipos_estrellas integer,
  aperturas_empezadas integer,
  aperturas_firmes integer,
  precision_rondas integer,
  precision_ultima integer,
  precision_fecha timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
with alumnos as (
  select p.id from public.profiles p where p.role = 'alumno'
),
progreso as (
  select tp.student_id,
    count(distinct tp.detail->>'puzzle_id')
      filter (where tp.activity = 'visualizacion')::int as visualizacion,
    count(distinct tp.detail->>'puzzle_id')
      filter (where tp.activity = 'temas')::int as temas,
    count(distinct tp.detail->>'puzzle_id')
      filter (where tp.detail ? 'limpio')::int as con_como_salio,
    count(distinct tp.detail->>'puzzle_id')
      filter (where tp.detail->>'limpio' = 'true')::int as limpios
  from public.training_progress tp
  join alumnos a on a.id = tp.student_id
  where tp.activity in ('visualizacion', 'temas', 'tactica')
    and coalesce(tp.detail->>'puzzle_id', '') <> ''
  group by tp.student_id
),
espejo as materialized (
  select ts.student_id, ts.key, public.json_seguro(ts.value->>'raw') as v
  from public.training_state ts
  join alumnos a on a.id = ts.student_id
  where ts.key in ('tipos_estrellas_v1', 'aperturas_srs_v1', 'precision_posicional_historial_v1')
),
objetos as materialized (
  select student_id, key, v from espejo where jsonb_typeof(v) = 'object'
),
listas as materialized (
  select student_id, key, v from espejo where jsonb_typeof(v) = 'array'
),
tipos as (
  select o.student_id,
         count(*) filter (where (case when jsonb_typeof(x.value) = 'number' then (x.value #>> '{}')::numeric end) > 0)::int as ejercicios,
         coalesce(sum(case when jsonb_typeof(x.value) = 'number' then (x.value #>> '{}')::numeric end), 0)::int as estrellas
  from objetos o, jsonb_each(o.v) x
  where o.key = 'tipos_estrellas_v1'
  group by o.student_id
),
aperturas as (
  select o.student_id,
         count(*) filter (where (case when jsonb_typeof(x.value) = 'object' then x.value->>'ultimo' end) is not null)::int as empezadas,
         count(*) filter (where (case when jsonb_typeof(x.value) = 'object' then x.value->>'ultimo' end) is not null
                            and (case when jsonb_typeof(x.value->'intervalo') = 'number' then (x.value->>'intervalo')::numeric end) >= 21)::int as firmes
  from objetos o, jsonb_each(o.v) x
  where o.key = 'aperturas_srs_v1'
  group by o.student_id
),
precision_pp as (
  select e.student_id,
         jsonb_array_length(e.v)::int as rondas,
         case when jsonb_typeof(e.v->0->'porcentaje') = 'number' then round((e.v->0->>'porcentaje')::numeric)::int end as ultima,
         public.fecha_segura(e.v->0->>'fecha') as fecha
  from listas e
  where e.key = 'precision_posicional_historial_v1' and e.v <> '[]'::jsonb
)
select a.id,
       coalesce(p.visualizacion, 0), coalesce(p.temas, 0), coalesce(p.con_como_salio, 0), coalesce(p.limpios, 0),
       coalesce(t.ejercicios, 0), coalesce(t.estrellas, 0),
       coalesce(ap.empezadas, 0), coalesce(ap.firmes, 0),
       coalesce(pp.rondas, 0), pp.ultima, pp.fecha
from alumnos a
left join progreso p on p.student_id = a.id
left join tipos t on t.student_id = a.id
left join aperturas ap on ap.student_id = a.id
left join precision_pp pp on pp.student_id = a.id
order by a.id;
$$;
revoke execute on function public.informes_entreno_modulos() from public, anon;
grant execute on function public.informes_entreno_modulos() to authenticated;
