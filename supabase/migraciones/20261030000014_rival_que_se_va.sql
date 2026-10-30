-- El rival que se va: avisarlo y dejar reclamar la victoria o las tablas.
--
-- Antes, si el rival cerraba la página o perdía la conexión, solo quedaba
-- esperar a que se le cayera la bandera (en una partida de 30 minutos, media
-- hora). Ahora, como en lichess, quien se queda puede reclamar. Ver «El rival
-- que se va» en docs/decisiones/juegos-y-torneos.md.
--
-- 1. partida_latidos: cuándo vio la base por última vez a cada jugador de
--    cada sala. No tiene políticas: solo la tocan las dos funciones.
-- 2. latido_de_partida(sala): la pantalla de cada jugador la llama cada
--    latido_s segundos (js/rival-ausente.js). Anota que sigue ahí y contesta
--    cuánto hace que la base no ve al rival, desde cuándo avisarlo, cada
--    cuánto volver a latir y si ya se puede reclamar. Los números viven acá,
--    una sola vez: la pantalla los recibe.
-- 3. reclamar_por_abandono(sala, tablas): termina la partida con la victoria
--    de quien reclama (o tablas) solo si la base, con SU hora, no ve al rival
--    hace reclamar_s segundos. Desde la consola no se adelanta nada.
--
-- Si el rival nunca entró, se cuenta desde que llegó quien reclama (no desde
-- que se creó la sala, que puede ser horas antes): nadie gana al abrir la
-- página. Ajedrez para 4 queda como estaba, por decisión.

create table if not exists public.partida_latidos (
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  desde timestamptz not null default now(),
  visto_en timestamptz not null default now(),
  primary key (room_id, user_id)
);
alter table public.partida_latidos enable row level security;
revoke all on public.partida_latidos from anon, authenticated;

-- A los cuántos segundos sin ver al rival se puede reclamar (una sola vez:
-- la usan las dos funciones).
create or replace function interno.segundos_para_reclamar()
 returns integer
 language sql
 immutable
 set search_path to ''
as $function$ select 40 $function$;
revoke execute on function interno.segundos_para_reclamar() from public, anon, authenticated;

-- Lo que se cuenta, en segundos: cuánto hace que la base no ve al rival.
create or replace function interno.ausencia_del_rival(p_room_id uuid, p_yo uuid)
 returns numeric
 language sql
 stable
 set search_path to ''
as $function$
  select extract(epoch from now() - coalesce(
           (select l.visto_en from public.partida_latidos l
             where l.room_id = g.id
               and l.user_id = case when p_yo = g.white_id then g.black_id else g.white_id end),
           -- El rival nunca entró: desde que llegó quien pregunta (si tampoco
           -- latió nunca, cero).
           greatest(g.created_at,
             coalesce((select l.desde from public.partida_latidos l where l.room_id = g.id and l.user_id = p_yo), now()))))
    from public.game_rooms g
   where g.id = p_room_id;
$function$;
revoke execute on function interno.ausencia_del_rival(uuid, uuid) from public, anon, authenticated;

create or replace function public.latido_de_partida(p_room_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  latido_s constant integer := 10;
  aviso_s constant integer := 20;
  reclamar_s constant integer := interno.segundos_para_reclamar();
  g record;
  yo uuid := auth.uid();
  seg numeric;
begin
  select id, white_id, black_id, status into g from public.game_rooms where id = p_room_id;
  if not coalesce(g.id is not null and yo in (g.white_id, g.black_id), false) then
    raise exception 'Solo quien juega esta partida';
  end if;
  insert into public.partida_latidos (room_id, user_id) values (p_room_id, yo)
  on conflict (room_id, user_id) do update set visto_en = now();
  if g.status <> 'playing' then
    return jsonb_build_object('segundos', 0, 'latido_s', latido_s, 'aviso_s', aviso_s, 'reclamar_s', reclamar_s, 'puede_reclamar', false);
  end if;
  seg := interno.ausencia_del_rival(p_room_id, yo);
  return jsonb_build_object('segundos', floor(seg), 'latido_s', latido_s, 'aviso_s', aviso_s,
                            'reclamar_s', reclamar_s, 'puede_reclamar', seg >= reclamar_s);
end;
$function$;
revoke execute on function public.latido_de_partida(uuid) from public, anon;
grant execute on function public.latido_de_partida(uuid) to authenticated;

create or replace function public.reclamar_por_abandono(p_room_id uuid, p_tablas boolean default false)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  reclamar_s constant integer := interno.segundos_para_reclamar();
  g record;
  yo uuid := auth.uid();
  seg numeric;
begin
  select id, white_id, black_id, status into g from public.game_rooms where id = p_room_id;
  if not coalesce(g.id is not null and yo in (g.white_id, g.black_id), false) then
    raise exception 'Solo quien juega esta partida';
  end if;
  if g.status <> 'playing' then
    raise exception 'La partida ya terminó';
  end if;
  seg := interno.ausencia_del_rival(p_room_id, yo);
  if seg < reclamar_s then
    raise exception 'Tu rival sigue conectado: la base lo vio hace % s', floor(seg);
  end if;
  update public.game_rooms
     set status = 'finished',
         result = case when p_tablas then 'draw' when yo = g.white_id then 'white' else 'black' end,
         updated_at = now()
   where id = p_room_id and status = 'playing';
end;
$function$;
revoke execute on function public.reclamar_por_abandono(uuid, boolean) from public, anon;
grant execute on function public.reclamar_por_abandono(uuid, boolean) to authenticated;