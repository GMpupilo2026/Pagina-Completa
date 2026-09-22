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