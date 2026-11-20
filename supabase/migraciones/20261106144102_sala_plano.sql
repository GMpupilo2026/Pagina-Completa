-- El plano de la sala de juego de una sala de torneo (el Centroamericano 2026):
-- las filas de mesas como se ven desde la gradería, cada fila con sus grupos
-- de mesas de derecha a izquierda, y cada mesa con los dos números de tablero
-- de chess-results y el torneo al que pertenece. La página pública lo lee con
-- la misma política de salas_torneo (visible); lo escribe solo
-- sala_plano_guardar(), para quien administra o tiene la herramienta de la
-- Mesa del árbitro (la organización del Centroamericano). Ver «El plano de la
-- sala» en docs/decisiones/juegos-y-torneos.md.
alter table public.salas_torneo add column if not exists plano jsonb;

create or replace function public.sala_plano_guardar(p_clave text, p_plano jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cuando timestamptz;
begin
  if not coalesce((select public.soy_admin()) or (select public.tengo_herramienta('mesa-arbitro')), false) then
    raise exception 'Solo la organización del torneo puede cambiar el plano de la sala.' using errcode = '42501';
  end if;
  if p_plano is not null then
    if jsonb_typeof(p_plano) <> 'object' or jsonb_typeof(p_plano->'filas') <> 'array' then
      raise exception 'El plano no tiene filas.' using errcode = '22023';
    end if;
    if jsonb_array_length(p_plano->'filas') > 60 or octet_length(p_plano::text) > 200000 then
      raise exception 'El plano es demasiado grande.' using errcode = '22023';
    end if;
  end if;
  update public.salas_torneo
     set plano = p_plano, updated_at = now(), updated_by = (select auth.uid())
   where clave = p_clave
  returning updated_at into v_cuando;
  if v_cuando is null then
    raise exception 'No existe esa sala.' using errcode = 'P0002';
  end if;
  return v_cuando;
end;
$$;

revoke execute on function public.sala_plano_guardar(text, jsonb) from public, anon;
grant execute on function public.sala_plano_guardar(text, jsonb) to authenticated;
