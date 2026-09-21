-- 1. Agujero: `profiles_update_own` deja a cada quien editar su propia fila y el
--    trigger de protección solo cubría role, email e is_admin. Un alumno podía
--    cambiarse `teacher_id` solo y aparecer en la clase (y en los informes) de
--    otro profesor. Ahora teacher_id y el cupo de invitaciones solo se cambian
--    con la service role: desde admin.html, que valida quién llama.
create or replace function public.protect_profiles_identity_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is not null then
    if new.role is distinct from old.role then new.role := old.role; end if;
    if new.email is distinct from old.email then new.email := old.email; end if;
    if new.is_admin is distinct from old.is_admin then new.is_admin := old.is_admin; end if;
    -- A qué profesor pertenece un alumno no lo decide el alumno.
    if new.teacher_id is distinct from old.teacher_id then new.teacher_id := old.teacher_id; end if;
    -- Ni el profesor su propio cupo de invitaciones.
    if new.invitaciones_max is distinct from old.invitaciones_max then
      new.invitaciones_max := old.invitaciones_max;
    end if;
    if new.invitaciones_usadas is distinct from old.invitaciones_usadas then
      new.invitaciones_usadas := old.invitaciones_usadas;
    end if;
  end if;
  return new;
end;
$function$;

-- 2. El cupo. `invitaciones_max` es cuántos alumnos nuevos puede invitar ese
--    profesor; `invitaciones_usadas` sube de a uno con cada invitación enviada
--    y NO baja si después se reasigna o se borra al alumno: lo que se controla
--    es cuántas invitaciones manda, no cuántos alumnos tiene en este momento.
--    0 = no puede invitar a nadie, que es el valor de partida a propósito.
alter table public.profiles
  add column if not exists invitaciones_max int not null default 0,
  add column if not exists invitaciones_usadas int not null default 0;

alter table public.profiles
  drop constraint if exists profiles_invitaciones_no_negativas;
alter table public.profiles
  add constraint profiles_invitaciones_no_negativas
  check (invitaciones_max >= 0 and invitaciones_usadas >= 0);

comment on column public.profiles.invitaciones_max is
  'Cuántos alumnos nuevos puede invitar este profesor. Lo fija quien administra desde admin.html. Quien administra no tiene tope.';
comment on column public.profiles.invitaciones_usadas is
  'Invitaciones ya enviadas. No baja al reasignar o borrar alumnos.';

-- 3. Gastar una invitación, en una sola operación atómica: si dos pestañas
--    invitan a la vez, el UPDATE con la condición adentro impide pasarse del
--    cupo. Quien administra no gasta cupo.
create or replace function public.consumir_invitacion(p_profesor uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare fila public.profiles%rowtype;
begin
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

-- Si la invitación falla después de gastar el cupo, se devuelve.
create or replace function public.devolver_invitacion(p_profesor uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.profiles
     set invitaciones_usadas = greatest(invitaciones_usadas - 1, 0)
   where id = p_profesor and not is_admin;
end;
$$;

-- Las dos son solo para la service role (las llama la Edge Function). Sin este
-- revoke quedarían con permiso de ejecución para todo el mundo, que es lo que
-- hace Postgres por defecto, y un profesor podría gastarse el cupo a mano.
revoke execute on function public.consumir_invitacion(uuid) from public, anon, authenticated;
revoke execute on function public.devolver_invitacion(uuid) from public, anon, authenticated;