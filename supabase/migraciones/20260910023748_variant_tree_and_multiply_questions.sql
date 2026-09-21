
-- Árbol de variantes/sub-variantes de exploración (no toca la línea en vivo hasta que
-- el profesor decide "Jugar desde aquí" y la promueve).
create table public.variant_nodes (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.variant_nodes(id) on delete cascade,
  root_ply int not null,
  san text not null,
  fen text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.variant_nodes enable row level security;

create policy "variant_nodes_select_authenticated"
  on public.variant_nodes for select to authenticated using (true);

-- Puede crear/extender variantes quien puede mover en vivo: el profesor, o el
-- alumno con el control cedido en ese momento.
create policy "variant_nodes_insert_mover"
  on public.variant_nodes for insert to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor')
    or auth.uid() = (select active_player_id from public.game_state where id = 1)
  );

create policy "variant_nodes_delete_profesor"
  on public.variant_nodes for delete to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor'));

alter publication supabase_realtime add table public.variant_nodes;

-- Preguntar a la clase: cuántas jugadas debe dar el alumno.
alter table public.questions add column expected_plies int not null default 1;

-- Respuesta de referencia calculada por el motor a máxima fuerza: privada, solo el
-- profesor puede leerla (tabla aparte para no exponerla a los alumnos vía questions).
create table public.question_engine_answers (
  question_id uuid primary key references public.questions(id) on delete cascade,
  answer jsonb not null,
  computed_at timestamptz not null default now()
);
alter table public.question_engine_answers enable row level security;

create policy "question_engine_answers_select_profesor"
  on public.question_engine_answers for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor'));

create policy "question_engine_answers_insert_profesor"
  on public.question_engine_answers for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor'));

-- question_answers pasa de una sola jugada a una secuencia (para preguntas de varias
-- jugadas). La tabla es nueva y sin datos reales todavía, así que se redefine limpio.
alter table public.question_answers drop column move_san;
alter table public.question_answers add column moves jsonb not null default '[]'::jsonb;
