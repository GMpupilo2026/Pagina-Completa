-- Quitar por completo un enlace de árbitro de un torneo (el «✕»): para cuando se metió a alguien que no correspondía.
--
-- «Apagar» ya existía (el enlace deja de funcionar pero la fila queda y se puede volver a encender). Esto la BORRA. Lo
-- que cuelga del enlace: el avance, la lista previa, los avisos y la ronda finalizada se van con él (on delete cascade);
-- las anotaciones, tiempos, presencia y fotos de planillas NO se pierden: se quedan en el registro con el nombre del
-- árbitro (su asignacion_id queda en null: on delete set null). El borrado queda en la bitácora de auditoría
-- (trigger auditar de la tabla).
--
-- Dos pasos para que la pantalla pueda avisar antes de borrar: con p_borrar = false solo CUENTA lo que ya anotó.

create function public.centroamericano_quitar_enlace(p_id uuid, p_borrar boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_a record;
  v_reg int; v_tie int; v_pre int; v_pla int;
begin
  if not coalesce((select public.tengo_herramienta('mesa-arbitro')), false) then
    raise exception 'Tu cuenta no tiene la licencia de la Mesa del árbitro' using errcode = '42501';
  end if;
  select id, arbitro, tnr into v_a from public.centroamericano_asignaciones where id = p_id;
  if not found then raise exception 'Ese enlace ya no existe' using errcode = 'P0002'; end if;
  select count(*) into v_reg from public.centroamericano_registro where asignacion_id = p_id;
  select count(*) into v_tie from public.centroamericano_tiempos where asignacion_id = p_id;
  select count(*) into v_pre from public.centroamericano_presencia where asignacion_id = p_id;
  select count(*) into v_pla from public.centroamericano_planillas where asignacion_id = p_id;
  if coalesce(p_borrar, false) then
    delete from public.centroamericano_asignaciones where id = p_id;
  end if;
  return jsonb_build_object('arbitro', v_a.arbitro, 'tnr', v_a.tnr, 'borrado', coalesce(p_borrar, false),
    'anotaciones', v_reg, 'tiempos', v_tie, 'presencia', v_pre, 'planillas', v_pla);
end;
$$;
revoke all on function public.centroamericano_quitar_enlace(uuid, boolean) from public, anon;
grant execute on function public.centroamericano_quitar_enlace(uuid, boolean) to authenticated;
