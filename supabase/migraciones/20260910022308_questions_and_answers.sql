
-- "Preguntar a la clase": el profesor congela la posición actual y pregunta
-- "¿qué jugarías?"; cada alumno responde en su propio tablero individual.
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  fen text not null,
  prompt text not null default '¿Qué jugarías en esta posición?',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

alter table public.questions enable row level security;

create policy "questions_select_authenticated"
  on public.questions for select to authenticated using (true);

create policy "questions_insert_profesor"
  on public.questions for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor'));

create policy "questions_update_profesor"
  on public.questions for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor'));

create table public.question_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  student_id uuid not null references public.profiles(id),
  move_san text not null,
  resulting_fen text not null,
  is_correct boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (question_id, student_id)
);

alter table public.question_answers enable row level security;

-- El alumno solo ve su propia respuesta; el profesor las ve todas.
create policy "question_answers_select"
  on public.question_answers for select to authenticated
  using (
    auth.uid() = student_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor')
  );

create policy "question_answers_insert_own"
  on public.question_answers for insert to authenticated
  with check (auth.uid() = student_id);

-- El alumno puede corregir su propia respuesta (reintentar); el profesor puede
-- actualizar cualquier fila (para marcar is_correct), pero un trigger le impide
-- al propio alumno tocar is_correct.
create policy "question_answers_update"
  on public.question_answers for update to authenticated
  using (
    auth.uid() = student_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor')
  )
  with check (
    auth.uid() = student_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor')
  );

create function public.protect_answer_grading()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  is_teacher boolean;
begin
  if auth.uid() is not null then
    select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor')
      into is_teacher;
    if not is_teacher then
      new.is_correct := old.is_correct;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.protect_answer_grading() from public, anon, authenticated;

create trigger protect_answer_grading_trigger
  before update on public.question_answers
  for each row execute function public.protect_answer_grading();

alter publication supabase_realtime add table public.questions;
alter publication supabase_realtime add table public.question_answers;
