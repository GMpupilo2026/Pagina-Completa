-- Multi-profesor: equipos/subgrupos + cada profesor con sus propios alumnos,
-- y clases en vivo totalmente independientes por profesor (cada uno con su
-- propio tablero, en vez de un único tablero global compartido por toda la
-- Academia).

-- ============================================================
-- 1. profiles: grupo (organización libre) + teacher_id (a qué profesor
--    pertenece cada alumno)
-- ============================================================
alter table public.profiles add column if not exists grupo text;
alter table public.profiles add column if not exists teacher_id uuid references public.profiles(id) on delete set null;
create index if not exists profiles_teacher_id_idx on public.profiles(teacher_id);
create index if not exists profiles_grupo_idx on public.profiles(grupo);

-- Todos los alumnos existentes ya eran, en la práctica, del único profesor
-- que existe hoy (Oscar) — se asignan ahí para no dejar a nadie "huérfano"
-- de golpe con este cambio.
update public.profiles
set teacher_id = (select id from public.profiles where email = 'oscaranguloweb@gmail.com')
where role = 'alumno' and teacher_id is null;

-- Función auxiliar SECURITY DEFINER: da el propio rol/is_admin/teacher_id sin
-- pasar de nuevo por RLS de "profiles" (evita cualquier problema de
-- políticas que se referencian a sí mismas) — se usa desde las políticas de
-- todas las tablas de aquí en adelante.
create or replace function public.my_profile()
returns table (role text, is_admin boolean, teacher_id uuid)
language sql
security definer
set search_path = public
stable
as $$
  select role, is_admin, teacher_id from public.profiles where id = auth.uid();
$$;

-- ============================================================
-- 2. profiles: RLS — cada quien ve su propia fila, la persona
--    administradora ve todo, un profesor ve solo a sus alumnos asignados,
--    un alumno ve también la fila de su propio profesor.
-- ============================================================
drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select on public.profiles for select using (
  auth.uid() = id
  or (select is_admin from public.my_profile())
  or (
    (select role from public.my_profile()) = 'profesor'
    and profiles.teacher_id = auth.uid()
  )
  or profiles.id = (select teacher_id from public.my_profile())
);

-- ============================================================
-- 3. game_state: de tablero único global (CHECK id = 1) a un tablero por
--    profesor (owner_id) — así dos profesores pueden dar clase al mismo
--    tiempo sin pisarse.
-- ============================================================
alter table public.game_state drop constraint if exists single_row;
alter table public.game_state add column if not exists owner_id uuid references public.profiles(id) on delete cascade;
update public.game_state
set owner_id = (select id from public.profiles where email = 'oscaranguloweb@gmail.com')
where owner_id is null;
alter table public.game_state alter column owner_id set not null;
create unique index if not exists game_state_owner_id_uidx on public.game_state(owner_id);

-- id deja de ser un valor fijo (siempre 1): se vuelve autoincremental para
-- que cada profesor pueda tener su propia fila nueva.
create sequence if not exists public.game_state_id_seq owned by public.game_state.id;
select setval('public.game_state_id_seq', greatest((select max(id) from public.game_state), 1));
alter table public.game_state alter column id set default nextval('public.game_state_id_seq');

drop policy if exists game_state_select_authenticated on public.game_state;
drop policy if exists game_state_update_profesor_or_active_player on public.game_state;
create policy game_state_select on public.game_state for select using (
  (select is_admin from public.my_profile())
  or owner_id = auth.uid()
  or owner_id = (select teacher_id from public.my_profile())
);
create policy game_state_insert on public.game_state for insert with check (
  (select is_admin from public.my_profile())
  or ((select role from public.my_profile()) = 'profesor' and owner_id = auth.uid())
);
create policy game_state_update on public.game_state for update using (
  (select is_admin from public.my_profile())
  or owner_id = auth.uid()
  or auth.uid() = active_player_id
) with check (
  (select is_admin from public.my_profile())
  or owner_id = auth.uid()
  or auth.uid() = active_player_id
);

