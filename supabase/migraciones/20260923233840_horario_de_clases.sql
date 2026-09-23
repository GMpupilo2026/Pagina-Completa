-- El horario fijo de cada profesor: «martes 3 p. m., grupo CENFO». De él salen
-- tres cosas: la ficha de asistencia que abre ya llena, el aviso cuando una
-- clase programada pasó sin ficha, y el «dio 7 de 8 clases programadas» del
-- informe mensual.

create table public.horario_clases (
  id           uuid primary key default gen_random_uuid(),
  profesor_id  uuid not null references public.profiles(id) on delete cascade,
  dia_semana   int  not null check (dia_semana between 0 and 6),
  hora         time not null,
  duracion_min int  not null default 60 check (duracion_min between 5 and 600),
  grupo        text check (grupo is null or length(btrim(grupo)) between 1 and 80),
  subgrupo_id  uuid references public.subgrupos(id) on delete set null,
  titulo       text check (titulo is null or length(titulo) <= 120),
  modalidad    text not null default 'presencial' check (modalidad in ('presencial', 'en_linea')),
  desde        date not null default (now() at time zone 'America/Costa_Rica')::date,
  hasta        date,
  created_at   timestamptz not null default now(),
  check (hasta is null or hasta >= desde)
);
create index horario_clases_profesor on public.horario_clases (profesor_id);
alter table public.horario_clases enable row level security;
revoke all on public.horario_clases from anon;

create policy horario_clases_select on public.horario_clases for select to authenticated
  using (profesor_id = auth.uid() or public.supervisado_por_mi(profesor_id)
         or coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false));
create policy horario_clases_insert on public.horario_clases for insert to authenticated
  with check (profesor_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and (p.role = 'profesor' or p.is_admin))
    and (subgrupo_id is null or exists (select 1 from public.subgrupos s where s.id = subgrupo_id and s.profesor_id = auth.uid())));
create policy horario_clases_update on public.horario_clases for update to authenticated
  using (profesor_id = auth.uid())
  with check (profesor_id = auth.uid()
    and (subgrupo_id is null or exists (select 1 from public.subgrupos s where s.id = subgrupo_id and s.profesor_id = auth.uid())));
create policy horario_clases_delete on public.horario_clases for delete to authenticated
  using (profesor_id = auth.uid());

-- Cada vez que tocaba clase según el horario, con su inicio y su fin en hora
-- de Costa Rica. Una sola cuenta para el informe y para el aviso.
create or replace function public.ocurrencias_horario(p_profesor uuid, p_desde date, p_hasta date)
returns table (horario_id uuid, profesor_id uuid, fecha date, inicio timestamptz, fin timestamptz, modalidad text)
language sql stable set search_path to 'public' as $$
  select h.id, h.profesor_id, d::date,
         (d::date + h.hora)::timestamp at time zone 'America/Costa_Rica',
         ((d::date + h.hora)::timestamp at time zone 'America/Costa_Rica') + make_interval(mins => h.duracion_min),
         h.modalidad
    from public.horario_clases h
    cross join lateral generate_series(greatest(p_desde, h.desde)::timestamp,
                                       least(p_hasta, coalesce(h.hasta, p_hasta))::timestamp,
                                       interval '1 day') d
   where (p_profesor is null or h.profesor_id = p_profesor)
     and extract(dow from d)::int = h.dia_semana;
$$;
revoke execute on function public.ocurrencias_horario(uuid, date, date) from public, anon, authenticated;

