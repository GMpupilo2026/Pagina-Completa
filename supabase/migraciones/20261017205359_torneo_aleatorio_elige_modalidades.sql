-- En un torneo aleatorio, quien lo organiza elige qué modalidades entran al
-- sorteo. Ver «Las modalidades que entran al sorteo» en
-- docs/decisiones/juegos-y-torneos.md.
--
-- tournaments.modos_aleatorio: la lista elegida, o nulo = las once de a dos
-- (lo que ya hacían los torneos aleatorios creados antes). Solo en un torneo
-- aleatorio, solo modalidades de a dos y al menos dos: con una sola no hay
-- sorteo, y la regla de «nunca la misma dos rondas seguidas» necesita otra.
--
-- La cambia solo quien organiza (o administra), como el ritmo: los inscritos
-- también actualizan el torneo (torneo-sync.js lo cierra) y a ellos se les
-- revierte en silencio. Y un torneo terminado ya no la cambia.
--
-- La ronda la respeta en la base: en un aleatorio con lista, una ronda cuya
-- modalidad no está en la lista no se crea.

alter table public.tournaments add column modos_aleatorio text[];
alter table public.tournaments add constraint tournaments_modos_aleatorio_check
  check (modos_aleatorio is null or (
    variant = 'aleatorio'
    and cardinality(modos_aleatorio) >= 2
    and modos_aleatorio <@ array['estandar','crazyhouse','cartas','duelo','niebla',
      'abrazos','camaleon','vampiro','ciegas','volcanes','misiones']::text[]));

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
    if old.status = 'finished' and new.modos_aleatorio is distinct from old.modos_aleatorio then
      raise exception 'El torneo ya terminó: sus modalidades ya no se pueden cambiar';
    end if;
    return new;
  end if;
  new.name := old.name;
  new.format := old.format;
  new.variant := old.variant;
  new.modos_aleatorio := old.modos_aleatorio;
  new.initial_seconds := old.initial_seconds;
  new.increment_seconds := old.increment_seconds;
  new.created_by := old.created_by;
  return new;
end;
$function$;

create or replace function interno.modalidad_de_la_ronda()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  v_torneo text;
  v_modos text[];
begin
  if tg_op = 'UPDATE' then
    new.variant := old.variant;
    return new;
  end if;
  select t.variant, t.modos_aleatorio into v_torneo, v_modos from public.tournaments t where t.id = new.tournament_id;
  if v_torneo is distinct from 'aleatorio' then
    new.variant := v_torneo;
  elsif new.variant is null then
    raise exception 'En un torneo aleatorio cada ronda lleva su modalidad';
  elsif v_modos is not null and not (new.variant = any (v_modos)) then
    raise exception 'Esa modalidad no está entre las que eligió quien organiza el torneo';
  end if;
  return new;
end;
$function$;
