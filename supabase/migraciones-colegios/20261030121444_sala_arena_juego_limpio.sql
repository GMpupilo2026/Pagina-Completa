-- La sala de arena: juego limpio. Lo que hace falta para revisar las partidas
-- y, si hay trampa, anular una partida sin borrarla.
--
-- Sigue el modelo de confianza de 20261029120000_sala_arena.sql: la legalidad
-- de cada jugada la decide el navegador de quien mueve (la base no tiene motor
-- de ajedrez), y la partida sigue fluida, sin esperar a un servidor en cada
-- jugada. Esto no lo impide: lo ENCUENTRA después. La Edge Function
-- `arena-admin` (acción «juego_limpio») repite cada partida terminada con
-- chess.js y anota lo que no cuadra; quien administra mira los indicios y
-- decide. Nada se anula solo.
--
-- LO QUE SE ANOTA (en una tabla aparte, `arena_revisiones`, que ningún jugador
-- lee: el motivo de una anulación no se le muestra a los compañeros):
--   · las veces que cada uno salió de la pantalla durante la partida (la
--     pestaña escondida: lo manda su navegador con `arena_anotar_salida`, y se
--     le avisa al entrar que queda anotado);
--   · lo que dijo la revisión con chess.js;
--   · quién anuló o devolvió la partida, cuándo y por qué (`historial`).
-- Y en cada jugada, el tiempo que se usó (`ms`), medido por la base con su
-- hora: sirve para ver tiempos sospechosamente parejos.
--
-- UNA PARTIDA ANULADA no se borra (es el acta): se marca `anulada` en
-- arena_partidas —eso sí lo ve quien jugó— y deja de contar en la
-- clasificación y en la racha. Los puntos ya guardados de las partidas
-- siguientes NO se recalculan: dependían de la racha de ese momento.
--
-- Nadie escribe estas columnas desde el navegador: no hay políticas de
-- escritura. Anular y devolver lo hace `arena-admin` con la service role.

-- ------------------------------------------------------------------ tablas
alter table public.arena_partidas
  add column anulada boolean not null default false;

create table public.arena_revisiones (
  partida_id uuid primary key references public.arena_partidas(id) on delete cascade,
  salidas_blancas integer not null default 0 check (salidas_blancas between 0 and 1000),
  salidas_negras integer not null default 0 check (salidas_negras between 0 and 1000),
  -- {"problemas": [{"tipo", "jugada", "detalle"}], "revisada_en"}: lo escribe arena-admin
  revision jsonb,
  anulada_motivo text check (anulada_motivo is null or length(btrim(anulada_motivo)) between 1 and 300),
  anulada_por text,
  anulada_en timestamptz,
  -- [{"accion": "anular" | "devolver", "motivo", "por", "en"}]
  historial jsonb not null default '[]'::jsonb check (jsonb_typeof(historial) = 'array')
);

comment on table public.arena_revisiones is
  'Juego limpio de la sala de arena: salidas de la pantalla, la revisión con chess.js y las anulaciones. Ningún jugador la lee; la escribe arena-admin (service role) y arena_anotar_salida.';

alter table public.arena_revisiones enable row level security;
-- Sin políticas: ni leer ni escribir desde el navegador.
revoke all on public.arena_revisiones from anon, authenticated;

