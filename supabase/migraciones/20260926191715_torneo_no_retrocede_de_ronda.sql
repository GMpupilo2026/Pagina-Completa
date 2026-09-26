create or replace function public.proteger_torneo()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if auth.uid() is null then
    return new;
  end if;
  new.current_round := greatest(coalesce(new.current_round, 0), coalesce(old.current_round, 0));
  if old.status <> 'registration' and new.status = 'registration' then
    new.status := old.status;
  end if;
  if old.created_by = auth.uid() or coalesce((select m.is_admin from public.my_profile() m), false) then
    if old.status = 'finished'
       and (new.initial_seconds is distinct from old.initial_seconds
            or new.increment_seconds is distinct from old.increment_seconds) then
      raise exception 'El torneo ya terminó: su tiempo ya no se puede cambiar';
    end if;
    return new;
  end if;
  new.name := old.name;
  new.format := old.format;
  new.variant := old.variant;
  new.initial_seconds := old.initial_seconds;
  new.increment_seconds := old.increment_seconds;
  new.created_by := old.created_by;
  return new;
end;
$function$;

revoke execute on function public.proteger_torneo() from public, anon, authenticated;

update public.tournaments t
   set current_round = r.ultima
  from (select tournament_id, max(round_number) as ultima
          from public.tournament_rounds group by tournament_id) r
 where r.tournament_id = t.id
   and t.current_round < r.ultima;