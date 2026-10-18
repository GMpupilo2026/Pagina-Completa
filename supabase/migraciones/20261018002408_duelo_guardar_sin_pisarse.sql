-- Duelo Simultáneo: el compromiso y la revelación de cada jugador se guardan
-- sin pisar los del rival. Ver «Las dos escrituras del duelo ya no se pisan»
-- en docs/decisiones/juegos-y-torneos.md.
--
-- Los dos jugadores escriben casi a la vez (confirman y revelan en el mismo
-- medio segundo), y la página guardaba duelo_state ENTERO tal como lo había
-- leído: la segunda escritura borraba lo que la primera acababa de poner. Con
-- dos revelaciones simultáneas, una se perdía y la partida se quedaba en
-- «revelando y resolviendo la ronda…» para siempre (1 de cada 8 en la prueba).
--
-- duelo_guardar() pone solo la parte propia (commit o reveal de su color) con
-- jsonb_set sobre la fila que ya tiene bloqueada: dos llamadas a la vez se
-- suman en vez de pisarse (la segunda espera a la primera y vuelve a leer la
-- fila). Solo en la ronda que se pide: lo que llega tarde de una ronda ya
-- resuelta no entra. El color lo pone la base (quién llama), no el navegador.
--
-- SECURITY INVOKER: la RLS de game_rooms (game_rooms_update) y el trigger del
-- reloj (proteger_reloj_de_partida) siguen decidiendo, igual que un update.
create or replace function public.duelo_guardar(p_sala uuid, p_ronda integer, p_parte text, p_valor jsonb, p_tiempo numeric default null)
 returns setof public.game_rooms
 language plpgsql
 security invoker
 set search_path to ''
as $function$
declare
  v_color text;
begin
  if p_parte not in ('commit', 'reveal') then
    raise exception 'Parte del duelo inválida';
  end if;
  select case when g.white_id = (select auth.uid()) then 'w'
              when g.black_id = (select auth.uid()) then 'b' end
    into v_color
    from public.game_rooms g
   where g.id = p_sala and g.variant = 'duelo';
  if v_color is null then
    raise exception 'No juegas esta partida';
  end if;
  return query
    update public.game_rooms g
       set duelo_state = jsonb_set(g.duelo_state, array[p_parte, v_color], p_valor, true),
           white_time_left = case when v_color = 'w' and p_tiempo is not null then p_tiempo else g.white_time_left end,
           black_time_left = case when v_color = 'b' and p_tiempo is not null then p_tiempo else g.black_time_left end,
           updated_at = now()
     where g.id = p_sala
       and g.status = 'playing'
       and (g.duelo_state ->> 'round')::integer = p_ronda
    returning g.*;
end;
$function$;

revoke execute on function public.duelo_guardar(uuid, integer, text, jsonb, numeric) from public, anon;
grant execute on function public.duelo_guardar(uuid, integer, text, jsonb, numeric) to authenticated;
