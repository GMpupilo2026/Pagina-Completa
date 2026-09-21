-- Se REEMPLAZA la función, no se crea una sobrecarga: con dos versiones de
-- distinta firma, PostgREST no sabe a cuál llamar y responde "could not choose
-- the best candidate function" a todo el mundo.
drop function if exists public.crear_examen(uuid[], text, text, integer, timestamptz, jsonb);

create or replace function public.crear_examen(
  p_alumnos uuid[],
  p_titulo text,
  p_instrucciones text,
  p_minutos integer,
  p_vence timestamptz,
  p_items jsonb,
  p_salidas_permitidas integer default 2
)
returns integer
language plpgsql
set search_path to 'public'
as $function$
declare
  v_alumno uuid;
  v_examen uuid;
  v_n integer := 0;
  v_items integer;
begin
  if p_alumnos is null or array_length(p_alumnos, 1) is null then
    raise exception 'Elige al menos un alumno.';
  end if;

  v_items := jsonb_array_length(coalesce(p_items, '[]'::jsonb));
  if v_items = 0 then
    raise exception 'El examen no tiene ninguna pregunta.';
  end if;
  if v_items > 100 then
    raise exception 'Un examen no puede llevar más de 100 preguntas.';
  end if;

  -- Nunca menos de un minuto por pregunta. Va acá y no en un CHECK de
  -- la tabla porque depende de cuántas preguntas trae el examen, y va
  -- en la base y no en la página porque un mínimo que solo comprueba
  -- el navegador se salta desde la consola.
  if p_minutos < v_items then
    raise exception 'Con % preguntas el examen necesita al menos % minutos.', v_items, v_items;
  end if;

  -- Igual que el mínimo de tiempo: el tope de salidas se valida acá y no en
  -- la pantalla. NULL se deja pasar a propósito — es "no congelar nunca".
  if p_salidas_permitidas is not null
     and (p_salidas_permitidas < 0 or p_salidas_permitidas > 20) then
    raise exception 'Las salidas permitidas van de 0 a 20.';
  end if;

  if coalesce(btrim(p_titulo), '') = '' then
    raise exception 'El examen necesita un título.';
  end if;
  if p_vence is null then
    raise exception 'El examen necesita una fecha límite.';
  end if;

  foreach v_alumno in array p_alumnos loop
    insert into public.examenes (profesor_id, alumno_id, titulo, instrucciones,
                                 minutos, vence_at, salidas_permitidas)
    values (auth.uid(), v_alumno, btrim(p_titulo), coalesce(p_instrucciones,''),
            p_minutos, p_vence, p_salidas_permitidas)
    returning id into v_examen;

    insert into public.examen_items (examen_id, orden, tipo, banco, item_id, area, peso, visible, clave)
    select v_examen,
           (it.orden - 1)::integer,
           it.valor->>'tipo',
           it.valor->>'banco',
           it.valor->>'item_id',
           nullif(it.valor->>'area',''),
           (it.valor->>'peso')::integer,
           it.valor->'visible',
           it.valor->'clave'
    from jsonb_array_elements(p_items) with ordinality as it(valor, orden);

    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$function$;