-- Supervisar a los profesores, y el informe mensual que cada profesor le manda
-- a su supervisión. La actividad de un profesor la da actividad_profesor(), UNA
-- sola cuenta que usan la pantalla del profesor, la de supervisión y la foto que
-- se guarda al enviar el informe: si cada una contara por su lado, el profesor
-- mandaría unos números y su supervisora leería otros.

create or replace function public.mes_en_palabras(p_periodo date)
returns text language sql immutable set search_path to '' as $$
  select (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
                'septiembre','octubre','noviembre','diciembre'])[extract(month from p_periodo)::int]
         || ' de ' || extract(year from p_periodo)::int;
$$;

-- El mes se cuenta en hora de Costa Rica, como la racha y los informes a la casa.
create or replace function public.actividad_profesor(p_profesor uuid, p_periodo date)
returns table (alumnos integer, alumnos_activos integer, ejercicios_alumnos integer,
               clases_en_linea integer, clases_presenciales integer, minutos_clase integer,
               asistencias integer, tareas_puestas integer, tareas_completadas integer,
               tareas_vencidas integer, examenes_puestos integer, examenes_rendidos integer,
               nota_promedio numeric, notas_bitacora integer, planes_nuevos integer)
language plpgsql stable security definer set search_path to 'public' set row_security to off as $$
#variable_conflict use_column
declare
  v_mes   date        := date_trunc('month', p_periodo)::date;
  v_desde timestamptz := v_mes::timestamp at time zone 'America/Costa_Rica';
  v_hasta timestamptz := (v_mes + interval '1 month')::timestamp at time zone 'America/Costa_Rica';
begin
  if p_profesor is null or p_periodo is null or not (
       p_profesor = auth.uid()
       or public.supervisado_por_mi(p_profesor)
       or coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)) then
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
      where pc.profesor_id = p_profesor and pc.created_at >= v_desde and pc.created_at < v_hasta);
end;
$$;

-- Un informe por profesor y por mes. Nadie lo escribe desde el navegador: lo
-- guarda guardar_informe_mensual() y lo revisa revisar_informe_mensual().
create table if not exists public.informes_profesor (
  id             uuid primary key default gen_random_uuid(),
  profesor_id    uuid not null references public.profiles(id) on delete cascade,
  periodo        date not null check (extract(day from periodo) = 1),
  resumen        text not null default '' check (char_length(resumen) <= 4000),
  logros         text not null default '' check (char_length(logros) <= 2000),
  dificultades   text not null default '' check (char_length(dificultades) <= 2000),
  proximo_mes    text not null default '' check (char_length(proximo_mes) <= 2000),
  datos          jsonb,
  estado         text not null default 'borrador' check (estado in ('borrador', 'enviado')),
  enviado_at     timestamptz,
  leido_at       timestamptz,
  leido_por      uuid references public.profiles(id) on delete set null,
  comentario     text not null default '' check (char_length(comentario) <= 2000),
  comentario_at  timestamptz,
  comentario_por uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (profesor_id, periodo)
);
alter table public.informes_profesor enable row level security;
revoke all on public.informes_profesor from anon;
revoke insert, update, delete on public.informes_profesor from authenticated;
drop policy if exists informes_profesor_select on public.informes_profesor;
create policy informes_profesor_select on public.informes_profesor for select to authenticated
  using (profesor_id = auth.uid()
         or (estado = 'enviado'
             and (public.supervisado_por_mi(profesor_id)
                  or coalesce((select mp.is_admin from public.my_profile() mp), false))));

create or replace function public.guardar_informe_mensual(
  p_periodo date, p_resumen text, p_logros text, p_dificultades text, p_proximo text,
  p_enviar boolean default false)
returns public.informes_profesor language plpgsql security definer set search_path to 'public' as $$
declare
  v_mes    date := date_trunc('month', p_periodo)::date;
  v_hoy    date := date_trunc('month', now() at time zone 'America/Costa_Rica')::date;
  v_enviar boolean := coalesce(p_enviar, false);
  v_fila   public.informes_profesor;
  v_datos  jsonb;
  v_nombre text;
  v_sup    uuid[];
begin
  if auth.uid() is null or not coalesce((select p.role = 'profesor' or p.is_admin
                                           from public.profiles p where p.id = auth.uid()), false) then
    raise exception 'El informe mensual es de quien da clase.' using errcode = '42501';
  end if;
  if p_periodo is null or v_mes > v_hoy then
    raise exception 'No se puede informar de un mes que todavía no empieza.';
  end if;
  if v_mes < v_hoy - interval '12 months' then
    raise exception 'Ese mes es de hace más de un año.';
  end if;
  select * into v_fila from public.informes_profesor
   where profesor_id = auth.uid() and periodo = v_mes for update;
  if found and v_fila.estado = 'enviado' then
    raise exception 'El informe de % ya se envió y no se puede cambiar.', public.mes_en_palabras(v_mes);
  end if;
  if v_enviar and char_length(btrim(coalesce(p_resumen, ''))) < 20 then
    raise exception 'Escribe un resumen de lo que hiciste en el mes (unas pocas líneas) antes de enviarlo.';
  end if;
  if v_enviar then
    select to_jsonb(a) into v_datos from public.actividad_profesor(auth.uid(), v_mes) a;
  end if;
  insert into public.informes_profesor as i
         (profesor_id, periodo, resumen, logros, dificultades, proximo_mes, datos, estado, enviado_at)
  values (auth.uid(), v_mes, btrim(coalesce(p_resumen, '')), btrim(coalesce(p_logros, '')),
          btrim(coalesce(p_dificultades, '')), btrim(coalesce(p_proximo, '')), v_datos,
          case when v_enviar then 'enviado' else 'borrador' end,
          case when v_enviar then now() end)
  on conflict (profesor_id, periodo) do update set
    resumen = excluded.resumen, logros = excluded.logros, dificultades = excluded.dificultades,
    proximo_mes = excluded.proximo_mes, datos = excluded.datos, estado = excluded.estado,
    enviado_at = excluded.enviado_at, updated_at = now()
  returning * into v_fila;

  -- El aviso no puede deshacer el envío: si falla, el informe queda enviado igual.
  if v_fila.estado = 'enviado' then
    begin
      select coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1)) into v_nombre
        from public.profiles p where p.id = auth.uid();
      select array_agg(sc.supervisor_id) into v_sup
        from public.supervisor_cuentas sc
        join public.profiles s on s.id = sc.supervisor_id and s.es_supervisor
       where sc.persona_id = auth.uid();
      if coalesce(array_length(v_sup, 1), 0) > 0 then
        perform public.avisar_push(v_sup, 'Informe mensual',
          v_nombre || ' envió su informe de ' || public.mes_en_palabras(v_mes) || '.',
          '/supervision.html', 'informe-profesor:' || v_fila.id);
      end if;
    exception when others then null;
    end;
  end if;
  return v_fila;
