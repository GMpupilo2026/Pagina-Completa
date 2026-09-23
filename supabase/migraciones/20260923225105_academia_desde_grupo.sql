-- Crear una academia a partir de un grupo (profiles.grupo), de una vez.
-- grupo_para_academia() dice quién entraría: los alumnos del grupo, las
-- cuentas del equipo docente que tienen ese grupo y los profesores de esos
-- alumnos (profesores_de: asignación directa o equipo). academia_crear_desde_grupo()
-- nombra al supervisor si hace falta, crea la academia y suma a la gente en la
-- MISMA transacción: partido en tres llamadas, si la última falla queda una
-- academia vacía que se ve perfecta.

create or replace function public.grupo_para_academia(p_grupo text)
returns table(id uuid, nombre text, rol text, es_coordinador boolean, es_supervisor boolean,
              en_grupo boolean, alumnos_del_grupo integer, academias text[])
language plpgsql stable security definer set search_path to 'public' set row_security to off as $$
declare v_g text := upper(btrim(coalesce(p_grupo, '')));
begin
  if not public.soy_admin() then
    raise exception 'Solo quien administra arma academias.' using errcode = '42501';
  end if;
  if v_g = '' then
    raise exception 'Elige un grupo.';
  end if;
  return query
  with al as (
    select p.id from public.profiles p
     where upper(btrim(coalesce(p.grupo, ''))) = v_g and p.role = 'alumno' and not p.is_admin
  ),
  prof as (
    select pd.x as pid, count(*)::int as n
      from al cross join lateral public.profesores_de(al.id) pd(x)
     group by pd.x
  ),
  gente as (
    select al.id as pid from al
    union
    select p.id from public.profiles p
     where upper(btrim(coalesce(p.grupo, ''))) = v_g and p.role <> 'alumno' and not p.is_admin
    union
    select prof.pid from prof
  )
  select p.id,
         coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1)),
         p.role, p.es_coordinador, p.es_supervisor,
         upper(btrim(coalesce(p.grupo, ''))) = v_g,
         coalesce((select prof.n from prof where prof.pid = p.id), 0),
         array(select a.nombre from public.academia_miembros m join public.academias a on a.id = m.academia_id
                where m.persona_id = p.id order by a.nombre)
    from gente g join public.profiles p on p.id = g.pid
   where not p.is_admin
   order by (p.role = 'alumno'), 2;
end;
$$;

create or replace function public.academia_crear_desde_grupo(p_nombre text, p_supervisor uuid, p_personas uuid[])
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_fila public.academias;
  n integer;
begin
  if not public.soy_admin() then
    raise exception 'Solo quien administra crea academias.' using errcode = '42501';
  end if;
  if coalesce(array_length(p_personas, 1), 0) = 0 then
    raise exception 'La academia tiene que nacer con alguien adentro.';
  end if;
  -- Un profesor que todavía no supervisa se marca acá: es la misma decisión
  -- que tomar en Administración, y la toma la misma persona.
  if p_supervisor is not null
     and not coalesce((select es_supervisor from public.profiles where id = p_supervisor), false) then
    perform public.marcar_supervisor(p_supervisor, true);
  end if;
  v_fila := public.academia_guardar(null, p_nombre, p_supervisor, null, null);
  n := public.academia_set_miembros(v_fila.id, p_personas);
  return jsonb_build_object('id', v_fila.id, 'nombre', v_fila.nombre, 'miembros', n);
end;
$$;

revoke execute on function public.grupo_para_academia(text) from public, anon;
revoke execute on function public.academia_crear_desde_grupo(text, uuid, uuid[]) from public, anon;
grant execute on function public.grupo_para_academia(text) to authenticated, service_role;
grant execute on function public.academia_crear_desde_grupo(text, uuid, uuid[]) to authenticated, service_role;
