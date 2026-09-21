-- Retarse es lo único que comparte toda la Academia. Ver y gestionar alumnos
-- sigue acotado a quien es su profesor; jugar, no: un alumno que quiere una
-- partida ahora mismo no tiene por qué esperar a que alguien de su propia
-- clase esté conectado.
--
-- Lo que NO se abre: `puedo_armar_partida_con()` (el profesor solo arma
-- partidas con los suyos) ni `profiles_select` (ver a alguien sigue siendo
-- otra cosa que jugar con él).
create or replace function public.pueden_jugar_entre_si(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select a is distinct from b
     and exists (select 1 from public.profiles p where p.id = a)
     and exists (select 1 from public.profiles p where p.id = b);
$$;

-- El nombre del rival, y NADA más. Antes las páginas de partida lo sacaban de
-- `profiles` con un select que se llevaba también el correo; con la lista de
-- en línea abierta a toda la Academia eso sería repartir los correos de un
-- montón de menores de edad. Acá sale el nombre ya resuelto: nunca el correo
-- entero, solo lo de antes de la @ cuando no hay nombre escrito.
--
-- Y solo de quien comparte conmigo una partida o un reto: no es un directorio.
create or replace function public.nombres_de_jugadores(p_ids uuid[])
returns table (id uuid, nombre text)
language sql stable security definer set search_path to 'public'
as $$
  select p.id,
         coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1))
  from public.profiles p
  where p.id = any (p_ids)
    and (
      p.id = auth.uid()
      or exists (
        select 1 from public.game_rooms r
         where auth.uid() in (r.white_id, r.black_id)
           and p.id in (r.white_id, r.black_id)
      )
      or exists (
        select 1 from public.fourplayer_games g
         where g.seats @> jsonb_build_array(jsonb_build_object('player_id', auth.uid()))
            or exists (
              select 1 from jsonb_each(g.seats) s
              where (s.value ->> 'player_id')::uuid = auth.uid()
                and exists (select 1 from jsonb_each(g.seats) s2
                            where (s2.value ->> 'player_id')::uuid = p.id)
            )
      )
      or exists (
        select 1 from public.desafios d
         where auth.uid() in (d.de_id, d.para_id)
           and p.id in (d.de_id, d.para_id)
      )
    );
$$;

revoke execute on function public.nombres_de_jugadores(uuid[]) from public;
grant execute on function public.nombres_de_jugadores(uuid[]) to authenticated;