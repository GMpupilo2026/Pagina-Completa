-- Tipos de entrenamiento (entreno/tipos.html): cada ejercicio resuelto por
-- primera vez se registra como actividad 'tipos'.
--
-- Hasta acá la página guardaba sus estrellas solo en el progreso de la cuenta
-- (training_state, 'tipos_estrellas_v1'), y nada más: 1211 ejercicios que no
-- sumaban a la meta del día ni a la racha, ni daban logros, ni salían en
-- «Cómo viene», ni se podían pedir como tarea. Con la fila en training_progress
-- entran a todo eso sin tocar ninguna de esas cuentas: todas leen esta tabla.
--
-- La fila lleva detail.puzzle_id = "tipo:id" (el ejercicio, para contar
-- distintos) y detail.category = el tipo («detective», «amenaza»…), que es el
-- recorte con el que tareas_con_avance() filtra un renglón sin cambiar nada.
--
-- Solo se agrega 'tipos'; ninguna actividad existente cambia (la lista es la
-- que había, con 'preparacion' incluida).
alter table public.training_progress drop constraint training_progress_activity_check;
alter table public.training_progress add constraint training_progress_activity_check
  check (activity = any (array[
    '4x4', 'aprender', 'coordenadas', 'practicar', 'mates', 'tactica',
    'concentracion', 'diagnostico', 'desafios', 'temas',
    'aperturas', 'confites', 'ilumina', 'visualizacion',
    'finales', 'preparacion', 'tipos'
  ]));

comment on constraint training_progress_activity_check on public.training_progress is
  'Actividades de Entrenamiento que se registran. Al crear una actividad nueva hay que añadirla aquí, o sus filas se rechazan sin aviso.';