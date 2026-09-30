-- «Tu próxima clase» en el panel del alumno.
--
-- El horario (horario_clases) solo lo leen su profesor, su supervisión y
-- administración: la RLS no se abre al alumnado, que vería el horario entero
-- de su profe (los otros grupos, los subgrupos). Esta función le contesta al
-- alumno UNA cosa: cuándo es SU próxima clase.
--
-- Qué clase es «suya» es la misma regla con que asistencia.html marca a los
-- del grupo al pasar lista (alumnosDelHorario):
-- - la del subgrupo en el que está;
-- - la de un grupo igual al suyo (profiles.grupo), sin tildes ni mayúsculas;
-- - una clase sin grupo ni subgrupo no es de nadie en particular: no cuenta.
-- Y siempre de uno de SUS profesores (interno.profesores_de), no de cualquiera
-- que tenga un grupo con el mismo nombre en otra academia.
--
-- Cuándo tocaba la cuenta ocurrencias_horario(), la misma del informe y del
-- aviso de la ficha que falta. Se mira una semana: el horario es semanal.
create or replace function public.mi_proxima_clase()
returns table (inicio timestamptz, fin timestamptz, titulo text, modalidad text, profesor text)
language sql stable security definer
set search_path to 'public'
as $$
  with yo as (
    select p.id, translate(lower(btrim(coalesce(p.grupo, ''))), 'áéíóúüñ', 'aeiouun') as g
      from public.profiles p
     where p.id = (select auth.uid())
  ),
  mios as (
    select h.id, h.profesor_id, h.titulo
      from public.horario_clases h, yo
     where h.profesor_id in (select interno.profesores_de(yo.id))
       and ((h.subgrupo_id is not null
             and exists (select 1 from public.subgrupo_alumnos sa
                          where sa.subgrupo_id = h.subgrupo_id and sa.alumno_id = yo.id))
         or (h.subgrupo_id is null and h.grupo is not null and yo.g <> ''
             and translate(lower(btrim(h.grupo)), 'áéíóúüñ', 'aeiouun') = yo.g))
  )
  select o.inicio, o.fin, nullif(btrim(m.titulo), ''), o.modalidad,
         nullif(btrim(pr.full_name), '')
    from mios m
    cross join lateral public.ocurrencias_horario(
      m.profesor_id,
      (now() at time zone 'America/Costa_Rica')::date,
      (now() at time zone 'America/Costa_Rica')::date + 7) o
    join public.profiles pr on pr.id = m.profesor_id
   where o.horario_id = m.id
     and o.fin > now()
   order by o.inicio
   limit 1;
$$;
revoke execute on function public.mi_proxima_clase() from public, anon;
grant execute on function public.mi_proxima_clase() to authenticated;
