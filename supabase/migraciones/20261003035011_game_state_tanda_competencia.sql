-- La competencia de ejercicios (game_state.tanda_calentamiento con modo "reto"):
-- los MISMOS ejercicios para todos, y gana quien resuelva más en el tiempo.
-- Lleva más ejercicios que el calentamiento con nota (100: más de los que
-- alguien alcanza a hacer), así que `cantidad` sube a 1..200, y `modo`, si
-- viene, es "nota" o "reto". El profe cambia el tiempo con la misma semilla:
-- eso ya lo dejaba el trigger (no mueve `at`) y el CHECK (segundos 0..7200).
-- El CHECK sigue envuelto en coalesce(…, false): un CHECK que da NULL cuenta
-- como aprobado (ver «El mapa de jugadas, el calentamiento y el podio»).
alter table public.game_state drop constraint if exists game_state_tanda_calentamiento_forma;
alter table public.game_state add constraint game_state_tanda_calentamiento_forma
  check (tanda_calentamiento is null or coalesce(jsonb_typeof(tanda_calentamiento) = 'object'
         and jsonb_typeof(tanda_calentamiento->'at') = 'string'
         and jsonb_typeof(tanda_calentamiento->'semilla') = 'string'
         and char_length(tanda_calentamiento->>'semilla') between 4 and 40
         and jsonb_typeof(tanda_calentamiento->'elo') = 'number'
         and jsonb_typeof(tanda_calentamiento->'cantidad') = 'number'
         and jsonb_typeof(tanda_calentamiento->'segundos') = 'number'
         and (case when jsonb_typeof(tanda_calentamiento->'elo') = 'number'
                   then (tanda_calentamiento->>'elo')::numeric between 400 and 3000 end)
         and (case when jsonb_typeof(tanda_calentamiento->'cantidad') = 'number'
                   then (tanda_calentamiento->>'cantidad')::numeric between 1 and 200 end)
         and (case when jsonb_typeof(tanda_calentamiento->'segundos') = 'number'
                   then (tanda_calentamiento->>'segundos')::numeric between 0 and 7200 end)
         and (not (tanda_calentamiento ? 'modo')
              or tanda_calentamiento->>'modo' in ('nota', 'reto')), false));