-- ============================================================
-- 4. variant_nodes: el árbol de variantes también es "del tablero de un
--    profesor" — se agrega teacher_id (dueño del tablero, no de la jugada:
--    created_by ya guarda quién hizo cada jugada puntual, que puede ser un
--    alumno con el control cedido).
-- ============================================================
alter table public.variant_nodes add column if not exists teacher_id uuid references public.profiles(id) on delete cascade;
update public.variant_nodes
set teacher_id = (select id from public.profiles where email = 'oscaranguloweb@gmail.com')
where teacher_id is null;
alter table public.variant_nodes alter column teacher_id set not null;

drop policy if exists variant_nodes_select_authenticated on public.variant_nodes;
drop policy if exists variant_nodes_insert_mover on public.variant_nodes;
drop policy if exists variant_nodes_delete_profesor on public.variant_nodes;
create policy variant_nodes_select on public.variant_nodes for select using (
  (select is_admin from public.my_profile())
  or teacher_id = auth.uid()
  or teacher_id = (select teacher_id from public.my_profile())
);
create policy variant_nodes_insert on public.variant_nodes for insert with check (
  (select is_admin from public.my_profile())
  or teacher_id = auth.uid()
  or auth.uid() = (select active_player_id from public.game_state where game_state.owner_id = variant_nodes.teacher_id)
);
create policy variant_nodes_delete on public.variant_nodes for delete using (
  (select is_admin from public.my_profile()) or teacher_id = auth.uid()
);

-- ============================================================
-- 5. questions / question_answers / question_engine_answers: ya tenían
--    created_by (quién hizo la pregunta) — solo hace falta filtrar por ahí
--    en vez de "cualquier profesor".
-- ============================================================
drop policy if exists questions_select_authenticated on public.questions;
drop policy if exists questions_insert_profesor on public.questions;
drop policy if exists questions_update_profesor on public.questions;
create policy questions_select on public.questions for select using (
  (select is_admin from public.my_profile())
  or created_by = auth.uid()
  or created_by = (select teacher_id from public.my_profile())
);
create policy questions_insert on public.questions for insert with check (
  (select role from public.my_profile()) = 'profesor' and created_by = auth.uid()
);
create policy questions_update on public.questions for update using (
  (select is_admin from public.my_profile()) or created_by = auth.uid()
) with check (
  (select is_admin from public.my_profile()) or created_by = auth.uid()
);

drop policy if exists question_answers_select on public.question_answers;
drop policy if exists question_answers_update on public.question_answers;
drop policy if exists question_answers_insert_own on public.question_answers;
create policy question_answers_select on public.question_answers for select using (
  auth.uid() = student_id
  or (select is_admin from public.my_profile())
  or exists (
    select 1 from public.questions q where q.id = question_answers.question_id
    and (q.created_by = auth.uid() or q.created_by = (select teacher_id from public.my_profile()))
  )
);
create policy question_answers_insert_own on public.question_answers for insert with check (
  auth.uid() = student_id
  and exists (
    select 1 from public.questions q where q.id = question_answers.question_id
    and q.created_by = (select teacher_id from public.my_profile())
  )
);
create policy question_answers_update on public.question_answers for update using (
  auth.uid() = student_id
  or (select is_admin from public.my_profile())
  or exists (select 1 from public.questions q where q.id = question_answers.question_id and q.created_by = auth.uid())
) with check (
  auth.uid() = student_id
  or (select is_admin from public.my_profile())
  or exists (select 1 from public.questions q where q.id = question_answers.question_id and q.created_by = auth.uid())
);

