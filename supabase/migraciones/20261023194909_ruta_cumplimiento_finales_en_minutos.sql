-- Ruta a la Beca: Finales se mide en MINUTOS, no en finales ganados.
--
-- La propuesta pedía «2 finales ganados contra la máquina» cada semana, durante
-- 36 semanas. Mirando cómo se guarda: `entreno/finales.html` solo deja una fila
-- en `training_progress` la PRIMERA vez que el alumno gana o salva un final
-- (`if (!yaEstaba)`), y el banco tiene 17. Pasadas las primeras semanas no
-- habría nada que contar, y la tabla diría «no cumple» a quien practica
-- finales todos los días: una salida injusta y sin ningún error. Por eso la
-- meta de Finales pasa a 1,5 h (90 minutos) en Finales contra la máquina y en
-- el curso El mapa de los finales, que es lo que la tabla de las 10 horas ya
-- le asignaba.
--
-- OJO con el nombre: la columna `finales` ahora trae MINUTOS (redondeados),
-- no una cantidad de finales. Se dejó con su nombre porque cambiar el nombre
-- de una columna de una función obliga a borrarla y volver a crearla, y esa
-- operación destructiva no se hizo para una función que todavía nadie usa. Lo
-- dice la pantalla («Finales: N min») y lo dice este comentario.
create or replace function public.ruta_cumplimiento(
  p_lunes  date,
  p_grupo  text default 'Ruta a la Beca',
  p_inicio date default date '2027-03-15'
)
returns table (
  alumno_id         uuid,
  nombre            text,
  semana            integer,
  fase              integer,
  minutos           numeric,
  dias_activos      integer,
  tactica           integer,
  tactica_meta      integer,
  calculo           integer,
  calculo_meta      integer,
  finales           integer,
  partidas          integer,
  minutos_cursos    numeric,
  clases            integer,
  justificada       boolean,
  cumple_horas      boolean,
  cumple_dias       boolean,
  cumple_metas      boolean,
  cumple_asistencia boolean
)
language plpgsql
stable
security invoker
set search_path to 'public'
as $$
declare
  v_n      integer;
  v_fase   integer;
  v_desde  timestamptz;
  v_hasta  timestamptz;
  v_tac    integer[] := array[60, 80, 90, 100];
  v_cal    integer[] := array[30, 40, 45, 50];
begin
  if p_lunes is null or p_inicio is null then
    raise exception 'Falta la fecha.';
  end if;
  if extract(isodow from p_lunes) <> 1 or extract(isodow from p_inicio) <> 1 then
    raise exception 'La semana empieza un lunes.';
  end if;

  v_n := (p_lunes - p_inicio) / 7 + 1;
  -- Antes de la semana 1 y la semana de pausa no hay mínimo.
  if v_n < 1 or v_n = 2 then
    return;
  end if;
  if v_n > 2 then
    v_n := v_n - 1;
  end if;
  if v_n > 36 then
    return;
  end if;
  v_fase := (v_n - 1) / 9 + 1;

  v_desde := p_lunes::timestamp at time zone 'America/Costa_Rica';
  v_hasta := (p_lunes + 7)::timestamp at time zone 'America/Costa_Rica';

  -- Los «cumple» se calculan UNA vez, acá, para que la pantalla y cualquier
  -- otro lector digan lo mismo del mismo alumno.
  return query
  select r.alumno_id, r.nombre, r.semana, r.fase, r.minutos, r.dias_activos,
         r.tactica, r.tactica_meta, r.calculo, r.calculo_meta, r.finales,
         r.partidas, r.minutos_cursos, r.clases, r.justificada,
         r.minutos >= 600,
         r.dias_activos >= 4,
         r.tactica >= r.tactica_meta and r.calculo >= r.calculo_meta
           and r.finales >= 90 and r.partidas >= 3,
         r.clases >= 1 or r.justificada
  from (
  select
    a.id as alumno_id,
    a.full_name as nombre,
    v_n as semana,
    v_fase as fase,
    ts.mins as minutos,
    (select count(distinct x.d)::integer from (
        select (pal.joined_at at time zone 'America/Costa_Rica')::date as d
          from public.platform_activity_log pal
         where pal.student_id = a.id and pal.joined_at >= v_desde and pal.joined_at < v_hasta
        union all
        select (tp.created_at at time zone 'America/Costa_Rica')::date
          from public.training_progress tp
         where tp.student_id = a.id and tp.created_at >= v_desde and tp.created_at < v_hasta
     ) x) as dias_activos,
    ts.tac as tactica,
    v_tac[v_fase] as tactica_meta,
    ts.cal as calculo,
    v_cal[v_fase] as calculo_meta,
    ts.fin as finales,
    (select count(*)::integer from public.game_rooms g
      where g.status = 'finished'
        and (g.white_id = a.id or g.black_id = a.id)
        and g.initial_seconds = 900 and g.increment_seconds = 10
        and g.updated_at >= v_desde and g.updated_at < v_hasta) as partidas,
    ts.cursos as minutos_cursos,
    (select count(distinct cpl.session_id)::integer from public.class_presence_log cpl
      where cpl.student_id = a.id and cpl.joined_at >= v_desde and cpl.joined_at < v_hasta) as clases,
    exists (select 1 from public.justificaciones_ausencia j
             where j.student_id = a.id and j.estado = 'aceptada'
               and j.fecha_desde <= p_lunes + 6 and j.fecha_hasta >= p_lunes) as justificada
  from public.profiles a
  cross join lateral (
    select
      coalesce(sum(t.minutos) filter (where t.seccion not in ('clase', 'logros')), 0) as mins,
      coalesce(sum(t.ejercicios) filter (where t.seccion = 'temas'), 0)::integer as tac,
      coalesce(sum(t.ejercicios) filter (where t.seccion in ('visualizacion', 'tipos')), 0)::integer as cal,
      round(coalesce(sum(t.minutos) filter (where t.seccion in ('finales', 'curso:el-mapa-de-los-finales')), 0))::integer as fin,
      coalesce(sum(t.minutos) filter (where t.seccion like 'curso:%'), 0) as cursos
    from public.tiempo_por_seccion(a.id, v_desde, v_hasta) t
  ) ts
  where a.role = 'alumno'
    and upper(btrim(a.grupo)) = upper(btrim(p_grupo))
    and (coalesce(public.soy_profesor_de(a.id), false)
         or coalesce(public.bajo_mi_coordinacion(a.id), false))
  ) r
  order by r.nombre;
end;
$$;

revoke execute on function public.ruta_cumplimiento(date, text, date) from public, anon;
grant execute on function public.ruta_cumplimiento(date, text, date) to authenticated;
