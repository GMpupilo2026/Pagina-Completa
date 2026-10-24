-- La Racha táctica, otra vez desde cero (lo pidió el dueño del sitio): ahora
-- dura días, sube de jugadas con la racha y la corrige la base. Ver «La Racha
-- táctica: una racha que dura días» en docs/decisiones/entrenamiento.md.
--
-- - El banco (`racha_ejercicios`) lo arma herramientas/racha-banco-generar.js:
--   ejercicios de Lichess de 1 a 8 jugadas del alumno, cada una la única buena
--   según Stockfish. Nadie lo lee directo: la solución no sale nunca de la
--   base antes de contestar.
-- - Una jugada hasta los 100 aciertos, dos hasta los 300, tres hasta los 600,
--   cuatro hasta los 1000…: el tramo k empieza en 50·k·(k−1). Dentro de cada
--   tramo, el rating sube de 600 a 1800. Los temas se van alternando.
-- - La racha NO se corta al cerrar la página: se guarda en
--   `racha_tactica_estado` y sigue al volver, otro día. Se corta al fallar o
--   al quedarse sin tiempo (también si se cerró la página con un ejercicio a
--   medias y el reloj se venció).
-- - Cada día de Costa Rica con al menos un acierto, después del primero de la
--   racha, paga 100 Puntos Ajedrez (`racha_tactica`, una vez por día y racha).
-- - El récord (`puzzle_rush_scores`) ya no lo escribe el navegador: lo sube la
--   base al acertar. Los récords de antes se guardan aparte y se borran.

-- ---------- Reiniciar la racha para todos ----------
create table interno.puzzle_rush_scores_hasta_20261024 as
  select * from public.puzzle_rush_scores;
comment on table interno.puzzle_rush_scores_hasta_20261024 is
  'Los récords de la Racha táctica de antes del reinicio del 24/10/2026 (la racha de un solo ejercicio de una jugada).';
delete from public.puzzle_rush_scores;

drop policy if exists puzzle_rush_scores_insert_own on public.puzzle_rush_scores;
drop policy if exists puzzle_rush_scores_update_own on public.puzzle_rush_scores;
revoke insert, update, delete on public.puzzle_rush_scores from anon, authenticated;

-- ---------- Puntos: el origen nuevo ----------
alter table public.puntos_ajustes drop constraint if exists puntos_ajustes_origen_check;
alter table public.puntos_ajustes add constraint puntos_ajustes_origen_check check (origen = any (array[
  'clase', 'entrenamiento', 'tarea', 'examen', 'racha', 'reto_semanal', 'canje', 'regalo', 'broma',
  'ajuste_manual', 'partida', 'semana_sin_entrenar', 'racha_tactica']));

-- ---------- El banco ----------
create table public.racha_ejercicios (
  id text primary key,                     -- PuzzleId de Lichess
  jugadas smallint not null check (jugadas between 1 and 12),
  rating integer not null,
  tema text not null,
  fen text not null,                       -- ANTES de la jugada del rival
  movimientos text[] not null,             -- UCI: [1] el rival, [2] el alumno, [3] el rival…
  check (array_length(movimientos, 1) = 2 * jugadas)
);
create index racha_ejercicios_jugadas_rating on public.racha_ejercicios (jugadas, rating);
comment on table public.racha_ejercicios is
  'El banco de la Racha táctica (herramientas/racha-banco-generar.js). Sin políticas: solo lo leen las funciones racha_tactica_*.';
alter table public.racha_ejercicios enable row level security;
revoke all on public.racha_ejercicios from anon, authenticated;

-- ---------- La racha de cada uno ----------
create table public.racha_tactica_estado (
  student_id uuid primary key references public.profiles(id) on delete cascade,
  racha integer not null default 0 check (racha >= 0),
  racha_id uuid not null default gen_random_uuid(),   -- cambia en cada racha nueva: la referencia del premio
  primer_dia date,                                    -- día de Costa Rica del primer acierto
  ultimo_dia date,
  dias integer not null default 0,                    -- días distintos con aciertos en esta racha
  tramo smallint,
  ejercicio text references public.racha_ejercicios(id) on delete set null,
  paso smallint not null default 0,                   -- jugadas del alumno ya hechas en el ejercicio
  entregado_en timestamptz,                           -- desde cuándo corre el reloj de la jugada
  limite_ms integer,
  modo text not null default 'normal' check (modo in ('normal', 'adaptado', 'ciego')),
  vistos text[] not null default '{}',
  temas_recientes text[] not null default '{}',
  actualizado_en timestamptz not null default now()
);
comment on table public.racha_tactica_estado is
  'La racha en curso de cada uno en la Racha táctica. Sin políticas: la leen y escriben las funciones racha_tactica_*.';
