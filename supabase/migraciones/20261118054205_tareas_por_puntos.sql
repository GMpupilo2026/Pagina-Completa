-- Tareas que llegan solas: el profe deja armada una tarea y elige a quién va,
-- pero en vez de mandarla ya, la tarea le llega a cada alumno el día que junta
-- cierta cantidad de Puntos Ajedrez ganados («Llegaste a 300 puntos: te toca
-- Combinaciones»). Es lo que Chessgora llama «la rutina se entrega sola».
--
-- Lo que se guarda es la REGLA (tareas_por_puntos) y a quién ya se le entregó
-- (tareas_por_puntos_entregas). La tarea que recibe el alumno es una tarea de
-- siempre, en `tareas` y `tarea_items`, así que se llena sola, sale en su
-- lista, en «Tareas enviadas» del profe y manda su aviso push con el trigger
-- avisar_tarea_asignada de siempre. No hay una segunda forma de leer una tarea.
--
-- Decisiones:
--
-- * Cuentan los puntos GANADOS, no el saldo. El saldo baja al canjear un
--   premio, al regalar o cuando se pierde la mitad por una semana sin
--   entrenar; con el saldo, canjear un premio le quitaría al alumno la tarea
--   que ya se había ganado, o se la daría dos veces. Ganados son los que salen
--   de asistir y entrenar: clase, entrenamiento, tarea, examen, racha, reto
--   semanal y tema terminado (interno.puntos_ganados). Los regalos, las
--   bromas, el robo de una partida y los ajustes a mano no cuentan: no son
--   trabajo del alumno. La misma función servirá para los rangos.
--
-- * Una regla se entrega UNA vez por alumno, y eso lo garantiza la llave
--   primaria (regla_id, alumno_id) de las entregas, no un `if`. Borrar la
--   tarea que recibió no se la vuelve a mandar: la entrega queda, con tarea_id
--   en NULL.
--
-- * Quien ya tiene los puntos la recibe al crear la regla. La regla dice
--   «quien llegue a N», no «quien cruce N desde hoy»; si no, al alumno que ya
--   pasó los 300 no le llegaría nunca. La pantalla lo avisa antes de guardar.
--
-- * El disparo es un trigger AFTER INSERT en puntos_ajustes, solo para filas
--   positivas de los orígenes que cuentan. Lo primero que mira es si el alumno
--   está en alguna regla activa (índice GIN sobre `alumnos`); sin ninguna, no
--   suma nada. Y va envuelto en un bloque de excepción: una falla al armar la
--   tarea NO puede tumbar el otorgamiento de puntos de un ejercicio resuelto.
--
-- * El permiso se mira dos veces: al crear la regla (los alumnos tienen que
--   ser del profe; quien administra, de cualquiera, igual que tareas_insert) y
--   al entregar (si el alumno ya no es de ese profe, no se le entrega: la
--   regla no puede servir de puerta trasera para mandarle tareas a un alumno
--   que se le quitó).
--
-- * Las tablas no tienen política de escritura salvo borrar la regla propia:
--   crear y pausar pasan por funciones que validan.

create or replace function interno.puntos_ganados(p_alumno uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(sum(cantidad), 0)::integer
    from public.puntos_ajustes
   where student_id = p_alumno
     and cantidad > 0
     and origen in ('clase', 'entrenamiento', 'tarea', 'examen', 'racha', 'reto_semanal', 'tema');
$$;
revoke all on function interno.puntos_ganados(uuid) from public, anon, authenticated;
comment on function interno.puntos_ganados(uuid) is
  'Puntos Ajedrez GANADOS asistiendo y entrenando (no el saldo: canjes, regalos, bromas, robos y ajustes a mano no cuentan). Base de las tareas que llegan solas.';

create table public.tareas_por_puntos (
  id            uuid primary key default gen_random_uuid(),
  profesor_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  alumnos       uuid[] not null check (cardinality(alumnos) between 1 and 300),
  umbral        integer not null check (umbral between 1 and 1000000),
  titulo        text not null check (char_length(btrim(titulo)) between 1 and 200),
  instrucciones text not null default '' check (char_length(instrucciones) <= 2000),
  items         jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 20),
  dias          integer not null check (dias between 1 and 90),
  activa        boolean not null default true,
  created_at    timestamptz not null default now()
);
comment on table public.tareas_por_puntos is
  'Tareas que llegan solas: la regla del profe. A cada alumno de `alumnos` le llega una tarea (en `tareas`) el día que sus puntos ganados llegan a `umbral`, con `dias` para hacerla. Los renglones tienen la forma de crear_tarea().';
create index tareas_por_puntos_alumnos on public.tareas_por_puntos using gin (alumnos) where activa;
create index tareas_por_puntos_profesor on public.tareas_por_puntos (profesor_id);

create table public.tareas_por_puntos_entregas (
  regla_id     uuid not null references public.tareas_por_puntos(id) on delete cascade,
  alumno_id    uuid not null references public.profiles(id) on delete cascade,
  tarea_id     uuid references public.tareas(id) on delete set null,
  entregada_at timestamptz not null default now(),
  primary key (regla_id, alumno_id)
);
comment on table public.tareas_por_puntos_entregas is
  'A quién ya le llegó cada tarea automática. La llave primaria garantiza que una regla se entrega una sola vez por alumno; tarea_id queda en NULL si el profe borra la tarea.';

