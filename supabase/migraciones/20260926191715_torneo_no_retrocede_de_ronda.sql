-- Un torneo no retrocede de ronda ni vuelve a inscripción.
--
-- «Empezar torneo» corría dos veces con un segundo clic mientras se armaba la
-- ronda 1 (la página no se repinta hasta terminar), y la segunda vez dejaba
-- current_round en 0 con la ronda 1 ya creada. Desde ahí cada «Generar ronda»
-- pedía la ronda 1 otra vez y la base la rechazaba por repetida
-- (tournament_rounds_tournament_id_round_number_key), en cada clic, sin salida.
-- Pasó en dos torneos en curso.
--
-- La página ya no empieza dos veces (update condicional a status =
-- 'registration') y cuenta la ronda también por las rondas que existen, pero lo
-- que no puede pasar lo pone la base: current_round nunca baja y un torneo que
-- ya empezó no vuelve a 'registration'. Se revierte en silencio, como el resto
-- de proteger_torneo(), y vale también para quien organiza.
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

-- Los torneos que quedaron trabados: current_round vuelve a la última ronda creada.
update public.tournaments t
   set current_round = r.ultima
  from (select tournament_id, max(round_number) as ultima
          from public.tournament_rounds group by tournament_id) r
 where r.tournament_id = t.id
   and t.current_round < r.ultima;
