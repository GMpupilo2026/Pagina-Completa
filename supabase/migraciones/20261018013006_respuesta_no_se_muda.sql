-- Una respuesta no se muda de pregunta ni de alumno. Ver «El cuestionario al
-- estilo Kahoot» en docs/decisiones/clase-en-vivo.md.
--
-- question_answers_update deja al alumno actualizar su propia fila, y nada
-- impedía cambiarle el question_id. Comprobado impersonando a un alumno: en
-- una pregunta del cuestionario (bloquea_cambio) contestaba la opción mala,
-- MUDABA la fila a otra pregunta (update … set question_id = otra) y volvía
-- a contestar la buena: la base la calificaba correcta. Mudarla también
-- llevaba un is_correct ajeno a otra pregunta (protect_answer_grading
-- conserva el de antes). Ninguna pantalla muda respuestas: todas escriben
-- con upsert sobre (question_id, student_id) o solo cambian is_correct. La
-- regla vale para todos, también para quien hizo la pregunta y
-- administración: va antes de que se los deje pasar.

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
  if tg_op = 'UPDATE' and (new.question_id is distinct from old.question_id
                           or new.student_id is distinct from old.student_id) then
    raise exception 'Una respuesta no se pasa a otra pregunta ni a otra persona.' using errcode = 'P0001';
  end if;
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
  if tg_op = 'UPDATE' and coalesce(q.bloquea_cambio, false) and old.opcion is not null
     and new.opcion is distinct from old.opcion then
    raise exception 'Esta pregunta no deja cambiar la respuesta ya elegida.' using errcode = 'P0001';
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