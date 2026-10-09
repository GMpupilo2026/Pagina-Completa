-- Puntos Ajedrez, segunda parte (A): retos de la semana y el marcador del salón.
-- Los regalos y las bromas van en 20261008170100. Ver «Retos, marcador, regalos y bromas»
-- en docs/decisiones/puntos-y-premios.md.
--
-- «Compañero» es lo mismo que ya usan los retos de ejercicios
-- (public.es_companero): comparten al menos un profesor Y una academia. Nada
-- de esto cruza entre academias.
--
-- De paso arregla un error de la primera parte: las tareas nunca pagaban.
-- El trigger miraba tareas.estado, que quedó sin uso desde que una tarea se
-- da por completada CALCULANDO sus renglones (tareas_con_avance()). Ahora la
-- tarea se paga al reclamar lo pendiente, igual que la racha.
set local lock_timeout = '8s';

-- =====================================================================
-- 0. Orígenes nuevos en el ledger, y otorgar_puntos dice cuánto pagó.
-- =====================================================================
alter table public.puntos_ajustes drop constraint puntos_ajustes_origen_check;
alter table public.puntos_ajustes add constraint puntos_ajustes_origen_check
  check (origen in ('clase', 'entrenamiento', 'tarea', 'examen', 'racha', 'reto_semanal',
                    'canje', 'regalo', 'broma', 'ajuste_manual'));

