-- Puerta de entrada para los exámenes del público. Va por función y no por
-- insert directo a la tabla: así quien no tiene sesión puede dejar su resultado
-- sin necesidad de ningún permiso de lectura, y la validación queda en el
-- servidor, donde no se puede saltar desde el navegador.
create or replace function public.registrar_arbitraje_publico(
  p_nombre text,
  p_email text,
  p_porcentaje integer,
  p_nivel text,
  p_detalle jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_id     uuid;
begin
  if length(v_nombre) < 2 or length(v_nombre) > 120 then
    raise exception 'El nombre no es válido.' using errcode = '22023';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(v_email) > 160 then
    raise exception 'El correo no es válido.' using errcode = '22023';
  end if;
  if p_detalle is null or pg_column_size(p_detalle) > 60000 then
    raise exception 'El detalle no es válido.' using errcode = '22023';
  end if;

  insert into public.arbitrajes_publicos (nombre, email, porcentaje, nivel, detalle)
  values (v_nombre, v_email,
          greatest(0, least(100, coalesce(p_porcentaje, 0))),
          left(coalesce(p_nivel, ''), 80),
          p_detalle)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.registrar_arbitraje_publico is
  'Deja el resultado del examen de arbitraje hecho desde nivel-de-arbitraje.html (sin cuenta). Valida nombre, correo y tamaño del detalle, y devuelve el id. Leerlos y responderlos sigue siendo solo de profesores y administración.';

revoke all on function public.registrar_arbitraje_publico(text, text, integer, text, jsonb) from public;
grant execute on function public.registrar_arbitraje_publico(text, text, integer, text, jsonb) to anon, authenticated;