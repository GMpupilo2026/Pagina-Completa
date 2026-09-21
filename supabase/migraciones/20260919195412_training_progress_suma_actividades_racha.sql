
-- Logros y racha de días: para que "cualquier tipo de ejercicio" cuente de
-- verdad, se suman al CHECK las cuatro actividades que hoy solo viven en
-- localStorage (Aperturas y celadas, Confites del caballo, Ilumina el
-- tablero y Visualización), que hasta ahora ni lo intentaban por este mismo
-- motivo. No se toca ninguna actividad existente.
alter table public.training_progress drop constraint training_progress_activity_check;
alter table public.training_progress add constraint training_progress_activity_check
  check (activity = any (array[
    '4x4', 'aprender', 'coordenadas', 'practicar', 'mates', 'tactica',
    'concentracion', 'diagnostico', 'desafios', 'temas',
    'aperturas', 'confites', 'ilumina', 'visualizacion'
  ]));
