-- La libreta de torneos (3 de 3): quién puede qué. Corregir es solo la ronda,
-- el torneo y los comentarios: las jugadas, el color, el resultado y lo que
-- dijo el motor no se tocan desde afuera.
grant update (ronda, evento, comentarios) on public.partidas_torneo to authenticated;
revoke execute on function public.avisar_partida_torneo(uuid, integer) from public, anon;
grant execute on function public.avisar_partida_torneo(uuid, integer) to authenticated;