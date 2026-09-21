-- El tiempo lo elige quien reta, para que el otro vea qué está aceptando.
alter table public.desafios
  add column if not exists initial_seconds integer,
  add column if not exists increment_seconds integer not null default 0;

-- Aceptar un reto crea la partida. Va por función SECURITY DEFINER porque la
-- política game_rooms_insert exige role = 'profesor': un alumno no puede crear
-- partidas por su cuenta, y así sigue siendo — solo las crea este camino, y
-- solo cuando hay un desafío pendiente de verdad dirigido a quien llama.
--
-- La posición inicial la manda el navegador (p_fen y los estados por modalidad)
-- porque quien sabe armarla es el JavaScript del sitio: el FEN de Crazyhouse
-- lleva la reserva, Abrazos guarda su propio JSON y Cartas y Duelo arrancan con
-- un mazo repartido. Duplicar todo eso en SQL sería tener dos verdades. El
-- alcance de un valor raro es la propia partida de quien lo manda.
create or replace function public.aceptar_desafio(
  p_desafio uuid,
  p_fen text default null,
  p_cartas jsonb default null,
  p_duelo jsonb default null,
  p_variant jsonb default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  d           public.desafios;
  v_blancas   uuid;
  v_negras    uuid;
  v_room      uuid;
begin
  select * into d from public.desafios where id = p_desafio for update;
  if not found then
    raise exception 'Ese desafío ya no existe.' using errcode = '22023';
  end if;
  if d.para_id <> auth.uid() then
    raise exception 'Solo puede aceptar quien recibió el desafío.' using errcode = '42501';
  end if;
  if d.estado <> 'pendiente' then
    raise exception 'Ese desafío ya fue respondido.' using errcode = '22023';
  end if;
  if not public.pueden_jugar_entre_si(d.de_id, d.para_id) then
    raise exception 'Ya no pueden jugar entre sí.' using errcode = '42501';
  end if;

  -- Colores al azar: no gana siempre las blancas quien reta.
  if random() < 0.5 then
    v_blancas := d.de_id; v_negras := d.para_id;
  else
    v_blancas := d.para_id; v_negras := d.de_id;
  end if;

  insert into public.game_rooms (
    variant, white_id, black_id, created_by,
    initial_seconds, increment_seconds, white_time_left, black_time_left,
    fen, cartas_state, duelo_state, variant_state
  ) values (
    d.modalidad, v_blancas, v_negras, auth.uid(),
    d.initial_seconds, coalesce(d.increment_seconds, 0), d.initial_seconds, d.initial_seconds,
    coalesce(nullif(btrim(coalesce(p_fen, '')), ''),
             'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[] w KQkq - 0 1'),
    p_cartas, p_duelo, p_variant
  ) returning id into v_room;

  update public.desafios
     set estado = 'aceptado', room_id = v_room, respondido_at = now()
   where id = d.id;

  -- Cualquier otro reto pendiente entre los dos deja de tener sentido.
  update public.desafios
     set estado = 'cancelado', respondido_at = now()
   where estado = 'pendiente'
     and id <> d.id
     and ((de_id = d.de_id and para_id = d.para_id) or (de_id = d.para_id and para_id = d.de_id));

  return v_room;
end;
$$;

comment on function public.aceptar_desafio is
  'Acepta un desafío pendiente y crea la partida en game_rooms con los colores sorteados. Único camino por el que un alumno estrena una partida: la política game_rooms_insert sigue exigiendo profesor.';

revoke all on function public.aceptar_desafio(uuid, text, jsonb, jsonb, jsonb) from public;
grant execute on function public.aceptar_desafio(uuid, text, jsonb, jsonb, jsonb) to authenticated;