alter table public.tareas_por_puntos enable row level security;
alter table public.tareas_por_puntos_entregas enable row level security;
revoke all on public.tareas_por_puntos, public.tareas_por_puntos_entregas from public, anon, authenticated;
grant select, delete on public.tareas_por_puntos to authenticated;
grant select on public.tareas_por_puntos_entregas to authenticated;

create policy tareas_por_puntos_ver on public.tareas_por_puntos for select to authenticated
  using (profesor_id = (select auth.uid()) or (select is_admin from public.my_profile()));
create policy tareas_por_puntos_borrar on public.tareas_por_puntos for delete to authenticated
  using (profesor_id = (select auth.uid()) or (select is_admin from public.my_profile()));
-- Las entregas se ven si se ve la regla: el conjunto de reglas visibles se
-- arma una vez (la subconsulta ya pasa por la RLS de arriba).
create policy tareas_por_puntos_entregas_ver on public.tareas_por_puntos_entregas for select to authenticated
  using (regla_id in (select id from public.tareas_por_puntos));

-- ---------------- Entregar ----------------
create or replace function interno.entregar_tareas_por_puntos(p_alumno uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  v_ganados integer;
  v_tarea uuid;
  v_primero jsonb;
  v_n integer := 0;
begin
  if p_alumno is null then return 0; end if;
  -- Lo barato primero: casi nunca hay una regla para este alumno.
  if not exists (select 1 from public.tareas_por_puntos t
                  where t.activa and t.alumnos @> array[p_alumno]) then
    return 0;
  end if;
  v_ganados := interno.puntos_ganados(p_alumno);

  for r in
    select t.*
      from public.tareas_por_puntos t
     where t.activa
       and t.alumnos @> array[p_alumno]
       and t.umbral <= v_ganados
       and not exists (select 1 from public.tareas_por_puntos_entregas e
                        where e.regla_id = t.id and e.alumno_id = p_alumno)
       and (t.profesor_id in (select interno.profesores_de(p_alumno))
            or coalesce((select p.is_admin from public.profiles p where p.id = t.profesor_id), false))
     order by t.umbral, t.created_at
  loop
    insert into public.tareas_por_puntos_entregas (regla_id, alumno_id)
    values (r.id, p_alumno)
    on conflict do nothing;
    if not found then continue; end if;   -- otra transacción ya la entregó

    v_primero := r.items -> 0;
    insert into public.tareas (
      profesor_id, alumno_id, titulo, instrucciones,
      material_tipo, material_slug, material_label, material_href, leccion, vence_at)
    values (
      r.profesor_id, p_alumno, btrim(r.titulo), r.instrucciones,
      v_primero->>'material_tipo', v_primero->>'material_slug',
      v_primero->>'material_label', v_primero->>'material_href',
      nullif(v_primero->>'leccion','')::integer, now() + make_interval(days => r.dias))
    returning id into v_tarea;

    insert into public.tarea_items (
      tarea_id, orden, material_tipo, material_slug, material_label,
      material_href, filtro_clave, filtro_label, leccion, actividades,
      meta_tipo, meta_cantidad)
    select
      v_tarea,
      (it.orden - 1)::integer,
      it.valor->>'material_tipo',
      it.valor->>'material_slug',
      it.valor->>'material_label',
      it.valor->>'material_href',
      nullif(it.valor->>'filtro_clave',''),
      nullif(it.valor->>'filtro_label',''),
      nullif(it.valor->>'leccion','')::integer,
      case when it.valor->'actividades' is null then null
           else array(select jsonb_array_elements_text(it.valor->'actividades')) end,
      it.valor->>'meta_tipo',
      nullif(it.valor->>'meta_cantidad','')::integer
    from jsonb_array_elements(r.items) with ordinality as it(valor, orden);

    update public.tareas_por_puntos_entregas set tarea_id = v_tarea
     where regla_id = r.id and alumno_id = p_alumno;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function interno.entregar_tareas_por_puntos(uuid) from public, anon, authenticated;

create or replace function interno.tareas_por_puntos_al_ganar()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  begin
    perform interno.entregar_tareas_por_puntos(new.student_id);
  exception when others then
    -- Los puntos del ejercicio valen más que la tarea automática: si armarla
    -- falla, se anota y el ejercicio se paga igual.
    raise warning 'tareas_por_puntos: no se pudo entregar a %: %', new.student_id, sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function interno.tareas_por_puntos_al_ganar() from public, anon, authenticated;

create trigger tareas_por_puntos_al_ganar
  after insert on public.puntos_ajustes
  for each row
  when (new.cantidad > 0 and new.origen in ('clase', 'entrenamiento', 'tarea', 'examen', 'racha', 'reto_semanal', 'tema'))
  execute function interno.tareas_por_puntos_al_ganar();

-- ---------------- Crear, pausar ----------------
create or replace function public.crear_tarea_por_puntos(
  p_alumnos       uuid[],
  p_titulo        text,
  p_instrucciones text,
  p_dias          integer,
  p_items         jsonb,
  p_umbral        integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_yo uuid := auth.uid();
  v_admin boolean;
  v_rol text;
  v_regla uuid;
  v_alumno uuid;
  v_ya integer := 0;
begin
  select coalesce(p.is_admin, false), p.role into v_admin, v_rol
    from public.profiles p where p.id = v_yo;
  if not coalesce(v_admin or v_rol = 'profesor', false) then
    raise exception 'Solo un profesor puede programar tareas.';
  end if;
  if p_alumnos is null or cardinality(p_alumnos) = 0 then
    raise exception 'Elige al menos un alumno.';
  end if;
  if cardinality(p_alumnos) > 300 then
    raise exception 'Demasiados alumnos de una vez.';
  end if;
  if array_position(p_alumnos, null) is not null then
    raise exception 'Hay un alumno vacío en la lista.';
  end if;
  if not v_admin and exists (
       select 1 from unnest(p_alumnos) a(id)
        where a.id not in (select interno.alumnos_de(v_yo))) then
    raise exception 'Solo puedes programarles tareas a tus alumnos.';
  end if;
  if coalesce(btrim(p_titulo), '') = '' then
    raise exception 'La tarea necesita un título.';
  end if;
  if p_umbral is null or p_umbral < 1 then
    raise exception 'Pon cuántos puntos tiene que juntar.';
  end if;
  if p_dias is null or p_dias < 1 or p_dias > 90 then
    raise exception 'Los días para hacerla van de 1 a 90.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La tarea no tiene ningún renglón.';
  end if;
  if jsonb_array_length(p_items) > 20 then
    raise exception 'Una tarea no puede llevar más de 20 renglones.';
  end if;

  insert into public.tareas_por_puntos (profesor_id, alumnos, umbral, titulo, instrucciones, items, dias)
  values (v_yo, (select array_agg(distinct a) from unnest(p_alumnos) a), p_umbral,
          btrim(p_titulo), coalesce(p_instrucciones, ''), p_items, p_dias)
  returning id into v_regla;

  -- Quien ya tiene los puntos la recibe ahora.
  foreach v_alumno in array p_alumnos loop
    v_ya := v_ya + interno.entregar_tareas_por_puntos(v_alumno);
  end loop;

  return jsonb_build_object('id', v_regla, 'entregadas', v_ya);
end;
$$;
revoke execute on function public.crear_tarea_por_puntos(uuid[], text, text, integer, jsonb, integer) from public, anon;
grant execute on function public.crear_tarea_por_puntos(uuid[], text, text, integer, jsonb, integer) to authenticated;

create or replace function public.activar_tarea_por_puntos(p_regla uuid, p_activa boolean)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_yo uuid := auth.uid();
  v_activa boolean;
  v_alumno uuid;
begin
  update public.tareas_por_puntos t set activa = coalesce(p_activa, false)
   where t.id = p_regla
     and coalesce(t.profesor_id = v_yo or (select p.is_admin from public.profiles p where p.id = v_yo), false)
  returning t.activa into v_activa;
  if v_activa is null then
    raise exception 'Esa tarea programada no existe o no es tuya.';
  end if;
  -- Al reactivarla, quien llegó a los puntos mientras estaba en pausa la recibe ya.
  if v_activa then
    for v_alumno in select unnest(alumnos) from public.tareas_por_puntos where id = p_regla loop
      perform interno.entregar_tareas_por_puntos(v_alumno);
    end loop;
  end if;
  return (select activa from public.tareas_por_puntos where id = p_regla);
end;
$$;
revoke execute on function public.activar_tarea_por_puntos(uuid, boolean) from public, anon;
grant execute on function public.activar_tarea_por_puntos(uuid, boolean) to authenticated;

-- Cuántos puntos ganados lleva cada alumno de una regla, para que el profe vea
-- quién está cerca. SECURITY DEFINER porque suma puntos_ajustes de alumnos
-- que el profe no lee directo; por eso repite a mano el permiso de la regla
-- (la del profe que la armó, o quien administra), envuelto en coalesce.
create or replace function public.tareas_por_puntos_avance(p_regla uuid)
returns table(alumno_id uuid, alumno_nombre text, ganados integer, entregada_at timestamptz, tarea_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $$
  select a.id, pr.full_name, interno.puntos_ganados(a.id), e.entregada_at, e.tarea_id
    from public.tareas_por_puntos t
    cross join lateral unnest(t.alumnos) a(id)
    left join public.profiles pr on pr.id = a.id
    left join public.tareas_por_puntos_entregas e on e.regla_id = t.id and e.alumno_id = a.id
   where t.id = p_regla
     and coalesce(t.profesor_id = auth.uid() or (select p.is_admin from public.profiles p where p.id = auth.uid()), false)
   order by pr.full_name;
$$;
revoke execute on function public.tareas_por_puntos_avance(uuid) from public, anon;
grant execute on function public.tareas_por_puntos_avance(uuid) to authenticated;
