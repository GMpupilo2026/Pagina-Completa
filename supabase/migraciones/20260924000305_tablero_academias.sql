-- El tablero por academia: una fila por academia con las cifras del mes.
-- No cuenta nada por su lado: las clases, las horas y el horario salen de
-- actividad_profesor(), la misma cuenta del informe mensual y de supervisión.
-- Quien administra ve todas y el gasto de IA; un supervisor, solo la suya y
-- sin nada de IA (eso es solo de administración).
create or replace function public.tablero_academias(p_periodo date)
returns table (
  academia_id uuid, nombre text, color text, supervisor text,
  profesores int, alumnos int, alumnos_activos int,
  clases_en_linea int, clases_presenciales int, minutos_clase int,
  clases_programadas int, clases_programadas_dadas int,
  informes_enviados int, informes_pendientes int,
  ia_gasto_usd numeric, ia_tope_usd numeric, ia_modelo text,
  cobros_pendientes jsonb
)
language plpgsql stable security definer
set search_path to 'public' set row_security to 'off' as $$
#variable_conflict use_column
declare
  v_admin boolean := coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
  v_mes   date;
  v_desde timestamptz;
  v_hasta timestamptz;
begin
  if p_periodo is null then raise exception 'Falta el mes.'; end if;
  if not coalesce(v_admin or exists (select 1 from public.academias a where a.supervisor_id = auth.uid()), false) then
    raise exception 'Esto es de quien administra o supervisa una academia.' using errcode = '42501';
  end if;
  v_mes   := date_trunc('month', p_periodo)::date;
  v_desde := v_mes::timestamp at time zone 'America/Costa_Rica';
  v_hasta := (v_mes + interval '1 month')::timestamp at time zone 'America/Costa_Rica';

  return query
  with ac as (
    select a.* from public.academias a
     where v_admin or a.supervisor_id = auth.uid()
  ),
  mi as (
    select m.academia_id, p.id, p.role
      from public.academia_miembros m
      join public.profiles p on p.id = m.persona_id
     where m.academia_id in (select ac.id from ac)
  ),
  act as (
    select mi.academia_id, x.*
      from mi cross join lateral public.actividad_profesor(mi.id, v_mes) x
     where mi.role = 'profesor'
  )
  select ac.id, ac.nombre, ac.color,
    (select coalesce(nullif(btrim(s.full_name), ''), split_part(s.email, '@', 1)) from public.profiles s where s.id = ac.supervisor_id),
    (select count(*)::int from mi where mi.academia_id = ac.id and mi.role = 'profesor'),
    (select count(*)::int from mi where mi.academia_id = ac.id and mi.role = 'alumno'),
    (select count(distinct tp.student_id)::int from public.training_progress tp
      where tp.student_id in (select mi.id from mi where mi.academia_id = ac.id and mi.role = 'alumno')
        and tp.created_at >= v_desde and tp.created_at < v_hasta),
    (select coalesce(sum(act.clases_en_linea), 0)::int from act where act.academia_id = ac.id),
    (select coalesce(sum(act.clases_presenciales), 0)::int from act where act.academia_id = ac.id),
    (select coalesce(sum(act.minutos_clase), 0)::int from act where act.academia_id = ac.id),
    (select coalesce(sum(act.clases_programadas), 0)::int from act where act.academia_id = ac.id),
    (select coalesce(sum(act.clases_programadas_dadas), 0)::int from act where act.academia_id = ac.id),
    (select count(*)::int from public.informes_profesor i
      where i.estado = 'enviado' and i.periodo = v_mes
        and i.profesor_id in (select mi.id from mi where mi.academia_id = ac.id and mi.role = 'profesor')),
    (select count(*)::int from mi where mi.academia_id = ac.id and mi.role = 'profesor'
        and not exists (select 1 from public.informes_profesor i
                         where i.profesor_id = mi.id and i.periodo = v_mes and i.estado = 'enviado')),
    case when v_admin then (select coalesce(sum(u.costo_usd), 0) from public.ia_uso u
                             where u.academia_id = ac.id and u.creado_at >= v_desde and u.creado_at < v_hasta) end,
    case when v_admin then (select c.tope_mensual_usd from public.academia_ia c where c.academia_id = ac.id) end,
    case when v_admin then (select c.modelo from public.academia_ia c where c.academia_id = ac.id) end,
    -- Una fila por moneda: sumar colones con dólares no significa nada.
    (select coalesce(jsonb_agg(jsonb_build_object('moneda', q.moneda, 'cobros', q.n, 'vencidos', q.v, 'saldo', q.s) order by q.moneda), '[]'::jsonb)
       from (select cv.moneda, count(*)::int n, count(*) filter (where cv.situacion = 'vencido')::int v, sum(cv.saldo) s
               from public.cobros_vista cv
              where cv.situacion in ('pendiente', 'vencido')
                and cv.student_id in (select mi.id from mi where mi.academia_id = ac.id and mi.role = 'alumno')
              group by cv.moneda) q)
  from ac
  order by ac.nombre;
end;
$$;
revoke execute on function public.tablero_academias(date) from public, anon;
grant execute on function public.tablero_academias(date) to authenticated, service_role;
