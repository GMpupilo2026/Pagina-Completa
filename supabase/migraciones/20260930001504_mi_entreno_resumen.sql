-- Los tres números de «Tu progreso» del panel del alumno (clases.html), sin
-- pasar por informes_resumen_alumnos().
--
-- El panel llamaba a informes_resumen_alumnos() para pintar tres números de UNA
-- persona. Esa función arma el renglón de cada alumno que la RLS deja ver —a un
-- alumno, también a sus compañeros—, con respuestas, asistencia y los minutos
-- (minutos_por_tramos): medida impersonando a un alumno en hora pico, tardaba
-- 7,3 s para devolver 51 renglones y usar uno. Con la base cargada se cortaba
-- por statement timeout y el panel se quedaba en «Cargando tu panel…».
--
-- Esta cuenta solo los tres números y solo de una persona (0,5 s en la misma
-- hora pico). Las tres expresiones son las mismas de informes_resumen_alumnos():
-- si cambia cómo se cuentan allá, se cambian acá también
-- (herramientas/verificar-mi-entreno.js lo revisa).
--
-- SECURITY INVOKER: quién ve a quién lo sigue decidiendo la RLS de
-- training_progress. Sin p_alumno cuenta lo de quien llama; con p_alumno de
-- alguien que no le toca ver, devuelve ceros.
create or replace function public.mi_entreno_resumen(p_alumno uuid default null)
returns table(puzzles integer, lecciones integer, mejor_coord integer)
language sql
stable
security invoker
set search_path to 'public'
as $$
  select
    count(distinct tp.detail->>'puzzle_id')
      filter (where tp.activity = '4x4' and coalesce(tp.detail->>'puzzle_id', '') <> '')::int,
    count(distinct tp.detail->>'lesson_id')
      filter (where tp.activity = 'aprender' and coalesce(tp.detail->>'lesson_id', '') <> '')::int,
    coalesce(max(case when tp.activity = 'coordenadas' and jsonb_typeof(tp.detail->'score') = 'number'
                      then (tp.detail->>'score')::numeric end), 0)::int
  from public.training_progress tp
  where tp.student_id = coalesce(p_alumno, (select auth.uid()))
    and tp.activity in ('4x4', 'aprender', 'coordenadas');
$$;

revoke execute on function public.mi_entreno_resumen(uuid) from public, anon;
grant execute on function public.mi_entreno_resumen(uuid) to authenticated;

comment on function public.mi_entreno_resumen(uuid) is
  'Puzzles 4x4, lecciones y mejor marca de Coordenadas de una persona (por defecto, quien llama). Mismas cuentas que informes_resumen_alumnos(), sin armar el renglón de todo el grupo.';
