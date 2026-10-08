-- Accesorios de avatar: gorros y adornos que se canjean con Puntos Ajedrez y
-- se ven en la foto de perfil, no solo en la propia pantalla. A diferencia
-- del título o el marco (que hoy solo se muestran en el panel y la tienda de
-- quien los tiene), el accesorio lo ve el profesor en «Alumnos conectados»
-- de la clase en vivo: el mismo tipo de premio que ya existía
-- (premios_catalogo/premios_canjeados/canjear_premio/equipar_premio, de
-- 20261008150000_puntos_acumulados.sql), solo que con una función aparte
-- para pedir el de VARIAS personas de una vez (accesorios_de), que es como se
-- necesita en un listado de alumnos y no uno por uno.
set local lock_timeout = '8s';

alter table public.premios_catalogo drop constraint premios_catalogo_tipo_efecto_check;
alter table public.premios_catalogo add constraint premios_catalogo_tipo_efecto_check
  check (tipo_efecto in ('titulo', 'marco_perfil', 'doble_puntos', 'curso_adelanto', 'material_tienda', 'accesorio_avatar'));

insert into public.premios_catalogo (clave, nombre, descripcion, emoji, categoria, tipo_efecto, costo_puntos, parametros, limite_por_alumno, orden) values
  ('accesorio_gatito', 'Orejas de gato', 'Un adorno en tu foto de perfil que ven tu profesor y tus compañeros en la clase en vivo.', '🐱', 'cosmetico', 'accesorio_avatar', 100, '{}'::jsonb, 1, 14),
  ('accesorio_gorro', 'Gorro de copa', 'Un adorno en tu foto de perfil que ven tu profesor y tus compañeros en la clase en vivo.', '🎩', 'cosmetico', 'accesorio_avatar', 120, '{}'::jsonb, 1, 15),
  ('accesorio_lentes', 'Lentes de sol', 'Un adorno en tu foto de perfil que ven tu profesor y tus compañeros en la clase en vivo.', '🕶️', 'cosmetico', 'accesorio_avatar', 120, '{}'::jsonb, 1, 16),
  ('accesorio_capa', 'Capa de héroe', 'Un adorno en tu foto de perfil que ven tu profesor y tus compañeros en la clase en vivo.', '🦸', 'cosmetico', 'accesorio_avatar', 300, '{}'::jsonb, 1, 45),
  ('accesorio_fuego', 'Aura de fuego', 'Un adorno en tu foto de perfil que ven tu profesor y tus compañeros en la clase en vivo.', '🔥', 'cosmetico', 'accesorio_avatar', 350, '{}'::jsonb, 1, 55),
  ('accesorio_corona', 'Corona dorada', 'Un adorno en tu foto de perfil que ven tu profesor y tus compañeros en la clase en vivo.', '👑', 'cosmetico', 'accesorio_avatar', 400, '{}'::jsonb, 1, 65)
on conflict (clave) do nothing;

-- El accesorio de VARIAS personas a la vez (un listado de alumnos conectados
-- no puede pedir uno por uno sin volverse lento). SECURITY INVOKER: la RLS
-- de premios_canjeados ya decide qué filas puede ver quien llama (lo suyo, lo
-- de admin, lo de sus alumnos, lo de quien supervisa) — esta función no
-- contesta nada que esa RLS no deje ver.
create or replace function public.accesorios_de(p_ids uuid[])
returns table (student_id uuid, emoji text, nombre text)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (pc.student_id) pc.student_id, cat.emoji, cat.nombre
    from public.premios_canjeados pc
    join public.premios_catalogo cat on cat.id = pc.premio_id
   where pc.activo and cat.tipo_efecto = 'accesorio_avatar' and pc.student_id = any(p_ids)
   order by pc.student_id, pc.created_at desc;
$$;
revoke execute on function public.accesorios_de(uuid[]) from public, anon;
grant execute on function public.accesorios_de(uuid[]) to authenticated;
