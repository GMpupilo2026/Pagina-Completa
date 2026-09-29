-- La ficha de Memoria (entreno/memoria.html, #560) cuenta: cada posición
-- reconstruida escribe una fila en training_progress ('memoria', con piezas,
-- segundos y si salió sin un error). Así suma a la meta del día, la racha,
-- los logros, «Cómo viene» y las tareas, como Fotografía dentro de Tipos.
-- Solo se agrega 'memoria'; la lista es la que había.
alter table public.training_progress drop constraint training_progress_activity_check;
alter table public.training_progress add constraint training_progress_activity_check
  check (activity = any (array[
    '4x4', 'aprender', 'coordenadas', 'practicar', 'mates', 'tactica',
    'concentracion', 'diagnostico', 'desafios', 'temas',
    'aperturas', 'confites', 'ilumina', 'visualizacion',
    'finales', 'preparacion', 'tipos',
    'precision-posicional', 'sonar', 'batalla-naval',
    'finales100', 'memoria'
  ]));
comment on constraint training_progress_activity_check on public.training_progress is
  'Actividades de Entrenamiento que se registran. Al crear una actividad nueva hay que añadirla aquí, o sus filas se rechazan sin aviso.';

-- Y el logro de Memoria: la mayor cantidad de piezas reconstruida sin un
-- error (memoria_max_limpia). Misma función, mismos permisos.
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
    'tesoros_3', count(*) filter (where tp.activity = 'sonar' and tp.detail->>'estrellas' = '3'),
    'memoria_max_limpia', coalesce(max(case when tp.activity = 'memoria' and tp.detail->>'limpio' = 'true'
                                              and jsonb_typeof(tp.detail->'piezas') = 'number'
                                            then (tp.detail->>'piezas')::int end), 0)
  )
  from public.training_progress tp
  where tp.student_id = alumno
    and tp.activity in ('batalla-naval', 'precision-posicional', 'sonar', 'memoria');
$$;
revoke execute on function public.logros_hitos(uuid) from public, anon;
grant execute on function public.logros_hitos(uuid) to authenticated;
