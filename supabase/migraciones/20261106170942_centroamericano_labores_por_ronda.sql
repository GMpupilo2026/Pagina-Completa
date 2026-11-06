-- «Ya terminé mis labores» POR RONDA: las labores concluidas se vuelven a habilitar solas cuando empieza la ronda siguiente.
--
-- Antes, un árbitro que tocaba «Ya terminé mis labores» quedaba cerrado hasta que la organización lo reabriera a mano
-- (`centroamericano_reabrir_labores`), una vez por árbitro y por ronda. Ahora el cierre vale para ESA ronda: se anota en qué
-- ronda estaba su torneo cuando concluyó (`concluyo_ronda`, de la copia compartida de chess-results, `centroamericano_lecturas`),
-- y cuando esa copia pasa a una ronda MAYOR, su enlace se reabre solo. Cada enlace mira la ronda de SU torneo (las categorías
-- no van todas en la misma ronda). Si no se sabía la ronda al concluir (no había lectura), queda como antes: la reabre la organización.
--
-- Todo va en la base y NO toca la Edge Function `centroamericano-mesa` (la que usan todas las tablets): ella sigue poniendo
-- `concluyo_en` y rechazando escrituras mientras tenga valor; estos triggers hacen el resto.
--   1. antes de cambiar `concluyo_en`: al concluir guarda `concluyo_ronda`; al reabrir (a mano o solo) la borra;
--   2. después de que la lectura de un torneo cambia de ronda: reabre los enlaces de ESE torneo que concluyeron en una ronda menor.
--   El segundo trigger NUNCA estorba a la lectura de chess-results: si algo falla adentro, lo avisa (warning) y sigue.

alter table public.centroamericano_asignaciones add column concluyo_ronda integer;
comment on column public.centroamericano_asignaciones.concluyo_ronda is
  'La ronda de su torneo (centroamericano_lecturas.ronda) cuando el árbitro tocó «Ya terminé mis labores». La pone el trigger centroamericano_concluyo_ronda; cuando la lectura pasa a una ronda mayor, centroamericano_reabrir_por_ronda reabre el enlace solo. Nula si no se sabía la ronda (entonces solo lo reabre la organización).';

create function public.centroamericano_concluyo_ronda_poner()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.concluyo_en is null then
    new.concluyo_ronda := null;
  elsif old.concluyo_en is null then
    new.concluyo_ronda := (select l.ronda from public.centroamericano_lecturas l where l.tnr = new.tnr);
  end if;
  return new;
end;
$$;
revoke all on function public.centroamericano_concluyo_ronda_poner() from public, anon, authenticated;

create trigger concluyo_ronda before update of concluyo_en on public.centroamericano_asignaciones
  for each row when (old.concluyo_en is distinct from new.concluyo_en)
  execute function public.centroamericano_concluyo_ronda_poner();

create function public.centroamericano_reabrir_por_ronda()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    update public.centroamericano_asignaciones a set concluyo_en = null
     where a.tnr = new.tnr and a.concluyo_en is not null and a.concluyo_ronda is not null and new.ronda > a.concluyo_ronda;
  exception when others then
    raise warning 'centroamericano_reabrir_por_ronda: %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function public.centroamericano_reabrir_por_ronda() from public, anon, authenticated;

create trigger reabrir_por_ronda after update of ronda on public.centroamericano_lecturas
  for each row when (new.ronda is not null and new.ronda is distinct from old.ronda)
  execute function public.centroamericano_reabrir_por_ronda();

-- Los que ya concluyeron: se les anota la ronda en que va hoy su torneo (la mejor pista que hay), para que también se reabran solos.
update public.centroamericano_asignaciones a set concluyo_ronda = l.ronda
  from public.centroamericano_lecturas l
 where l.tnr = a.tnr and a.concluyo_en is not null and a.concluyo_ronda is null;
