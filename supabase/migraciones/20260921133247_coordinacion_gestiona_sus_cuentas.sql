-- Quien coordina tenía que pedirle a quien administra dos cosas de todos los
-- días: corregirle el nombre mal escrito a una familia nueva y repartir a un
-- alumno entre sus profesores. Ahora las hace desde `coordinacion.html`.
--
-- VA EN SQL Y NO EN LA EDGE FUNCTION DEL PANEL, a propósito: el alcance de la
-- coordinación ya vive acá —`bajo_mi_coordinacion()`, `cambiar_rol()`,
-- `set_profesores_del_coordinador()`— y partirlo entre la base y una función
-- que tendría que volver a preguntar lo mismo es cómo se separan dos
-- versiones de la misma regla. `admin-manage-users` se queda para lo que es de
-- la cuenta master: crear cuentas sueltas, borrarlas, el cupo y los equipos.

-- El nombre y el grupo. NADA MÁS: el rol va por `cambiar_rol()`, que sabe
-- rechazar bajar a un profesor que todavía tiene alumnos; `is_admin` y el cupo
-- son de la cuenta master. Ofrecer acá esos campos sería ofrecer algo que la
-- base va a rechazar.
create or replace function public.coord_guardar_cuenta(
  p_persona uuid,
  p_nombre text,
  p_grupo text
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare v_fila public.profiles;
begin
  if not public.soy_coordinador() then
    raise exception 'Esto es de quien coordina o administra.' using errcode = '42501';
  end if;
  if not public.bajo_mi_coordinacion(p_persona) then
    raise exception 'Esa cuenta no está bajo tu coordinación.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_nombre), '') = '' then
    raise exception 'El nombre no puede quedar vacío: es como se le reconoce en toda la plataforma.'
      using errcode = '22023';
  end if;

  update public.profiles
     set full_name = btrim(p_nombre),
         grupo = nullif(btrim(coalesce(p_grupo, '')), '')
   where id = p_persona
  returning * into v_fila;

  -- Se vuelve a mirar, y no por gusto: es la trampa que ya se comió
  -- `marcar_coordinador()`, que devolvía "listo" con el valor revertido
  -- detrás. Acá el trigger de identidad no toca estas dos columnas, pero el
  -- día que alguien las sume a la lista esto lo dice en vez de callarlo.
  if not found or coalesce(v_fila.full_name, '') is distinct from btrim(p_nombre) then
    raise exception 'No quedó guardado. No se cambió nada.' using errcode = '22023';
  end if;

  return jsonb_build_object('ok', true, 'full_name', v_fila.full_name, 'grupo', v_fila.grupo);
end;
$$;

-- Entre qué profesores está repartido un alumno. `profile_teachers` no tiene
-- política de insert/update/delete —solo se escribe desde funciones como
-- esta—, igual que `equipos` y `coordinador_profesores`.
create or replace function public.coord_set_profesores(
  p_alumno uuid,
  p_profesores uuid[]
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_pedidos uuid[] := coalesce(p_profesores, '{}'::uuid[]);
  v_ajeno uuid;
  v_finales uuid[];
  v_n int;
begin
  if not public.soy_coordinador() then
    raise exception 'Esto es de quien coordina o administra.' using errcode = '42501';
  end if;
  if not public.bajo_mi_coordinacion(p_alumno) then
    raise exception 'Ese alumno no está bajo tu coordinación.' using errcode = '42501';
  end if;
  if (select role from public.profiles where id = p_alumno) <> 'alumno' then
    raise exception 'Solo los alumnos tienen profesores asignados.' using errcode = '22023';
  end if;
  if array_length(v_pedidos, 1) > 10 then
    raise exception 'Demasiados profesores para un mismo alumno (máximo 10).' using errcode = '22023';
  end if;

  -- Cada profesor que se pone tiene que estar bajo su coordinación: sin esto,
  -- quien coordina podría darle a un tercero acceso a ese alumno, su progreso
  -- y su bitácora, sin que nada fallara.
  foreach v_ajeno in array v_pedidos loop
    if not public.bajo_mi_coordinacion(v_ajeno) then
      raise exception 'Hay un profesor que no está bajo tu coordinación.' using errcode = '42501';
    end if;
    if (select role from public.profiles where id = v_ajeno) <> 'profesor' then
      raise exception 'Solo se puede asignar a cuentas con rol de profesor.' using errcode = '22023';
    end if;
  end loop;

  -- Y LOS QUE NO VE NO SE LE BORRAN. Un alumno puede tener además una
  -- profesora de OTRA coordinación: la pantalla no la recibe (el join de
  -- mi_gente() pasa por la RLS de quien mira), así que no puede mandarla de
  -- vuelta en la lista, y "lo que no esté se quita" se la llevaría por
  -- delante. Esa profesora perdería a su alumno sin que nada fallara y sin
  -- que nadie lo hubiera pedido.
  select coalesce(array_agg(distinct t), '{}'::uuid[]) into v_finales
  from (
    select unnest(v_pedidos) as t
    union
    select pt.teacher_id from public.profile_teachers pt
     where pt.student_id = p_alumno
       and not public.bajo_mi_coordinacion(pt.teacher_id)
  ) x;

  delete from public.profile_teachers
   where student_id = p_alumno and not (teacher_id = any (v_finales));
  insert into public.profile_teachers (student_id, teacher_id)
  select p_alumno, t from unnest(v_finales) t
  on conflict (student_id, teacher_id) do nothing;

  select count(*) into v_n from public.profile_teachers where student_id = p_alumno;
  return jsonb_build_object('ok', true, 'profesores', v_finales, 'cuantos', v_n);
end;
$$;

-- Ni `anon` ni PUBLIC tienen nada que hacer acá. `authenticated` sí: la
-- llaman con la sesión de quien coordina.
revoke execute on function public.coord_guardar_cuenta(uuid, text, text) from public, anon;
revoke execute on function public.coord_set_profesores(uuid, uuid[]) from public, anon;
grant execute on function public.coord_guardar_cuenta(uuid, text, text) to authenticated;
grant execute on function public.coord_set_profesores(uuid, uuid[]) to authenticated;