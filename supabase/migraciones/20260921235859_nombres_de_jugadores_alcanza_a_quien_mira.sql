-- Quien MIRA una partida también necesita saber quién juega.
--
-- `nombres_de_jugadores()` se escribió con el alcance de `game_rooms_select`
-- "menos es_companero", y ahí quedó escrito por qué: «para mirar la partida de
-- un compañero no hace falta su nombre completo». Eso era cierto mientras
-- mirarla no se pudiera: las páginas de partida cortaban a cualquiera que no
-- fuera jugador ni profesor, así que un compañero nunca llegaba a la pantalla.
-- Desde que la pantalla dejó de poner su propio candado —mirar lo decide la
-- RLS— la frase se volvió falsa, y de la peor manera: la partida se abre, el
-- tablero se pinta, y arriba dice «Jugador» contra «Jugador». En un torneo eso
-- es no saber qué cruce se está viendo, con la lista de torneo.html diciendo
-- los dos nombres a un clic de distancia.
--
-- No reparte NADA nuevo, y por eso es esta función y no una columna más:
-- `profiles_select` ya le entrega a un compañero la FILA ENTERA de perfil
-- (`es_companero(id)`), nombre incluido. Comprobado con datos reales antes de
-- escribir esto: sobre los dos jugadores de un cruce de torneo, una compañera
-- suya recibe 2 filas por `profiles` y 1 por `nombres_de_jugadores()`. Lo que
-- esta función agrega es que el nombre salga por el mismo camino que ya usan
-- las seis páginas de partida, en vez de que cada una vuelva a `profiles` —que
-- es de donde se llevaban también el correo de un montón de menores de edad.
--
-- El alcance queda EXACTAMENTE igual al de `game_rooms_select`: quien juega,
-- quien administra, el profesor de alguno de los dos, y el compañero de clase.
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
      or (select mp.is_admin from public.my_profile() mp)
      or exists (
        select 1 from public.game_rooms r
         where p.id in (r.white_id, r.black_id)
           and (auth.uid() in (r.white_id, r.black_id)
                or public.soy_profesor_de_alguno(array[r.white_id, r.black_id])
                or public.es_companero(r.white_id)
                or public.es_companero(r.black_id))
      )
      or exists (
        select 1 from public.fourplayer_games g
         where exists (select 1 from jsonb_each(g.seats) s
                        where (s.value ->> 'player_id')::uuid = p.id)
           and (exists (select 1 from jsonb_each(g.seats) s
                         where (s.value ->> 'player_id')::uuid = auth.uid())
                or public.soy_profesor_de_alguno(
                     array(select (s.value ->> 'player_id')::uuid
                             from jsonb_each(g.seats) s
                            where s.value ->> 'player_id' is not null)))
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