alter table public.racha_tactica_estado enable row level security;
revoke all on public.racha_tactica_estado from anon, authenticated;

-- ---------- Las reglas ----------
-- El tramo: k jugadas desde los 50·k·(k−1) aciertos (0, 100, 300, 600, 1000…),
-- hasta el más largo que haya en el banco.
create or replace function interno.racha_tramo(p_racha integer)
returns integer language sql stable set search_path = public as $$
  select greatest(1, least(
    floor((1 + sqrt(1 + p_racha / 12.5)) / 2)::integer,
    coalesce((select max(jugadas) from public.racha_ejercicios), 1)));
$$;

-- El rating que toca: de 600 a 1800 a lo largo del tramo.
create or replace function interno.racha_rating_meta(p_racha integer, p_tramo integer)
returns integer language sql immutable as $$
  select (600 + 1200 * least(1.0, greatest(0.0,
    (p_racha - 50.0 * p_tramo * (p_tramo - 1)) / (100.0 * p_tramo))))::integer;
$$;

-- El reloj de cada jugada: 10 s; 60 s en Modo Adaptado; con la cuenta ciega,
-- 30 s, y en la primera jugada además lo que tarda la lectura pieza por pieza.
create or replace function interno.racha_limite_ms(p_modo text, p_fen text, p_paso integer)
returns integer language sql immutable as $$
  select case p_modo
    when 'adaptado' then 60000
    when 'ciego' then 30000 + case when p_paso = 0
      then 8000 + 4000 * length(regexp_replace(split_part(p_fen, ' ', 1), '[^a-zA-Z]', '', 'g')) else 0 end
    else 10000 end;
$$;

-- Lo que la base le perdona a la red: la jugada llega un poco después de que
-- el reloj de la pantalla la mandó.
create or replace function interno.racha_vencido(e public.racha_tactica_estado)
returns boolean language sql stable as $$
  select e.entregado_en is not null and now() > e.entregado_en + make_interval(secs => (e.limite_ms + 2500) / 1000.0);
$$;

