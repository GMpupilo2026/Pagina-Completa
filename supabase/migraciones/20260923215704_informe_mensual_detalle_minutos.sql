-- Los minutos de cada clase con un decimal: redondeados de a uno, la suma del
-- detalle se separaba en un minuto del total de actividad_profesor(), que
-- redondea la suma. La pantalla redondea al pintar.

create or replace function public.detalle_mensual_crudo(p_profesor uuid, p_periodo date)
returns jsonb language plpgsql stable security definer set search_path to 'public' set row_security to off as $$
declare
  v_mes   date        := date_trunc('month', p_periodo)::date;
  v_desde timestamptz := v_mes::timestamp at time zone 'America/Costa_Rica';
  v_hasta timestamptz := (v_mes + interval '1 month')::timestamp at time zone 'America/Costa_Rica';
  v_clases jsonb;
  v_alumnos jsonb;
begin
  -- La duración se cuenta igual que en actividad_profesor(): de inicio a fin,
  -- con un tope de 10 horas, y una clase que sigue abierta cuenta hasta ahora.
  with ses as (
    select cs.id, cs.started_at, coalesce(cs.modalidad, 'en_linea') as modalidad,
           coalesce(nullif(btrim(cs.title), ''), '') as titulo,
           coalesce(btrim(cs.notes), '') as notas,
           greatest(least(extract(epoch from (coalesce(cs.ended_at, least(now(), v_hasta)) - cs.started_at)) / 60, 600), 0) as mins
      from public.class_sessions cs
     where cs.created_by = p_profesor and cs.started_at >= v_desde and cs.started_at < v_hasta
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', ses.id, 'inicio', ses.started_at, 'modalidad', ses.modalidad,
           'titulo', ses.titulo, 'notas', ses.notas, 'minutos', round(ses.mins::numeric, 1),
           'asistentes', (select count(*) from public.class_attendance ca where ca.session_id = ses.id),
           'tarde', (select count(*) from public.class_attendance ca where ca.session_id = ses.id and ca.minutos_tarde > 0)
         ) order by ses.started_at), '[]'::jsonb)
    into v_clases from ses;

  with ses as (
    select cs.id, coalesce(cs.modalidad, 'en_linea') as modalidad
      from public.class_sessions cs
     where cs.created_by = p_profesor and cs.started_at >= v_desde and cs.started_at < v_hasta
  ),
  al as (
    select distinct a.x as id from public.alumnos_de(p_profesor) a(x)
      join public.profiles p on p.id = a.x and p.role = 'alumno'
    union
    -- Quien vino a una clase suya aunque hoy ya no sea su alumno: esa clase
    -- se dio y la asistencia existe.
    select ca.student_id from public.class_attendance ca where ca.session_id in (select id from ses)
  ),
  asis as (
    select ca.student_id,
           count(*) filter (where s.modalidad <> 'presencial') as en_linea,
           count(*) filter (where s.modalidad = 'presencial') as presenciales,
           count(*) filter (where ca.minutos_tarde > 0) as veces_tarde,
           coalesce(sum(ca.minutos_tarde), 0) as minutos_tarde
      from public.class_attendance ca join ses s on s.id = ca.session_id
     group by ca.student_id
  ),
  mins as (
    select t.particion::uuid as student_id, t.minutos
      from public.minutos_por_tramos(array(
        select row(l.student_id::text, l.joined_at, l.left_at)::public.tramo_crudo
          from public.class_presence_log l where l.session_id in (select id from ses))) t
  ),
  ejer as (
    select tp.student_id, count(*) as n from public.training_progress tp
     where tp.student_id in (select id from al) and tp.created_at >= v_desde and tp.created_at < v_hasta
     group by tp.student_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', al.id,
           'nombre', coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1), 'Sin nombre'),
           'grupo', p.grupo,
           'clases_en_linea', coalesce(asis.en_linea, 0),
           'clases_presenciales', coalesce(asis.presenciales, 0),
           'minutos_clase', coalesce(round(mins.minutos), 0)::int,
           'veces_tarde', coalesce(asis.veces_tarde, 0),
           'minutos_tarde', coalesce(asis.minutos_tarde, 0),
           'ejercicios', coalesce(ejer.n, 0)
         ) order by coalesce(nullif(btrim(p.full_name), ''), p.email)), '[]'::jsonb)
    into v_alumnos
    from al
    join public.profiles p on p.id = al.id
    left join asis on asis.student_id = al.id
    left join mins on mins.student_id = al.id
    left join ejer on ejer.student_id = al.id;

  return jsonb_build_object('periodo', v_mes, 'clases', v_clases, 'alumnos', v_alumnos);
end;
$$;
