-- El cuestionario al estilo Kahoot de la clase en vivo (js/clase-cuestionario.js).
-- Ver «El cuestionario» en docs/decisiones/clase-en-vivo.md.
--
-- Tres cosas:
--   1. public.cuestionarios: los cuestionarios que arma cada profe, con sus
--      preguntas y la opción correcta de cada una. Son del profe y de nadie
--      más: la correcta vive acá, así que un alumno no puede leer la tabla.
--   2. La hora de cada respuesta la pone la base. Los puntos del cuestionario
--      dependen de cuánto tardó cada uno, y created_at/updated_at los podía
--      mandar el alumno desde la consola (un created_at igual al de la
--      pregunta eran 1000 puntos siempre).
--   3. questions.sin_tablero: una pregunta de cuestionario que no habla de una
--      posición («¿cuántas casillas tiene el tablero?») no le muestra un
--      tablero que no viene al caso.

-- 1. Los cuestionarios -------------------------------------------------------
create table if not exists public.cuestionarios (
  id uuid primary key default gen_random_uuid(),
  profesor_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  titulo text not null,
  preguntas jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un CHECK que da NULL cuenta como aprobado: van envueltos en coalesce.
  constraint cuestionarios_titulo_largo check (coalesce(char_length(btrim(titulo)) between 1 and 80, false)),
  constraint cuestionarios_preguntas_forma check (coalesce(jsonb_typeof(preguntas) = 'array'
    and jsonb_array_length(preguntas) <= 50, false))
);
create index if not exists cuestionarios_profesor_idx on public.cuestionarios (profesor_id, updated_at desc);

alter table public.cuestionarios enable row level security;

-- Del profe que lo escribió, y de nadie más (ni se firma con el nombre de otro).
drop policy if exists cuestionarios_select on public.cuestionarios;
create policy cuestionarios_select on public.cuestionarios for select
  using (profesor_id = (select auth.uid()));
drop policy if exists cuestionarios_insert on public.cuestionarios;
create policy cuestionarios_insert on public.cuestionarios for insert
  with check (profesor_id = (select auth.uid()));
drop policy if exists cuestionarios_update on public.cuestionarios;
create policy cuestionarios_update on public.cuestionarios for update
  using (profesor_id = (select auth.uid())) with check (profesor_id = (select auth.uid()));
drop policy if exists cuestionarios_delete on public.cuestionarios;
create policy cuestionarios_delete on public.cuestionarios for delete
  using (profesor_id = (select auth.uid()));

revoke all on public.cuestionarios from anon;
grant select, insert, update, delete on public.cuestionarios to authenticated;

-- 2. La hora de la respuesta la pone la base ---------------------------------
-- created_at: cuándo contestó por primera vez; updated_at: cuándo cambió lo que
-- contestó (la opción o las jugadas). Calificar a mano no la mueve: el profe que
-- marca «bien» no le cambia al alumno cuánto tardó.
create or replace function public.respuesta_hora_de_la_base()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then return new; end if;   -- servicio / SQL: sin reglas
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
  else
    new.created_at := old.created_at;
    new.updated_at := case
      when new.opcion is distinct from old.opcion or new.moves is distinct from old.moves then now()
      else old.updated_at end;
  end if;
  return new;
end;
$$;
revoke execute on function public.respuesta_hora_de_la_base() from public, anon, authenticated;
drop trigger if exists respuesta_hora_de_la_base_trigger on public.question_answers;
create trigger respuesta_hora_de_la_base_trigger before insert or update on public.question_answers
  for each row execute function public.respuesta_hora_de_la_base();

-- 3. La pregunta de opciones sin tablero --------------------------------------
alter table public.questions add column if not exists sin_tablero boolean not null default false;

-- La de siempre, con «sin tablero». Sin valor por omisión: con uno, la llamada
-- de cinco argumentos sería ambigua entre las dos.
create or replace function public.hacer_pregunta_de_opciones(
  p_fen text, p_prompt text, p_opciones jsonb, p_correcta integer, p_tiempo_limite integer, p_sin_tablero boolean)
returns public.questions
language plpgsql
security invoker
set search_path = public
as $$
declare
  q public.questions;
begin
  if p_correcta is not null and (p_correcta < 0 or p_correcta >= jsonb_array_length(p_opciones)) then
    raise exception 'La opción correcta tiene que ser una de las opciones.' using errcode = 'P0001';
  end if;
  update public.questions set closed_at = now()
   where created_by = (select auth.uid()) and closed_at is null;
  insert into public.questions (fen, prompt, created_by, expected_plies, tipo, opciones, tiempo_limite, sin_tablero)
  values (p_fen, p_prompt, (select auth.uid()), 1, 'opciones', p_opciones, p_tiempo_limite, coalesce(p_sin_tablero, false))
  returning * into q;
  if p_correcta is not null then
    insert into public.preguntas_clave (question_id, correcta) values (q.id, p_correcta);
  end if;
  return q;
end;
$$;
revoke execute on function public.hacer_pregunta_de_opciones(text, text, jsonb, integer, integer, boolean) from public, anon;
grant execute on function public.hacer_pregunta_de_opciones(text, text, jsonb, integer, integer, boolean) to authenticated;

-- La de cinco argumentos pasa por la nueva: una sola copia de lo que hace.
create or replace function public.hacer_pregunta_de_opciones(
  p_fen text, p_prompt text, p_opciones jsonb, p_correcta integer, p_tiempo_limite integer)
returns public.questions
language sql
security invoker
set search_path = public
as $$
  select public.hacer_pregunta_de_opciones(p_fen, p_prompt, p_opciones, p_correcta, p_tiempo_limite, false);
$$;
revoke execute on function public.hacer_pregunta_de_opciones(text, text, jsonb, integer, integer) from public, anon;
grant execute on function public.hacer_pregunta_de_opciones(text, text, jsonb, integer, integer) to authenticated;
