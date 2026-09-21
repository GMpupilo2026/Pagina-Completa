-- El candado de `activity` se quedó con las tres actividades del principio, así
-- que la base venía rechazando en silencio todo lo demás: el diagnóstico de
-- nivel, Concentración, Practicar, Mates y Táctica nunca llegaban a Informes
-- aunque el alumno los terminara. Se amplía a las actividades que existen hoy.
alter table public.training_progress drop constraint if exists training_progress_activity_check;

alter table public.training_progress
  add constraint training_progress_activity_check
  check (activity = any (array[
    '4x4', 'aprender', 'coordenadas', 'practicar', 'mates', 'tactica',
    'concentracion', 'diagnostico', 'desafios', 'temas'
  ]));

comment on constraint training_progress_activity_check on public.training_progress is
  'Actividades de Entrenamiento que se registran. Al crear una actividad nueva hay que añadirla aquí, o sus filas se rechazan sin aviso.';