-- Resumen de tareas y exámenes de UN alumno, para los informes.
--
-- Es SECURITY DEFINER, y esa es la decisión que sostiene todo lo demás.
-- `tareas` y `examenes` están aisladas por profesor a propósito: un profesor
-- solo ve las que ÉL mandó, no las de un colega que comparte el mismo alumno.
-- Pero el informe a la casa no es de un profesor, es del ALUMNO: a la madre no
-- le sirve saber que hizo "2 de 2 tareas" cuando en realidad le pusieron 5.
--
-- Y hay un segundo motivo, peor: `informe_de_alumno()` es SECURITY INVOKER, así
-- que la tanda de pg_cron (service role) y la vista previa del profesor
-- pasarían por reglas distintas. El profesor vería un informe y a la casa
-- llegaría otro, sin que nada fallara ni avisara.
--
-- Lo que devuelve son NÚMEROS Y FECHAS, nunca títulos ni quién puso la tarea:
-- la familia necesita el conteo, y el colega sigue sin exponer su trabajo.
create or replace function public.resumen_tareas_examenes(
  p_alumno uuid,
  p_desde  timestamptz,
  p_hasta  timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_yo      uuid := auth.uid();
  v_admin   boolean := false;
  v_tareas  jsonb;
  v_ex      jsonb;
begin
  -- Quién puede preguntar por quién va escrito acá porque la función se salta
  -- la RLS a propósito. auth.uid() nulo es la tanda de pg_cron entrando con la
  -- service role; a `anon` se le revoca el execute más abajo, así que no hay
  -- una tercera forma de llegar sin sesión.
  if v_yo is not null then
    select coalesce(pr.is_admin, false) into v_admin
      from public.profiles pr where pr.id = v_yo;
    if not (p_alumno = v_yo or v_admin or public.soy_profesor_de(p_alumno)) then
      raise exception 'No puedes ver el resumen de ese alumno.';
    end if;
  end if;

  -- Las tareas se cuentan con tareas_con_avance(), la MISMA función que pintan
  -- tareas.html y el panel. Escribir la cuenta otra vez acá sería una tercera
  -- versión de "cuánto lleva hecho" que puede decir algo distinto del mismo
  -- alumno. Se le pasa el alumno y NINGÚN profesor: dentro de esta función la
  -- RLS no filtra, así que vienen las de todos sus profesores.
  with t as (
    select * from public.tareas_con_avance(p_alumno, null, false, null)
  )
  select jsonb_build_object(
    -- Del periodo del informe: qué le pusieron y cómo le fue.
    'puestas',     count(*) filter (where created_at >= p_desde and created_at < p_hasta),
    'completadas', count(*) filter (where created_at >= p_desde and created_at < p_hasta
                                      and situacion = 'completada'),
    'vencidas',    count(*) filter (where created_at >= p_desde and created_at < p_hasta
                                      and situacion = 'vencida'),
    -- Y cómo está HOY, que es lo que de verdad hay que mirar: una tarea de
    -- hace tres semanas sin hacer no aparecería en el periodo y es justo la
    -- que hay que contar.
    'sin_hacer_hoy', count(*) filter (where situacion = 'vencida'),
    'pendientes',    count(*) filter (where situacion = 'pendiente'),
    'proxima_vence', min(vence_at) filter (where situacion = 'pendiente'),
    -- Los renglones de lo que se le pidió en el periodo, para una barra.
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
    -- Igual que las tareas: lo que quedó sin hacer se cuenta HOY, no dentro
    -- del periodo. Un examen que venció la semana pasada y nadie rindió sigue
    -- siendo lo primero que la familia tiene que saber.
    'sin_hacer_hoy', count(*) filter (where e.estado = 'asignado' and e.vence_at < now()),
    'pendientes',    count(*) filter (where e.estado = 'asignado' and e.vence_at >= now()),
    'proximo_vence', min(e.vence_at) filter (where e.estado = 'asignado' and e.vence_at >= now())
  ) into v_ex
  from public.examenes e where e.alumno_id = p_alumno;

  return jsonb_build_object('tareas', v_tareas, 'examenes', v_ex);
end;
$$;

revoke execute on function public.resumen_tareas_examenes(uuid, timestamptz, timestamptz) from anon;
grant  execute on function public.resumen_tareas_examenes(uuid, timestamptz, timestamptz) to authenticated;