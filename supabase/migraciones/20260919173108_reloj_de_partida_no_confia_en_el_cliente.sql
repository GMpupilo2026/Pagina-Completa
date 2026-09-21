-- Encontrado hoy en producción: game_rooms.f6fb3abc... (Ajedrez Estándar,
-- increment_seconds=0) quedó con white_time_left = 1036 s, MÁS que los 600
-- iniciales — imposible sin incremento. Causa: cada jugada guarda su propio
-- clock_updated_at con `new Date().toISOString()` del NAVEGADOR de quien
-- mueve, no con la hora del servidor. Si el reloj de ESE aparato está
-- adelantado, ese timestamp queda en el futuro; cuando el RIVAL mueve
-- después, calcula elapsed = Date.now() - clock_updated_at con SU PROPIO
-- reloj (correcto) contra ese ancla futura -> elapsed sale NEGATIVO y su
-- propio tiempo restante se INFLA en vez de descontarse. Un solo aparato
-- con la hora mal puesta arruina el reloj de los dos jugadores.
--
-- Mismo defecto, mismo arreglo que ya tienen class_presence_log y
-- platform_activity_log (proteger_tiempos_de_presencia): el navegador
-- puede decidir CUÁNDO tocar el reloj, pero no CUÁNTO valen las marcas de
-- tiempo — esas las pone el reloj del servidor.
create or replace function public.proteger_reloj_de_partida()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    if new.clock_updated_at is not null then
      new.clock_updated_at := now();
    end if;
  elsif new.clock_updated_at is distinct from old.clock_updated_at and new.clock_updated_at is not null then
    new.clock_updated_at := now();
  end if;
  return new;
end;
$$;

create trigger reloj_de_partida
  before insert or update on public.game_rooms
  for each row execute function public.proteger_reloj_de_partida();
