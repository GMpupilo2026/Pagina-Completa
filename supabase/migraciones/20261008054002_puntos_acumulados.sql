-- Puntos Ajedrez: un total único que junta los puntos de la clase con lo que
-- el alumno hace en el resto de la plataforma (entrenamiento, tareas,
-- exámenes, racha de días), para canjear por premios. Ver «Puntos Ajedrez:
-- se acumulan y se canjean» en docs/decisiones/puntos-y-premios.md.
--
-- Hasta hoy "los puntos de la clase" (puntos_de_la_clase/puntos_del_mes) se
-- RECALCULABAN siempre, sin ninguna historia más allá del mes en curso. Esto
-- no les toca nada: agrega, aparte, un LEDGER de apéndice (mismo patrón que
-- trofeos_ajustes) que se escribe UNA SOLA VEZ por evento —al cerrar la
-- clase, al registrar un ejercicio de entrenamiento, al completar una tarea,
-- al entregar un examen, al alcanzar un hito de racha— y que además se puede
-- GASTAR, cosa que trofeos_ajustes no permite.
set local lock_timeout = '8s';

-- =====================================================================
-- 1. El ledger: un renglón por cada vez que alguien gana o gasta puntos.
-- =====================================================================
create table public.puntos_ajustes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  cantidad integer not null check (cantidad <> 0),
  origen text not null check (origen in ('clase', 'entrenamiento', 'tarea', 'examen', 'racha', 'canje', 'ajuste_manual')),
  motivo text not null default '' check (char_length(motivo) <= 200),
  -- La clave de qué evento fue (p. ej. 'clase:<id>', 'tarea:<id>'): con ella
  -- otorgar_puntos() nunca paga el mismo evento dos veces. null = cada
  -- llamada es un evento distinto a propósito (un canje, un ajuste a mano).
  referencia text check (referencia is null or char_length(referencia) <= 100),
  creado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.puntos_ajustes is
  'Puntos Ajedrez: un renglón por cada vez que un alumno gana o gasta puntos (clase, entrenamiento, tareas, exámenes, racha, canjes, ajustes a mano). El saldo es la suma (saldo_de_puntos()). Nunca se actualiza ni se borra; solo lo escriben otorgar_puntos() y canjear_premio().';

create index puntos_ajustes_alumno on public.puntos_ajustes (student_id, created_at desc);
create unique index puntos_ajustes_referencia_unica on public.puntos_ajustes (student_id, origen, referencia) where referencia is not null;

alter table public.puntos_ajustes enable row level security;
revoke all on public.puntos_ajustes from public, anon, authenticated;
grant select on public.puntos_ajustes to authenticated;

-- Nadie tiene política de insert/update/delete: solo las funciones DEFINER
-- de abajo escriben, con el dueño de la función (que salta la RLS).
create policy puntos_ajustes_ver on public.puntos_ajustes
  for select to authenticated
  using (
    student_id = (select auth.uid())
    or (select public.soy_admin())
    or student_id in (select interno.alumnos_de((select auth.uid())))
    or ((select public.soy_supervisor()) and student_id in (select interno.supervisados_por_mi()))
  );

create trigger auditar after insert on public.puntos_ajustes
  for each row execute function interno.auditar();

