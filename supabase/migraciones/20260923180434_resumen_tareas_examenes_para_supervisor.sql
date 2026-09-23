CREATE OR REPLACE FUNCTION public.resumen_tareas_examenes(p_alumno uuid, p_desde timestamp with time zone, p_hasta timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_yo      uuid := auth.uid();
  v_admin   boolean := false;
  v_tareas  jsonb;
  v_ex      jsonb;
begin
  if v_yo is not null then
    select coalesce(pr.is_admin, false) into v_admin
      from public.profiles pr where pr.id = v_yo;
    -- Quien supervisa también lee el resumen de sus estudiantes a cargo.
    if not (p_alumno = v_yo or v_admin or public.soy_profesor_de(p_alumno)
            or public.supervisado_por_mi(p_alumno)) then
      raise exception 'No puedes ver el resumen de ese alumno.';
    end if;
  end if;

  with t as (
    select * from public.tareas_con_avance(p_alumno, null, false, null)
  )
  select jsonb_build_object(
    'puestas',     count(*) filter (where created_at >= p_desde and created_at < p_hasta),
    'completadas', count(*) filter (where created_at >= p_desde and created_at < p_hasta
                                      and situacion = 'completada'),
    'vencidas',    count(*) filter (where created_at >= p_desde and created_at < p_hasta
                                      and situacion = 'vencida'),
    'sin_hacer_hoy', count(*) filter (where situacion = 'vencida'),
    'pendientes',    count(*) filter (where situacion = 'pendiente'),
    'proxima_vence', min(vence_at) filter (where situacion = 'pendiente'),
    'renglones',  coalesce(sum(renglones) filter (where created_at >= p_desde and created_at < p_hasta), 0),
    'cumplidos',  coalesce(sum(cumplidos) filter (where created_at >= p_desde and created_at < p_hasta), 0)
  ) into v_tareas from t;

  select jsonb_build_object(
    'rendidos',   count(*) filter (where e.estado in ('entregado','congelado')
                                     and e.entregado_at >= p_desde and e.entregado_at < p_hasta),
    'nota_media', round(avg(e.nota) filter (where e.estado in ('entregado','congelado')
                                     and e.entregado_at >= p_desde and e.entregado_at < p_hasta)::numeric, 2),
    'mejor_nota', max(e.nota) filter (where e.estado in ('entregado','congelado')
                                     and e.entregado_at >= p_desde and e.entregado_at < p_hasta),
    'sin_hacer_hoy', count(*) filter (where e.estado = 'asignado' and e.vence_at < now()
                                        and e.disponible_desde <= now()),
    'pendientes',    count(*) filter (where e.estado = 'asignado' and e.vence_at >= now()
                                        and e.disponible_desde <= now()),
    'proximo_vence', min(e.vence_at) filter (where e.estado = 'asignado' and e.vence_at >= now()
                                               and e.disponible_desde <= now())
  ) into v_ex
  from public.examenes e where e.alumno_id = p_alumno;

  return jsonb_build_object('tareas', v_tareas, 'examenes', v_ex);
end;
$function$;
