-- Precisión posicional, el Sonar y Batalla naval: cada tanda o partida
-- terminada se registra en training_progress, con el nombre que ya usaba su
-- registro de tiempo ('precision-posicional', 'sonar', 'batalla-naval').
--
-- Hasta acá las tres guardaban su resultado solo en el progreso de la cuenta
-- (training_state) y el tiempo en platform_activity_log: no sumaban a la meta
-- del día ni a la racha, no daban logros, no salían en «Cómo viene» y no se
-- podían pedir como tarea por cantidad. Con la fila entran a todo eso sin
-- tocar ninguna de esas cuentas: todas leen esta tabla.
--
-- Las filas no llevan puzzle_id ni nivel_id a propósito: son partidas nuevas
-- cada vez (el tesoro y la flota se esconden al azar; la tanda de Precisión
-- se sortea), así que tareas_con_avance() cuenta cada una (cae en tp.id).
--
-- Solo se agregan las tres; ninguna actividad existente cambia.
alter table public.training_progress drop constraint training_progress_activity_check;
alter table public.training_progress add constraint training_progress_activity_check
  check (activity = any (array[
    '4x4', 'aprender', 'coordenadas', 'practicar', 'mates', 'tactica',
    'concentracion', 'diagnostico', 'desafios', 'temas',
    'aperturas', 'confites', 'ilumina', 'visualizacion',
    'finales', 'preparacion', 'tipos',
    'precision-posicional', 'sonar', 'batalla-naval'
  ]));

comment on constraint training_progress_activity_check on public.training_progress is
  'Actividades de Entrenamiento que se registran. Al crear una actividad nueva hay que añadirla aquí, o sus filas se rechazan sin aviso.';
