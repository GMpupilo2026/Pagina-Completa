with topes(slug, clave, tope) as (values
  ('practicas', '', 9), ('practicas', 'tacticas', 4), ('practicas', 'mates', 3), ('practicas', 'finales', 2),
  ('aprender', '', 21), ('aprender', 'movimientos', 12), ('aprender', 'reglas', 5), ('aprender', 'tacticas', 4)
)
update public.tarea_items i
   set meta_cantidad = t.tope
  from topes t
 where i.meta_tipo = 'cantidad'
   and i.material_slug = t.slug
   and coalesce(i.filtro_clave, '') = t.clave
   and i.meta_cantidad > t.tope;