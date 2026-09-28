-- mandar_plan_rival(): a un alumno que no es de quien manda, el error decía
-- «no es de un alumno». La función es SECURITY INVOKER y el profesor no alcanza
-- a ver esa cuenta, así que no puede saber si es un alumno: puede saber que no
-- es suyo. Solo cambia el mensaje.

create or replace function public.mandar_plan_rival(
  p_alumnos uuid[], p_rival text, p_lado text, p_plan jsonb, p_nota text, p_vence timestamptz)
 returns integer
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_alumno uuid;
  v_id uuid;
  v_n integer := 0;
  v_rival text := btrim(coalesce(p_rival, ''));
  v_etiqueta text;
begin
  if p_alumnos is null or array_length(p_alumnos, 1) is null then
    raise exception 'Elige al menos un alumno.';
  end if;
  if array_length(p_alumnos, 1) > 300 then
    raise exception 'Demasiados alumnos de una vez.';
  end if;
  if not coalesce((select public.puedo_preparar_rivales()), false) then
    raise exception 'No tienes activa la preparación de rivales.' using errcode = '42501';
  end if;
  if p_lado not in ('conBlancas', 'conNegras') then
    raise exception 'El plan tiene que ser con blancas o con negras.';
  end if;
  if p_plan is null or jsonb_typeof(p_plan -> 'plan') <> 'array' or jsonb_array_length(p_plan -> 'plan') = 0 then
    raise exception 'Ese lado no tiene plan.';
  end if;
  v_etiqueta := 'el plan contra ' || v_rival || (case when p_lado = 'conBlancas' then ', con blancas' else ', con negras' end);

  foreach v_alumno in array p_alumnos loop
    if not exists (select 1 from public.profiles where id = v_alumno and role = 'alumno') then
      raise exception 'Una de las cuentas elegidas no es alumno tuyo.' using errcode = '22023';
    end if;
    insert into public.planes_rival_alumno (profesor_id, alumno_id, rival, lado, plan, nota)
    values (auth.uid(), v_alumno, v_rival, p_lado, p_plan, nullif(btrim(coalesce(p_nota, '')), ''))
    returning id into v_id;

    perform public.crear_tarea(
      array[v_alumno],
      'Tu plan contra ' || v_rival,
      coalesce(nullif(btrim(coalesce(p_nota, '')), ''), 'Recorre cada línea en el tablero hasta saberla.'),
      p_vence,
      jsonb_build_array(jsonb_build_object(
        'material_tipo', 'herramienta',
        'material_slug', 'plan-rival',
        'material_label', v_etiqueta,
        'material_href', 'plan-rival.html?id=' || v_id,
        'meta_tipo', 'completar')));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$function$;
revoke execute on function public.mandar_plan_rival(uuid[], text, text, jsonb, text, timestamptz) from public, anon;
grant execute on function public.mandar_plan_rival(uuid[], text, text, jsonb, text, timestamptz) to authenticated;