-- =====================================================================
-- 2. Quien otorga puntos de verdad: idempotente (por student_id+origen+
--    referencia) y dobla la cantidad si hay un «doble_puntos» vigente.
--    En interno: nadie la llama por RPC, solo las funciones de abajo, que
--    son todas SECURITY DEFINER del mismo dueño.
-- =====================================================================
create or replace function interno.otorgar_puntos(
  p_alumno uuid,
  p_cantidad integer,
  p_origen text,
  p_motivo text,
  p_referencia text default null,
  p_creado_por uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mult integer := 1;
begin
  if p_alumno is null or p_cantidad is null or p_cantidad = 0 then
    return;
  end if;
  if p_cantidad > 0 and p_origen in ('clase', 'entrenamiento', 'tarea', 'examen', 'racha') then
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
end;
$$;
revoke all on function interno.otorgar_puntos(uuid, integer, text, text, text, uuid) from public, anon, authenticated;

-- =====================================================================
-- 3. Leer el saldo y el historial. SECURITY INVOKER a propósito, como
--    puntos_de_la_clase: quién puede ver el de quién lo decide la RLS de
--    puntos_ajustes de arriba, no esta función.
-- =====================================================================
create or replace function public.saldo_de_puntos(p_alumno uuid default auth.uid())
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(cantidad), 0)::integer from public.puntos_ajustes where student_id = p_alumno;
$$;
revoke execute on function public.saldo_de_puntos(uuid) from public, anon;
grant execute on function public.saldo_de_puntos(uuid) to authenticated;