end;
$$;

create or replace function public.revisar_informe_mensual(p_id uuid, p_comentario text default null)
returns public.informes_profesor language plpgsql security definer set search_path to 'public' as $$
declare
  v     public.informes_profesor;
  v_com text := btrim(coalesce(p_comentario, ''));
begin
  select * into v from public.informes_profesor where id = p_id for update;
  if not found or v.estado <> 'enviado' or not (
       public.supervisado_por_mi(v.profesor_id)
       or coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)) then
    raise exception 'Ese informe no está a tu cargo.' using errcode = '42501';
  end if;
  if char_length(v_com) > 2000 then
    raise exception 'El comentario es demasiado largo (máximo 2000 caracteres).';
  end if;
  update public.informes_profesor set
    leido_at       = coalesce(leido_at, now()),
    leido_por      = coalesce(leido_por, auth.uid()),
    comentario     = case when v_com <> '' then v_com else comentario end,
    comentario_at  = case when v_com <> '' then now() else comentario_at end,
    comentario_por = case when v_com <> '' then auth.uid() else comentario_por end
   where id = p_id
   returning * into v;
  if v_com <> '' then
    begin
      perform public.avisar_push(array[v.profesor_id], 'Comentario a tu informe',
        'Tu supervisión comentó tu informe de ' || public.mes_en_palabras(v.periodo) || '.',
        '/informe-mensual.html', 'informe-mensual:' || v.id);
    exception when others then null;
    end;
  end if;
  return v;
end;
$$;

-- Los profesores a cargo de quien supervisa (o todos, para quien administra),
-- con su actividad del mes y si mandaron el informe.
create or replace function public.resumen_profesores_supervisados(p_periodo date)
returns table (id uuid, nombre text, grupo text, actividad jsonb,
               informe_id uuid, enviado_at timestamptz, leido_at timestamptz, comentado boolean)
language plpgsql stable security definer set search_path to 'public' set row_security to off as $$
#variable_conflict use_column
declare
  v_admin boolean;
  v_mes   date := date_trunc('month', p_periodo)::date;
begin
  select coalesce(p.is_admin, false) into v_admin from public.profiles p where p.id = auth.uid();
  if p_periodo is null or not (coalesce(v_admin, false) or public.soy_supervisor()) then
    raise exception 'Solo quien supervisa o administra ve esto.' using errcode = '42501';
  end if;
  return query
  select p.id,
         coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1)),
         p.grupo,
         (select to_jsonb(a) from public.actividad_profesor(p.id, v_mes) a),
         i.id, i.enviado_at, i.leido_at, (i.comentario <> '')
    from public.profiles p
    left join public.informes_profesor i
      on i.profesor_id = p.id and i.periodo = v_mes and i.estado = 'enviado'
   where p.role = 'profesor' and p.id <> auth.uid()
     and (coalesce(v_admin, false) or exists (
           select 1 from public.supervisor_cuentas sc
            where sc.supervisor_id = auth.uid() and sc.persona_id = p.id))
   order by 2;
end;
$$;

-- A quién le llega el informe de quien llama.
create or replace function public.mis_supervisores()
returns table (id uuid, nombre text)
language sql stable security definer set search_path to 'public' as $$
  select s.id, coalesce(nullif(btrim(s.full_name), ''), split_part(s.email, '@', 1))
    from public.supervisor_cuentas sc
    join public.profiles s on s.id = sc.supervisor_id and s.es_supervisor
   where sc.persona_id = auth.uid()
   order by 2;
$$;

revoke execute on function public.mes_en_palabras(date) from public, anon;
revoke execute on function public.actividad_profesor(uuid, date) from public, anon;
revoke execute on function public.guardar_informe_mensual(date, text, text, text, text, boolean) from public, anon;
revoke execute on function public.revisar_informe_mensual(uuid, text) from public, anon;
revoke execute on function public.resumen_profesores_supervisados(date) from public, anon;
revoke execute on function public.mis_supervisores() from public, anon;
grant execute on function public.mes_en_palabras(date) to authenticated, service_role;
grant execute on function public.actividad_profesor(uuid, date) to authenticated, service_role;
grant execute on function public.guardar_informe_mensual(date, text, text, text, text, boolean) to authenticated, service_role;
grant execute on function public.revisar_informe_mensual(uuid, text) to authenticated, service_role;
grant execute on function public.resumen_profesores_supervisados(date) to authenticated, service_role;
grant execute on function public.mis_supervisores() to authenticated, service_role;
