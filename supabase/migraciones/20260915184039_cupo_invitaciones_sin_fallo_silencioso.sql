-- El trigger de protección revierte cualquier cambio a las columnas de
-- identidad cuando hay sesión de usuario. Eso dejaba a consumir_invitacion()
-- con un fallo silencioso: si la llamaban con la sesión del profesor por
-- delante, el trigger deshacía el contador y la función igual devolvía ok
-- (el RETURNING trae la fila ya revertida y `found` sigue siendo cierto), así
-- que el cupo no se gastaba nunca y nadie se enteraba.
--
-- Ahora las dos funciones ponen una marca local en la transacción y el trigger
-- la respeta SOLO para las dos columnas del cupo. teacher_id, role, email e
-- is_admin siguen protegidos pase lo que pase.
create or replace function public.protect_profiles_identity_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  contando_invitaciones boolean := coalesce(current_setting('ajedrez.contando_invitaciones', true), '') = 'si';
begin
  if auth.uid() is not null then
    if new.role is distinct from old.role then new.role := old.role; end if;
    if new.email is distinct from old.email then new.email := old.email; end if;
    if new.is_admin is distinct from old.is_admin then new.is_admin := old.is_admin; end if;
    -- A qué profesor pertenece un alumno no lo decide el alumno.
    if new.teacher_id is distinct from old.teacher_id then new.teacher_id := old.teacher_id; end if;
    -- El cupo tampoco lo decide el profesor, salvo que quien esté escribiendo
    -- sea consumir_invitacion()/devolver_invitacion(), que dejan la marca.
    if not contando_invitaciones then
      if new.invitaciones_max is distinct from old.invitaciones_max then
        new.invitaciones_max := old.invitaciones_max;
      end if;
      if new.invitaciones_usadas is distinct from old.invitaciones_usadas then
        new.invitaciones_usadas := old.invitaciones_usadas;
      end if;
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.consumir_invitacion(p_profesor uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare fila public.profiles%rowtype;
begin
  perform set_config('ajedrez.contando_invitaciones', 'si', true);

  update public.profiles
     set invitaciones_usadas = invitaciones_usadas + 1
   where id = p_profesor
     and role = 'profesor'
     and (is_admin or invitaciones_usadas < invitaciones_max)
  returning * into fila;

  if not found then
    select * into fila from public.profiles where id = p_profesor;
    if fila.id is null then
      return jsonb_build_object('ok', false, 'motivo', 'sin_perfil');
    end if;
    if fila.role <> 'profesor' then
      return jsonb_build_object('ok', false, 'motivo', 'no_es_profesor');
    end if;
    return jsonb_build_object('ok', false, 'motivo', 'sin_cupo',
      'max', fila.invitaciones_max, 'usadas', fila.invitaciones_usadas);
  end if;

  return jsonb_build_object('ok', true, 'max', fila.invitaciones_max,
    'usadas', fila.invitaciones_usadas, 'ilimitado', fila.is_admin,
    'restantes', case when fila.is_admin then null
                      else greatest(fila.invitaciones_max - fila.invitaciones_usadas, 0) end);
end;
$$;

create or replace function public.devolver_invitacion(p_profesor uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform set_config('ajedrez.contando_invitaciones', 'si', true);
  update public.profiles
     set invitaciones_usadas = greatest(invitaciones_usadas - 1, 0)
   where id = p_profesor and not is_admin;
end;
$$;

revoke execute on function public.consumir_invitacion(uuid) from public, anon, authenticated;
revoke execute on function public.devolver_invitacion(uuid) from public, anon, authenticated;