-- Practicar: los profesores del alumno leen las rondas en que jugó, aunque las
-- haya armado un colega.
--
-- El informe del alumno muestra sus partidas de práctica de la clase en vivo,
-- intento por intento, con las jugadas numeradas desde la posición de salida
-- de la ronda (practice_sessions.fen). Las partidas (practice_games y
-- practice_intentos) ya las leen todos sus profesores (interno.alumnos_de),
-- pero la ronda solo quien la armó: un alumno con dos profesores dejaba al
-- segundo con las jugadas y sin la posición de donde salen. Van también las
-- rondas donde jugó uno mismo, aunque fuera en la clase de alguien que no es
-- su profesor (su propio informe).
--
-- El conjunto se arma una vez con una función SECURITY DEFINER sin RLS: si la
-- política de practice_sessions leyera practice_games con la RLS puesta, y la
-- de practice_games lee practice_sessions, se llamarían una a la otra.
-- Ver «Las partidas de práctica en el informe» en docs/decisiones/informes.md.

create or replace function interno.rondas_de_mis_alumnos()
returns setof uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select distinct g.session_id from public.practice_games g
   where g.student_id = (select auth.uid())
      or g.student_id in (select interno.alumnos_de((select auth.uid())));
$$;

revoke execute on function interno.rondas_de_mis_alumnos() from public, anon;
grant execute on function interno.rondas_de_mis_alumnos() to authenticated;

create policy practice_sessions_de_mis_alumnos on public.practice_sessions
  for select to authenticated
  using (id in (select interno.rondas_de_mis_alumnos()));