drop policy if exists question_engine_answers_select_profesor on public.question_engine_answers;
drop policy if exists question_engine_answers_insert_profesor on public.question_engine_answers;
create policy question_engine_answers_select on public.question_engine_answers for select using (
  (select is_admin from public.my_profile())
  or exists (select 1 from public.questions q where q.id = question_engine_answers.question_id and q.created_by = auth.uid())
);
create policy question_engine_answers_insert on public.question_engine_answers for insert with check (
  (select is_admin from public.my_profile())
  or exists (select 1 from public.questions q where q.id = question_engine_answers.question_id and q.created_by = auth.uid())
);

-- ============================================================
-- 6. class_sessions / class_attendance / class_presence_log: cada sesión ya
--    tiene created_by (el profesor que la abrió) — se filtra por ahí en vez
--    de "la más reciente de cualquiera".
-- ============================================================
drop policy if exists class_sessions_select_authenticated on public.class_sessions;
drop policy if exists class_sessions_insert_profesor on public.class_sessions;
drop policy if exists class_sessions_update_profesor on public.class_sessions;
drop policy if exists class_sessions_delete_profesor on public.class_sessions;
create policy class_sessions_select on public.class_sessions for select using (
  (select is_admin from public.my_profile())
  or created_by = auth.uid()
  or created_by = (select teacher_id from public.my_profile())
);
create policy class_sessions_insert on public.class_sessions for insert with check (
  (select role from public.my_profile()) = 'profesor' and created_by = auth.uid()
);
create policy class_sessions_update on public.class_sessions for update using (
  (select is_admin from public.my_profile()) or created_by = auth.uid()
) with check (
  (select is_admin from public.my_profile()) or created_by = auth.uid()
);
create policy class_sessions_delete on public.class_sessions for delete using (
  (select is_admin from public.my_profile()) or created_by = auth.uid()
);

drop policy if exists class_attendance_select on public.class_attendance;
drop policy if exists class_attendance_insert_own on public.class_attendance;
create policy class_attendance_select on public.class_attendance for select using (
  auth.uid() = student_id
  or (select is_admin from public.my_profile())
  or exists (select 1 from public.class_sessions cs where cs.id = class_attendance.session_id and cs.created_by = auth.uid())
);
create policy class_attendance_insert_own on public.class_attendance for insert with check (
  auth.uid() = student_id
  and exists (select 1 from public.class_sessions cs where cs.id = class_attendance.session_id and cs.created_by = (select teacher_id from public.my_profile()))
);

drop policy if exists class_presence_log_select on public.class_presence_log;
drop policy if exists class_presence_log_insert_own on public.class_presence_log;
create policy class_presence_log_select on public.class_presence_log for select using (
  auth.uid() = student_id
  or (select is_admin from public.my_profile())
  or exists (select 1 from public.class_sessions cs where cs.id = class_presence_log.session_id and cs.created_by = auth.uid())
);
create policy class_presence_log_insert_own on public.class_presence_log for insert with check (
  auth.uid() = student_id
  and exists (select 1 from public.class_sessions cs where cs.id = class_presence_log.session_id and cs.created_by = (select teacher_id from public.my_profile()))
);

-- ============================================================
-- 7. class_chat_messages: el hilo es por alumno — se filtra por el
--    teacher_id de ESE alumno (el chat sigue existiendo entre clase y
--    clase, no es "de una sesión" puntual).
-- ============================================================
drop policy if exists class_chat_messages_select_own_thread on public.class_chat_messages;
drop policy if exists class_chat_messages_insert_own_thread on public.class_chat_messages;
drop policy if exists class_chat_messages_delete_profesor on public.class_chat_messages;
create policy class_chat_messages_select on public.class_chat_messages for select using (
  auth.uid() = student_id
  or (select is_admin from public.my_profile())
  or exists (select 1 from public.profiles st where st.id = class_chat_messages.student_id and st.teacher_id = auth.uid())
);
create policy class_chat_messages_insert on public.class_chat_messages for insert with check (
  auth.uid() = sender_id
  and (
    sender_id = student_id
    or exists (select 1 from public.profiles st where st.id = class_chat_messages.student_id and st.teacher_id = auth.uid())
  )
);
create policy class_chat_messages_delete on public.class_chat_messages for delete using (
  (select is_admin from public.my_profile())
  or exists (select 1 from public.profiles st where st.id = class_chat_messages.student_id and st.teacher_id = auth.uid())
);

