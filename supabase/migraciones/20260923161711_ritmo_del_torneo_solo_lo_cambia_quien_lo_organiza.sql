-- El ritmo de un torneo se puede cambiar, pero solo quien lo organiza.
--
-- tournaments_update deja escribir también a los inscritos (estoy_inscrito_en):
-- lo necesita torneo-sync.js para cerrar rondas y el torneo. Con eso, desde la
-- consola un inscrito podía cambiarle el tiempo, el nombre o la modalidad al
-- torneo entero, y ninguna pantalla lo avisaba. Ahora esas columnas solo las
-- mueve quien lo creó o quien administra; a cualquier otro se le revierten en
-- silencio, como hace proteger_tiempos_de_presencia(). Y un torneo terminado
-- ya no cambia de ritmo: sus partidas se jugaron con el que tenían.
--
-- Los topes son de cordura, no de negocio: de 30 segundos a 3 horas, y hasta 3
-- minutos de incremento. Atajan un error de dedo en el ritmo personalizado.
alter table public.tournaments
  add constraint tournaments_ritmo_check check (
    (initial_seconds is null or initial_seconds between 30 and 10800)
    and increment_seconds between 0 and 180
  );

alter table public.game_rooms
  add constraint game_rooms_ritmo_tope_check check (
    (initial_seconds is null or initial_seconds <= 10800) and increment_seconds <= 180
  );

create or replace function public.proteger_torneo()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if auth.uid() is null then
    return new;
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

create trigger tournaments_proteger
  before update on public.tournaments
  for each row execute function public.proteger_torneo();