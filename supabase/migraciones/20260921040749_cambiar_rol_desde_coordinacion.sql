-- Subir a alguien a profesor, o bajarlo a alumno, sin pasar por quien
-- administra. Es lo que pasa en una academia de verdad: el alumno grande
-- empieza a dar clase a los pequeños, o un profesor deja de dar y sigue
-- entrenando.
--
-- `profiles.role` lo revierte el trigger de identidad —el rol no lo decide
-- quien lo tiene—, así que esto va por una función `SECURITY DEFINER` que deja
-- la marca local `ajedrez.cambiando_rol`, como ya hacen `marcar_coordinador()`
-- y el contador de invitaciones. Y, por la misma lección, VUELVE A LEER LA
-- FILA y falla si el rol no quedó: aquella función devolvía "listo" con el
-- valor revertido detrás.
create or replace function public.cambiar_rol(p_persona uuid, p_rol text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_antes text;
  v_admin boolean;
  v_quedo text;
  v_alumnos integer;
  v_soy_coord boolean := public.soy_coordinador();
  v_yo_admin boolean := coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
begin
  if not v_soy_coord then
    raise exception 'Esto es de quien coordina o administra';
  end if;
  if not public.bajo_mi_coordinacion(p_persona) then
    raise exception 'Esa cuenta no está bajo tu coordinación';
  end if;
  if p_rol not in ('alumno', 'profesor') then
    -- 'admin' no se reparte: la cuenta master es una decisión de quien ya
    -- administra, y se da con el interruptor de Administración.
    raise exception 'El rol solo puede ser alumno o profesor';
  end if;

  select p.role, p.is_admin into v_antes, v_admin from public.profiles p where p.id = p_persona;
  if v_antes is null then raise exception 'No existe esa cuenta'; end if;
  if v_admin then raise exception 'La cuenta que administra no cambia de rol'; end if;
  if v_antes = p_rol then
    return jsonb_build_object('ok', true, 'sin_cambios', true, 'rol', v_antes);
  end if;

  /* Bajar a alumno a alguien que todavía tiene alumnos asignados dejaría a
     esos alumnos sin profesor y sin que nada fallara: los informes de esa
     gente dejarían de salirle a nadie. Se dice, con el número, en vez de
     hacerlo callado. */
  if p_rol = 'alumno' then
    select count(*) into v_alumnos from public.alumnos_de(p_persona);
    if v_alumnos > 0 then
      raise exception 'Todavía tiene % alumno(s) asignado(s): repártelos antes de bajarlo a alumno', v_alumnos;
    end if;
    if coalesce((select p.es_coordinador from public.profiles p where p.id = p_persona), false) then
      raise exception 'Esa cuenta coordina: quítale la coordinación antes de bajarla a alumno';
    end if;
  end if;

  perform set_config('ajedrez.cambiando_rol', 'si', true);
  update public.profiles set role = p_rol where id = p_persona;
  perform set_config('ajedrez.cambiando_rol', '', true);

  select p.role into v_quedo from public.profiles p where p.id = p_persona;
  if v_quedo is distinct from p_rol then
    raise exception 'El rol no quedó guardado. No se cambió nada.';
  end if;

  /* QUE NO DESAPAREZCA DE LA VISTA DE QUIEN LO CAMBIÓ.
     Subir a un alumno a profesor lo saca de `profile_teachers` en la práctica
     —deja de ser alumno de nadie—, así que quien coordina lo perdería de
     vista en el mismo acto de ascenderlo, sin que nada fallara. Queda bajo su
     coordinación. Y al revés: quien baja a un profesor a alumno se queda con
     él como alumno suyo, para poder seguir viéndolo. */
  if p_rol = 'profesor' and not v_yo_admin then
    insert into public.coordinador_profesores (coordinador_id, profesor_id)
    values (auth.uid(), p_persona)
    on conflict do nothing;
  end if;
  if p_rol = 'alumno' then
    delete from public.coordinador_profesores where profesor_id = p_persona;
    if not v_yo_admin then
      insert into public.profile_teachers (student_id, teacher_id)
      values (p_persona, auth.uid())
      on conflict do nothing;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'rol', v_quedo, 'antes', v_antes);
end;
$$;

revoke execute on function public.cambiar_rol(uuid, text) from public;
grant execute on function public.cambiar_rol(uuid, text) to authenticated;

-- El trigger de identidad respeta la marca SOLO para `role`, igual que respeta
-- `ajedrez.nombrando_coordinador` solo para esa columna: sin ese "solo", la
-- marca abriría de paso el correo, el is_admin y el cupo de invitaciones.
create or replace function public.protect_profiles_identity_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  contando_invitaciones boolean := coalesce(current_setting('ajedrez.contando_invitaciones', true), '') = 'si';
  sincronizando boolean := coalesce(current_setting('ajedrez.sincronizando_profesores', true), '') = 'si';
  nombrando boolean := coalesce(current_setting('ajedrez.nombrando_coordinador', true), '') = 'si';
  cambiando_rol boolean := coalesce(current_setting('ajedrez.cambiando_rol', true), '') = 'si';
begin
  if auth.uid() is not null then
    if not cambiando_rol then
      if new.role is distinct from old.role then new.role := old.role; end if;
    end if;
    if new.email is distinct from old.email then new.email := old.email; end if;
    if new.is_admin is distinct from old.is_admin then new.is_admin := old.is_admin; end if;
    if not nombrando then
      if new.es_coordinador is distinct from old.es_coordinador then
        new.es_coordinador := old.es_coordinador;
      end if;
    end if;
    -- Quién es su profesor principal no lo decide el alumno. Lo decide
    -- profile_teachers, a través de sincronizar_profesor_principal().
    if not sincronizando then
      if new.teacher_id is distinct from old.teacher_id then new.teacher_id := old.teacher_id; end if;
    end if;
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

revoke execute on function public.protect_profiles_identity_columns() from public;