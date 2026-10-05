-- Borrar una cuenta que jugó una partida de torneo fallaba igual.
--
-- 20261004000748_borrar_cuenta_sin_trabas le dio su on delete a cada clave
-- que apunta a una cuenta, y game_rooms se borra en cascada con quien jugó
-- (white_id, black_id) o la creó (created_by). Pero tournament_pairings
-- apunta a game_rooms sin regla (NO ACTION): al borrar la sala, la base
-- rechazaba el borrado entero con «violates foreign key constraint
-- tournament_pairings_game_room_id_fkey». La comprobación de esa migración
-- solo miraba las claves que apuntan DIRECTO a profiles/auth.users, no el
-- segundo eslabón.
--
-- El pareo es del torneo, no de la persona: queda, con la sala vacía, igual
-- que white_id/black_id quedan vacíos. Ver «Borrar una cuenta» en
-- docs/decisiones/permisos-y-roles.md.

-- Si game_rooms está ocupada (una partida guardándose), se rinde en vez de
-- trabar las partidas en curso.
set lock_timeout = '5s';

alter table public.tournament_pairings drop constraint tournament_pairings_game_room_id_fkey;
alter table public.tournament_pairings add constraint tournament_pairings_game_room_id_fkey
  foreign key (game_room_id) references public.game_rooms(id) on delete set null;

-- La cadena entera: toda tabla que se borra en cascada desde una cuenta, y
-- cada clave que apunte a cualquiera de ellas, tiene que decir qué hacer.
do $$
declare n int; cuales text;
begin
  with recursive cascada(tabla) as (
    select 'auth.users'::regclass
    union
    select c.conrelid::regclass
      from pg_constraint c join cascada k on c.confrelid = k.tabla
     where c.contype = 'f' and c.confdeltype = 'c'
  )
  select count(*), string_agg(c.conname, ', ') into n, cuales
    from pg_constraint c
   where c.contype = 'f'
     and c.confrelid in (select tabla from cascada)
     and c.confdeltype in ('a', 'r')
     and c.connamespace = 'public'::regnamespace;
  if n > 0 then
    raise exception 'quedan % claves en la cadena del borrado de una cuenta sin on delete: %', n, cuales;
  end if;
end $$;