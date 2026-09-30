-- Quien coordina también mira la clase en vivo de sus profesores, y ayuda en la
-- práctica, como quien supervisa (sesion.html?observar=<profesor>).
--
-- El alcance es el de coordinación y se pregunta como siempre, con
-- bajo_mi_coordinacion() (nunca mirando coordinador_profesores): sus
-- profesores. El conjunto se arma UNA vez, en dos funciones:
--   interno.profesores_que_coordino(): los profesores bajo mi coordinación
--     (no yo: la clase propia no se «mira»);
--   interno.clases_que_coordino(): de ésos, los que tienen la clase abierta.
-- Solo si la cuenta es coordinadora (es_coordinador): quien supervisa ya tiene
-- lo suyo, y quien administra también.
--
-- Qué se abre, y solo con la clase abierta, igual que a supervisión: el
-- tablero (game_state), las variantes, la videollamada, la práctica (ronda y
-- partidas) y escribir la AYUDA de una partida —el trigger
-- practica_ayuda_proteger le devuelve el resto de la fila a quien no es el
-- alumno—. Y class_sessions de sus profesores, que hace falta para saber que
-- la clase está abierta, para la lista de «En clase ahora» y para enterarse
-- de que se cerró (supervisión lee las de sus supervisados igual).

create or replace function interno.profesores_que_coordino()
returns setof uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select p.id from public.profiles p
   where coalesce((select y.es_coordinador from public.profiles y where y.id = auth.uid()), false)
     and p.role = 'profesor'
     and p.id <> auth.uid()
     and public.bajo_mi_coordinacion(p.id);
$$;

create or replace function interno.clases_que_coordino()
returns setof uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select distinct cs.created_by from public.class_sessions cs
   where cs.ended_at is null
     and cs.created_by in (select interno.profesores_que_coordino());
$$;

revoke execute on function interno.profesores_que_coordino() from public, anon;
revoke execute on function interno.clases_que_coordino() from public, anon;
grant execute on function interno.profesores_que_coordino() to authenticated;
grant execute on function interno.clases_que_coordino() to authenticated;

create policy class_sessions_select_coordinacion on public.class_sessions
  for select to authenticated
  using (created_by in (select interno.profesores_que_coordino()));

create policy game_state_select_coordinacion on public.game_state
  for select to authenticated
  using (owner_id in (select interno.clases_que_coordino()));

create policy variant_nodes_select_coordinacion on public.variant_nodes
  for select to authenticated
  using (teacher_id in (select interno.clases_que_coordino()));

create policy profesor_videollamada_select_coordinacion on public.profesor_videollamada
  for select to authenticated
  using (profesor_id in (select interno.clases_que_coordino()));

create policy practice_sessions_select_coordinacion on public.practice_sessions
  for select to authenticated
  using (created_by in (select interno.clases_que_coordino()));

create policy practice_games_select_coordinacion on public.practice_games
  for select to authenticated
  using (session_id in (select s.id from public.practice_sessions s
                         where s.created_by in (select interno.clases_que_coordino())));

create policy practice_games_update_coordinacion on public.practice_games
  for update to authenticated
  using (session_id in (select s.id from public.practice_sessions s
                         where s.created_by in (select interno.clases_que_coordino())))
  with check (session_id in (select s.id from public.practice_sessions s
                              where s.created_by in (select interno.clases_que_coordino())));