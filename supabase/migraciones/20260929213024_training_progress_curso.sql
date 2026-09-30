-- «Marcar lección como estudiada» (js/curso-academia.js) escribe en
-- training_progress con activity 'curso', pero 'curso' nunca estuvo en el
-- CHECK: la base rechazaba cada fila y el alumno veía «No se pudo guardar el
-- avance», sin que se hubiera guardado nunca ninguna. Solo se agrega 'curso';
-- la lista es la que había (20260929171852_memoria_cuenta.sql).
alter table public.training_progress drop constraint training_progress_activity_check;
alter table public.training_progress add constraint training_progress_activity_check
  check (activity = any (array[
    '4x4', 'aprender', 'coordenadas', 'practicar', 'mates', 'tactica',
    'concentracion', 'diagnostico', 'desafios', 'temas',
    'aperturas', 'confites', 'ilumina', 'visualizacion',
    'finales', 'preparacion', 'tipos',
    'precision-posicional', 'sonar', 'batalla-naval',
    'finales100', 'memoria', 'curso'
  ]));
comment on constraint training_progress_activity_check on public.training_progress is
  'Actividades de Entrenamiento que se registran. Al crear una actividad nueva hay que añadirla aquí, o sus filas se rechazan sin aviso.';