create or replace function public.historial_de_puntos(p_alumno uuid default auth.uid(), p_limite integer default 30)
returns table (id uuid, cantidad integer, origen text, motivo text, created_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select pa.id, pa.cantidad, pa.origen, pa.motivo, pa.created_at
    from public.puntos_ajustes pa
   where pa.student_id = p_alumno
   order by pa.created_at desc
   limit greatest(1, least(coalesce(p_limite, 30), 200));
$$;
revoke execute on function public.historial_de_puntos(uuid, integer) from public, anon;
grant execute on function public.historial_de_puntos(uuid, integer) to authenticated;

-- =====================================================================
-- 4. De dónde salen los puntos, cada uno en su evento:
-- =====================================================================

-- 4a. La clase: al cerrarla (ended_at pasa de null a una fecha), lo de
--     preguntas (puntos_de_la_clase) y lo de calentamiento/competencia
--     (puntos_de_tandas), para cada alumno que tuvo algo en ESA clase.
--     No incluye turnos de palabra ni prácticas/partidas: eso vive solo en
--     game_state, que se limpia al cerrar (ver docs/decisiones/clase-en-vivo.md).
create or replace function interno.otorgar_puntos_de_clase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_total integer;
begin
  if new.ended_at is null or old.ended_at is not null then
    return new;
  end if;
  for r in
    select coalesce(pq.student_id, pt.student_id) as student_id,
           coalesce(pq.puntos_preguntas, 0) + coalesce(pt.puntos, 0) as puntos
      from public.puntos_de_la_clase(new.id) pq
      full outer join public.puntos_de_tandas(new.id) pt on pt.student_id = pq.student_id
  loop
    v_total := r.puntos;
    if v_total > 0 then
      perform interno.otorgar_puntos(r.student_id, v_total, 'clase', 'Puntos de la clase', 'clase:' || new.id::text);
    end if;
  end loop;
  return new;
end;
$$;
revoke execute on function interno.otorgar_puntos_de_clase() from public, anon, authenticated;

create trigger otorgar_puntos_de_clase after update on public.class_sessions
  for each row execute function interno.otorgar_puntos_de_clase();

-- 4b. Entrenamiento: 2 puntos por cada ejercicio que se registra en
--     training_progress (cualquier actividad), con un tope de 40 por día de
--     Costa Rica, para que no se pueda hacer trampa a fuerza de repetir.
create or replace function interno.otorgar_puntos_de_entrenamiento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tope constant integer := 40;
  v_premio constant integer := 2;
  v_ganado_hoy integer;
begin
  select coalesce(sum(cantidad), 0) into v_ganado_hoy
    from public.puntos_ajustes
   where student_id = new.student_id
     and origen = 'entrenamiento'
     and (created_at at time zone 'America/Costa_Rica')::date = (now() at time zone 'America/Costa_Rica')::date;
  if v_ganado_hoy >= v_tope then
    return new;
  end if;
  perform interno.otorgar_puntos(new.student_id, least(v_premio, v_tope - v_ganado_hoy), 'entrenamiento', 'Ejercicio de entrenamiento', 'entrenamiento:' || new.id::text);
  return new;
end;
$$;
revoke execute on function interno.otorgar_puntos_de_entrenamiento() from public, anon, authenticated;

create trigger otorgar_puntos_de_entrenamiento after insert on public.training_progress
  for each row execute function interno.otorgar_puntos_de_entrenamiento();

-- 4c. Tareas: 15 puntos al marcarla completada (pendiente -> completada).
--     Desmarcar y volver a marcar la MISMA tarea no vuelve a pagar: la
--     referencia es tarea:<id>, siempre la misma.
create or replace function interno.otorgar_puntos_de_tarea()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'completada' and old.estado is distinct from 'completada' then
    perform interno.otorgar_puntos(new.alumno_id, 15, 'tarea', 'Tarea completada: ' || new.titulo, 'tarea:' || new.id::text);
  end if;
  return new;
end;
$$;
revoke execute on function interno.otorgar_puntos_de_tarea() from public, anon, authenticated;

create trigger otorgar_puntos_de_tarea after update on public.tareas
  for each row execute function interno.otorgar_puntos_de_tarea();

-- 4d. Exámenes: entre 5 y 20 puntos al entregarlo (según el porcentaje),
--     sin importar qué función lo cierre (responder_examen() u otra): el
--     trigger mira la transición de estado, no quién la hizo.
create or replace function interno.otorgar_puntos_de_examen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_puntos integer;
begin
  if new.estado = 'entregado' and old.estado is distinct from 'entregado' then
    v_puntos := greatest(5, least(20, round(coalesce(new.porcentaje, 0) / 5.0)))::int;
    perform interno.otorgar_puntos(new.alumno_id, v_puntos, 'examen', 'Examen entregado: ' || new.titulo, 'examen:' || new.id::text);
  end if;
  return new;
end;
$$;
revoke execute on function interno.otorgar_puntos_de_examen() from public, anon, authenticated;

create trigger otorgar_puntos_de_examen after update on public.examenes
  for each row execute function interno.otorgar_puntos_de_examen();

-- 4e. Racha de días: un bono al alcanzar cada hito (una sola vez cada uno;
--     otra vez con la misma racha, otorgar_puntos ya no paga). Lo llama el
--     panel al cargar, con el alumno de quien está adentro de su sesión.
create or replace function public.reclamar_bono_racha()
returns table (nuevo_hito integer, puntos_otorgados integer, racha_actual integer)
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
  i integer;
begin
  if v_yo is null then
    raise exception 'Hace falta iniciar sesión.' using errcode = '42501';
  end if;
  select pr.racha_actual into v_racha from public.progreso_dias_y_racha(v_yo) pr;
  v_racha := coalesce(v_racha, 0);
  for i in 1 .. array_length(v_hitos, 1) loop
    if v_racha >= v_hitos[i] then
      v_hito := v_hitos[i];
      v_bono := v_bonos[i];
    end if;
  end loop;
  if v_hito is not null then
    perform interno.otorgar_puntos(v_yo, v_bono, 'racha', 'Racha de ' || v_hito || ' días', 'racha:' || v_hito::text);
  end if;
  return query select v_hito, v_bono, v_racha;
end;
$$;
revoke execute on function public.reclamar_bono_racha() from public, anon;
grant execute on function public.reclamar_bono_racha() to authenticated;

-- =====================================================================
-- 5. El catálogo de premios. Vive en la base (como insignias_tipos), no en
--    código: quien administra lo puede ampliar sin un despliegue.
-- =====================================================================
create table public.premios_catalogo (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique check (clave ~ '^[a-z0-9_]{3,40}$'),
  nombre text not null,
  descripcion text not null default '',
  emoji text not null default '🎁',
  categoria text not null check (categoria in ('cosmetico', 'entrenamiento', 'contenido')),
  -- Qué hace canjear_premio() al canjearlo. 'titulo'/'marco_perfil': solo
  -- queda la fila en premios_canjeados, la lee la propia pantalla. Los demás
  -- SÍ tienen un efecto real (ver canjear_premio()).
  tipo_efecto text not null check (tipo_efecto in ('titulo', 'marco_perfil', 'doble_puntos', 'curso_adelanto', 'material_tienda')),
  costo_puntos integer not null check (costo_puntos > 0),
  parametros jsonb not null default '{}'::jsonb,
  -- null = se puede canjear las veces que alcance; 1 = una sola vez (no
  -- tiene sentido comprar dos veces el mismo título).
  limite_por_alumno integer check (limite_por_alumno is null or limite_por_alumno > 0),
  activo boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);
comment on table public.premios_catalogo is
  'Catálogo de premios que se canjean con puntos acumulados (puntos_ajustes vía canjear_premio()). Solo lo edita quien administra.';

alter table public.premios_catalogo enable row level security;
revoke all on public.premios_catalogo from public, anon;
grant select, insert, update, delete on public.premios_catalogo to authenticated;

create policy premios_catalogo_select on public.premios_catalogo
  for select to authenticated
  using (activo or (select public.soy_admin()));
create policy premios_catalogo_insert on public.premios_catalogo
  for insert to authenticated with check ((select public.soy_admin()));
create policy premios_catalogo_update on public.premios_catalogo
  for update to authenticated using ((select public.soy_admin())) with check ((select public.soy_admin()));
create policy premios_catalogo_delete on public.premios_catalogo
  for delete to authenticated using ((select public.soy_admin()));

insert into public.premios_catalogo (clave, nombre, descripcion, emoji, categoria, tipo_efecto, costo_puntos, parametros, limite_por_alumno, orden) values
  ('titulo_tactico', 'Título: Táctico', 'Un título que aparece junto a tu nombre en el panel.', '⚔️', 'cosmetico', 'titulo', 150, '{"texto":"⚔️ Táctico"}'::jsonb, 1, 10),
  ('titulo_estratega', 'Título: Estratega', 'Un título que aparece junto a tu nombre en el panel.', '🧠', 'cosmetico', 'titulo', 150, '{"texto":"🧠 Estratega"}'::jsonb, 1, 20),
  ('titulo_leyenda', 'Título: Leyenda del tablero', 'El título más alto, junto a tu nombre en el panel.', '👑', 'cosmetico', 'titulo', 500, '{"texto":"👑 Leyenda del tablero"}'::jsonb, 1, 30),
  ('marco_bronce', 'Marco de bronce', 'Un marco de bronce alrededor de tu foto de perfil.', '🥉', 'cosmetico', 'marco_perfil', 100, '{"clase":"marco-bronce"}'::jsonb, 1, 40),
  ('marco_plata', 'Marco de plata', 'Un marco de plata alrededor de tu foto de perfil.', '🥈', 'cosmetico', 'marco_perfil', 300, '{"clase":"marco-plata"}'::jsonb, 1, 50),
  ('marco_oro', 'Marco de oro', 'Un marco de oro alrededor de tu foto de perfil.', '🥇', 'cosmetico', 'marco_perfil', 700, '{"clase":"marco-oro"}'::jsonb, 1, 60),
  ('doble_puntos_dia', 'Día de puntos dobles', 'Durante 24 horas, todos los puntos que ganes en clase, entrenamiento, tareas y exámenes valen el doble.', '✨', 'entrenamiento', 'doble_puntos', 200, '{"horas":24}'::jsonb, null, 70),
  ('doble_puntos_semana', 'Semana de puntos dobles', 'Durante 7 días, todos los puntos que ganes valen el doble.', '🌟', 'entrenamiento', 'doble_puntos', 900, '{"horas":168}'::jsonb, null, 80),
  ('avance_cimientos', 'Adelanta una lección: Los cimientos del ajedrez', 'Abre la siguiente lección del curso sin esperar a que tu profesor te la desbloquee.', '📘', 'contenido', 'curso_adelanto', 120, '{"curso":"los-cimientos-del-ajedrez","lecciones":1}'::jsonb, null, 90),
  ('avance_estancamiento', 'Adelanta una lección: Rompe el estancamiento', 'Abre la siguiente lección del curso sin esperar a que tu profesor te la desbloquee.', '📗', 'contenido', 'curso_adelanto', 120, '{"curso":"rompe-el-estancamiento","lecciones":1}'::jsonb, null, 100),
  ('avance_ganar_con_poco', 'Adelanta una lección: Ganar con poco', 'Abre la siguiente lección del curso sin esperar a que tu profesor te la desbloquee.', '📙', 'contenido', 'curso_adelanto', 120, '{"curso":"ganar-con-poco","lecciones":1}'::jsonb, null, 110),
  ('material_fichas_estudio', 'Fichas de Estudio completas', 'El libro y las cartas de Fichas de Estudio para imprimir, sin pagar por ellas.', '🗂️', 'contenido', 'material_tienda', 600, '{"producto":"fichas-de-estudio"}'::jsonb, 1, 120),
  ('material_libro_diagnostico', 'Libro de diagnóstico', 'El libro de diagnóstico completo, en PDF.', '📖', 'contenido', 'material_tienda', 500, '{"producto":"libro-de-diagnostico"}'::jsonb, 1, 130)
on conflict (clave) do nothing;

-- =====================================================================
-- 6. Lo que cada alumno ya canjeó.
-- =====================================================================
create table public.premios_canjeados (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  premio_id uuid not null references public.premios_catalogo(id) on delete restrict,
  costo_pagado integer not null check (costo_pagado > 0),
  parametros jsonb not null default '{}'::jsonb,
  -- Para un cosmético: si se está mostrando o no (equipar_premio()). Para un
  -- doble_puntos: si ya venció, da igual, lo mira vigente_hasta.
  activo boolean not null default true,
  vigente_hasta timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.premios_canjeados is
  'Lo que cada alumno canjeó con sus puntos. Solo lo escriben canjear_premio() y equipar_premio(); nunca se borra.';

create index premios_canjeados_alumno on public.premios_canjeados (student_id, created_at desc);

alter table public.premios_canjeados enable row level security;
revoke all on public.premios_canjeados from public, anon, authenticated;
grant select on public.premios_canjeados to authenticated;

-- Reparte acceso (course_unlocks, compras_tienda): sin política de
-- insert/update/delete, igual que profile_teachers o paquetes_acceso.
create policy premios_canjeados_ver on public.premios_canjeados
  for select to authenticated
  using (
    student_id = (select auth.uid())
    or (select public.soy_admin())
    or student_id in (select interno.alumnos_de((select auth.uid())))
    or ((select public.soy_supervisor()) and student_id in (select interno.supervisados_por_mi()))
  );

create trigger auditar after insert on public.premios_canjeados
  for each row execute function interno.auditar();

-- =====================================================================
-- 7. Canjear un premio: valida el saldo con un candado por alumno (como
--    ajustar_trofeos), descuenta los puntos y aplica el efecto de verdad.
-- =====================================================================
create or replace function public.canjear_premio(p_premio_id uuid)
returns table (canje_id uuid, saldo_restante integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_premio record;
  v_saldo integer;
  v_ya_tiene integer;
  v_canje_id uuid;
  v_vigente_hasta timestamptz := null;
begin
  if v_yo is null then
    raise exception 'Hace falta iniciar sesión.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('puntos:' || v_yo::text));

  select * into v_premio from public.premios_catalogo where id = p_premio_id and activo;
  if v_premio.id is null then
    raise exception 'Ese premio ya no está disponible.' using errcode = '22023';
  end if;

  if v_premio.limite_por_alumno is not null then
    select count(*) into v_ya_tiene from public.premios_canjeados
     where student_id = v_yo and premio_id = p_premio_id;
    if v_ya_tiene >= v_premio.limite_por_alumno then
      raise exception 'Ya canjeaste este premio el máximo de veces permitido.' using errcode = '22023';
    end if;
  end if;

  if v_premio.tipo_efecto = 'material_tienda' and exists (
       select 1 from public.compras_tienda
        where profile_id = v_yo and producto = v_premio.parametros->>'producto') then
    raise exception 'Ya tienes ese material.' using errcode = '22023';
  end if;

  select coalesce(sum(cantidad), 0) into v_saldo from public.puntos_ajustes where student_id = v_yo;
  if v_saldo < v_premio.costo_puntos then
    raise exception 'Te faltan % puntos para este premio.', (v_premio.costo_puntos - v_saldo) using errcode = '22023';
  end if;

  perform interno.otorgar_puntos(v_yo, -v_premio.costo_puntos, 'canje', 'Canjeado: ' || v_premio.nombre, 'canje:' || gen_random_uuid()::text);

  if v_premio.tipo_efecto = 'doble_puntos' then
    v_vigente_hasta := now() + make_interval(hours => coalesce((v_premio.parametros->>'horas')::int, 24));
  end if;

  insert into public.premios_canjeados (student_id, premio_id, costo_pagado, parametros, vigente_hasta)
  values (v_yo, p_premio_id, v_premio.costo_puntos, v_premio.parametros, v_vigente_hasta)
  returning id into v_canje_id;

  if v_premio.tipo_efecto = 'curso_adelanto' then
    insert into public.course_unlocks (student_id, curso, hasta_leccion, granted_by)
    values (
      v_yo, v_premio.parametros->>'curso',
      coalesce((select hasta_leccion from public.course_unlocks
                 where student_id = v_yo and curso = v_premio.parametros->>'curso'), 0)
        + coalesce((v_premio.parametros->>'lecciones')::int, 1),
      v_yo
    )
    on conflict (student_id, curso) do update
      set hasta_leccion = excluded.hasta_leccion, granted_by = excluded.granted_by, updated_at = now();
  elsif v_premio.tipo_efecto = 'material_tienda' then
    insert into public.compras_tienda (profile_id, producto, otorgado_por)
    values (v_yo, v_premio.parametros->>'producto', null)
    on conflict (profile_id, producto) do nothing;
  end if;

  select coalesce(sum(cantidad), 0) into v_saldo from public.puntos_ajustes where student_id = v_yo;
  return query select v_canje_id, v_saldo;
end;
$$;
revoke execute on function public.canjear_premio(uuid) from public, anon;
grant execute on function public.canjear_premio(uuid) to authenticated;

-- Equipar/desequipar un cosmético ya canjeado (solo el booleano, nunca qué
-- fue ni cuánto costó: lo demás lo protegería un trigger si hiciera falta,
-- pero como no hay política de update, esta es la única puerta).
create or replace function public.equipar_premio(p_canje_id uuid, p_activo boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_filas integer;
begin
  update public.premios_canjeados
     set activo = coalesce(p_activo, true)
   where id = p_canje_id and student_id = v_yo;
  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    raise exception 'Ese premio no es tuyo o no existe.' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function public.equipar_premio(uuid, boolean) from public, anon;
grant execute on function public.equipar_premio(uuid, boolean) to authenticated;

-- Lo que cada alumno canjeó, con el nombre/tipo/parámetros del premio ya
-- pegados (para no pedir premios_catalogo aparte desde la pantalla).
create or replace function public.mis_premios(p_alumno uuid default auth.uid())
returns table (
  id uuid, premio_id uuid, clave text, nombre text, emoji text, categoria text,
  tipo_efecto text, parametros jsonb, activo boolean, vigente_hasta timestamptz, created_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select pc.id, pc.premio_id, cat.clave, cat.nombre, cat.emoji, cat.categoria,
         cat.tipo_efecto, pc.parametros, pc.activo, pc.vigente_hasta, pc.created_at
    from public.premios_canjeados pc
    join public.premios_catalogo cat on cat.id = pc.premio_id
   where pc.student_id = p_alumno
   order by pc.created_at desc;
$$;
revoke execute on function public.mis_premios(uuid) from public, anon;
grant execute on function public.mis_premios(uuid) to authenticated;
