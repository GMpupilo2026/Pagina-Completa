-- Preguntas más completas en la clase en vivo:
--
--  * tiempo_limite: segundos para contestar (null = sin límite). La base
--    rechaza la respuesta que llega tarde (con 5 s de gracia por la red): una
--    cuenta regresiva solo en la pantalla se salta desde la consola.
--  * tipo 'opciones': «¿quién está mejor?», «¿cuál es el plan?» o el
--    termómetro («¿lo entendiste?»), además de 'jugada' (la de siempre).
--    La opción correcta NO va en questions —los alumnos leen esa fila— sino
--    en preguntas_clave, que solo lee quien la hizo. Si hay clave, la base
--    califica sola; el termómetro no tiene clave.
--  * resultados_visibles: el profe le muestra a la clase qué contestó el
--    grupo (sin nombres), con resultados_de_la_pregunta().
--
-- Y un hueco que ya estaba: protect_answer_grading corre solo en UPDATE, así
-- que un alumno podía INSERTAR su respuesta ya marcada como correcta (y los
-- trofeos se cuentan de las correctas). Ahora un alumno nunca se califica.
alter table public.questions add column if not exists tipo text not null default 'jugada';
alter table public.questions add column if not exists opciones jsonb;
alter table public.questions add column if not exists tiempo_limite integer;
alter table public.questions add column if not exists resultados_visibles boolean not null default false;
alter table public.questions drop constraint if exists questions_tipo_forma;
alter table public.questions add constraint questions_tipo_forma check (
  (tipo = 'jugada' and opciones is null)
  or (tipo = 'opciones' and jsonb_typeof(opciones) = 'array'
      and jsonb_array_length(opciones) between 2 and 6));
alter table public.questions drop constraint if exists questions_tiempo_limite_rango;
alter table public.questions add constraint questions_tiempo_limite_rango
  check (tiempo_limite is null or tiempo_limite between 10 and 900);

alter table public.question_answers add column if not exists opcion integer;

create table if not exists public.preguntas_clave (
  question_id uuid primary key references public.questions(id) on delete cascade,
  correcta integer not null check (correcta >= 0)
);
alter table public.preguntas_clave enable row level security;
drop policy if exists preguntas_clave_de_quien_pregunta on public.preguntas_clave;
create policy preguntas_clave_de_quien_pregunta on public.preguntas_clave for all to authenticated
  using (exists (select 1 from public.questions q where q.id = question_id and q.created_by = (select auth.uid())))
  with check (exists (select 1 from public.questions q where q.id = question_id and q.created_by = (select auth.uid())));
revoke all on public.preguntas_clave from anon;

-- Califica y pone el plazo. Corre DESPUÉS de protect_answer_grading_trigger
-- (los triggers van por nombre): en un UPDATE del alumno aquel ya le devolvió
-- la nota de antes, y acá se recalcula si la pregunta es de opciones.
create or replace function public.respuesta_calificar_y_plazo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.questions%rowtype;
  v_clave integer;
begin
  if auth.uid() is null then return new; end if;   -- servicio / SQL: sin reglas
  select * into q from public.questions where id = new.question_id;
  if not found then return new; end if;
  -- Quien hizo la pregunta (o administración) califica a mano: se respeta.
  if q.created_by = auth.uid()
     or coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false) then
    return new;
  end if;
  if q.tiempo_limite is not null
     and now() > q.created_at + make_interval(secs => q.tiempo_limite + 5) then
    raise exception 'Se acabó el tiempo para contestar esta pregunta.' using errcode = 'P0001';
  end if;
  if q.tipo = 'opciones' then
    if new.opcion is null or new.opcion < 0 or new.opcion >= jsonb_array_length(q.opciones) then
      raise exception 'Esa opción no está en la pregunta.' using errcode = 'P0001';
    end if;
    select k.correcta into v_clave from public.preguntas_clave k where k.question_id = q.id;
    new.is_correct := case when v_clave is null then null else new.opcion = v_clave end;
  elsif tg_op = 'INSERT' then
    new.opcion := null;
    new.is_correct := null;   -- un alumno no se califica solo
  end if;
  return new;
end;
$$;
revoke execute on function public.respuesta_calificar_y_plazo() from public, anon, authenticated;
drop trigger if exists respuesta_calificar_y_plazo_trigger on public.question_answers;
create trigger respuesta_calificar_y_plazo_trigger before insert or update on public.question_answers
  for each row execute function public.respuesta_calificar_y_plazo();

-- Una pregunta de opciones con su clave, en UNA transacción: con dos
-- inserts sueltos, un alumno rápido contestaría entre los dos y quedaría sin
-- calificar. SECURITY INVOKER: las políticas de questions y preguntas_clave
-- deciden, igual que si los hiciera la página.
create or replace function public.hacer_pregunta_de_opciones(
  p_fen text, p_prompt text, p_opciones jsonb, p_correcta integer, p_tiempo_limite integer)
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
  insert into public.questions (fen, prompt, created_by, expected_plies, tipo, opciones, tiempo_limite)
  values (p_fen, p_prompt, (select auth.uid()), 1, 'opciones', p_opciones, p_tiempo_limite)
  returning * into q;
  if p_correcta is not null then
    insert into public.preguntas_clave (question_id, correcta) values (q.id, p_correcta);
  end if;
  return q;
end;
$$;
revoke execute on function public.hacer_pregunta_de_opciones(text, text, jsonb, integer, integer) from public, anon;
grant execute on function public.hacer_pregunta_de_opciones(text, text, jsonb, integer, integer) to authenticated;

-- Lo que contestó el grupo, SIN nombres: cuántos eligieron cada jugada (la
-- primera de la respuesta) o cada opción. Lo ve quien hizo la pregunta y
-- administración siempre; sus alumnos, solo cuando el profe la muestra.
-- La correcta de una de opciones se dice solo a quien ya puede verla.
create or replace function public.resultados_de_la_pregunta(p_pregunta uuid)
returns table (respuesta text, cuantos integer, es_correcta boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  q public.questions%rowtype;
  v_clave integer;
begin
  select * into q from public.questions where id = p_pregunta;
  if not found then return; end if;
  if not coalesce(
       q.created_by = auth.uid()
       or (select p.is_admin from public.profiles p where p.id = auth.uid())
       or (q.resultados_visibles and public.es_mi_profesor(q.created_by)), false) then
    return;
  end if;
  select k.correcta into v_clave from public.preguntas_clave k where k.question_id = q.id;
  if q.tipo = 'opciones' then
    return query
      select o.idx::text, count(a.id)::int, case when v_clave is null then null else o.idx = v_clave end
        from generate_series(0, jsonb_array_length(q.opciones) - 1) as o(idx)
        left join public.question_answers a on a.question_id = q.id and a.opcion = o.idx
       group by o.idx
       order by o.idx;
  else
    return query
      select a.moves->>0, count(*)::int, null::boolean
        from public.question_answers a
       where a.question_id = q.id and jsonb_typeof(a.moves) = 'array' and jsonb_array_length(a.moves) > 0
       group by a.moves->>0
       order by count(*) desc, a.moves->>0;
  end if;
end;
$$;
revoke execute on function public.resultados_de_la_pregunta(uuid) from public, anon;
grant execute on function public.resultados_de_la_pregunta(uuid) to authenticated;