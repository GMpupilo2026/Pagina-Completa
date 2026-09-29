-- Logros que no son «cuántos»: ganarle un duelo a la computadora en Batalla
-- naval, tandas de Precisión posicional con 70 % o más y tesoros del Sonar
-- con tres estrellas. progreso_dias_y_racha() solo cuenta filas por
-- actividad, y su `por_actividad` lo suman otras pantallas (el panel), así
-- que no se le agregan claves: va aparte y la pide js/logros.js a la par.
--
-- SECURITY INVOKER (por omisión): quién puede ver los hitos de quién lo
-- decide la RLS de training_progress, igual que la racha.
create or replace function public.logros_hitos(alumno uuid default auth.uid())
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  select jsonb_build_object(
    'duelos_ganados', count(*) filter (where tp.activity = 'batalla-naval' and tp.detail->>'duelo' = 'true' and tp.detail->>'gano' = 'true'),
    'tandas_70', count(*) filter (where tp.activity = 'precision-posicional'
                                    and jsonb_typeof(tp.detail->'porcentaje') = 'number'
                                    and (tp.detail->>'porcentaje')::numeric >= 70),
    'tesoros_3', count(*) filter (where tp.activity = 'sonar' and tp.detail->>'estrellas' = '3')
  )
  from public.training_progress tp
  where tp.student_id = alumno
    and tp.activity in ('batalla-naval', 'precision-posicional', 'sonar');
$$;
revoke execute on function public.logros_hitos(uuid) from public, anon;
grant execute on function public.logros_hitos(uuid) to authenticated;
