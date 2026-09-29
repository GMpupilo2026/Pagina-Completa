-- «Tu semana» en el informe a la casa: los ejercicios del periodo y cuántos
-- salieron sin error ni pista, contra el periodo anterior del mismo largo
-- (la semana anterior, el mes anterior, ayer). Es lo mismo que el alumno ve en
-- el hub (entreno_mi_semana), y la casa solo veía minutos y días: no sabía si
-- venía mejorando.
--
-- `con` son los que dicen cómo salieron (detail ? 'limpio'): los que no lo
-- dicen no cuentan ni a favor ni en contra del porcentaje.
--
-- SECURITY INVOKER (por omisión): la RLS de training_progress decide, igual
-- que en el resto de informe_de_alumno().
create or replace function public.entreno_comparado(p_alumno uuid, p_desde timestamptz, p_hasta timestamptz)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  with filas as (
    select case when tp.created_at >= p_desde then 'esta' else 'anterior' end as periodo, tp.detail
    from public.training_progress tp
    where tp.student_id = p_alumno
      and tp.created_at >= p_desde - (p_hasta - p_desde)
      and tp.created_at < p_hasta
  )
  select jsonb_build_object('comparacion', jsonb_build_object(
    'esta', count(*) filter (where periodo = 'esta'),
    'esta_con', count(*) filter (where periodo = 'esta' and detail ? 'limpio'),
    'esta_limpios', count(*) filter (where periodo = 'esta' and detail->>'limpio' = 'true'),
    'anterior', count(*) filter (where periodo = 'anterior'),
    'anterior_con', count(*) filter (where periodo = 'anterior' and detail ? 'limpio'),
    'anterior_limpios', count(*) filter (where periodo = 'anterior' and detail->>'limpio' = 'true')
  ))
  from filas;
$$;
revoke execute on function public.entreno_comparado(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.entreno_comparado(uuid, timestamptz, timestamptz) to authenticated;

-- Se suma a la cola de informe_de_alumno() a partir de su definición vigente,
-- como los premios (20260926202544): no se copia a mano la función entera.
do $$
declare
  d text := pg_get_functiondef('public.informe_de_alumno(uuid, timestamptz, timestamptz)'::regprocedure);
  viejo text := '|| public.premios_de_alumno(p_alumno, p_desde, p_hasta)';
begin
  if position(viejo in d) = 0 then
    raise exception 'informe_de_alumno() ya no termina como se esperaba';
  end if;
  if position('entreno_comparado' in d) = 0 then
    execute replace(d, viejo, viejo || E'\n|| public.entreno_comparado(p_alumno, p_desde, p_hasta)');
  end if;
end $$;
