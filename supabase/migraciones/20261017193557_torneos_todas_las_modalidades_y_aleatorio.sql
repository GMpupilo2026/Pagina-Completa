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