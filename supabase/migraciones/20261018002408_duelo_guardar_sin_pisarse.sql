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