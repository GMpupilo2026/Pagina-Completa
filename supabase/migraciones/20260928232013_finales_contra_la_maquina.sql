-- «Finales contra la máquina» (entreno/finales.html): cada final ganado o
-- salvado se registra como actividad 'finales', para que lo vea el profesor en
-- Informes y cuente en las tareas y en el plan del diagnóstico. Sin sumarla al
-- CHECK, la base rechazaría esas filas sin que nada avisara. Solo se agrega
-- 'finales'; ninguna actividad existente cambia.
alter table public.training_progress drop constraint training_progress_activity_check;
alter table public.training_progress add constraint training_progress_activity_check
  check (activity = any (array[
    '4x4', 'aprender', 'coordenadas', 'practicar', 'mates', 'tactica',
    'concentracion', 'diagnostico', 'desafios', 'temas',
    'aperturas', 'confites', 'ilumina', 'visualizacion',
    'finales'
  ]));

comment on constraint training_progress_activity_check on public.training_progress is
  'Actividades de Entrenamiento que se registran. Al crear una actividad nueva hay que añadirla aquí, o sus filas se rechazan sin aviso.';
