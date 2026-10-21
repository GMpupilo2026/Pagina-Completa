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