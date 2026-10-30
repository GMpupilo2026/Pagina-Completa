-- La partida terminada se revisa con chess.js.
--
-- La base acepta la posición que manda el navegador: desde la consola se
-- puede escribir cualquier tablero (un mate que no se jugó). Validar cada
-- jugada en el servidor frenaría la partida; en cambio, al terminar, la Edge
-- Function partida-fin rehace las jugadas con chess.js (revision.ts) y anota
-- acá la que no cuadra, para que la mire su profe. Ver «La partida terminada
-- se revisa con chess.js» en docs/decisiones/juegos-y-torneos.md.
--
-- 1. game_rooms.fen_inicial: la posición con que nació la sala (una partida
--    de la clase puede arrancar del tablero del profe). La fija la base al
--    crearla y nadie la cambia después; sin ella no hay de dónde rehacer
--    las jugadas. Las salas de antes quedan en null: la revisión supone la
--    posición de siempre y, si las jugadas no calzan, no acusa.
-- 2. partidas_revision: una fila por partida que no cuadró. La escribe solo
--    la Edge Function (clave de servicio): no hay política de escritura. La
--    leen quien administra y el profe de alguno de los dos jugadores.
-- 3. marcar_partida_revisada(): «Ya la revisé», con el mismo permiso.
-- 4. disparar_fin_de_partida() avisa también con tablas (antes solo con
--    ganador, porque solo hacía el robo de puntos).

alter table public.game_rooms add column if not exists fen_inicial text;

-- Las salas que todavía no tienen jugadas están en su posición inicial (va
-- antes del trigger: con él, un UPDATE deja fen_inicial como estaba).
update public.game_rooms set fen_inicial = fen
 where fen_inicial is null and coalesce(jsonb_array_length(moves), 0) = 0;

create or replace function public.fijar_fen_inicial()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if TG_OP = 'INSERT' then
    new.fen_inicial := new.fen;
  else
    new.fen_inicial := old.fen_inicial;
  end if;
  return new;
end;
$function$;
revoke execute on function public.fijar_fen_inicial() from public, anon, authenticated;

create or replace trigger fen_inicial_de_partida
  before insert or update on public.game_rooms
  for each row execute function public.fijar_fen_inicial();

create table if not exists public.partidas_revision (
  room_id uuid primary key references public.game_rooms(id) on delete cascade,
  motivo text not null,
  jugada integer,
  detalle text,
  creado_en timestamptz not null default now(),
  revisada_por uuid references public.profiles(id) on delete set null,
  revisada_en timestamptz
);
alter table public.partidas_revision enable row level security;
revoke all on public.partidas_revision from anon;
revoke insert, update, delete, truncate on public.partidas_revision from authenticated;

create policy partidas_revision_select on public.partidas_revision
  for select to authenticated
  using (
    (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or exists (
      select 1 from public.game_rooms g
       where g.id = partidas_revision.room_id
         and public.soy_profesor_de_alguno(array[g.white_id, g.black_id])
    )
  );

create or replace function public.marcar_partida_revisada(p_room_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not coalesce(
    (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or exists (
      select 1 from public.game_rooms g
       where g.id = p_room_id
         and public.soy_profesor_de_alguno(array[g.white_id, g.black_id])
    ), false)
  then
    raise exception 'Solo su profe o administración marcan esta partida';
  end if;
  update public.partidas_revision
     set revisada_por = auth.uid(), revisada_en = now()
   where room_id = p_room_id;
end;
$function$;
revoke execute on function public.marcar_partida_revisada(uuid) from public, anon;
grant execute on function public.marcar_partida_revisada(uuid) to authenticated;

create or replace function public.disparar_fin_de_partida()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  secreto text;
begin
  -- Estándar con resultado (también tablas: la revisión corre igual; el robo
  -- de puntos lo decide la Edge Function, solo con ganador).
  if new.variant <> 'estandar' or new.result is null then
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
$function$;