-- Permite al profesor "saltar el orden" de las lecciones de un curso para un
-- alumno puntual: desbloquea manualmente hasta cierto tema, sin que el alumno
-- tenga que marcar como estudiados los anteriores. No toca training_progress
-- (eso sigue siendo "lo que el alumno realmente estudió", para Informes) —
-- esto es aparte, un permiso de acceso que curso-academia.js consulta para
-- decidir si una lección se ve bloqueada o disponible.
create table public.course_unlocks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  curso text not null,
  hasta_leccion integer not null check (hasta_leccion >= 1),
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, curso)
);

alter table public.course_unlocks enable row level security;

-- El propio alumno lee su desbloqueo (lo necesita curso-academia.js); su
-- profesor (o quien administra) también, para mostrar el control en Informes.
create policy course_unlocks_select on public.course_unlocks
  for select using (
    student_id = auth.uid()
    or (select is_admin from my_profile())
    or soy_profesor_de(student_id)
  );

-- Solo el profesor del alumno (o quien administra) puede otorgar/quitar el
-- desbloqueo. El alumno nunca puede tocar su propia fila.
create policy course_unlocks_insert on public.course_unlocks
  for insert with check (
    (select is_admin from my_profile())
    or soy_profesor_de(student_id)
  );

create policy course_unlocks_update on public.course_unlocks
  for update using (
    (select is_admin from my_profile())
    or soy_profesor_de(student_id)
  ) with check (
    (select is_admin from my_profile())
    or soy_profesor_de(student_id)
  );

create policy course_unlocks_delete on public.course_unlocks
  for delete using (
    (select is_admin from my_profile())
    or soy_profesor_de(student_id)
  );
