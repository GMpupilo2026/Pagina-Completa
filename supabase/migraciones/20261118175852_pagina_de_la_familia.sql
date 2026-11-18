-- La página de la familia: lo que hoy le llega a la casa por correo, en una
-- página que se abre con un enlace secreto, sin cuenta (familia.html#t=…).
--
-- Salió de comparar la Academia con otras plataformas (18/11/2026): era lo que
-- más tenían y nosotros no. La persona encargada sigue sin tener cuenta: el
-- enlace es de UN encargado y muestra a UN alumno. Lo enciende quien le da
-- clase (o quien administra) desde Informes, y lo puede apagar o cambiar.
--
-- Qué hay acá:
--   · familia_enlaces: el token de cada encargado. Nadie la lee desde afuera;
--     reparte acceso, así que lleva el trigger de auditoría.
--   · familia_enlace() / familia_enlace_apagar(): encender (o cambiar) y
--     apagar el enlace. Solo un profesor del alumno o quien administra.
--   · familia_pagina(token): todo lo que pinta la página, de una vez. Para
--     anon. Las faltas que muestra son solo las SEGURAS: una clase con lista
--     en la que estaba y no fue. La clase sin lista de otro grupo del mismo
--     profe no es una falta suya, y decírselo a una familia sería mentirle.
--   · familia_avisar_ausencia(token, …): deja una justificación «pendiente»
--     a nombre de la familia, con el freno de los envíos sin cuenta.
--
-- Ver «La página de la familia» en docs/decisiones/informes.md.

create table public.familia_enlaces (
  encargado_id uuid primary key references public.encargados(id) on delete cascade,
  token        text not null unique check (token ~ '^[0-9a-f]{64}$'),
  creado       timestamptz not null default now(),
  creado_por   uuid references public.profiles(id) on delete set null,
  visto_at     timestamptz
);
comment on table public.familia_enlaces is
  'El enlace secreto de la página de la familia, uno por encargado. Sin políticas: lo escriben y lo leen solo las funciones familia_*.';
alter table public.familia_enlaces enable row level security;
revoke all on public.familia_enlaces from anon, authenticated;
create trigger auditar after insert or delete or update on public.familia_enlaces
  for each row execute function interno.auditar();

-- ¿Puede quien llama manejar el enlace de este encargado? (su alumno es suyo,
-- o administra). Devuelve el alumno, o null.
create function interno.familia_alumno_si_puedo(p_encargado uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select e.student_id
    from public.encargados e
   where e.id = p_encargado
     and coalesce(
           (select p.is_admin from public.profiles p where p.id = (select auth.uid()))
           or public.soy_profesor_de(e.student_id), false);
$$;
revoke execute on function interno.familia_alumno_si_puedo(uuid) from public, anon;

-- Encender el enlace (o, con p_renovar, cambiarlo: el anterior deja de servir).
create function public.familia_enlace(p_encargado uuid, p_renovar boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_alumno uuid := interno.familia_alumno_si_puedo(p_encargado);
  v_token text;
  v_visto timestamptz;
begin
  if v_alumno is null then raise exception 'No puedes manejar el enlace de esta familia.'; end if;
  if p_renovar then delete from public.familia_enlaces where encargado_id = p_encargado; end if;
  insert into public.familia_enlaces (encargado_id, token, creado_por)
  values (p_encargado, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), auth.uid())
  on conflict (encargado_id) do nothing;
  select token, visto_at into v_token, v_visto from public.familia_enlaces where encargado_id = p_encargado;
  return jsonb_build_object('token', v_token, 'visto_at', v_visto);
end;
$$;
revoke execute on function public.familia_enlace(uuid, boolean) from public, anon;
grant execute on function public.familia_enlace(uuid, boolean) to authenticated;

create function public.familia_enlace_apagar(p_encargado uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if interno.familia_alumno_si_puedo(p_encargado) is null then
    raise exception 'No puedes manejar el enlace de esta familia.';
  end if;
  delete from public.familia_enlaces where encargado_id = p_encargado;
end;
$$;
revoke execute on function public.familia_enlace_apagar(uuid) from public, anon;
grant execute on function public.familia_enlace_apagar(uuid) to authenticated;

-- Cuáles encargados de un alumno tienen el enlace encendido (para Informes).
-- No devuelve el token: ese se pide con familia_enlace().
create function public.familia_enlaces_de(p_alumno uuid)
returns table (encargado_id uuid, creado timestamptz, visto_at timestamptz)
language sql stable security definer set search_path = public as $$
  select f.encargado_id, f.creado, f.visto_at
    from public.familia_enlaces f
    join public.encargados e on e.id = f.encargado_id
   where e.student_id = p_alumno
     and coalesce(
           (select p.is_admin from public.profiles p where p.id = (select auth.uid()))
           or public.soy_profesor_de(p_alumno), false);
$$;
revoke execute on function public.familia_enlaces_de(uuid) from public, anon;
grant execute on function public.familia_enlaces_de(uuid) to authenticated;

-- Todo lo que pinta la página, de una vez.
create function public.familia_pagina(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_enc record;
  v_alumno uuid;
  hoy date := (now() at time zone 'America/Costa_Rica')::date;
  -- El lunes de esta semana, a medianoche de Costa Rica.
  v_lunes timestamptz := (date_trunc('week', now() at time zone 'America/Costa_Rica')) at time zone 'America/Costa_Rica';
  v_out jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'enlace');
  end if;
  select e.id, e.nombre, e.student_id, e.activo into v_enc
    from public.familia_enlaces f join public.encargados e on e.id = f.encargado_id
   where f.token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'enlace'); end if;
  v_alumno := v_enc.student_id;
  update public.familia_enlaces set visto_at = now() where token = p_token;

  -- Quien abre el enlace con una sesión de la Academia en ese navegador llega
  -- con SU identidad, y las funciones del informe la revisarían como si fuera
  -- un profesor pidiendo a un alumno ajeno. Acá la identidad es el token: el
  -- resto de este pedido corre sin usuario, como la tanda de los correos.
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  select jsonb_build_object(
    'ok', true,
    'al_dia', now(),
    'encargado', v_enc.nombre,
    'alumno', (select jsonb_build_object('nombre', p.full_name, 'grupo', p.grupo) from public.profiles p where p.id = v_alumno),
    'informe', public.informe_de_alumno(v_alumno, v_lunes, now()),
    -- Sus clases de los próximos 28 días (la primera es «la próxima»).
    'proximas', coalesce((
      select jsonb_agg(x order by x->>'inicio') from (
        select jsonb_build_object('inicio', o.inicio, 'fin', o.fin, 'fecha', o.fecha,
                 'titulo', nullif(btrim(h.titulo), ''), 'modalidad', o.modalidad,
                 'profesor', nullif(btrim(pr.full_name), '')) as x
          from public.horario_clases h
          cross join lateral public.ocurrencias_horario(h.profesor_id, hoy, hoy + 28) o
          join public.profiles pr on pr.id = h.profesor_id
         where h.id in (select interno.horarios_del_alumno(v_alumno))
           and o.horario_id = h.id and o.fin > now()
           and not exists (select 1 from public.dias_sin_clase s
                            where s.fecha = o.fecha and (s.profesor_id is null or s.profesor_id = h.profesor_id))
         order by o.inicio limit 8) q), '[]'::jsonb),
    -- Las clases cerradas de los últimos 35 días: a las que fue, y las faltas
    -- seguras (había lista, estaba en ella y no fue).
    'asistencia', coalesce((
      select jsonb_agg(x order by x->>'inicio' desc) from (
        select jsonb_build_object('inicio', cs.started_at,
                 'presente', ca.student_id is not null,
                 'tarde', coalesce(ca.minutos_tarde, 0),
                 'justificada', ca.student_id is null and exists (
                    select 1 from public.justificaciones_ausencia ja
                     where ja.student_id = v_alumno and ja.estado = 'aceptada'
                       and (cs.started_at at time zone 'America/Costa_Rica')::date between ja.fecha_desde and ja.fecha_hasta)) as x
          from public.class_sessions cs
          left join public.class_attendance ca on ca.session_id = cs.id and ca.student_id = v_alumno
         where cs.ended_at is not null
           and cs.started_at >= now() - interval '35 days'
           and cs.created_by in (select interno.profesores_de(v_alumno))
           and (ca.student_id is not null
                or (cs.solo_asignados and exists (select 1 from public.clase_asignados a
                                                   where a.class_session_id = cs.id and a.student_id = v_alumno)))
         order by cs.started_at desc limit 12) q), '[]'::jsonb),
    -- Las tareas ya disponibles, las más nuevas primero.
    'tareas', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object('titulo', t.titulo, 'vence_at', t.vence_at,
                 'renglones', t.renglones, 'cumplidos', t.cumplidos, 'situacion', t.situacion) as x
          from public.tareas_con_avance(v_alumno, null, false, null) t
         where t.situacion <> 'programada'
           and (t.situacion = 'pendiente' or t.vence_at >= now() - interval '45 days')
         order by t.vence_at desc limit 8) q), '[]'::jsonb),
    'cobros', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object('concepto', c.concepto, 'monto', c.monto, 'moneda', c.moneda,
                 'vence', c.vence, 'saldo', c.saldo, 'situacion', c.situacion,
                 'periodo_inicio', c.periodo_inicio, 'periodo_fin', c.periodo_fin,
                 'ultimo_pago', c.ultimo_pago) as x
          from public.cobros_vista c
         where c.student_id = v_alumno and c.situacion <> 'anulado'
         order by c.vence desc nulls last limit 6) q), '[]'::jsonb),
    'recibos', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object('numero', r.numero, 'fecha', r.fecha, 'total', r.total,
                 'moneda', r.moneda, 'metodo', r.metodo) as x
          from public.recibos_vista r
         where r.student_id = v_alumno and r.estado <> 'anulado'
         order by r.fecha desc limit 6) q), '[]'::jsonb),
    -- Las ausencias avisadas que todavía importan.
    'avisos', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object('desde', ja.fecha_desde, 'hasta', ja.fecha_hasta,
                 'motivo', ja.motivo, 'estado', ja.estado) as x
          from public.justificaciones_ausencia ja
         where ja.student_id = v_alumno and ja.fecha_hasta >= hoy - 7
         order by ja.fecha_desde limit 6) q), '[]'::jsonb)
  ) into v_out;
  return v_out;
