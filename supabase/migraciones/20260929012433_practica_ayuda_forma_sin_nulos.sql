-- El CHECK de practice_games.ayuda dejaba pasar una ayuda sin 'jugadas':
-- jsonb_typeof de una clave que falta da NULL, el AND entero da NULL, y un CHECK
-- en NULL pasa. Comprobado impersonando al profesor: '{"texto":"sin jugadas"}'
-- entraba. Envuelto en coalesce(..., false), como el permiso de las funciones.
alter table public.practice_games drop constraint if exists practice_games_ayuda_forma;
alter table public.practice_games add constraint practice_games_ayuda_forma check (
  ayuda is null or coalesce(
    jsonb_typeof(ayuda) = 'object'
    and jsonb_typeof(ayuda->'jugadas') = 'number'
    and jsonb_typeof(coalesce(ayuda->'flechas', '[]'::jsonb)) = 'array'
    and jsonb_array_length(coalesce(ayuda->'flechas', '[]'::jsonb)) <= 12
    and jsonb_typeof(coalesce(ayuda->'circulos', '[]'::jsonb)) = 'array'
    and jsonb_array_length(coalesce(ayuda->'circulos', '[]'::jsonb)) <= 12
    and char_length(coalesce(ayuda->>'texto', '')) <= 280,
  false)
);