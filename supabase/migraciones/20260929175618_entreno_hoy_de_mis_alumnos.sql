-- «Hoy entrenaron», en el panel del profesor: cada alumno que entrenó hoy,
-- cuántos ejercicios hizo y cuántos salieron limpios de los que dicen cómo
-- salieron. Es el resumen del día del hub (entreno_resumen_hoy), visto desde
-- el otro lado del escritorio. Hoy es el día de Costa Rica.
--
-- SECURITY INVOKER: quién es alumno de quién lo decide la RLS de
-- training_progress y de profiles; acá no hay ni un filtro de profesor. Una
-- fila por alumno que entrenó hoy, de más a menos.
create or replace function public.entreno_hoy_de_mis_alumnos()
returns table (
  student_id uuid,
  nombre text,
  ejercicios integer,
  con_como_salio integer,
  limpios integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select tp.student_id,
         p.full_name,
         count(*)::int,
         count(*) filter (where tp.detail ? 'limpio')::int,
         count(*) filter (where tp.detail->>'limpio' = 'true')::int
  from public.training_progress tp
  join public.profiles p on p.id = tp.student_id and p.role = 'alumno'
  where (tp.created_at at time zone 'America/Costa_Rica')::date = (now() at time zone 'America/Costa_Rica')::date
    and tp.student_id <> (select auth.uid())
  group by tp.student_id, p.full_name
  order by count(*) desc, p.full_name;
$$;
revoke execute on function public.entreno_hoy_de_mis_alumnos() from public, anon;
grant execute on function public.entreno_hoy_de_mis_alumnos() to authenticated;