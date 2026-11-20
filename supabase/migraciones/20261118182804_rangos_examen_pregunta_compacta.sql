-- El banco de rango quedó más compacto (40 por rango, ~37 KB): ya no guarda
-- el enunciado ni la explicación, que se arman acá con la MISMA plantilla de
-- ExamenBanco.deTactica(). herramientas/rangos-examen-banco.js tiene esa
-- plantilla en rearmar() y comprueba que las 200 preguntas vuelven exactas.
--   a = área, p = peso, m = mate (0/1), f = fen, s = la solución en español,
--   r = rating de Lichess, j = [[desde, hasta], …]
create or replace function interno.pregunta_de_rango(p_item jsonb)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'tipo', 'jugada', 'banco', 'tactica', 'area', p_item->>'a', 'peso', (p_item->>'p')::integer,
    'visible', jsonb_build_object(
      'enunciado', 'Juegan las ' || case split_part(p_item->>'f', ' ', 2) when 'w' then 'blancas' else 'negras' end
                   || ': ' || case when (p_item->>'m')::integer = 1 then 'encuentra el mate' else 'encuentra la mejor jugada' end || '.',
      'fen', p_item->>'f',
      'explica', (p_item->>'a') || '. La solución: ' || (p_item->>'s') || ' — Ejercicio de Lichess de dificultad ' || (p_item->>'r') || '.'),
    'clave', jsonb_build_object('jugadas',
      (select coalesce(jsonb_agg(jsonb_build_object('from', j->>0, 'to', j->>1)), '[]'::jsonb) from jsonb_array_elements(p_item->'j') j)));
$$;
revoke all on function interno.pregunta_de_rango(jsonb) from public, anon, authenticated;
