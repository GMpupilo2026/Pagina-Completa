-- «De oído» (entreno/oido.html) escribe en training_progress con activity
-- 'oido': cada pregunta contestada cuenta para la meta del día, la racha y las
-- tareas. Sin esta línea la base rechazaría cada fila sin avisar. La lista es
-- la que había (20261112201131_training_progress_finales_clases.sql) más
-- 'oido'. Ver «De oído» en docs/decisiones/entrenamiento.md.
alter table public.training_progress drop constraint training_progress_activity_check;
alter table public.training_progress add constraint training_progress_activity_check
  check (activity = any (array[
    '4x4', 'aprender', 'coordenadas', 'practicar', 'mates', 'tactica',
    'concentracion', 'diagnostico', 'desafios', 'temas',
    'aperturas', 'confites', 'ilumina', 'visualizacion',
    'finales', 'preparacion', 'tipos',
    'precision-posicional', 'sonar', 'batalla-naval',
    'finales100', 'memoria', 'curso', 'finales_clases', 'oido'
  ]));
comment on constraint training_progress_activity_check on public.training_progress is
  'Actividades de Entrenamiento que se registran. Al crear una actividad nueva hay que añadirla aquí, o sus filas se rechazan sin aviso.';
