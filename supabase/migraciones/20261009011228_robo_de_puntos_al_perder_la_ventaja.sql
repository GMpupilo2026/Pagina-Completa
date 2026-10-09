-- El robo de puntos: cuando dos alumnos juegan entre sí (ajedrez estándar,
-- dentro o fuera de una clase) y quien gana estuvo en algún momento en una
-- posición materialmente perdida, se le "roban" esos puntos a quien tenía la
-- ventaja y la dejó ir. La cantidad es la mayor ventaja en material (en
-- peones) que tuvo el perdedor durante la partida, por 100 (si tuvo +6 en
-- algún momento, pierde 600 y se los lleva el otro). Ver «El robo de puntos»
-- en docs/decisiones/puntos-y-premios.md.
--
-- Contar material pieza por pieza, jugada por jugada, no se puede hacer en
-- SQL sin reproducir la partida con reglas de ajedrez de verdad (capturas,
-- promociones...), así que lo hace chess.js en la Edge Function partida-fin,
-- la misma librería que usa todo el sitio para no inventar nunca una
-- posición. pg_net dispara esa función al terminar la partida, firmado con
-- un secreto de la bóveda (mismo patrón que disparar_informes_encargados):
-- nadie más la puede llamar, y la base vuelve a comprobar el estado de la
-- sala antes de repartir nada.
set local lock_timeout = '8s';

-- =====================================================================
-- 1. Un origen más para el ledger de puntos (puntos_ajustes.origen).
-- =====================================================================
alter table public.puntos_ajustes drop constraint puntos_ajustes_origen_check;
alter table public.puntos_ajustes add constraint puntos_ajustes_origen_check
  check (origen in ('clase', 'entrenamiento', 'tarea', 'examen', 'racha', 'reto_semanal', 'canje', 'regalo', 'broma', 'ajuste_manual', 'partida'));

-- =====================================================================
-- 2. El secreto con el que game_rooms avisa a la Edge Function y con el
--    que esta vuelve a comparar. Se genera solo, nadie lo escribe ni lo ve.
-- =====================================================================
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'partida_robo_secreto') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'partida_robo_secreto',
      'Firma con la que game_rooms avisa a la Edge Function partida-fin que una partida terminó.');
  end if;
end $$;

create or replace function public.secreto_partida_robo()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'partida_robo_secreto';
$$;
revoke execute on function public.secreto_partida_robo() from public, anon, authenticated;
grant execute on function public.secreto_partida_robo() to service_role;

-- =====================================================================
-- 3. Lo que de verdad reparte los puntos. La llama la Edge Function, que ya
--    hizo las cuentas con chess.js: nunca el navegador. Dos asientos del
--    mismo ledger, cada uno con su propia referencia por sala, para que una
--    sala que avisa dos veces no pague ni cobre dos veces.
-- =====================================================================
create or replace function public.registrar_robo_de_puntos(
  p_room_id uuid,
  p_ganador uuid,
  p_perdedor uuid,
  p_puntos integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_ganador is null or p_perdedor is null or p_ganador = p_perdedor or p_puntos is null or p_puntos <= 0 then
    return;
  end if;
  perform interno.otorgar_puntos(p_perdedor, -p_puntos, 'partida',
    'Perdió una partida que tenía ganada', 'partida_robo:' || p_room_id::text);
  perform interno.otorgar_puntos(p_ganador, p_puntos, 'partida',
    'Ganó una partida perdida: le robó puntos a su rival', 'partida_premio:' || p_room_id::text);
end;
$$;
revoke execute on function public.registrar_robo_de_puntos(uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.registrar_robo_de_puntos(uuid, uuid, uuid, integer) to service_role;

-- =====================================================================
-- 4. El disparador: cuando una partida termina con un ganador (tablas no
--    roba nada), avisa a la Edge Function. No llama a nadie si falta el
--    secreto o si la variante no es ajedrez estándar (en las demás
--    variantes —crazyhouse, niebla, cartas...— contar material a partir de
--    las jugadas SAN con chess.js no es confiable).
-- =====================================================================
create or replace function public.disparar_fin_de_partida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  secreto text;
begin
  if new.variant <> 'estandar' or new.result is null or new.result = 'draw' then
    return new;
  end if;
  select decrypted_secret into secreto from vault.decrypted_secrets where name = 'partida_robo_secreto';
  if secreto is null or secreto = '' then
    raise warning 'No hay secreto de robo de puntos: no se avisó el fin de la partida %', new.id;
    return new;
  end if;
  perform net.http_post(
    url := 'https://bgtijpimpcokxatxxbki.supabase.co/functions/v1/partida-fin',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secreto),
    body := jsonb_build_object('room_id', new.id),
    timeout_milliseconds := 20000
  );
  return new;
end;
$$;
revoke execute on function public.disparar_fin_de_partida() from public, anon, authenticated;

create trigger disparar_fin_de_partida after update on public.game_rooms
  for each row
  when (new.status = 'finished' and old.status is distinct from 'finished')
  execute function public.disparar_fin_de_partida();
