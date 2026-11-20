-- La grabación de la llamada, pasada a texto.
--
-- Lo pidió el dueño el 17/11/2026 (la «3» de las mejoras): que cada grabación
-- tenga su texto para leer o buscar, que sirve además a un alumno sordo.
--
-- El texto lo saca Whisper EN EL NAVEGADOR de quien la escucha
-- (js/reporte-transcribir.js, el mismo de Reportes): el audio no sale de esa
-- computadora ni va a ningún servicio.
--
-- 1. clase_grabaciones.texto: el texto de esa parte, si alguien con permiso lo
--    guardó. Se borra con la fila (los 90 días de clase-grabaciones-limpiar).
-- 2. guardar_texto_grabacion(): lo guarda SOLO el profe de la clase o la
--    administración. Un alumno también la puede pasar a texto, pero le queda en
--    su pantalla: si pudiera guardarlo, podría poner un texto falso que leerían
--    los demás.
--
-- Ver «La grabación de la llamada» en docs/decisiones/clase-en-vivo.md.

alter table public.clase_grabaciones add column if not exists texto text;
alter table public.clase_grabaciones drop constraint if exists clase_grabaciones_texto_largo;
alter table public.clase_grabaciones add constraint clase_grabaciones_texto_largo
  check (texto is null or char_length(texto) <= 200000);
comment on column public.clase_grabaciones.texto is
  'Lo que se dijo en esa parte, pasado a texto en el navegador (Whisper). Lo guarda el profe o administración. Se borra con la grabación.';

create or replace function public.guardar_texto_grabacion(p_id uuid, p_texto text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := (select auth.uid());
begin
  if yo is null then
    raise exception 'Inicia sesión.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.clase_grabaciones g
                  where g.id = p_id
                    and (g.profesor_id = yo or coalesce(public.soy_admin(), false))) then
    raise exception 'Solo el profe de la clase guarda el texto de su grabación.' using errcode = '42501';
  end if;
  update public.clase_grabaciones
     set texto = nullif(trim(left(coalesce(p_texto, ''), 200000)), '')
   where id = p_id;
  return true;
end;
$$;
revoke execute on function public.guardar_texto_grabacion(uuid, text) from public, anon;
grant execute on function public.guardar_texto_grabacion(uuid, text) to authenticated;
