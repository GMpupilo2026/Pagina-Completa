-- «Posiciones de las clases» (entreno/finales.html?banco=clases) escribe en
-- training_progress con activity 'finales_clases', con la posición en
-- detail.theme, para que una tarea pida una posición puntual y no se cuente
-- junto con los finales de libro. Sin esta línea la base rechazaría cada fila
-- sin avisar. La lista es la que había (20260929213024_training_progress_curso.sql)
-- más 'finales_clases'. Ver «Las posiciones de las clases, para practicarlas
-- contra el motor» en docs/decisiones/accesibilidad.md.
alter table public.training_progress drop constraint training_progress_activity_check;
alter table public.training_progress add constraint training_progress_activity_check
  check (activity = any (array[
    '4x4', 'aprender', 'coordenadas', 'practicar', 'mates', 'tactica',
    'concentracion', 'diagnostico', 'desafios', 'temas',
    'aperturas', 'confites', 'ilumina', 'visualizacion',
    'finales', 'preparacion', 'tipos',
    'precision-posicional', 'sonar', 'batalla-naval',
    'finales100', 'memoria', 'curso', 'finales_clases'
  ]));
comment on constraint training_progress_activity_check on public.training_progress is
  'Actividades de Entrenamiento que se registran. Al crear una actividad nueva hay que añadirla aquí, o sus filas se rechazan sin aviso.';