-- Corta la racha y devuelve cómo terminó (con la solución desde donde iba).
create or replace function interno.racha_cortar(p_yo uuid, p_motivo text, p_jugada text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e public.racha_tactica_estado;
  x public.racha_ejercicios;
  v_desde integer;
begin
  select * into e from public.racha_tactica_estado where student_id = p_yo;
  select * into x from public.racha_ejercicios where id = e.ejercicio;
  v_desde := 2 * e.paso + 2;
  update public.racha_tactica_estado
     set racha = 0, racha_id = gen_random_uuid(), primer_dia = null, ultimo_dia = null, dias = 0,
         tramo = null, ejercicio = null, paso = 0, entregado_en = null, limite_ms = null,
         vistos = '{}', temas_recientes = '{}', actualizado_en = now()
   where student_id = p_yo;
  return jsonb_build_object(
    'resultado', 'fallo',
    'motivo', p_motivo,
    'jugada', p_jugada,
    'racha_final', e.racha,
    'dias', e.dias,
    'fen', x.fen,
    'hechas', to_jsonb(coalesce(x.movimientos[1:v_desde - 1], '{}')),
    'solucion', to_jsonb(coalesce(x.movimientos[v_desde:], '{}')));
end;
$$;

-- Lo que la pantalla necesita para pintar la racha y, si hay, el ejercicio a medias.
create or replace function interno.racha_resumen(e public.racha_tactica_estado)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  x public.racha_ejercicios;
  k integer := interno.racha_tramo(coalesce(e.racha, 0));
  v jsonb;
begin
  v := jsonb_build_object(
    'racha', coalesce(e.racha, 0),
    'dias', coalesce(e.dias, 0),
    'record', coalesce((select best_streak from public.puzzle_rush_scores where student_id = e.student_id), 0),
    'jugadas', k,
    'proximo_tramo', 50 * (k + 1) * k);
  if e.ejercicio is not null then
    select * into x from public.racha_ejercicios where id = e.ejercicio;
    v := v || jsonb_build_object('ejercicio', jsonb_build_object(
      'fen', x.fen,
      'hechas', to_jsonb(x.movimientos[1:2 * e.paso + 1]),
      'jugadas', x.jugadas,
      'paso', e.paso,
      'limite_ms', e.limite_ms,
      'restan_ms', greatest(0, e.limite_ms - (extract(epoch from now() - e.entregado_en) * 1000)::integer)));
  end if;
  return v;
end;
$$;

-- ---------- Lo que llama la página ----------
-- Cómo va: la racha guardada y, si quedó un ejercicio a medias, ese ejercicio
-- (o, si ya se le venció el reloj, cómo terminó).
create or replace function public.racha_tactica_estado()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_yo uuid := auth.uid();
  e public.racha_tactica_estado;
  v_fallo jsonb;
begin
  if v_yo is null then raise exception 'Hace falta iniciar sesión.' using errcode = '42501'; end if;
  select * into e from public.racha_tactica_estado where student_id = v_yo for update;
  if found and e.ejercicio is not null and interno.racha_vencido(e) then
    v_fallo := interno.racha_cortar(v_yo, 'tiempo', null);
    select * into e from public.racha_tactica_estado where student_id = v_yo;
  end if;
  if not found then e.student_id := v_yo; end if;
  return interno.racha_resumen(e) || coalesce(jsonb_build_object('fallo', v_fallo), '{}');
end;
$$;

-- El ejercicio que toca. Si hay uno a medias, es ese: no se puede saltar uno
-- difícil recargando la página.
create or replace function public.racha_tactica_siguiente(p_modo text default 'normal')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_yo uuid := auth.uid();
  v_modo text := case when p_modo in ('adaptado', 'ciego') then p_modo else 'normal' end;
  e public.racha_tactica_estado;
  x public.racha_ejercicios;
  k integer;
  v_meta integer;
  v_recientes text[];
begin
  if v_yo is null then raise exception 'Hace falta iniciar sesión.' using errcode = '42501'; end if;
  if not coalesce(public.acceso_vigente(), false) then
    raise exception 'Tu acceso a la plataforma no está vigente.' using errcode = 'P0001';
  end if;
  insert into public.racha_tactica_estado (student_id) values (v_yo) on conflict (student_id) do nothing;
  select * into e from public.racha_tactica_estado where student_id = v_yo for update;

  if e.ejercicio is not null then
    if interno.racha_vencido(e) then
      return interno.racha_cortar(v_yo, 'tiempo', null);
    end if;
    return interno.racha_resumen(e);
  end if;

  k := interno.racha_tramo(e.racha);
  if e.tramo is distinct from k then e.vistos := '{}'; end if;
  v_meta := interno.racha_rating_meta(e.racha, k);
  v_recientes := e.temas_recientes[greatest(1, coalesce(array_length(e.temas_recientes, 1), 0) - 2):];
  -- Cerca del rating que toca (con un poco de azar), sin repetir y sin los tres últimos temas.
  select * into x from public.racha_ejercicios
   where jugadas = k and not (id = any (e.vistos)) and not (tema = any (v_recientes))
   order by abs(rating - v_meta) + random() * 250 limit 1;
  if not found then
    select * into x from public.racha_ejercicios
     where jugadas = k and not (id = any (e.vistos))
     order by abs(rating - v_meta) + random() * 250 limit 1;
  end if;
  if not found then
    e.vistos := '{}';
    select * into x from public.racha_ejercicios where jugadas = k
     order by abs(rating - v_meta) + random() * 250 limit 1;
  end if;
  if not found then raise exception 'El banco de la Racha táctica está vacío.' using errcode = 'P0001'; end if;

  update public.racha_tactica_estado
     set tramo = k, ejercicio = x.id, paso = 0, modo = v_modo, entregado_en = now(),
         limite_ms = interno.racha_limite_ms(v_modo, x.fen, 0),
         vistos = e.vistos || x.id, actualizado_en = now()
   where student_id = v_yo
   returning * into e;
  return interno.racha_resumen(e);
end;
$$;

-- Una jugada del alumno (UCI, «e2e4» o «e7e8q»; null = se le acabó el tiempo).
-- La corrige la base: o sigue (con la respuesta del rival), o resolvió, o falló.
create or replace function public.racha_tactica_jugar(p_jugada text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_yo uuid := auth.uid();
  v_jugada text := lower(nullif(trim(p_jugada), ''));
  e public.racha_tactica_estado;
  x public.racha_ejercicios;
  v_i integer;
  v_hoy date := (now() at time zone 'America/Costa_Rica')::date;
  v_bono integer := 0;
  v_record integer;
  k_antes integer;
begin
  if v_yo is null then raise exception 'Hace falta iniciar sesión.' using errcode = '42501'; end if;
  select * into e from public.racha_tactica_estado where student_id = v_yo for update;
  if not found or e.ejercicio is null then
    raise exception 'No hay ningún ejercicio en curso.' using errcode = 'P0001';
  end if;
  select * into x from public.racha_ejercicios where id = e.ejercicio;
  v_i := 2 * e.paso + 2;

  if v_jugada is null or interno.racha_vencido(e) then
    return interno.racha_cortar(v_yo, 'tiempo', v_jugada);
  end if;
  if v_jugada <> x.movimientos[v_i] then
    return interno.racha_cortar(v_yo, 'incorrecta', v_jugada);
  end if;

  -- Bien, y quedan jugadas: el rival contesta y el reloj vuelve a empezar.
  if e.paso + 1 < x.jugadas then
    update public.racha_tactica_estado
       set paso = e.paso + 1, entregado_en = now(),
           limite_ms = interno.racha_limite_ms(e.modo, x.fen, e.paso + 1), actualizado_en = now()
     where student_id = v_yo
     returning * into e;
    return jsonb_build_object('resultado', 'sigue', 'respuesta', x.movimientos[v_i + 1],
      'paso', e.paso, 'limite_ms', e.limite_ms);
  end if;

  -- Resuelto.
  k_antes := interno.racha_tramo(e.racha);
  e.racha := e.racha + 1;
  if e.primer_dia is null then
    e.primer_dia := v_hoy; e.ultimo_dia := v_hoy; e.dias := 1;
  elsif v_hoy > e.ultimo_dia then
    e.ultimo_dia := v_hoy; e.dias := e.dias + 1;
    -- Un día más de racha: 100 puntos (una vez por día y por racha).
    v_bono := interno.otorgar_puntos(v_yo, 100, 'racha_tactica',
      'Racha táctica: día ' || e.dias || ' de la misma racha',
      'racha_tactica:' || e.racha_id || ':' || v_hoy, null);
  end if;
  update public.racha_tactica_estado
     set racha = e.racha, primer_dia = e.primer_dia, ultimo_dia = e.ultimo_dia, dias = e.dias,
         ejercicio = null, paso = 0, entregado_en = null, limite_ms = null,
         temas_recientes = (e.temas_recientes || x.tema)[greatest(1, coalesce(array_length(e.temas_recientes, 1), 0) - 1):],
         actualizado_en = now()
   where student_id = v_yo;
  insert into public.puzzle_rush_scores as s (student_id, best_streak, achieved_at, updated_at)
  values (v_yo, e.racha, now(), now())
  on conflict (student_id) do update
     set best_streak = excluded.best_streak, achieved_at = now(), updated_at = now()
   where s.best_streak < excluded.best_streak;
  select best_streak into v_record from public.puzzle_rush_scores where student_id = v_yo;
  return jsonb_build_object('resultado', 'resuelto', 'racha', e.racha, 'record', v_record,
    'dias', e.dias, 'bono', v_bono,
    'jugadas', interno.racha_tramo(e.racha), 'sube', interno.racha_tramo(e.racha) > k_antes);
end;
$$;

revoke execute on function interno.racha_tramo(integer), interno.racha_rating_meta(integer, integer),
  interno.racha_limite_ms(text, text, integer), interno.racha_vencido(public.racha_tactica_estado),
  interno.racha_cortar(uuid, text, text), interno.racha_resumen(public.racha_tactica_estado)
  from public, anon, authenticated;
revoke execute on function public.racha_tactica_estado(), public.racha_tactica_siguiente(text),
  public.racha_tactica_jugar(text) from public, anon;
grant execute on function public.racha_tactica_estado(), public.racha_tactica_siguiente(text),
  public.racha_tactica_jugar(text) to authenticated;
