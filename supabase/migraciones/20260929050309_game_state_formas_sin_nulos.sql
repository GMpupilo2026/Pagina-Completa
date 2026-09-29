-- Los CHECK de forma de game_state dejaban pasar una clave que falta: con
-- `encuesta = '{"lineas": []}'`, jsonb_typeof(encuesta->'question_id') es
-- NULL, la condición entera da NULL, y un CHECK que da NULL cuenta como
-- aprobado. Pasaba igual en elegido y pensar. Cada uno va ahora envuelto en
-- coalesce(…, false): lo que no se puede comprobar, no entra.
alter table public.game_state drop constraint if exists game_state_elegido_forma;
alter table public.game_state add constraint game_state_elegido_forma
  check (elegido is null or coalesce(jsonb_typeof(elegido) = 'object'
         and jsonb_typeof(elegido->'id') = 'string'
         and jsonb_typeof(elegido->'at') = 'string', false));

alter table public.game_state drop constraint if exists game_state_pensar_forma;
alter table public.game_state add constraint game_state_pensar_forma
  check (pensar is null or coalesce(jsonb_typeof(pensar) = 'object'
         and jsonb_typeof(pensar->'at') = 'string'
         and jsonb_typeof(pensar->'segundos') = 'number'
         and (pensar->>'segundos')::numeric between 5 and 3600
         and (pensar->'texto' is null or jsonb_typeof(pensar->'texto') = 'null'
              or (jsonb_typeof(pensar->'texto') = 'string' and char_length(pensar->>'texto') <= 140)), false));

alter table public.game_state drop constraint if exists game_state_encuesta_forma;
alter table public.game_state add constraint game_state_encuesta_forma
  check (encuesta is null or coalesce(jsonb_typeof(encuesta) = 'object'
         and jsonb_typeof(encuesta->'question_id') = 'string'
         and jsonb_typeof(encuesta->'lineas') = 'array'
         and jsonb_array_length(encuesta->'lineas') <= 12, false));

alter table public.game_state drop constraint if exists game_state_calentamiento_forma;
alter table public.game_state add constraint game_state_calentamiento_forma
  check (calentamiento is null or coalesce(jsonb_typeof(calentamiento) = 'object'
         and jsonb_typeof(calentamiento->'at') = 'string'
         and jsonb_typeof(calentamiento->'fen') = 'string'
         and char_length(calentamiento->>'fen') between 15 and 100
         and (calentamiento->'solucion' is null or jsonb_typeof(calentamiento->'solucion') in ('null', 'array'))
         and (calentamiento->'titulo' is null or jsonb_typeof(calentamiento->'titulo') = 'null'
              or (jsonb_typeof(calentamiento->'titulo') = 'string' and char_length(calentamiento->>'titulo') <= 140)), false));

alter table public.game_state drop constraint if exists game_state_podio_forma;
alter table public.game_state add constraint game_state_podio_forma
  check (podio is null or coalesce(jsonb_typeof(podio) = 'object'
         and jsonb_typeof(podio->'at') = 'string'
         and jsonb_typeof(podio->'lineas') = 'array'
         and jsonb_array_length(podio->'lineas') <= 100, false));
