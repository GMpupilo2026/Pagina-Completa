-- Quien recibe el reto es el único que puede aceptarlo o rechazarlo; quien lo
-- envió solo puede cancelarlo. Antes los dos podían dejar cualquier estado: el
-- que retaba podía marcar su propio reto como "aceptado" y ponerle el room_id
-- que quisiera. No abría ninguna partida ajena (game_rooms tiene su propia RLS
-- por white_id/black_id), pero se mandaba solo al vacío por Realtime.
-- Aceptar de verdad sigue siendo cosa de aceptar_desafio(), que es SECURITY
-- DEFINER y se salta esta política.
drop policy if exists desafios_update on public.desafios;

create policy desafios_update on public.desafios
  for update to authenticated
  using (
    (auth.uid() = para_id and estado = 'pendiente')
    or (auth.uid() = de_id and estado = 'pendiente')
  )
  with check (
    (auth.uid() = para_id and estado in ('rechazado', 'cancelado') and room_id is null)
    or (auth.uid() = de_id and estado = 'cancelado' and room_id is null)
  );