-- --------------------------------------------- salir de la pantalla, anotado
-- La llama el navegador de quien juega cuando esconde la pestaña en medio de
-- una partida. Solo suma (con tope) y solo a su propio color.
create or replace function public.arena_anotar_salida(p_partida uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  yo uuid := (select auth.uid());
  p public.arena_partidas%rowtype;
begin
  if yo is null or not coalesce(public.soy_jugador_de_sala(), false) then
    raise exception 'Hace falta entrar a la sala con tu usuario y tu clave.' using errcode = '42501';
  end if;
  select * into p from public.arena_partidas where id = p_partida;
  if not found or yo not in (p.blancas, p.negras) then
    raise exception 'No juegas en esta partida.' using errcode = '42501';
  end if;
  if p.estado <> 'en_juego' then return; end if;

  insert into public.arena_revisiones as r (partida_id, salidas_blancas, salidas_negras)
  values (p.id, case when yo = p.blancas then 1 else 0 end, case when yo = p.negras then 1 else 0 end)
  on conflict (partida_id) do update
     set salidas_blancas = least(r.salidas_blancas + case when yo = p.blancas then 1 else 0 end, 1000),
         salidas_negras = least(r.salidas_negras + case when yo = p.negras then 1 else 0 end, 1000);
end;
$function$;

revoke execute on function public.arena_anotar_salida(uuid) from public, anon;
grant execute on function public.arena_anotar_salida(uuid) to authenticated, service_role;

-- ------------------------------------- la jugada, con el tiempo que se usó
-- Igual que antes, y además cada jugada guarda `ms`: lo que tardó quien
-- movió, contado por la base.
create or replace function public.arena_mover(
  p_partida uuid, p_desde text, p_hasta text, p_san text, p_fen text, p_fin text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  yo uuid := (select auth.uid());
  p public.arena_partidas%rowtype;
  t public.arena_torneos%rowtype;
  color text;
  usado bigint;
  resta bigint;
  nuevo bigint;
  n integer;
begin
  if yo is null or not coalesce(public.soy_jugador_de_sala(), false) then
    raise exception 'Hace falta entrar a la sala con tu usuario y tu clave.' using errcode = '42501';
  end if;
  select * into p from public.arena_partidas where id = p_partida for update;
  if not found then raise exception 'Esa partida no existe.'; end if;
  if p.estado <> 'en_juego' then return to_jsonb(p); end if;

  color := case yo when p.blancas then 'w' when p.negras then 'b' else null end;
  if color is null then raise exception 'No juegas en esta partida.' using errcode = '42501'; end if;
  if split_part(p.fen, ' ', 2) <> color then raise exception 'Todavía no es tu turno.'; end if;

  -- Si se le acabó el tiempo, la jugada llegó tarde: pierde por tiempo.
  if public.arena_vencer(p.id) then
    select * into p from public.arena_partidas where id = p_partida;
    return to_jsonb(p);
  end if;

  if p_desde !~ '^[a-h][1-8]$' or p_hasta !~ '^[a-h][1-8]$'
     or p_san is null or length(p_san) not between 2 and 12
     or p_fen is null or length(p_fen) > 100
     or p_fen !~ '^[pnbrqkPNBRQK1-8/]+ [wb] (-|[KQkq]{1,4}) (-|[a-h][36]) [0-9]+ [0-9]+$'
     or split_part(p_fen, ' ', 2) = color
     or length(regexp_replace(split_part(p_fen, ' ', 1), '[^K]', '', 'g')) <> 1
     or length(regexp_replace(split_part(p_fen, ' ', 1), '[^k]', '', 'g')) <> 1
     or p_fin is not null and p_fin not in ('mate', 'ahogado', 'material', 'repeticion', 'cincuenta') then
    raise exception 'Esa jugada no es válida.';
  end if;

  n := jsonb_array_length(p.jugadas);
  if n >= 600 then raise exception 'La partida llegó al tope de jugadas.'; end if;

  select * into t from public.arena_torneos where id = p.torneo_id;
  usado := floor(extract(epoch from (clock_timestamp() - p.reloj_desde)) * 1000);
  resta := (case color when 'w' then p.ms_blancas else p.ms_negras end) - usado;
  nuevo := least(resta + t.incremento_seg * 1000, 2147483000);

  update public.arena_partidas
     set fen = p_fen,
         jugadas = p.jugadas || jsonb_build_array(jsonb_build_object('s', p_san, 'f', p_desde, 't', p_hasta, 'ms', least(greatest(usado, 0), 2147483000))),
         ms_blancas = case when color = 'w' then nuevo else p.ms_blancas end,
         ms_negras = case when color = 'b' then nuevo else p.ms_negras end,
         reloj_desde = clock_timestamp(),
         oferta_tablas = null
   where id = p.id;

  if p_fin = 'mate' then
    perform public.arena_cerrar(p.id, case color when 'w' then '1-0' else '0-1' end, 'mate');
  elsif p_fin is not null then
    perform public.arena_cerrar(p.id, '1/2-1/2', p_fin);
  end if;

  select * into p from public.arena_partidas where id = p_partida;
  return to_jsonb(p);
end;
$function$;

-- ------------------------------------ lo anulado no cuenta para la racha
create or replace function public.arena_puntos(p_torneo uuid, p_jugador uuid, p_res text, p_jugadas integer)
 returns integer
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  racha integer := 0;
  r record;
  base integer;
begin
  -- Las dos últimas partidas terminadas: si ganó las dos, va en racha.
  for r in
    select ((p.blancas = p_jugador and p.resultado = '1-0') or (p.negras = p_jugador and p.resultado = '0-1')) as gano
    from public.arena_partidas p
    where p.torneo_id = p_torneo and p.estado = 'terminada' and p.resultado is not null
      and p_jugador in (p.blancas, p.negras)
      and not p.anulada
    order by p.terminada_en desc
    limit 2
  loop
    if r.gano then racha := racha + 1; else exit; end if;
  end loop;

  base := case p_res when 'g' then 2 when 'e' then 1 else 0 end;
  -- Unas tablas de menos de 20 jugadas no dan nada: es la forma de que no se
  -- pongan de acuerdo en regalarse puntos.
  if p_res = 'e' and p_jugadas < 20 then base := 0; end if;
  if racha >= 2 and p_res <> 'p' then base := base * 2; end if;
  return base;
end;
$function$;

-- --------------------------- ni para la clasificación ni para quién va en racha
create or replace function public.arena_clasificacion(p_torneo uuid)
 returns jsonb
 language sql
 stable
 security invoker
 set search_path to ''
as $function$
  with t as (
    select mejores from public.arena_torneos where id = p_torneo
  ), res as (
    select p.blancas as jugador, p.puntos_blancas as pts, (p.resultado = '1-0') as gano
      from public.arena_partidas p
     where p.torneo_id = p_torneo and p.estado = 'terminada' and p.resultado is not null and not p.anulada
    union all
    select p.negras, p.puntos_negras, (p.resultado = '0-1')
      from public.arena_partidas p
     where p.torneo_id = p_torneo and p.estado = 'terminada' and p.resultado is not null and not p.anulada
  ), por_jugador as (
    select j.id, j.nombre, j.equipo_id, e.nombre as equipo,
           coalesce(sum(r.pts), 0)::int as puntos,
           count(r.jugador)::int as partidas,
           count(*) filter (where r.gano)::int as victorias
      from public.arena_jugadores j
      left join public.arena_equipos e on e.id = j.equipo_id
      left join res r on r.jugador = j.id
     where j.id in (select jugador from res)
        or j.id in (select c.jugador_id from public.arena_cola c where c.torneo_id = p_torneo)
        or j.id in (select a.blancas from public.arena_partidas a where a.torneo_id = p_torneo and a.estado = 'en_juego')
        or j.id in (select a.negras from public.arena_partidas a where a.torneo_id = p_torneo and a.estado = 'en_juego')
     group by j.id, j.nombre, j.equipo_id, e.nombre
  ), ordenados as (
    select pj.*, row_number() over (partition by pj.equipo_id order by pj.puntos desc, pj.partidas, pj.nombre) as puesto_en_equipo
      from por_jugador pj
     where pj.equipo_id is not null
  ), por_equipo as (
    select e.id, e.nombre,
           coalesce(sum(o.puntos) filter (where o.puesto_en_equipo <= (select mejores from t)), 0)::int as puntos,
           count(o.id)::int as jugadores
      from public.arena_equipos e
      left join ordenados o on o.equipo_id = e.id
     where exists (select 1 from public.arena_jugadores jj where jj.equipo_id = e.id)
     group by e.id, e.nombre
  )
  select jsonb_build_object(
    'jugadores', coalesce((select jsonb_agg(to_jsonb(x) order by x.puntos desc, x.partidas, x.nombre) from por_jugador x), '[]'::jsonb),
    'equipos', coalesce((select jsonb_agg(to_jsonb(y) order by y.puntos desc, y.nombre) from por_equipo y), '[]'::jsonb)
  )
$function$;

create or replace function public.arena_en_racha(p_torneo uuid)
 returns setof uuid
 language sql
 stable
 security invoker
 set search_path to ''
as $function$
  with todas as (
    select p.blancas as jugador, (p.resultado = '1-0') as gano, p.terminada_en
      from public.arena_partidas p
     where p.torneo_id = p_torneo and p.estado = 'terminada' and p.resultado is not null and not p.anulada
    union all
    select p.negras, (p.resultado = '0-1'), p.terminada_en
      from public.arena_partidas p
     where p.torneo_id = p_torneo and p.estado = 'terminada' and p.resultado is not null and not p.anulada
  ), ult as (
    select jugador, gano,
           row_number() over (partition by jugador order by terminada_en desc) as n
      from todas
  )
  select jugador from ult where n <= 2 group by jugador having count(*) = 2 and bool_and(gano)
$function$;
