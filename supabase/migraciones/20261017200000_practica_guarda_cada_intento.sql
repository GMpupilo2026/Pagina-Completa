-- Practicar contra el motor: las jugadas de cada intento quedan guardadas.
--
-- Reintentar reusa la fila de practice_games (un solo tablero por alumno en la
-- grilla del profe), así que las jugadas del intento anterior se perdían. Ahora,
-- en el momento en que el alumno reintenta, la base copia el intento que
-- termina a practice_intentos: sus jugadas, cómo terminó y su número. El intento
-- en curso sigue en practice_games; juntos son toda la ronda, y el profe elige
-- cuál mostrar a la clase.
--
-- La copia la hace un trigger (no el navegador): el alumno no la escribe, no la
-- cambia ni la borra, y no se puede saltear. La leen los mismos que leen
-- practice_games (el alumno la suya; su profe, coordinación, supervisión y
-- administración), con el conjunto armado una vez.
-- Ver «Practicar: las jugadas de cada intento» en docs/decisiones/clase-en-vivo.md.

create table public.practice_intentos (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.practice_games(id) on delete cascade,
  session_id uuid not null references public.practice_sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  intento integer not null check (intento >= 1),
  moves jsonb not null default '[]'::jsonb check (jsonb_typeof(moves) = 'array'),
  status text not null,
  terminado_at timestamptz not null default now(),
  unique (game_id, intento)
);
create index practice_intentos_session_idx on public.practice_intentos (session_id);
create index practice_intentos_student_idx on public.practice_intentos (student_id);
comment on table public.practice_intentos is
  'Los intentos ya terminados de cada alumno en una ronda de Practicar (el que juega ahora sigue en practice_games). Los escribe solo el trigger practica_guardar_intento, al reintentar.';

alter table public.practice_intentos enable row level security;
revoke all on public.practice_intentos from public, anon, authenticated;
grant select on public.practice_intentos to authenticated;

create policy practice_intentos_select on public.practice_intentos
  for select to authenticated
  using (
    ((select auth.uid()) = student_id)
    or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or (student_id in (select interno.alumnos_de((select auth.uid()))))
    or (session_id in (select s.id from public.practice_sessions s
                        where s.created_by in (select interno.clases_que_coordino())))
    or ((select public.soy_supervisor())
        and session_id in (select s.id from public.practice_sessions s
                            where s.created_by in (select interno.clases_que_superviso())))
  );
create policy practice_intentos_exige_acceso_sel on public.practice_intentos
  as restrictive for select to authenticated
  using ((select public.acceso_vigente()));

create or replace function interno.practica_guardar_intento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.attempts > old.attempts then
    insert into public.practice_intentos (game_id, session_id, student_id, intento, moves, status)
    values (old.id, old.session_id, old.student_id, old.attempts,
            coalesce(old.moves, '[]'::jsonb), old.status)
    on conflict (game_id, intento) do nothing;
  end if;
  return null;
end;
$$;

revoke execute on function interno.practica_guardar_intento() from public, anon, authenticated;

create or replace trigger practica_guardar_intento
  after update of attempts on public.practice_games
  for each row execute function interno.practica_guardar_intento();
