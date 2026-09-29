-- Preparación de rivales, etapa 7: el alumno entrena el plan y cuenta.
--
-- plan-rival.html deja jugar cada línea del plan de memoria (el entrenador
-- mueve por el rival). Cada línea terminada queda en training_progress con la
-- actividad nueva 'preparacion': detail.linea_id = '<id del plan>:<jugadas>'
-- y, SOLO si salió sin error ni pista, detail.theme = '<id del plan>'.
--
-- Así la tarea se llena sola: mandar_plan_rival() ya no pone un renglón
-- «completar» (lo marcaba el alumno a mano) sino «cantidad»: tantas líneas
-- como hojas tiene el plan, contadas por tareas_con_avance() con
-- filtro_clave = el id del plan, que solo encuentra las líneas limpias.
-- Ver «Entrenar el plan: etapa 7» en docs/decisiones/paneles.md.

alter table public.training_progress drop constraint training_progress_activity_check;
alter table public.training_progress add constraint training_progress_activity_check
  check (activity = any (array['4x4','aprender','coordenadas','practicar','mates','tactica','concentracion',
                               'diagnostico','desafios','temas','aperturas','confites','ilumina','visualizacion',
                               'finales','preparacion']));

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
  v_lineas integer;
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
  -- Cuántas líneas tiene el plan: sus hojas (lineasDelPlan() en
  -- js/preparacion-lineas.js cuenta igual).
  with recursive nodos(n) as (
    select x from jsonb_array_elements(p_plan -> 'plan') x
    union all
    select h from nodos, jsonb_array_elements(case when jsonb_typeof(nodos.n -> 'hijos') = 'array' then nodos.n -> 'hijos' else '[]'::jsonb end) h
  )
  select count(*) into v_lineas from nodos
   where jsonb_typeof(n -> 'hijos') is distinct from 'array' or jsonb_array_length(n -> 'hijos') = 0;
  v_lineas := least(greatest(v_lineas, 1), 1000);
  v_etiqueta := 'tu plan contra ' || v_rival || (case when p_lado = 'conBlancas' then ', con blancas' else ', con negras' end);

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
      coalesce(nullif(btrim(coalesce(p_nota, '')), ''), 'Juega cada línea de memoria hasta que te salga sin errores.'),
      p_vence,
      jsonb_build_array(jsonb_build_object(
        'material_tipo', 'herramienta',
        'material_slug', 'plan-rival',
        'material_label', v_etiqueta,
        'material_href', 'plan-rival.html?id=' || v_id,
        'filtro_clave', v_id::text,
        'filtro_label', v_etiqueta,
        'actividades', jsonb_build_array('preparacion'),
        'meta_tipo', 'cantidad',
        'meta_cantidad', v_lineas)));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$function$;
revoke execute on function public.mandar_plan_rival(uuid[], text, text, jsonb, text, timestamptz) from public, anon;
grant execute on function public.mandar_plan_rival(uuid[], text, text, jsonb, text, timestamptz) to authenticated;