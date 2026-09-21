-- Un renglón por alumno y curso empezado: los temas que lleva estudiados sobre
-- el total del curso y cuál fue el último. Sale de las mismas filas
-- training_progress con activity = 'curso' que antes se bajaban enteras.
create or replace function public.informes_cursos_alumnos()
returns table (
  student_id uuid,
  slug text,
  titulo text,
  total integer,
  hechos integer,
  ultimo_titulo text,
  ultima_fecha timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
with base as (
  select tp.student_id,
         tp.detail->>'curso' as slug,
         tp.detail->>'leccion' as leccion,
         nullif(tp.detail->>'curso_titulo', '') as curso_titulo,
         case when jsonb_typeof(tp.detail->'total') = 'number'
              then (tp.detail->>'total')::int end as total,
         coalesce(nullif(tp.detail->>'titulo', ''), tp.detail->>'leccion') as tema,
         tp.created_at
  from public.training_progress tp
  join public.profiles p on p.id = tp.student_id and p.role = 'alumno'
  where tp.activity = 'curso'
    and coalesce(tp.detail->>'curso', '') <> ''
    and coalesce(tp.detail->>'leccion', '') <> ''
)
select b.student_id,
       b.slug,
       -- El título del curso lo trae cada fila; vale el del apunte más reciente,
       -- y si ninguna lo trajo queda el propio identificador.
       coalesce((array_agg(b.curso_titulo order by b.created_at desc)
                 filter (where b.curso_titulo is not null))[1], b.slug),
       coalesce(max(b.total), 0),
       count(distinct b.leccion)::int,
       (array_agg(b.tema order by b.created_at desc))[1],
       max(b.created_at)
from base b
group by b.student_id, b.slug
order by b.student_id, 3;
$$;

revoke execute on function public.informes_cursos_alumnos() from public, anon;
grant execute on function public.informes_cursos_alumnos() to authenticated;

-- Las tres tarjetas de arriba del resumen. Son cuentas, no listas: antes se
-- bajaban las tres tablas enteras para hacer .length en el navegador.
create or replace function public.informes_totales()
returns table (clases_cerradas integer, preguntas integer, partidas integer)
language sql
stable
security invoker
set search_path = public
as $$
select (select count(*)::int from public.class_sessions where ended_at is not null),
       (select count(*)::int from public.questions),
       (select count(*)::int from public.saved_games);
$$;

revoke execute on function public.informes_totales() from public, anon;
grant execute on function public.informes_totales() to authenticated;

-- El diagnóstico vigente de cada alumno (el más reciente) y, si dejó uno a
-- medias, por qué pregunta iba. De los dos lugares donde puede estar —la tabla
-- training_progress y el espejo de progreso training_state— gana el más nuevo,
-- igual que hacía el navegador. Devuelve como mucho un renglón por alumno, en
-- vez del training_state entero, que es una fila por clave y por alumno.
create or replace function public.informes_diagnosticos_alumnos()
returns table (
  student_id uuid,
  detalle jsonb,
  fecha timestamptz,
  a_medias_pregunta integer,
  a_medias_fecha timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
with alumnos as (
  select p.id from public.profiles p where p.role = 'alumno'
),
desde_progreso as (
  select tp.student_id, tp.detail as detalle, tp.created_at as fecha
  from public.training_progress tp
  join alumnos a on a.id = tp.student_id
  where tp.activity = 'diagnostico' and tp.detail ? 'areas'
),
-- El espejo guarda el texto tal cual lo escribió localStorage, así que el JSON
-- de dentro puede estar roto: json_seguro devuelve NULL en vez de fallar.
espejo as (
  select ts.student_id, public.json_seguro(ts.value->>'raw') as guardado, ts.updated_at
  from public.training_state ts
  join alumnos a on a.id = ts.student_id
  where ts.key = 'diagnostico_resultado_v1'
),
desde_espejo as (
  select e.student_id,
         e.guardado->'detalle' as detalle,
         coalesce(public.fecha_segura(e.guardado->'detalle'->>'fecha'),
                  public.fecha_segura(e.guardado->>'fecha'),
                  e.updated_at) as fecha
  from espejo e
  where e.guardado is not null and (e.guardado->'detalle') ? 'areas'
),
vigente as (
  select distinct on (t.student_id) t.student_id, t.detalle, t.fecha
  from (select * from desde_progreso union all select * from desde_espejo) t
  order by t.student_id, t.fecha desc
),
a_medias as (
  select ts.student_id,
         (public.json_seguro(ts.value->>'raw')->'estado'->>'idx') as idx,
         ts.updated_at
  from public.training_state ts
  join alumnos a on a.id = ts.student_id
  where ts.key = 'diagnostico_estado_v1'
),
empezados as (
  -- idx es en cuántas preguntas va; se muestra la siguiente, que es la que
  -- tiene enfrente. Cero no cuenta: es haberlo abierto y no contestar nada.
  select student_id, (idx::int) + 1 as pregunta, updated_at
  from a_medias
  where idx ~ '^[0-9]+$' and idx::int > 0
)
select coalesce(v.student_id, m.student_id), v.detalle, v.fecha, m.pregunta, m.updated_at
from vigente v
full join empezados m on m.student_id = v.student_id;
$$;

revoke execute on function public.informes_diagnosticos_alumnos() from public, anon;
grant execute on function public.informes_diagnosticos_alumnos() to authenticated;

-- Índices por alumno que faltaban. A treinta alumnos no se notan; con mil, cada
-- consulta de un alumno puntual recorre la tabla entera sin ellos.
-- (training_state no necesita uno: su clave primaria ya empieza por student_id.)
create index if not exists class_presence_log_student_idx
  on public.class_presence_log (student_id);
create index if not exists class_attendance_student_idx
  on public.class_attendance (student_id);
create index if not exists question_answers_student_idx
  on public.question_answers (student_id, created_at desc);