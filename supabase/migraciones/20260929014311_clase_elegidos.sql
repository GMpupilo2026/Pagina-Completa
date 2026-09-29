-- Cada vez que el profe elige al azar a quién le toca responder, una fila.
-- Sirve para dos cosas: que el profe vea cuántas veces le tocó a cada uno en
-- la clase, y que el sorteo elija entre los que llevan menos (justo, y que
-- sobrevive a recargar la página, que la cuenta en memoria no sobrevivía).
-- game_state.elegido sigue diciendo quién tiene el turno AHORA; esto es la
-- historia de la clase.
create table if not exists public.clase_elegidos (
  id uuid primary key default gen_random_uuid(),
  class_session_id uuid not null references public.class_sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists clase_elegidos_clase_idx on public.clase_elegidos (class_session_id);
create index if not exists clase_elegidos_alumno_idx on public.clase_elegidos (student_id);
alter table public.clase_elegidos enable row level security;
revoke all on public.clase_elegidos from anon;

-- Lo escribe y lo lee quien da la clase, y solo sobre alumnos suyos.
drop policy if exists clase_elegidos_select on public.clase_elegidos;
create policy clase_elegidos_select on public.clase_elegidos for select to authenticated
  using (exists (select 1 from public.class_sessions cs
                  where cs.id = class_session_id and cs.created_by = (select auth.uid())));
drop policy if exists clase_elegidos_insert on public.clase_elegidos;
create policy clase_elegidos_insert on public.clase_elegidos for insert to authenticated
  with check (exists (select 1 from public.class_sessions cs
                       where cs.id = class_session_id and cs.created_by = (select auth.uid()))
              and public.soy_profesor_de(student_id));
