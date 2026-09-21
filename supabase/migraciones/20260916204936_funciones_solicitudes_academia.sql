-- Inserta una solicitud pública de ingreso a la Academia. Se valida acá
-- adentro (nunca confiando en lo que mande el navegador) porque anon no
-- tiene ningún permiso directo sobre la tabla — mismo patrón que
-- responder_formulario().
create or replace function public.solicitar_academia(
  p_nombre text,
  p_email text,
  p_telefono text default null,
  p_edad_nivel text default null,
  p_mensaje text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  nombre text := btrim(coalesce(p_nombre, ''));
  email text := btrim(coalesce(p_email, ''));
  telefono text := nullif(btrim(coalesce(p_telefono, '')), '');
  edad_nivel text := nullif(btrim(coalesce(p_edad_nivel, '')), '');
  mensaje text := nullif(btrim(coalesce(p_mensaje, '')), '');
begin
  if nombre = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta el nombre');
  end if;
  if length(nombre) > 200 then
    return jsonb_build_object('ok', false, 'error', 'El nombre es demasiado largo');
  end if;
  if email = '' or email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'El correo no es válido');
  end if;
  if length(email) > 254 then
    return jsonb_build_object('ok', false, 'error', 'El correo es demasiado largo');
  end if;
  if telefono is not null and length(telefono) > 60 then
    return jsonb_build_object('ok', false, 'error', 'El teléfono es demasiado largo');
  end if;
  if edad_nivel is not null and length(edad_nivel) > 200 then
    return jsonb_build_object('ok', false, 'error', 'Ese campo es demasiado largo');
  end if;
  if mensaje is not null and length(mensaje) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'El mensaje es demasiado largo');
  end if;

  insert into public.solicitudes_academia (nombre, email, telefono, edad_nivel, mensaje)
  values (nombre, lower(email), telefono, edad_nivel, mensaje);

  return jsonb_build_object('ok', true);
end;
$function$;

grant execute on function public.solicitar_academia(text, text, text, text, text) to anon;

-- Lectura pública mínima para la página "Elegí tu plan": nunca devuelve
-- email/teléfono/mensaje, solo lo justo para saludar y decidir qué mostrar.
create or replace function public.solicitud_para_elegir_plan(p_id uuid)
returns table(nombre text, estado text, plan_elegido text)
language sql
stable security definer
set search_path to 'public'
as $function$
  select s.nombre, s.estado, s.plan_elegido
  from public.solicitudes_academia s
  where s.id = p_id;
$function$;

grant execute on function public.solicitud_para_elegir_plan(uuid) to anon;

-- Elección de plan, una sola vez: solo aplica sobre una solicitud rechazada
-- que todavía no eligió nada.
create or replace function public.elegir_plan(p_id uuid, p_plan text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  fila public.solicitudes_academia%rowtype;
begin
  if p_plan not in ('plataforma', 'grupal', 'individual') then
    return jsonb_build_object('ok', false, 'error', 'Plan inválido');
  end if;

  select * into fila from public.solicitudes_academia where id = p_id;
  if fila.id is null then
    return jsonb_build_object('ok', false, 'error', 'No se encontró esa solicitud');
  end if;
  if fila.estado <> 'rechazada' then
    return jsonb_build_object('ok', false, 'error', 'Este enlace ya no es válido');
  end if;
  if fila.plan_elegido is not null then
    return jsonb_build_object('ok', false, 'error', 'Ya habías elegido un plan', 'plan', fila.plan_elegido);
  end if;

  update public.solicitudes_academia
     set plan_elegido = p_plan, plan_elegido_en = now()
   where id = p_id;

  return jsonb_build_object('ok', true, 'plan', p_plan);
end;
$function$;

grant execute on function public.elegir_plan(uuid, text) to anon;
