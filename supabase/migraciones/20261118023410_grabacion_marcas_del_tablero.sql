-- La grabación de la llamada, sincronizada con el tablero.
--
-- Lo pidió el dueño el 17/11/2026: al repasar la grabación en «Repasar mis
-- clases», que el tablero vaya a la posición de cada momento. Para un alumno
-- ciego es repasar la clase como la vivió: oye al profe y le puede preguntar a
-- la posición de ESE instante.
--
-- La clase no guarda la hora de cada jugada (game_state solo lleva las
-- jugadas en orden y updated_at), así que la anota quien graba: mientras se
-- graba, la página del profe mira cada segundo la posición que ve la clase y,
-- cuando cambia, anota {s: segundo de la parte, fen}. Viaja con la parte.
--
-- 1. clase_grabaciones.marcas: un arreglo de {s, fen}, como mucho 3600 (una
--    por segundo de una parte de una hora: las partes son de 5 minutos, así que
--    sobra). Las grabaciones de antes quedan sin marcas y se escuchan igual.
-- 2. guardar_parte_grabacion() recibe p_marcas (por defecto null). Se borra la
--    de cuatro argumentos: con las dos, un pedido con cuatro nombres no sabría
--    a cuál llamar.
--
-- Ver «La grabación de la llamada» en docs/decisiones/clase-en-vivo.md.

alter table public.clase_grabaciones add column if not exists marcas jsonb;
alter table public.clase_grabaciones drop constraint if exists clase_grabaciones_marcas_forma;
alter table public.clase_grabaciones add constraint clase_grabaciones_marcas_forma
  check (marcas is null or (jsonb_typeof(marcas) = 'array' and jsonb_array_length(marcas) <= 3600));
comment on column public.clase_grabaciones.marcas is
  'Las posiciones del tablero durante la parte: [{s: segundo de la parte, fen}], anotadas por la página del profe al grabar. Null en las de antes.';

drop function if exists public.guardar_parte_grabacion(uuid, text, integer, bigint);

create or replace function public.guardar_parte_grabacion(p_clase uuid, p_ruta text, p_segundos integer, p_bytes bigint, p_marcas jsonb default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := (select auth.uid());
  v_id uuid;
begin
  if yo is null then
    raise exception 'Inicia sesión.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.class_sessions c
                  where c.id = p_clase and c.created_by = yo
                    and (c.ended_at is null or c.ended_at > now() - interval '30 minutes')) then
    raise exception 'Esa clase no es tuya o ya se cerró.' using errcode = '42501';
  end if;
  if p_ruta is null or p_ruta not like yo::text || '/' || p_clase::text || '/%' then
    raise exception 'La parte no está en la carpeta de tu clase.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'clase-grabaciones' and o.name = p_ruta) then
    raise exception 'La parte todavía no está subida.' using errcode = 'check_violation';
  end if;
  insert into public.clase_grabaciones (class_session_id, profesor_id, parte, ruta, segundos, bytes, marcas)
  values (p_clase, yo,
          coalesce((select max(g.parte) from public.clase_grabaciones g where g.class_session_id = p_clase), 0) + 1,
          p_ruta, greatest(coalesce(p_segundos, 0), 0), p_bytes,
          case when jsonb_typeof(p_marcas) = 'array' then p_marcas end)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.guardar_parte_grabacion(uuid, text, integer, bigint, jsonb) from public, anon;
grant execute on function public.guardar_parte_grabacion(uuid, text, integer, bigint, jsonb) to authenticated;
