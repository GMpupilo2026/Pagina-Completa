-- Cada tarea que ya estaba era un material suelto: se convierte en su renglón
-- único, de tipo 'completar' (que es como funcionaban: el alumno marcaba a
-- mano). Así hay UNA sola forma de leer una tarea y ninguna página tiene que
-- distinguir "de las de antes" de "de las de ahora". Las que ya estaban
-- completadas conservan su marca, o mañana aparecerían pendientes otra vez.
insert into public.tarea_items
  (tarea_id, orden, material_tipo, material_slug, material_label,
   material_href, leccion, meta_tipo, completada_at, created_at)
select t.id, 0, t.material_tipo, t.material_slug, t.material_label,
       t.material_href, t.leccion, 'completar',
       case when t.estado = 'completada' then coalesce(t.completada_at, t.created_at) end,
       t.created_at
from public.tareas t
where not exists (select 1 from public.tarea_items i where i.tarea_id = t.id);

-- A partir de acá `tareas.estado` y `tareas.completada_at` quedan SIN USO: la
-- situación la calcula tareas_con_avance() a partir de los renglones, igual
-- que cobros_vista. No se borran de la tabla — quitarlas obligaría a una
-- migración para nada, la misma decisión que se tomó con
-- game_state.shown_curso.
comment on column public.tareas.estado is
  'Sin uso desde la migracion de tareas con renglones: la situacion la calcula tareas_con_avance() a partir de tarea_items. Se conserva por las filas viejas.';
comment on column public.tareas.completada_at is
  'Sin uso: ver el comentario de tareas.estado.';
comment on column public.tareas.material_slug is
  'Eco del primer renglon (ver tarea_items). Lo que vale para el alumno es tarea_items.';