end;
$$;
revoke execute on function public.familia_pagina(text) from public;
grant execute on function public.familia_pagina(text) to anon, authenticated;

-- El freno de los envíos sin cuenta aprende un tipo nuevo. Se reescribe la
-- función tal como está, con una línea más (como las colas del informe).
do $$
declare
  d text := pg_get_functiondef('interno.frenar_envio_publico(text,text,text,text)'::regprocedure);
  marca text := E'    else raise exception ''tipo de envío desconocido: %'', p_tipo;';
  nueva text;
begin
  if position(marca in d) = 0 then raise exception 'frenar_envio_publico cambió: no encuentro dónde sumar el tipo'; end if;
  nueva := replace(d, marca,
    E'    -- El aviso de ausencia desde la página de la familia: una familia avisa\n'
    || E'    -- unas pocas al mes. Seis al día por encargado sobra, y frena un enlace\n'
    || E'    -- reenviado que alguien se ponga a apretar.\n'
    || E'    when ''familia_ausencia'' then tope_ip := 12; tope_correo := 6; periodo_correo := interval ''1 day''; tope_total := 200;\n'
    || marca);
  execute nueva;
end $$;

-- Avisar una ausencia desde la página de la familia.
create function public.familia_avisar_ausencia(p_token text, p_fecha date, p_motivo text, p_detalle text, p_privacidad text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_enc record;
  v_alumno uuid;
  hoy date := (now() at time zone 'America/Costa_Rica')::date;
  v_detalle text := btrim(coalesce(p_detalle, ''));
  v_freno text;
  v_id uuid;
  nombre text;
  destinos uuid[];
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'Este enlace no sirve. Pídele uno nuevo a su profe.');
  end if;
  select e.id, e.nombre, e.email, e.student_id into v_enc
    from public.familia_enlaces f join public.encargados e on e.id = f.encargado_id
   where f.token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Este enlace no sirve. Pídele uno nuevo a su profe.');
  end if;
  v_alumno := v_enc.student_id;
  if not coalesce(interno.version_legal_valida(p_privacidad), false) then
    return jsonb_build_object('ok', false, 'error', 'Falta aceptar la política de privacidad.');
  end if;
  if p_fecha is null or p_fecha < hoy or p_fecha > hoy + 28 then
    return jsonb_build_object('ok', false, 'error', 'Elige una clase de las próximas cuatro semanas.');
  end if;
  if p_motivo is null or p_motivo not in ('salud', 'cita', 'familiar', 'estudios', 'viaje', 'otro') then
    return jsonb_build_object('ok', false, 'error', 'Elige el motivo de la ausencia.');
  end if;
  if char_length(v_detalle) > 300 then
    return jsonb_build_object('ok', false, 'error', 'La nota es muy larga: caben 300 caracteres.');
  end if;

  v_freno := interno.frenar_envio_publico('familia_ausencia', v_alumno::text, v_enc.email);
  if v_freno is not null then return jsonb_build_object('ok', false, 'error', v_freno); end if;

  begin
    insert into public.justificaciones_ausencia
      (student_id, fecha_desde, fecha_hasta, motivo, detalle, adjuntos, privacidad_version)
    values (v_alumno, p_fecha, p_fecha, p_motivo,
            'Avisada por su familia (' || coalesce(nullif(btrim(v_enc.nombre), ''), 'encargado') || ').'
              || case when v_detalle <> '' then ' ' || v_detalle else '' end,
            '[]'::jsonb, p_privacidad)
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'Esa ausencia ya estaba avisada.');
  end;

  -- El aviso al celular, como el de la justificación del alumno. Si falla, el
  -- aviso de la familia queda igual.
  begin
    select coalesce(nullif(btrim(p.full_name), ''), 'un alumno') into nombre from public.profiles p where p.id = v_alumno;
    select array_agg(distinct d) into destinos from (
      select interno.profesores_de(v_alumno) as d
      union select interno.coordinadores_de(v_alumno)
      union select public.supervisores_de(v_alumno)
    ) x where d is not null and d <> v_alumno;
    perform public.avisar_push(destinos, 'Aviso de ausencia',
      'La familia de ' || nombre || ' avisó que falta el ' || to_char(p_fecha, 'DD/MM/YYYY') || '.',
      '/justificaciones.html', 'justificacion-' || v_id::text);
  exception when others then
    raise warning 'No salió el aviso de la ausencia %: %', v_id, sqlerrm;
  end;
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.familia_avisar_ausencia(text, date, text, text, text) from public;
grant execute on function public.familia_avisar_ausencia(text, date, text, text, text) to anon, authenticated;
