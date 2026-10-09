-- El cuestionario al estilo Kahoot (js/clase-cuestionario.js) no deja cambiar
-- la respuesta ya elegida. Ver «El cuestionario al estilo Kahoot» en
-- docs/decisiones/clase-en-vivo.md.
--
-- Antes, en toda pregunta de opciones (también en el cuestionario) un alumno
-- podía tocar otra opción mientras la pregunta siguiera abierta: cuenta la
-- ÚLTIMA respuesta, a propósito, para la pregunta de opciones de siempre
-- (Preguntar). En el cuestionario eso deja cambiar viendo cómo va contestando
-- el resto si el profe tarda en cerrar la pregunta. questions.bloquea_cambio
-- lo pone SOLO hacer_pregunta_de_opciones cuando lo manda el cuestionario;
-- la pregunta de opciones de siempre (la de cinco argumentos) sigue sin
-- tocarlo y sigue dejando cambiar.

alter table public.questions add column if not exists bloquea_cambio boolean not null default false;

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

-- La de siete argumentos, canónica: la de seis (sin_tablero, de siempre) pasa
-- por ella con bloquea_cambio en false, igual que la de cinco ya pasaba por
-- la de seis.
create or replace function public.hacer_pregunta_de_opciones(
  p_fen text, p_prompt text, p_opciones jsonb, p_correcta integer, p_tiempo_limite integer,
  p_sin_tablero boolean, p_bloquea_cambio boolean)
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
  insert into public.questions (fen, prompt, created_by, expected_plies, tipo, opciones, tiempo_limite, sin_tablero, bloquea_cambio)
  values (p_fen, p_prompt, (select auth.uid()), 1, 'opciones', p_opciones, p_tiempo_limite,
    coalesce(p_sin_tablero, false), coalesce(p_bloquea_cambio, false))
  returning * into q;
  if p_correcta is not null then
    insert into public.preguntas_clave (question_id, correcta) values (q.id, p_correcta);
  end if;
  return q;
end;
$$;
revoke execute on function public.hacer_pregunta_de_opciones(text, text, jsonb, integer, integer, boolean, boolean) from public, anon;
grant execute on function public.hacer_pregunta_de_opciones(text, text, jsonb, integer, integer, boolean, boolean) to authenticated;

-- La de seis argumentos pasa por la de siete: una sola copia de lo que hace.
create or replace function public.hacer_pregunta_de_opciones(
  p_fen text, p_prompt text, p_opciones jsonb, p_correcta integer, p_tiempo_limite integer, p_sin_tablero boolean)
returns public.questions
language sql
security invoker
set search_path = public
as $$
  select public.hacer_pregunta_de_opciones(p_fen, p_prompt, p_opciones, p_correcta, p_tiempo_limite, p_sin_tablero, false);
$$;
revoke execute on function public.hacer_pregunta_de_opciones(text, text, jsonb, integer, integer, boolean) from public, anon;
grant execute on function public.hacer_pregunta_de_opciones(text, text, jsonb, integer, integer, boolean) to authenticated;
