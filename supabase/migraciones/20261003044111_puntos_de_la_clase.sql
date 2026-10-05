-- Los puntos de la clase, según la dificultad, los intentos y quién acertó
-- primero (ver «Los puntos de la clase» en docs/decisiones/clase-en-vivo.md).
--
-- Por cada respuesta correcta:
--   base     = de 10 (600 puntos Elo o menos) a 50 (2200 o más), en línea
--              recta; sin dificultad anotada, la de 1200 (25 puntos).
--   intentos = a la primera, todo; al 2.º intento, el 60 %; del 3.º en
--              adelante, el 30 %.
--   puesto   = el 1.º en acertar suma un 50 % más; el 2.º, un 30 %; el 3.º,
--              un 15 %. El orden es el de la hora (de la base) de su última
--              respuesta: con la que acertó.
-- Lo incorrecto no suma. Nada de esto se guarda: se calcula de las filas.
set local lock_timeout = '8s';

-- 1. La dificultad de cada pregunta (en puntos Elo, como el rating de los ejercicios).
alter table public.questions add column if not exists dificultad integer;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'questions_dificultad_rango') then
    alter table public.questions add constraint questions_dificultad_rango
      check (dificultad is null or dificultad between 400 and 3000);
  end if;
end $$;

-- 2. Cuántas veces contestó: la base las cuenta (el alumno no las escribe).
alter table public.question_answers add column if not exists intentos integer not null default 1;

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
    new.intentos := 1;
  else
    new.created_at := old.created_at;
    -- Cambiar lo que contestó (la opción o las jugadas) es otro intento, y
    -- mueve la hora. Calificar a mano no mueve ninguna de las dos.
    if new.opcion is distinct from old.opcion or new.moves is distinct from old.moves then
      new.updated_at := now();
      new.intentos := coalesce(old.intentos, 1) + 1;
    else
      new.updated_at := old.updated_at;
      new.intentos := old.intentos;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.respuesta_hora_de_la_base() from public, anon, authenticated;

-- 3. Los puntos de UNA respuesta correcta (pura: la misma cuenta que
--    PuntosClase.puntosDeUnaRespuesta en js/puntos-clase.js).
create or replace function interno.puntos_de_una_respuesta(p_dificultad integer, p_intentos integer, p_puesto integer)
returns integer
language sql
immutable
security invoker
set search_path = public
as $$
  select round(
    round(10 + 40 * least(1, greatest(0, (coalesce(p_dificultad, 1200) - 600) / 1600.0)))
    * case when coalesce(p_intentos, 1) <= 1 then 1 when p_intentos = 2 then 0.6 else 0.3 end
    * (1 + case p_puesto when 1 then 0.5 when 2 then 0.3 when 3 then 0.15 else 0 end)
  )::int;
$$;
revoke execute on function interno.puntos_de_una_respuesta(integer, integer, integer) from public, anon;
grant execute on function interno.puntos_de_una_respuesta(integer, integer, integer) to authenticated;

-- 4. En qué puesto acertó cada uno cada pregunta de la clase. Para eso hay
--    que mirar las respuestas de los demás (un alumno, por la RLS, solo ve
--    las suyas): por eso es SECURITY DEFINER, y por eso devuelve solo los
--    renglones que quien llama ya puede ver en question_answers (las mismas
--    reglas que sus políticas de SELECT): el suyo, los de las preguntas que
--    hizo, todo si administra, y los de quien supervisa.
create or replace function interno.puestos_de_la_clase(p_clase uuid)
returns table (question_id uuid, student_id uuid, puesto integer)
language sql
stable
security definer
set search_path = public
as $$
  with yo as (
    select (select auth.uid()) as id,
           coalesce((select mp.is_admin from public.my_profile() mp), false) as admin,
           coalesce((select public.soy_supervisor()), false) as sup
  ),
  r as (
    select a.question_id, a.student_id, q.created_by,
           (row_number() over (partition by a.question_id order by a.updated_at, a.id))::int as puesto
      from public.question_answers a
      join public.questions q on q.id = a.question_id
     where q.class_session_id = p_clase and a.is_correct is true
  )
  select r.question_id, r.student_id, r.puesto
    from r, yo
   where yo.id is not null
     and (r.student_id = yo.id or yo.admin or r.created_by = yo.id
          or (yo.sup and r.student_id in (select interno.supervisados_por_mi())));
$$;
revoke execute on function interno.puestos_de_la_clase(uuid) from public, anon;
grant execute on function interno.puestos_de_la_clase(uuid) to authenticated;

-- 5. Los puntos de cada alumno en una clase y en el mes. Van aparte de
--    resumen_de_la_clase / resumen_del_mes (que no cambian) y la página los
--    junta por student_id: así nada de lo que ya los usa se entera.
--    SECURITY INVOKER: cada uno ve las respuestas que la RLS le deja ver.
create or replace function public.puntos_de_la_clase(p_clase uuid)
returns table (student_id uuid, puntos_preguntas integer, a_la_primera integer, primeros integer)
language sql
stable
security invoker
set search_path = public
as $$
  with pu as (select * from interno.puestos_de_la_clase(p_clase))
  select a.student_id,
         coalesce(sum(interno.puntos_de_una_respuesta(q.dificultad, a.intentos, pu.puesto)), 0)::int,
         count(*) filter (where a.intentos <= 1)::int,
         count(*) filter (where pu.puesto = 1)::int
    from public.question_answers a
    join public.questions q on q.id = a.question_id
    left join pu on pu.question_id = a.question_id and pu.student_id = a.student_id
   where q.class_session_id = p_clase and a.is_correct is true
     and a.student_id is distinct from q.created_by
   group by a.student_id;
$$;
revoke execute on function public.puntos_de_la_clase(uuid) from public, anon;
grant execute on function public.puntos_de_la_clase(uuid) to authenticated;

-- Las clases del mes, con el mismo filtro que resumen_del_mes: las propias y
-- en las que aparezco; de cada una, mis renglones o, si es mía, los de todos.
create or replace function public.puntos_del_mes(p_profesor uuid default null)
returns table (student_id uuid, puntos_preguntas integer, a_la_primera integer, primeros integer)
language sql
stable
security invoker
set search_path = public
as $$
  select r.student_id, sum(r.puntos_preguntas)::int, sum(r.a_la_primera)::int, sum(r.primeros)::int
    from public.class_sessions cs
    cross join lateral public.puntos_de_la_clase(cs.id) r
   where cs.started_at >= (date_trunc('month', now() at time zone 'America/Costa_Rica') at time zone 'America/Costa_Rica')
     and (p_profesor is null or cs.created_by = p_profesor)
     and (cs.created_by = (select auth.uid())
          or cs.id in (select interno.clases_donde_aparezco(
                         date_trunc('month', now() at time zone 'America/Costa_Rica') at time zone 'America/Costa_Rica')))
     and (r.student_id = (select auth.uid()) or cs.created_by = (select auth.uid()))
   group by r.student_id;
$$;
revoke execute on function public.puntos_del_mes(uuid) from public, anon;
grant execute on function public.puntos_del_mes(uuid) to authenticated;