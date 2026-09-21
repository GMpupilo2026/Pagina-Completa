
-- training_progress_insert_own solo exige student_id = auth.uid(): el
-- contenido de `detail` (jsonb) queda enteramente en manos del cliente, y
-- algunos de esos campos son justo "la mejor marca" que ve el profesor en
-- Informes (coordenadas.score vía mejor_coord, practicar.stars). No hay
-- política de UPDATE en esta tabla, así que basta con validar en el insert.
--
-- Esto NO cierra el mismo problema para los conteos basados en "ids
-- distintos" (4x4.puzzle_id, aprender.lesson_id, mates.puzzle_id,
-- tactica.puzzle_id, concentracion.nivel/ejercicio): validar que un
-- puzzle_id sea real pediría tener el banco de ejercicios adentro de
-- Postgres, sincronizado con los JSON que sirve el sitio — un proyecto
-- aparte, no este arreglo puntual.
create or replace function public.validar_marca_training_progress()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_num numeric;
begin
  if new.activity = 'coordenadas' then
    -- Ronda de 30s (o de 3s/10s por casilla): en los datos reales el score
    -- más alto es 33. 300 deja muchísimo margen y de todos modos es
    -- humanamente imposible de superar, así que solo ataja un número
    -- inventado, nunca una marca real.
    foreach v_num in array array[
      (new.detail->>'score')::numeric,
      (new.detail->>'best_streak')::numeric,
      (new.detail->>'misses')::numeric
    ] loop
      if v_num is not null and (v_num < 0 or v_num > 300) then
        raise exception 'Marca de coordenadas fuera de rango: %', v_num;
      end if;
    end loop;
  elsif new.activity = 'practicar' then
    -- El sistema de estrellas de entreno/practicas.html es fijo: 1, 2 o 3.
    v_num := (new.detail->>'stars')::numeric;
    if v_num is not null and (v_num < 1 or v_num > 3) then
      raise exception 'Estrellas de practicar fuera de rango: %', v_num;
    end if;
  end if;
  return new;
end;
$function$;

create trigger training_progress_valida_marca
before insert on public.training_progress
for each row execute function public.validar_marca_training_progress();