-- Devuelve lo que de verdad se anotó (0 si ese evento ya estaba pagado):
-- así quien reclama sabe qué es nuevo sin mirar el saldo antes y después.
drop function interno.otorgar_puntos(uuid, integer, text, text, text, uuid);
create function interno.otorgar_puntos(
  p_alumno uuid,
  p_cantidad integer,
  p_origen text,
  p_motivo text,
  p_referencia text default null,
  p_creado_por uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mult integer := 1;
  v_n integer;
begin
  if p_alumno is null or p_cantidad is null or p_cantidad = 0 then
    return 0;
  end if;
  if p_cantidad > 0 and p_origen in ('clase', 'entrenamiento', 'tarea', 'examen', 'racha', 'reto_semanal') then
    select 2 into v_mult
      from public.premios_canjeados pc
      join public.premios_catalogo cat on cat.id = pc.premio_id
     where pc.student_id = p_alumno
       and cat.tipo_efecto = 'doble_puntos'
       and pc.vigente_hasta is not null and pc.vigente_hasta > now()
     limit 1;
    v_mult := coalesce(v_mult, 1);
  end if;
  insert into public.puntos_ajustes (student_id, cantidad, origen, motivo, referencia, creado_por)
  values (p_alumno, p_cantidad * v_mult, p_origen, left(btrim(coalesce(p_motivo, '')), 200), p_referencia, p_creado_por)
  on conflict (student_id, origen, referencia) where referencia is not null do nothing;
  get diagnostics v_n = row_count;
  return case when v_n > 0 then p_cantidad * v_mult else 0 end;
end;
$$;
revoke all on function interno.otorgar_puntos(uuid, integer, text, text, text, uuid) from public, anon, authenticated;

-- El trigger de tareas no se disparaba nunca (ver arriba): se va.
drop trigger if exists otorgar_puntos_de_tarea on public.tareas;
drop function if exists interno.otorgar_puntos_de_tarea();

-- =====================================================================
-- 1. Frases fijas para regalos y bromas: nada de texto libre entre alumnos
--    (muchos son menores). Viven en la base para que la pantalla y la
--    función que valida lean la misma lista.
-- =====================================================================
create table public.frases_regalo (
  clave text primary key check (clave ~ '^[a-z0-9_]{3,30}$'),
  texto text not null check (char_length(texto) between 3 and 80),
  uso text not null check (uso in ('regalo', 'broma')),
  orden integer not null default 0
);
alter table public.frases_regalo enable row level security;
revoke all on public.frases_regalo from public, anon, authenticated;
grant select on public.frases_regalo to authenticated;
create policy frases_regalo_select on public.frases_regalo for select to authenticated using (true);

insert into public.frases_regalo (clave, texto, uso, orden) values
  ('felicidades', '¡Felicidades!', 'regalo', 10),
  ('gran_partida', '¡Qué gran partida!', 'regalo', 20),
  ('gracias', 'Gracias por ayudarme.', 'regalo', 30),
  ('suerte', '¡Mucha suerte en el torneo!', 'regalo', 40),
  ('cumple', '¡Feliz cumpleaños!', 'regalo', 50),
  ('animo', '¡Ánimo, tú puedes!', 'regalo', 60),
  ('reto_puntos', '¡Te reto a pasarme en puntos esta semana!', 'broma', 10),
  ('jaque_broma', 'Jaque… ¡pero de broma!', 'broma', 20),
  ('cuac', 'Cuac. Eso es todo.', 'broma', 30),
  ('peon_saludos', '¡Mi peón te manda saludos!', 'broma', 40),
  ('te_vigilo', 'Te estoy vigilando… desde la casilla e4.', 'broma', 50);

-- =====================================================================
-- 2. Retos de la semana: de lunes a domingo, en hora de Costa Rica.
-- =====================================================================
create table public.retos_semanales (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique check (clave ~ '^[a-z0-9_]{3,40}$'),
  nombre text not null,
  descripcion text not null default '',
  emoji text not null default '🎯',
  metrica text not null check (metrica in ('ejercicios', 'dias_activos', 'tareas')),
  meta integer not null check (meta > 0 and meta <= 1000),
  bono integer not null check (bono > 0 and bono <= 500),
  activo boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);
comment on table public.retos_semanales is
  'Retos de la semana de Puntos Ajedrez. Se cumplen solos (los cuenta interno.avance_reto) y se cobran al reclamar lo pendiente. Solo los edita quien administra.';
alter table public.retos_semanales enable row level security;
revoke all on public.retos_semanales from public, anon;
grant select, insert, update, delete on public.retos_semanales to authenticated;
create policy retos_semanales_select on public.retos_semanales for select to authenticated
  using (activo or (select public.soy_admin()));
create policy retos_semanales_insert on public.retos_semanales for insert to authenticated
  with check ((select public.soy_admin()));
create policy retos_semanales_update on public.retos_semanales for update to authenticated
  using ((select public.soy_admin())) with check ((select public.soy_admin()));
create policy retos_semanales_delete on public.retos_semanales for delete to authenticated
  using ((select public.soy_admin()));

insert into public.retos_semanales (clave, nombre, descripcion, emoji, metrica, meta, bono, orden) values
  ('ejercicios_30', 'Treinta ejercicios', 'Resuelve 30 ejercicios de Entrenamiento esta semana.', '🎯', 'ejercicios', 30, 40, 10),
  ('dias_4', 'Cuatro días de entrenamiento', 'Entrena 4 días esta semana, con al menos 5 ejercicios cada día.', '📅', 'dias_activos', 4, 60, 20),
  ('tareas_2', 'Tareas al día', 'Completa 2 tareas esta semana.', '📋', 'tareas', 2, 30, 30);

-- Cuánto lleva un alumno en una métrica desde un momento. «tareas» cuenta
-- las tareas que se le pagaron (una tarea completada se nota al reclamar:
-- su completud se calcula, no tiene hora propia).
create or replace function interno.avance_reto(p_alumno uuid, p_metrica text, p_desde timestamptz)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select (case p_metrica
    when 'ejercicios' then (
      select count(*) from public.training_progress tp
       where tp.student_id = p_alumno and tp.created_at >= p_desde)
    when 'dias_activos' then (
      select count(*) from (
        select (tp.created_at at time zone 'America/Costa_Rica')::date
          from public.training_progress tp
         where tp.student_id = p_alumno and tp.created_at >= p_desde
         group by 1 having count(*) >= 5) d)
    when 'tareas' then (
      select count(*) from public.puntos_ajustes pa
       where pa.student_id = p_alumno and pa.origen = 'tarea' and pa.created_at >= p_desde)
    else 0 end)::integer;
$$;
revoke all on function interno.avance_reto(uuid, text, timestamptz) from public, anon, authenticated;

-- Los retos de esta semana de quien está adentro, con su avance.
create or replace function public.retos_de_la_semana()
returns table (id uuid, clave text, nombre text, descripcion text, emoji text, metrica text,
               meta integer, bono integer, avance integer, cobrado boolean, desde date, hasta date)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select date_trunc('week', (now() at time zone 'America/Costa_Rica')::date)::date as lunes
  )
  select r.id, r.clave, r.nombre, r.descripcion, r.emoji, r.metrica, r.meta, r.bono,
         interno.avance_reto((select auth.uid()), r.metrica, s.lunes::timestamp at time zone 'America/Costa_Rica'),
         exists (select 1 from public.puntos_ajustes pa
                  where pa.student_id = (select auth.uid()) and pa.origen = 'reto_semanal'
                    and pa.referencia = 'reto:' || r.id::text || ':' || s.lunes::text),
         s.lunes, s.lunes + 6
    from public.retos_semanales r, s
   where r.activo and (select auth.uid()) is not null
   order by r.orden;
$$;
revoke execute on function public.retos_de_la_semana() from public, anon;
grant execute on function public.retos_de_la_semana() to authenticated;

-- =====================================================================
-- 3. Reclamar todo lo pendiente de una vez (reemplaza reclamar_bono_racha):
--    las tareas completadas, el hito de racha y los retos cumplidos. Cada
--    cosa tiene su referencia, así que llamarla mil veces paga una sola.
-- =====================================================================
drop function if exists public.reclamar_bono_racha();