-- ============================================================
-- 8. game_rooms / fourplayer_games: un profesor solo arma y ve partidas
--    entre SUS propios alumnos asignados.
-- ============================================================
drop policy if exists game_rooms_select on public.game_rooms;
drop policy if exists game_rooms_update on public.game_rooms;
drop policy if exists game_rooms_insert_profesor on public.game_rooms;
drop policy if exists game_rooms_delete_profesor on public.game_rooms;
create policy game_rooms_select on public.game_rooms for select using (
  auth.uid() = white_id or auth.uid() = black_id
  or (select is_admin from public.my_profile())
  or exists (select 1 from public.profiles st where st.id in (white_id, black_id) and st.teacher_id = auth.uid())
);
create policy game_rooms_update on public.game_rooms for update using (
  auth.uid() = white_id or auth.uid() = black_id
  or (select is_admin from public.my_profile())
  or exists (select 1 from public.profiles st where st.id in (white_id, black_id) and st.teacher_id = auth.uid())
) with check (
  auth.uid() = white_id or auth.uid() = black_id
  or (select is_admin from public.my_profile())
  or exists (select 1 from public.profiles st where st.id in (white_id, black_id) and st.teacher_id = auth.uid())
);
create policy game_rooms_insert on public.game_rooms for insert with check (
  (select role from public.my_profile()) = 'profesor'
  and created_by = auth.uid()
  and not exists (select 1 from public.profiles st where st.id in (white_id, black_id) and st.teacher_id is distinct from auth.uid())
);
create policy game_rooms_delete on public.game_rooms for delete using (
  (select is_admin from public.my_profile())
  or exists (select 1 from public.profiles st where st.id in (white_id, black_id) and st.teacher_id = auth.uid())
);

drop policy if exists fourplayer_games_select on public.fourplayer_games;
drop policy if exists fourplayer_games_update on public.fourplayer_games;
drop policy if exists fourplayer_games_insert_profesor on public.fourplayer_games;
drop policy if exists fourplayer_games_delete_profesor on public.fourplayer_games;
create policy fourplayer_games_select on public.fourplayer_games for select using (
  (auth.uid())::text = any(array[seats->'red'->>'player_id', seats->'blue'->>'player_id', seats->'yellow'->>'player_id', seats->'green'->>'player_id'])
  or (select is_admin from public.my_profile())
  or exists (
    select 1 from public.profiles st
    where st.id::text = any(array[seats->'red'->>'player_id', seats->'blue'->>'player_id', seats->'yellow'->>'player_id', seats->'green'->>'player_id'])
    and st.teacher_id = auth.uid()
  )
);
create policy fourplayer_games_update on public.fourplayer_games for update using (
  (auth.uid())::text = any(array[seats->'red'->>'player_id', seats->'blue'->>'player_id', seats->'yellow'->>'player_id', seats->'green'->>'player_id'])
  or (select is_admin from public.my_profile())
  or exists (
    select 1 from public.profiles st
    where st.id::text = any(array[seats->'red'->>'player_id', seats->'blue'->>'player_id', seats->'yellow'->>'player_id', seats->'green'->>'player_id'])
    and st.teacher_id = auth.uid()
  )
) with check (
  (auth.uid())::text = any(array[seats->'red'->>'player_id', seats->'blue'->>'player_id', seats->'yellow'->>'player_id', seats->'green'->>'player_id'])
  or (select is_admin from public.my_profile())
  or exists (
    select 1 from public.profiles st
    where st.id::text = any(array[seats->'red'->>'player_id', seats->'blue'->>'player_id', seats->'yellow'->>'player_id', seats->'green'->>'player_id'])
    and st.teacher_id = auth.uid()
  )
);
create policy fourplayer_games_insert on public.fourplayer_games for insert with check (
  (select role from public.my_profile()) = 'profesor'
  and not exists (
    select 1 from public.profiles st
    where st.id::text = any(array[seats->'red'->>'player_id', seats->'blue'->>'player_id', seats->'yellow'->>'player_id', seats->'green'->>'player_id'])
    and st.teacher_id is distinct from auth.uid()
  )
);
create policy fourplayer_games_delete on public.fourplayer_games for delete using (
  (select is_admin from public.my_profile())
  or exists (
    select 1 from public.profiles st
    where st.id::text = any(array[seats->'red'->>'player_id', seats->'blue'->>'player_id', seats->'yellow'->>'player_id', seats->'green'->>'player_id'])
    and st.teacher_id = auth.uid()
  )
);

