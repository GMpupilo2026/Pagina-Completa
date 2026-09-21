-- Sin un orden fijo, pedir la función por páginas (que es como la lee
-- informes.html) podría repetir o saltarse renglones entre una página y otra.
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
full join empezados m on m.student_id = v.student_id
order by 1;
$$;

revoke execute on function public.informes_diagnosticos_alumnos() from public, anon;
grant execute on function public.informes_diagnosticos_alumnos() to authenticated;