-- Elegir un plan pide sesión, y la de la persona que pidió entrar.
--
-- elegir_plan y solicitud_para_elegir_plan se podían llamar sin sesión:
-- bastaba el enlace del correo (elegir-plan.html?s=<id>). Decisión del dueño
-- del sitio: elegir un plan es contratar, y va con la cuenta. Además, con
-- solo exigir sesión cualquiera que tuviera el enlace podría elegir por otra
-- persona; por eso la cuenta tiene que ser la del CORREO DE LA SOLICITUD
-- (auth.users.email, no lo que diga la página).
--
-- Sin sesión, elegir-plan.html enseña los planes igual —verlos es público—,
-- con «Inicia sesión para elegir tu plan» y WhatsApp para quien no tiene cuenta.

-- Devuelve la solicitud solo si es de quien llama. Si no, ninguna fila: la
-- página no puede distinguir «no existe» de «es de otro correo», y no tiene
-- por qué (no se le dice a nadie de quién es un enlace).
create or replace function public.solicitud_para_elegir_plan(p_id uuid)
 returns table(nombre text, estado text, plan_elegido text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select s.nombre, s.estado, s.plan_elegido
  from public.solicitudes_academia s
  where s.id = p_id
    and lower(s.email) = (select lower(u.email) from auth.users u where u.id = auth.uid());
$function$;
revoke execute on function public.solicitud_para_elegir_plan(uuid) from public, anon;
grant execute on function public.solicitud_para_elegir_plan(uuid) to authenticated, service_role;

-- La de 20260924214817_consentimiento_guardado, con la cuenta como condición
-- después de exigir los Términos y antes de escribir.
create or replace function public.elegir_plan(p_id uuid, p_plan text, p_version_terminos text DEFAULT NULL::text, p_version_privacidad text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  fila public.solicitudes_academia%rowtype;
begin
  if not coalesce(interno.version_legal_valida(p_version_terminos)
                  and interno.version_legal_valida(p_version_privacidad), false) then
    return jsonb_build_object('ok', false, 'error', 'Falta aceptar los Términos y condiciones');
  end if;
  if p_plan not in ('plataforma', 'grupal', 'individual') then
    return jsonb_build_object('ok', false, 'error', 'Plan inválido');
  end if;

  select * into fila from public.solicitudes_academia where id = p_id;
  -- Sin sesión, o con otra cuenta, es lo mismo que no encontrarla. coalesce:
  -- con auth.uid() nulo la comparación da NULL, y NULL no rechaza.
  if fila.id is null
     or not coalesce(lower(fila.email) = (select lower(u.email) from auth.users u where u.id = auth.uid()), false) then
    return jsonb_build_object('ok', false, 'error', 'Inicia sesión con la cuenta del correo al que te llegó este enlace');
  end if;
  if fila.estado <> 'rechazada' then
    return jsonb_build_object('ok', false, 'error', 'Este enlace ya no es válido');
  end if;
  if fila.plan_elegido is not null then
    return jsonb_build_object('ok', false, 'error', 'Ya habías elegido un plan', 'plan', fila.plan_elegido);
  end if;

  -- La casilla de elegir-plan.html acepta los Términos Y la privacidad. La
  -- privacidad ya aceptada al pedir información no se pisa: vale la primera.
  update public.solicitudes_academia
     set plan_elegido = p_plan, plan_elegido_en = now(),
         terminos_version = p_version_terminos, terminos_aceptados_en = now(),
         privacidad_aceptada_en = coalesce(privacidad_aceptada_en, now()),
         privacidad_version = coalesce(privacidad_version, p_version_privacidad)
   where id = p_id;

  return jsonb_build_object('ok', true, 'plan', p_plan);
end;
$function$;
revoke execute on function public.elegir_plan(uuid, text, text, text) from public, anon;
grant execute on function public.elegir_plan(uuid, text, text, text) to authenticated, service_role;