-- Quién puede hablar en la llamada de la clase: con turno, todos o nadie.
--
-- El dueño pidió dos cosas seguidas el 17/11/2026: «¿se puede que hablen
-- varios a la vez?» y «que el profesor pueda bloquear que los estudiantes
-- puedan hablar, para tener mayor control». Son tres estados de lo mismo, así
-- que van en UNA columna, no en dos interruptores que podrían contradecirse
-- (libre y bloqueado a la vez):
--
--   turno      → habla quien tiene el turno de la clase (game_state.elegido),
--                como siempre;
--   libre      → puede hablar cualquiera de los que están en la llamada;
--   bloqueada  → ningún alumno puede hablar, aunque tenga el turno. Solo el
--                profe.
--
-- 1. game_state.llamada_modo reemplaza a game_state.llamada_libre (migración
--    llamada_microfono_libre, aplicada minutos antes y que ninguna página llegó
--    a usar: se borra). Solo vale con la llamada abierta en esta clase, y la
--    página lo vuelve a «turno» al abrir o terminar la llamada.
-- 2. Solo lo pone el profe: protect_game_state_teacher_columns() se lo devuelve
--    a cualquier otro (la función ENTERA otra vez, con todas las columnas y
--    llamada_modo en lugar de llamada_libre).
-- 3. llamada_de_la_clase() devuelve `modo`; con él deciden el pase y
--    «sincronizar» quién puede hablar. Lo hace cumplir el servidor de LiveKit.
--
-- Ver «La llamada de voz de la clase» en docs/decisiones/clase-en-vivo.md.

alter table public.game_state add column if not exists llamada_modo text not null default 'turno';
alter table public.game_state drop constraint if exists game_state_llamada_modo_valido;
alter table public.game_state add constraint game_state_llamada_modo_valido
  check (llamada_modo in ('turno', 'libre', 'bloqueada'));

comment on column public.game_state.llamada_modo is
  'Quién puede hablar en la llamada de voz: turno (quien tiene el turno), libre (todos) o bloqueada (ningún alumno). Solo lo pone el profe.';

create or replace function public.protect_game_state_teacher_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  is_teacher boolean;
  yo uuid := (select auth.uid());
  mio text;
  turno text;
  movido text;
  antes int;
  despues int;
begin
  select exists(select 1 from public.profiles p where p.id = yo and p.role = 'profesor')
    into is_teacher;
  if not is_teacher then
    new.arrows := old.arrows;
    new.circles := old.circles;
    new.active_player_id := old.active_player_id;
    new.active_player_color := old.active_player_color;
    new.rival_id := old.rival_id;
    new.vista := old.vista;
    new.comentarios := old.comentarios;
    new.elegido := old.elegido;
    new.pensar := old.pensar;
    new.encuesta := old.encuesta;
    new.calentamiento := old.calentamiento;
    new.podio := old.podio;
    new.equipos := old.equipos;
    new.tanda_calentamiento := old.tanda_calentamiento;
    new.presentacion := old.presentacion;
    new.planilla := old.planilla;
    new.practica := old.practica;
    new.sticker := old.sticker;
    new.reloj := old.reloj;
    -- La llamada de voz la abre y la termina el profe (ver llamada_de_la_clase).
    new.llamada_sesion := old.llamada_sesion;
    new.llamada_modo := old.llamada_modo;

    -- Quien juega con un solo color mueve solo ese color, de a una jugada.
    if yo is not null and (yo = old.active_player_id or yo = old.rival_id) then
      mio := case when yo = old.active_player_id then old.active_player_color
                  when old.active_player_color = 'w' then 'b'
                  when old.active_player_color = 'b' then 'w' end;
      if mio is distinct from 'both' then
        antes := coalesce(jsonb_array_length(case when jsonb_typeof(old.moves) = 'array' then old.moves end), 0);
        despues := coalesce(jsonb_array_length(case when jsonb_typeof(new.moves) = 'array' then new.moves end), 0);
        turno := coalesce(nullif(split_part(coalesce(old.fen, ''), ' ', 2), ''), 'w');
        if despues = antes + 1 then
          movido := turno;
        elsif despues = antes - 1 then
          movido := case turno when 'w' then 'b' else 'w' end;
        elsif despues = antes and new.fen is not distinct from old.fen
              and new.start_fen is not distinct from old.start_fen then
          movido := null;
        else
          raise exception 'Con un solo color se juega de a una jugada.' using errcode = 'check_violation';
        end if;
        if movido is not null and movido is distinct from mio then
          raise exception 'Ese color no es el tuyo.' using errcode = 'check_violation';
        end if;
      end if;
    end if;
  else
    -- Sin control de un solo color no hay rival.
    if new.active_player_id is null
       or new.active_player_color not in ('w', 'b')
       or new.rival_id = new.active_player_id then
      new.rival_id := null;
    end if;
    if new.pensar is not null
       and (old.pensar is null or new.pensar->>'at' is distinct from old.pensar->>'at') then
      new.pensar := jsonb_set(new.pensar, '{at}', to_jsonb(now()));
    end if;
    -- Cada sticker que se manda lleva la hora de la base: con ella cada
    -- pantalla sabe si todavía se ve (y quien entra después no ve uno viejo).
    if jsonb_typeof(new.sticker) = 'object'
       and new.sticker is distinct from old.sticker then
      new.sticker := jsonb_set(new.sticker, '{at}', to_jsonb(now()));
    end if;
    -- Una tanda nueva (otra semilla) arranca con la hora de la base.
    -- (Solo a un objeto: lo que no lo es lo rechaza el CHECK, no un error de jsonb_set.)
    if jsonb_typeof(new.tanda_calentamiento) = 'object'
       and (jsonb_typeof(old.tanda_calentamiento) is distinct from 'object'
            or new.tanda_calentamiento->>'semilla' is distinct from old.tanda_calentamiento->>'semilla') then
      new.tanda_calentamiento := jsonb_set(new.tanda_calentamiento, '{at}', to_jsonb(now()));
    elsif jsonb_typeof(new.tanda_calentamiento) = 'object' then
      -- La misma tanda (el profe la termina antes): el arranque no se mueve.
      new.tanda_calentamiento := jsonb_set(new.tanda_calentamiento, '{at}', old.tanda_calentamiento->'at');
    end if;
  end if;
  return new;