-- ============================================================
-- 9. practice_sessions / practice_games / saved_games / training_progress
-- ============================================================
drop policy if exists practice_sessions_select_authenticated on public.practice_sessions;
drop policy if exists practice_sessions_insert_profesor on public.practice_sessions;
drop policy if exists practice_sessions_update_profesor on public.practice_sessions;
create policy practice_sessions_select on public.practice_sessions for select using (
  (select is_admin from public.my_profile())
  or created_by = auth.uid()
  or created_by = (select teacher_id from public.my_profile())
);
create policy practice_sessions_insert on public.practice_sessions for insert with check (
  (select role from public.my_profile()) = 'profesor' and created_by = auth.uid()
);
create policy practice_sessions_update on public.practice_sessions for update using (
  (select is_admin from public.my_profile()) or created_by = auth.uid()
) with check (
  (select is_admin from public.my_profile()) or created_by = auth.uid()
);

drop policy if exists practice_games_select on public.practice_games;
drop policy if exists practice_games_update on public.practice_games;
drop policy if exists practice_games_delete_profesor on public.practice_games;
create policy practice_games_select on public.practice_games for select using (
  auth.uid() = student_id
  or (select is_admin from public.my_profile())
  or exists (select 1 from public.profiles st where st.id = practice_games.student_id and st.teacher_id = auth.uid())
);
create policy practice_games_update on public.practice_games for update using (
  auth.uid() = student_id
  or (select is_admin from public.my_profile())
  or exists (select 1 from public.profiles st where st.id = practice_games.student_id and st.teacher_id = auth.uid())
) with check (
  auth.uid() = student_id
  or (select is_admin from public.my_profile())
  or exists (select 1 from public.profiles st where st.id = practice_games.student_id and st.teacher_id = auth.uid())
);
create policy practice_games_delete on public.practice_games for delete using (
  (select is_admin from public.my_profile())
  or exists (select 1 from public.profiles st where st.id = practice_games.student_id and st.teacher_id = auth.uid())
);

drop policy if exists saved_games_select_authenticated on public.saved_games;
drop policy if exists saved_games_insert_profesor on public.saved_games;
drop policy if exists saved_games_delete_profesor on public.saved_games;
create policy saved_games_select on public.saved_games for select using (
  (select is_admin from public.my_profile()) or created_by = auth.uid()
);
create policy saved_games_insert on public.saved_games for insert with check (
  (select role from public.my_profile()) = 'profesor' and created_by = auth.uid()
);
create policy saved_games_delete on public.saved_games for delete using (
  (select is_admin from public.my_profile()) or created_by = auth.uid()
);

drop policy if exists training_progress_select_teacher on public.training_progress;
create policy training_progress_select_teacher on public.training_progress for select using (
  (select is_admin from public.my_profile())
  or exists (select 1 from public.profiles st where st.id = training_progress.student_id and st.teacher_id = auth.uid())
);
