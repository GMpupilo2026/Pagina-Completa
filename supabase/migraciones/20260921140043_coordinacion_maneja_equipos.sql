-- Los equipos son la ÚNICA forma de agrupar que da permisos, y hasta hoy solo
-- los escribía la Edge Function admin-manage-users, o sea solo quien
-- administra. Repartir alumnos de a uno con coord_set_profesores es lo que
-- hacía falta evitar: un equipo hace lo mismo para todo un grupo de una vez,
-- y además se queda puesto (quien entre después al equipo hereda a sus
-- entrenadores, que es justo lo que un reparto en lote NO hace).
--
-- El alcance es el de siempre: soy_coordinador() dice QUIÉN entra,
-- bajo_mi_coordinacion() dice SOBRE QUIÉN. Y acá hay una fuga propia de los
-- equipos que no existe en coord_set_profesores y que estas funciones cierran:
-- meter a un alumno suyo en un equipo con entrenadores AJENOS le daría a esos
-- entrenadores acceso a ese alumno — o sea, repartir permisos fuera de su
-- coordinación sin que nada fallara. Por eso tocar la gente de un equipo pide
-- que TODA la gente del equipo esté bajo su coordinación, en los dos lados.

create or replace function public.equipo_bajo_mi_coordinacion(p_equipo uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  -- Un equipo vacío cumple de entrada: no hay a quién dejar fuera de alcance.
  select p_equipo is not null
     and exists (select 1 from public.equipos e where e.id = p_equipo)
     and not exists (
       select 1 from public.equipo_alumnos ea
        where ea.equipo_id = p_equipo
          and not public.bajo_mi_coordinacion(ea.alumno_id)
     )
     and not exists (
       select 1 from public.equipo_entrenadores ee
        where ee.equipo_id = p_equipo
          and not public.bajo_mi_coordinacion(ee.teacher_id)
     );
$$;

-- Renombrar y borrar es otra cosa que repartir: un equipo que armó
-- administración puede tener un sentido que no es el de quien coordina, así
-- que esos dos verbos se quedan con lo que ella misma creó. Quien administra
-- sigue pudiendo con todos.
create or replace function public.equipo_lo_cree_yo(p_equipo uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)
      or exists (select 1 from public.equipos e
                  where e.id = p_equipo and e.created_by = auth.uid());
$$;

create or replace function public.coord_equipo_create(p_nombre text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_id uuid;
begin
  if not public.soy_coordinador() then
    raise exception 'Esto es de quien coordina o administra.' using errcode = '42501';
  end if;
  if v_nombre = '' then
    raise exception 'El equipo necesita un nombre: es lo único que lo distingue en la lista.' using errcode = '22023';
  end if;
  begin
    insert into public.equipos (nombre, created_by) values (v_nombre, auth.uid())
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Ya hay un equipo que se llama así.' using errcode = '22023';
  end;
  return jsonb_build_object('ok', true, 'id', v_id, 'nombre', v_nombre);
end;
$$;

create or replace function public.coord_equipo_rename(p_equipo uuid, p_nombre text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_nombre text := btrim(coalesce(p_nombre, ''));
begin
  if not public.soy_coordinador() then
    raise exception 'Esto es de quien coordina o administra.' using errcode = '42501';
  end if;
  if not public.equipo_lo_cree_yo(p_equipo) then
    raise exception 'Ese equipo lo armó otra persona: puedes repartirle tu gente, pero no renombrarlo.' using errcode = '42501';
  end if;
  if v_nombre = '' then
    raise exception 'El equipo necesita un nombre: es lo único que lo distingue en la lista.' using errcode = '22023';
  end if;
  begin
    update public.equipos set nombre = v_nombre where id = p_equipo;
  exception when unique_violation then
    raise exception 'Ya hay un equipo que se llama así.' using errcode = '22023';
  end;
  if not found then
    raise exception 'No quedó guardado. No se cambió nada.' using errcode = '22023';
  end if;
  return jsonb_build_object('ok', true, 'nombre', v_nombre);
end;
$$;

create or replace function public.coord_equipo_delete(p_equipo uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.soy_coordinador() then
    raise exception 'Esto es de quien coordina o administra.' using errcode = '42501';
  end if;
  if not public.equipo_lo_cree_yo(p_equipo) then
    raise exception 'Ese equipo lo armó otra persona: puedes repartirle tu gente, pero no borrarlo.' using errcode = '42501';
  end if;
  delete from public.equipos where id = p_equipo;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.coord_equipo_set_alumnos(p_equipo uuid, p_alumnos uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_pedidos uuid[] := coalesce(p_alumnos, '{}'::uuid[]);
  v_uno uuid;
  v_finales uuid[];
begin
  if not public.soy_coordinador() then
    raise exception 'Esto es de quien coordina o administra.' using errcode = '42501';
  end if;
  if not public.equipo_bajo_mi_coordinacion(p_equipo) then
    raise exception 'Ese equipo tiene gente que no está bajo tu coordinación.' using errcode = '42501';
  end if;

  foreach v_uno in array v_pedidos loop
    if not public.bajo_mi_coordinacion(v_uno) then
      raise exception 'Hay un alumno que no está bajo tu coordinación.' using errcode = '42501';
    end if;
    if (select role from public.profiles where id = v_uno) <> 'alumno' then
      raise exception 'A un equipo solo entran cuentas con rol de alumno.' using errcode = '22023';
    end if;
  end loop;

  -- Lo que ya estaba y no coordina se conserva, como en coord_set_profesores:
  -- la pantalla no lo recibe, así que no puede mandarlo de vuelta y "lo que no
  -- esté se quita" se lo llevaría por delante. Hoy no puede pasar —el equipo
  -- entero tiene que ser suyo— pero la regla se escribe igual: el día que se
  -- afloje esa condición, el borrado callado ya no estaría esperando.
  select coalesce(array_agg(distinct t), '{}'::uuid[]) into v_finales
  from (
    select unnest(v_pedidos) as t
    union
    select ea.alumno_id from public.equipo_alumnos ea
     where ea.equipo_id = p_equipo and not public.bajo_mi_coordinacion(ea.alumno_id)
  ) x;

  if coalesce(array_length(v_finales, 1), 0) > 300 then
    raise exception 'Son demasiados alumnos para un mismo equipo (máximo 300).' using errcode = '22023';
  end if;

  delete from public.equipo_alumnos
   where equipo_id = p_equipo and not (alumno_id = any (v_finales));
  insert into public.equipo_alumnos (equipo_id, alumno_id)
  select p_equipo, t from unnest(v_finales) t
  on conflict (equipo_id, alumno_id) do nothing;

  return jsonb_build_object('ok', true, 'alumnos', v_finales,
                            'cuantos', coalesce(array_length(v_finales, 1), 0));
end;
$$;

create or replace function public.coord_equipo_set_entrenadores(p_equipo uuid, p_entrenadores uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_pedidos uuid[] := coalesce(p_entrenadores, '{}'::uuid[]);
  v_uno uuid;
  v_finales uuid[];
begin
  if not public.soy_coordinador() then
    raise exception 'Esto es de quien coordina o administra.' using errcode = '42501';
  end if;
  if not public.equipo_bajo_mi_coordinacion(p_equipo) then
    raise exception 'Ese equipo tiene gente que no está bajo tu coordinación.' using errcode = '42501';
  end if;

  foreach v_uno in array v_pedidos loop
    if not public.bajo_mi_coordinacion(v_uno) then
      raise exception 'Hay un entrenador que no está bajo tu coordinación.' using errcode = '42501';
    end if;
    if (select role from public.profiles where id = v_uno) not in ('profesor', 'admin') then
      raise exception 'Solo el equipo docente puede entrenar un equipo.' using errcode = '22023';
    end if;
  end loop;

  select coalesce(array_agg(distinct t), '{}'::uuid[]) into v_finales
  from (
    select unnest(v_pedidos) as t
    union
    select ee.teacher_id from public.equipo_entrenadores ee
     where ee.equipo_id = p_equipo and not public.bajo_mi_coordinacion(ee.teacher_id)
  ) x;

  if coalesce(array_length(v_finales, 1), 0) > 30 then
    raise exception 'Son demasiados entrenadores para un mismo equipo (máximo 30).' using errcode = '22023';
  end if;

  delete from public.equipo_entrenadores
   where equipo_id = p_equipo and not (teacher_id = any (v_finales));
  insert into public.equipo_entrenadores (equipo_id, teacher_id)
  select p_equipo, t from unnest(v_finales) t
  on conflict (equipo_id, teacher_id) do nothing;

  return jsonb_build_object('ok', true, 'entrenadores', v_finales,
                            'cuantos', coalesce(array_length(v_finales, 1), 0));
end;
$$;

revoke execute on function public.equipo_bajo_mi_coordinacion(uuid) from public, anon;
revoke execute on function public.equipo_lo_cree_yo(uuid) from public, anon;
revoke execute on function public.coord_equipo_create(text) from public, anon;
revoke execute on function public.coord_equipo_rename(uuid, text) from public, anon;
revoke execute on function public.coord_equipo_delete(uuid) from public, anon;
revoke execute on function public.coord_equipo_set_alumnos(uuid, uuid[]) from public, anon;
revoke execute on function public.coord_equipo_set_entrenadores(uuid, uuid[]) from public, anon;
grant execute on function public.equipo_bajo_mi_coordinacion(uuid) to authenticated;
grant execute on function public.equipo_lo_cree_yo(uuid) to authenticated;
grant execute on function public.coord_equipo_create(text) to authenticated;
grant execute on function public.coord_equipo_rename(uuid, text) to authenticated;
grant execute on function public.coord_equipo_delete(uuid) to authenticated;
grant execute on function public.coord_equipo_set_alumnos(uuid, uuid[]) to authenticated;
grant execute on function public.coord_equipo_set_entrenadores(uuid, uuid[]) to authenticated;