end;
$function$;

revoke execute on function public.protect_game_state_teacher_columns() from public, anon, authenticated;

create or replace function public.llamada_de_la_clase(p_profesor uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  yo uuid := (select auth.uid());
  v_sesion uuid;
  v_rol text;
  v_elegido uuid;
  v_texto text;
  v_nombre text;
  v_sacados jsonb;
  v_abierta boolean;
  v_modo text;
begin
  if yo is null or p_profesor is null then
    return null;
  end if;

  select c.id into v_sesion
    from public.class_sessions c
   where c.created_by = p_profesor and c.ended_at is null
   order by c.started_at desc
   limit 1;
  if v_sesion is null then
    return null;
  end if;

  if yo = p_profesor then
    if not exists (select 1 from public.profiles p where p.id = yo and p.role = 'profesor') then
      return null;
    end if;
    v_rol := 'profe';
  elsif coalesce(public.es_mi_profesor(p_profesor), false) then
    if exists (select 1 from public.clase_sacados s
                where s.class_session_id = v_sesion and s.student_id = yo and s.devuelto_at is null) then
      return null;
    end if;
    v_rol := 'alumno';
  else
    return null;
  end if;

  -- El turno de la clase. Un id que no sea un uuid no le da la palabra a nadie
  -- (y no revienta el cast).
  select g.elegido->>'id', g.llamada_sesion is not distinct from v_sesion, g.llamada_modo
    into v_texto, v_abierta, v_modo
    from public.game_state g where g.owner_id = p_profesor;
  v_abierta := coalesce(v_abierta, false);
  -- Quién puede hablar solo vale con la llamada abierta en esta clase; si no,
  -- el de siempre: el turno.
  v_modo := case when v_abierta then coalesce(v_modo, 'turno') else 'turno' end;
  -- El alumno entra solo si el profe abrió la llamada en ESTA clase.
  if v_rol = 'alumno' and not v_abierta then
    return null;
  end if;
  if v_texto ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_elegido := v_texto::uuid;
  end if;

  select coalesce(nullif(trim(p.full_name), ''), 'Sin nombre') into v_nombre
    from public.profiles p where p.id = yo;

  if v_rol = 'profe' then
    select coalesce(jsonb_agg(s.student_id), '[]'::jsonb) into v_sacados
      from public.clase_sacados s
     where s.class_session_id = v_sesion and s.devuelto_at is null;
  end if;

  return jsonb_build_object(
    'yo', yo,
    'rol', v_rol,
    'sala', 'clase-' || v_sesion,
    'nombre', coalesce(v_nombre, 'Sin nombre'),
    'elegido', v_elegido,
    'sacados', v_sacados,
    'abierta', v_abierta,
    'modo', v_modo
  );
end;
$$;

revoke execute on function public.llamada_de_la_clase(uuid) from public, anon;
grant execute on function public.llamada_de_la_clase(uuid) to authenticated;

-- Ya nadie la nombra (ni el trigger ni la función de arriba).
alter table public.game_state drop column if exists llamada_libre;
