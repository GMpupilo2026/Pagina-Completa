-- Corrección: cuando se acababa el tiempo, esta función cerraba el
-- examen y acto seguido lanzaba una excepción — y el RAISE deshace
-- TODO lo que hizo la función, incluido el cierre. Resultado: el
-- examen se quedaba 'en_curso' para siempre, sin nota, y el profesor
-- lo veía colgado sin saber por qué. El alumno sí recibía el aviso,
-- así que desde la pantalla parecía que todo había funcionado: el
-- fallo callado de siempre.
--
-- Ahora el fin del examen se DEVUELVE, no se lanza. Las excepciones
-- quedan para lo que sí es un abuso (un examen que no es suyo), donde
-- no hay nada que persistir.
create or replace function public.responder_examen(
  p_item uuid,
  p_respuesta jsonb,
  p_segundos integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  it public.examen_items%rowtype;
  e  public.examenes%rowtype;
  v_correcta boolean := false;
  v_clave jsonb;
begin
  select * into it from public.examen_items where id = p_item;
  if not found then raise exception 'Esa pregunta no existe.'; end if;

  select * into e from public.examenes where id = it.examen_id;
  if e.alumno_id is distinct from auth.uid() then
    raise exception 'Ese examen no es tuyo.';
  end if;

  if e.estado <> 'en_curso' then
    return jsonb_build_object('guardada', false, 'motivo', 'cerrado', 'estado', e.estado);
  end if;

  -- El reloj del servidor, no el de la página. Pasado el tiempo el
  -- examen se cierra y se califica con lo que llevaba: lo que no
  -- contestó vale cero, que es lo que significa que se le acabó.
  if e.termina_at is not null and now() > e.termina_at then
    perform public.cerrar_examen(e.id, 'tiempo');
    return jsonb_build_object('guardada', false, 'motivo', 'tiempo');
  end if;

  v_clave := it.clave;

  if it.tipo in ('opcion','opcion_tablero') then
    v_correcta := (p_respuesta->>'opcion') is not null
              and (p_respuesta->>'opcion') = (v_clave->>'correcta');

  elsif it.tipo = 'jugada' then
    -- Vale la principal o cualquiera de sus alternas: dar solo una
    -- marcaría mal una respuesta correcta.
    v_correcta := exists (
      select 1 from jsonb_array_elements(v_clave->'jugadas') j
      where lower(j->>'from') = lower(coalesce(p_respuesta->>'from',''))
        and lower(j->>'to')   = lower(coalesce(p_respuesta->>'to',''))
    );

  elsif it.tipo = 'casilla' then
    v_correcta := exists (
      select 1 from jsonb_array_elements_text(v_clave->'casillas') c
      where lower(c) = lower(coalesce(p_respuesta->>'casilla',''))
    );

  elsif it.tipo = 'linea' then
    -- Ejecutar la apertura de una vez: la línea entera, en orden y sin
    -- pistas. O la dio completa o no la dio.
    v_correcta := (v_clave->'jugadas') = (p_respuesta->'jugadas');
  end if;

  insert into public.examen_respuestas (item_id, examen_id, respuesta, correcta, puntos, segundos)
  values (p_item, e.id, coalesce(p_respuesta,'{}'::jsonb), v_correcta,
          case when v_correcta then it.peso else 0 end,
          greatest(0, coalesce(p_segundos, 0)))
  on conflict (item_id) do nothing;

  if not found then
    -- Una sola oportunidad, y lo hace cumplir el UNIQUE de la tabla.
    return jsonb_build_object('guardada', false, 'motivo', 'ya_respondida');
  end if;

  return jsonb_build_object('guardada', true);
end;
$$;

revoke execute on function public.responder_examen(uuid, jsonb, integer) from anon;