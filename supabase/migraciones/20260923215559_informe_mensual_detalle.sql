-- El informe mensual con el detalle por clase y por estudiante, en línea y
-- presencial juntos. Ver «El detalle del informe mensual» en CLAUDE.md.

-- El detalle crudo: TODAS las clases del profesor en el mes y TODOS sus
-- alumnos, sin filtrar por quién mira. Es interna: solo la llaman las otras
-- funciones de acá, que deciden qué parte ve cada quien.
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
           'titulo', ses.titulo, 'notas', ses.notas, 'minutos', round(ses.mins)::int,
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

-- Qué parte del detalle ve quien mira. El profesor y quien administra, todo.
-- Quien supervisa, las clases enteras (son números, sin nombres) pero solo los
-- estudiantes que supervisa: un profesor puede estar en dos academias, y el
-- supervisor de una no tiene por qué ver los nombres de los alumnos de la otra.
create or replace function public.detalle_para_mi(p_profesor uuid, p_detalle jsonb)
returns jsonb language plpgsql stable security definer set search_path to 'public' set row_security to off as $$
declare
  v_fuera int;
begin
  if p_detalle is null then return null; end if;
  if auth.uid() = p_profesor or public.soy_admin() then
    return p_detalle || jsonb_build_object('alumnos_fuera', 0);
  end if;
  select count(*) into v_fuera from jsonb_array_elements(p_detalle->'alumnos') a
   where not public.supervisado_por_mi((a->>'id')::uuid);
  return jsonb_set(p_detalle, '{alumnos}', coalesce((
           select jsonb_agg(a) from jsonb_array_elements(p_detalle->'alumnos') a
            where public.supervisado_por_mi((a->>'id')::uuid)), '[]'::jsonb))
         || jsonb_build_object('alumnos_fuera', v_fuera);
end;
$$;

-- El detalle de hoy de un mes (para el borrador o para lo que todavía no se envió).
create or replace function public.detalle_mensual_profesor(p_profesor uuid, p_periodo date)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if p_profesor is null or p_periodo is null or not (
       p_profesor = auth.uid() or public.supervisado_por_mi(p_profesor) or public.soy_admin()) then
    raise exception 'No supervisas a esa persona.' using errcode = '42501';
  end if;
  return public.detalle_para_mi(p_profesor, public.detalle_mensual_crudo(p_profesor, p_periodo));
end;
$$;

-- La foto del detalle, tomada al ENVIAR. Sin ninguna política: solo se lee por
-- detalle_informe_mensual(), que filtra los estudiantes para quien supervisa.
-- Si viviera en informes_profesor.datos, la RLS de esa tabla se la entregaría
-- entera al supervisor.
create table if not exists public.informes_profesor_detalle (
  informe_id uuid primary key references public.informes_profesor(id) on delete cascade,
  detalle    jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.informes_profesor_detalle enable row level security;
revoke all on public.informes_profesor_detalle from anon, authenticated;
grant all on public.informes_profesor_detalle to service_role;

create or replace function public.detalle_informe_mensual(p_informe uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' set row_security to off as $$
declare
  v public.informes_profesor;
  d jsonb;
begin
  select * into v from public.informes_profesor where id = p_informe;
  if not found or not (
       v.profesor_id = auth.uid()
       or public.soy_admin()
       or (v.estado = 'enviado' and public.supervisado_por_mi(v.profesor_id))) then
    raise exception 'Ese informe no está a tu cargo.' using errcode = '42501';
  end if;
  select detalle into d from public.informes_profesor_detalle where informe_id = p_informe;
  return public.detalle_para_mi(v.profesor_id, d);
end;
$$;

-- guardar_informe_mensual(), igual que antes más la foto del detalle al enviar.
create or replace function public.guardar_informe_mensual(p_periodo date, p_resumen text, p_logros text, p_dificultades text, p_proximo text, p_enviar boolean DEFAULT false)
 RETURNS informes_profesor
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- La foto del detalle, en el mismo acto que el envío: si fallara, el envío
  -- falla entero y no queda un informe enviado sin su detalle.
  if v_fila.estado = 'enviado' then
    insert into public.informes_profesor_detalle (informe_id, detalle)
    values (v_fila.id, public.detalle_mensual_crudo(auth.uid(), v_mes))
    on conflict (informe_id) do update set detalle = excluded.detalle, created_at = now();
  end if;

  -- El aviso no puede deshacer el envío: si falla, el informe queda enviado igual.
  if v_fila.estado = 'enviado' then
    begin
      select coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1)) into v_nombre
        from public.profiles p where p.id = auth.uid();
      select array_agg(s) into v_sup from public.supervisores_de(auth.uid()) s;
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
$function$;

revoke execute on function public.detalle_mensual_crudo(uuid, date) from public, anon, authenticated;
grant execute on function public.detalle_mensual_crudo(uuid, date) to service_role;
revoke execute on function public.detalle_para_mi(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.detalle_para_mi(uuid, jsonb) to service_role;
do $$
declare f text;
begin
  foreach f in array array['public.detalle_mensual_profesor(uuid,date)', 'public.detalle_informe_mensual(uuid)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