create or replace function public.reclamar_puntos_pendientes()
returns table (que text, detalle text, ganados integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_racha integer;
  v_hito integer;
  v_bono integer;
  v_hitos integer[] := array[3, 7, 14, 30, 60, 100];
  v_bonos integer[] := array[10, 25, 50, 100, 180, 300];
  v_lunes date := date_trunc('week', (now() at time zone 'America/Costa_Rica')::date)::date;
  v_desde timestamptz;
  v_n integer;
  i integer;
  t record;
begin
  if v_yo is null then
    raise exception 'Hace falta iniciar sesión.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('puntos:' || v_yo::text));
  v_desde := v_lunes::timestamp at time zone 'America/Costa_Rica';

  -- Tareas completadas. Solo las asignadas desde que existe Puntos Ajedrez:
  -- pagar de golpe todas las tareas viejas sería una sorpresa, no un premio.
  for t in
    select x.id, x.titulo from public.tareas_con_avance(p_alumno => v_yo) x
     where x.situacion = 'completada' and x.created_at >= timestamptz '2026-10-08 00:00:00-06'
  loop
    v_n := interno.otorgar_puntos(v_yo, 15, 'tarea', 'Tarea completada: ' || t.titulo, 'tarea:' || t.id::text);
    if v_n > 0 then
      que := 'tarea'; detalle := 'Tarea completada: ' || t.titulo; ganados := v_n;
      return next;
    end if;
  end loop;

  -- El hito de racha más alto alcanzado.
  select pr.racha_actual into v_racha from public.progreso_dias_y_racha(v_yo) pr;
  v_racha := coalesce(v_racha, 0);
  for i in 1 .. array_length(v_hitos, 1) loop
    if v_racha >= v_hitos[i] then
      v_hito := v_hitos[i];
      v_bono := v_bonos[i];
    end if;
  end loop;
  if v_hito is not null then
    v_n := interno.otorgar_puntos(v_yo, v_bono, 'racha', 'Racha de ' || v_hito || ' días', 'racha:' || v_hito::text);
    if v_n > 0 then
      que := 'racha'; detalle := 'Racha de ' || v_hito || ' días'; ganados := v_n;
      return next;
    end if;
  end if;

  -- Los retos de la semana ya cumplidos.
  for t in select r.id, r.nombre, r.metrica, r.meta, r.bono from public.retos_semanales r where r.activo loop
    if interno.avance_reto(v_yo, t.metrica, v_desde) >= t.meta then
      v_n := interno.otorgar_puntos(v_yo, t.bono, 'reto_semanal', 'Reto de la semana: ' || t.nombre,
                                    'reto:' || t.id::text || ':' || v_lunes::text);
      if v_n > 0 then
        que := 'reto_semanal'; detalle := 'Reto de la semana: ' || t.nombre; ganados := v_n;
        return next;
      end if;
    end if;
  end loop;
  return;
end;
$$;
revoke execute on function public.reclamar_puntos_pendientes() from public, anon;
grant execute on function public.reclamar_puntos_pendientes() to authenticated;

-- =====================================================================
-- 4. El marcador del salón: lo GANADO en la semana o el mes (lo gastado en
--    canjes, regalos y bromas no resta). Un alumno ve a sus compañeros (el
--    mismo conjunto que la rama de compañeros de profiles_select: mismo
--    profe Y misma academia); un profe, a sus alumnos; quien administra, a
--    todos. Sale quien sumó algo, y siempre uno mismo.
-- =====================================================================
create or replace function public.marcador_del_salon(p_periodo text default 'semana')
returns table (alumno_id uuid, nombre text, puntos integer, puesto integer, soy_yo boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_hoy date := (now() at time zone 'America/Costa_Rica')::date;
  v_desde timestamptz;
begin
  if v_yo is null then
    raise exception 'Hace falta iniciar sesión.' using errcode = '42501';
  end if;
  v_desde := (case when p_periodo = 'mes' then date_trunc('month', v_hoy) else date_trunc('week', v_hoy) end)::date::timestamp
             at time zone 'America/Costa_Rica';
  return query
  with gente as (
    select a as id
      from interno.profesores_de(v_yo) pr cross join lateral interno.alumnos_de(pr) a
     where a in (select interno.gente_de_mis_academias())
    union
    select v_yo where exists (select 1 from interno.profesores_de(v_yo))
    union
    select a from interno.alumnos_de(v_yo) a
    union
    select p.id from public.profiles p where coalesce(public.soy_admin(), false) and p.role = 'alumno'
  ),
  suma as (
    select g.id,
           coalesce(sum(pa.cantidad) filter (where pa.cantidad > 0 and pa.origen not in ('canje', 'regalo', 'broma')), 0)::integer as pts
      from gente g
      join public.profiles p on p.id = g.id and p.role = 'alumno'
      left join public.puntos_ajustes pa on pa.student_id = g.id and pa.created_at >= v_desde
     group by g.id
  )
  select s.id, p.full_name, s.pts, (rank() over (order by s.pts desc))::integer, s.id = v_yo
    from suma s join public.profiles p on p.id = s.id
   where s.pts > 0 or s.id = v_yo
   order by 4, 2
   limit 50;
end;
$$;
revoke execute on function public.marcador_del_salon(text) from public, anon;
grant execute on function public.marcador_del_salon(text) to authenticated;
