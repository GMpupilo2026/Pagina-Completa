-- Los torneos se pueden jugar en TODAS las modalidades de a dos, y en una más:
-- «aleatorio», que cambia de modalidad ronda a ronda.
--
-- Hasta ahora tournaments_variant_check aceptaba solo las cinco primeras
-- (estándar, crazyhouse, cartas, duelo y niebla), aunque game_rooms ya
-- aceptaba once. Las que faltaban (abrazos, camaleón, vampiro, a ciegas,
-- volcanes y misiones secretas) se juegan en las mismas salas de a dos, así
-- que un cruce de torneo es una sala más. Relevo y las de 4 jugadores no
-- entran: un torneo empareja de a dos.
--
-- La modalidad de cada ronda queda escrita en tournament_rounds.variant. En
-- un torneo de modalidad fija la pone la base (la del torneo, diga lo que diga
-- quien inserta); en uno aleatorio la sortea quien arma la ronda y la base
-- exige que venga y que sea una de las de a dos. Después ya no cambia: la
-- ronda la pueden actualizar también los jugadores (para cerrarla), y la
-- modalidad de una ronda en juego no es de ellos. Las rondas de antes quedan
-- con variant nulo y se leen con la del torneo.

alter table public.tournaments drop constraint tournaments_variant_check;
alter table public.tournaments add constraint tournaments_variant_check
  check (variant = any (array['estandar','crazyhouse','cartas','duelo','niebla',
    'abrazos','camaleon','vampiro','ciegas','volcanes','misiones','aleatorio']::text[]));

alter table public.tournament_rounds add column variant text;
alter table public.tournament_rounds add constraint tournament_rounds_variant_check
  check (variant is null or variant = any (array['estandar','crazyhouse','cartas','duelo','niebla',
    'abrazos','camaleon','vampiro','ciegas','volcanes','misiones']::text[]));

create or replace function interno.modalidad_de_la_ronda()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  v_torneo text;
begin
  if tg_op = 'UPDATE' then
    new.variant := old.variant;
    return new;
  end if;
  select t.variant into v_torneo from public.tournaments t where t.id = new.tournament_id;
  if v_torneo is distinct from 'aleatorio' then
    new.variant := v_torneo;
  elsif new.variant is null then
    raise exception 'En un torneo aleatorio cada ronda lleva su modalidad';
  end if;
  return new;
end;
$function$;

revoke execute on function interno.modalidad_de_la_ronda() from public, anon, authenticated;

create trigger tournament_rounds_modalidad
  before insert or update on public.tournament_rounds
  for each row execute function interno.modalidad_de_la_ronda();
