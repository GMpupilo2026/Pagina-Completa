-- Arreglo de 20261024172848_puntos_entrenamiento_por_dificultad.sql: «ya
-- hecho» miraba cualquier OTRA fila con la misma clave (tp.id <> new.id). El
-- trigger es after insert por fila, y en un insert de varias filas a la vez
-- (los ejercicios sin internet suben juntos) cada fila ya ve a las demás:
-- dos filas del mismo ejercicio se veían una a la otra y NINGUNA pagaba. Se
-- comprobó así en la base antes de dar el cambio por terminado. Ahora solo
-- cuenta lo que vino ANTES (created_at, y el id para desempatar dos filas
-- del mismo instante): la primera paga, las otras no.
create or replace function interno.otorgar_puntos_de_entrenamiento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clave text;
begin
  if not interno.entrenamiento_logrado(new.detail) then
    return new;
  end if;
  v_clave := interno.entrenamiento_clave(new.activity, new.detail, new.created_at);
  if exists (
    select 1 from public.training_progress tp
     where tp.student_id = new.student_id
       and interno.entrenamiento_clave(tp.activity, tp.detail, tp.created_at) = v_clave
       and (tp.created_at, tp.id) < (new.created_at, new.id)
       and interno.entrenamiento_logrado(tp.detail)
  ) then
    return new;
  end if;
  perform interno.otorgar_puntos(new.student_id, interno.entrenamiento_premio(new.activity, new.detail),
    'entrenamiento', 'Ejercicio nuevo de entrenamiento', 'entrenamiento:' || v_clave);
  return new;
end;
$$;
revoke execute on function interno.otorgar_puntos_de_entrenamiento() from public, anon, authenticated;
