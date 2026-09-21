-- Mismo defecto que game_rooms (ver migración anterior) y en el mismo
-- campo, `clock_updated_at`: cuatro-jugadores.html también lo escribe con
-- `new Date().toISOString()` del navegador de quien mueve. Reutiliza la
-- misma función SECURITY-sin-cliente.
create trigger reloj_de_partida
  before insert or update on public.fourplayer_games
  for each row execute function public.proteger_reloj_de_partida();