-- El informe mensual suma dos números. Se agregan al final: la foto que ya
-- viajó en un informe enviado no los trae, y la pantalla dice «—».
drop function public.actividad_profesor(uuid, date);
create function public.actividad_profesor(p_profesor uuid, p_periodo date)
 RETURNS TABLE(alumnos integer, alumnos_activos integer, ejercicios_alumnos integer, clases_en_linea integer, clases_presenciales integer, minutos_clase integer, asistencias integer, tareas_puestas integer, tareas_completadas integer, tareas_vencidas integer, examenes_puestos integer, examenes_rendidos integer, nota_promedio numeric, notas_bitacora integer, planes_nuevos integer, clases_programadas integer, clases_programadas_dadas integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
#variable_conflict use_column
declare
  v_mes   date        := date_trunc('month', p_periodo)::date;
  v_desde timestamptz := v_mes::timestamp at time zone 'America/Costa_Rica';
  v_hasta timestamptz := (v_mes + interval '1 month')::timestamp at time zone 'America/Costa_Rica';
begin
  if p_profesor is null or p_periodo is null or not coalesce(
       p_profesor = auth.uid()
       or public.supervisado_por_mi(p_profesor)
       or coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false), false) then
    raise exception 'No supervisas a esa persona.' using errcode = '42501';
  end if;
  return query
  with al as (
    select distinct a.x as id
      from public.alumnos_de(p_profesor) a(x)
      join public.profiles p on p.id = a.x and p.role = 'alumno'
  ),
  ses as (
    select cs.id, cs.modalidad,
           least(extract(epoch from (coalesce(cs.ended_at, least(now(), v_hasta)) - cs.started_at)) / 60, 600) as mins
      from public.class_sessions cs
     where cs.created_by = p_profesor and cs.started_at >= v_desde and cs.started_at < v_hasta
  ),
  tar as (
    select f.situacion from public.tareas_con_avance(null, p_profesor) f
     where f.created_at >= v_desde and f.created_at < v_hasta
  ),
  exa as (
    select e.estado, e.nota from public.examenes e
     where e.profesor_id = p_profesor and e.created_at >= v_desde and e.created_at < v_hasta
  ),
  -- Solo cuentan las que ya terminaron: la de esta tarde todavía no se debe.
  oc as (
    select o.fecha, count(*)::int as n
      from public.ocurrencias_horario(p_profesor, v_mes, (v_mes + interval '1 month' - interval '1 day')::date) o
     where o.fin <= now()
     group by o.fecha
  ),
  -- Un día con dos clases programadas y una dada cuenta una: se compara por día.
  dadas as (
    select least(oc.n, (select count(*)::int from public.class_sessions cs
                         where cs.created_by = p_profesor
                           and (cs.started_at at time zone 'America/Costa_Rica')::date = oc.fecha)) as d
      from oc
  )
  select
    (select count(*)::int from al),
    (select count(distinct tp.student_id)::int from public.training_progress tp
      where tp.student_id in (select al.id from al) and tp.created_at >= v_desde and tp.created_at < v_hasta),
    (select count(*)::int from public.training_progress tp
      where tp.student_id in (select al.id from al) and tp.created_at >= v_desde and tp.created_at < v_hasta),
    (select count(*)::int from ses where ses.modalidad is distinct from 'presencial'),
    (select count(*)::int from ses where ses.modalidad = 'presencial'),
    (select coalesce(round(sum(greatest(ses.mins, 0))), 0)::int from ses),
    (select count(*)::int from public.class_attendance ca where ca.session_id in (select ses.id from ses)),
    (select count(*)::int from tar),
    (select count(*)::int from tar where tar.situacion = 'completada'),
    (select count(*)::int from tar where tar.situacion = 'vencida'),
    (select count(*)::int from exa),
    (select count(*)::int from exa where exa.estado in ('entregado', 'congelado')),
    (select round(avg(exa.nota), 2) from exa where exa.estado in ('entregado', 'congelado')),
    (select count(*)::int from public.notas_alumno n
      where n.profesor_id = p_profesor and n.created_at >= v_desde and n.created_at < v_hasta),
    (select count(*)::int from public.planes_clase pc
      where pc.profesor_id = p_profesor and pc.created_at >= v_desde and pc.created_at < v_hasta),
    (select coalesce(sum(oc.n), 0)::int from oc),
    (select coalesce(sum(dadas.d), 0)::int from dadas);
end;
$function$;
revoke execute on function public.actividad_profesor(uuid, date) from public, anon;
grant execute on function public.actividad_profesor(uuid, date) to authenticated, service_role;

-- El aviso de la ficha que falta: una clase presencial del horario terminó
-- hace más de una hora y ese día no hay ninguna clase suya registrada.
create table public.avisos_ficha_faltante (
  horario_id uuid not null references public.horario_clases(id) on delete cascade,
  fecha      date not null,
  enviado_at timestamptz not null default now(),
  primary key (horario_id, fecha)
);
alter table public.avisos_ficha_faltante enable row level security;
revoke all on public.avisos_ficha_faltante from public, anon, authenticated;

create or replace function public.avisar_fichas_faltantes()
returns int language plpgsql security definer set search_path to 'public' set row_security to off as $$
declare
  v_hoy date := (now() at time zone 'America/Costa_Rica')::date;
  v_n   int  := 0;
  r     record;
begin
  for r in
    select o.horario_id, o.profesor_id, o.fecha, h.titulo, h.grupo,
           to_char(o.inicio at time zone 'America/Costa_Rica', 'HH24:MI') as hora
      from public.ocurrencias_horario(null, v_hoy - 1, v_hoy) o
      join public.horario_clases h on h.id = o.horario_id
     where o.modalidad = 'presencial'
       and o.fin + interval '1 hour' <= now()
       and not exists (select 1 from public.class_sessions cs
                        where cs.created_by = o.profesor_id
                          and (cs.started_at at time zone 'America/Costa_Rica')::date = o.fecha)
  loop
    insert into public.avisos_ficha_faltante (horario_id, fecha)
    values (r.horario_id, r.fecha) on conflict do nothing;
    continue when not found;
    begin
      perform public.avisar_push(array[r.profesor_id], 'Falta pasar lista',
        'La clase de las ' || r.hora
          || coalesce(' (' || nullif(btrim(coalesce(r.titulo, r.grupo)), '') || ')', '')
          || case when r.fecha = v_hoy then ' de hoy' else ' de ayer' end
          || ' todavía no tiene ficha. Ya viene llena: solo marca quiénes llegaron.',
        '/asistencia.html?horario=' || r.horario_id || '&fecha=' || r.fecha,
        'ficha-faltante:' || r.horario_id || ':' || r.fecha);
    exception when others then null;
    end;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.avisar_fichas_faltantes() from public, anon, authenticated;

select cron.schedule('avisar-fichas-faltantes', '10 * * * *', 'select public.avisar_fichas_faltantes();');
