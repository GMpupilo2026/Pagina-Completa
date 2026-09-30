-- Dos consultas que cada panel pide al abrir, más livianas. Mismo resultado.
--
-- El 29/9 en la hora pico la base (plan gratuito) se saturó y los paneles no
-- cargaban. Estas dos se pedían cientos de veces por hora; medidas
-- impersonando en SQL con la base tranquila, y comparando la respuesta nueva
-- contra la vieja con una huella (md5 de todas las filas) en 7 cuentas —
-- alumnos, profesores, con y sin p_profesor—: iguales en todos los casos.
--
-- 1. resumen_del_mes() — los puntos del mes del panel del alumno.
--    Para un alumno armaba el resumen COMPLETO de cada clase del mes de sus
--    profesores (toda la clase, cada alumno) y después se quedaba con su
--    renglón: 100-180 ms. Ahora solo entran las clases que dio quien llama o
--    en las que aparece —las mismas cinco fuentes de las que
--    resumen_de_la_clase() saca a su gente: asistencia, respuestas, práctica,
--    partidas y turnos—: 13-20 ms. Un profesor con 23 alumnos en el mes: de
--    289 a 76 ms. Una clase donde no aparece no le podía aportar ningún
--    renglón (el filtro de siempre, r.student_id = uid o la clase es suya),
--    así que no se pierde nada.
--
--    Las clases donde aparece las junta interno.clases_donde_aparezco(): de
--    una vez y sin pasar por la RLS de cinco tablas. Con esas mismas cinco
--    como EXISTS dentro de la consulta daba igual de bien al alumno, pero
--    planificar las cinco políticas en cada llamada le sumaba 10-20 ms al
--    profesor. Devuelve SOLO ids de clases de quien llama: nada de otra
--    persona.
--
-- 2. mis_clases() — la pide cada página del alumno (el selector de clase y el
--    botón de la videollamada). Buscaba «mi fila» con `yo.id = auth.uid()`
--    sin envolver: sin índice, recorría profiles entera evaluando la política
--    de profiles (cuatro subconsultas) en cada fila. Ahora «yo» sale por la
--    llave, y los profesores por profesores_de() directo a su llave: de 16-22
--    a 2-11 ms. Sigue siendo SECURITY INVOKER: la videollamada la sigue
--    decidiendo la RLS de profesor_videollamada.

create or replace function interno.clases_donde_aparezco(p_desde timestamptz)
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
set row_security to 'off'
as $$
  select ca.session_id from public.class_attendance ca
   where ca.student_id = (select auth.uid())
  union
  -- Una respuesta es siempre posterior al inicio de su clase: con p_desde no
  -- se recorren las respuestas de meses anteriores.
  select q.class_session_id from public.question_answers a
    join public.questions q on q.id = a.question_id
   where a.student_id = (select auth.uid()) and a.created_at >= p_desde
  union
  select s.class_session_id from public.practice_games g
    join public.practice_sessions s on s.id = g.session_id
   where g.student_id = (select auth.uid())
  union
  select gr.class_session_id from public.game_rooms gr
   where (select auth.uid()) in (gr.white_id, gr.black_id) and gr.class_session_id is not null
  union
  select e.class_session_id from public.clase_elegidos e
   where e.student_id = (select auth.uid());
$$;

revoke execute on function interno.clases_donde_aparezco(timestamptz) from public, anon;
grant execute on function interno.clases_donde_aparezco(timestamptz) to authenticated;

comment on function interno.clases_donde_aparezco(timestamptz) is
  'Las clases (class_sessions.id) en las que aparece quien llama: asistencia, respuestas desde p_desde, práctica, partidas y turnos. Solo de sí mismo. La usa resumen_del_mes().';

create or replace function public.resumen_del_mes(p_profesor uuid default null)
returns table(student_id uuid, nombre text, clases integer, respondidas integer, correctas integer, turnos_bien integer, turnos_casi integer, ganadas integer, tablas integer, partidas_ganadas integer, partidas_tablas integer)
language sql
stable
set search_path to 'public'
as $$
  select r.student_id, max(r.nombre), count(distinct cs.id)::int,
         sum(r.respondidas)::int, sum(r.correctas)::int, sum(r.turnos_bien)::int, sum(r.turnos_casi)::int,
         sum(r.ganadas)::int, sum(r.tablas)::int, sum(r.partidas_ganadas)::int, sum(r.partidas_tablas)::int
    from public.class_sessions cs
    cross join lateral public.resumen_de_la_clase(cs.id) r
   where cs.started_at >= (date_trunc('month', now() at time zone 'America/Costa_Rica') at time zone 'America/Costa_Rica')
     and (p_profesor is null or cs.created_by = p_profesor)
     -- Solo las clases que pueden aportar un renglón: las propias y en las que aparezco.
     and (cs.created_by = (select auth.uid())
          or cs.id in (select interno.clases_donde_aparezco(
                         date_trunc('month', now() at time zone 'America/Costa_Rica') at time zone 'America/Costa_Rica')))
     and (r.student_id = (select auth.uid()) or cs.created_by = (select auth.uid()))
   group by r.student_id;
$$;

create or replace function public.mis_clases()
returns table(profesor_id uuid, profesor text, es_principal boolean, clase_abierta boolean, titulo_clase text, videollamada text)
language sql
stable
set search_path to 'public'
as $$
  with yo as (
    select p.id, p.teacher_id, p.grupo from public.profiles p where p.id = (select auth.uid())
  )
  select pr.id as profesor_id,
         coalesce(nullif(pr.full_name, ''), pr.email) as profesor,
         pr.id = yo.teacher_id as es_principal,
         cs.id is not null as clase_abierta,
         cs.title,
         v.enlace
  from yo
  cross join lateral interno.profesores_de(yo.id) mio(id)
  join public.profiles pr on pr.id = mio.id
  left join lateral (
    select c.id, c.title from public.class_sessions c
    where c.created_by = pr.id and c.ended_at is null
    order by c.started_at desc nulls last limit 1
  ) cs on true
  left join lateral (
    select w.enlace from public.profesor_videollamada w
    where w.profesor_id = pr.id
      and (w.grupo = coalesce(yo.grupo, '') or w.grupo = '')
    order by (w.grupo <> '') desc   -- el del grupo manda sobre el general
    limit 1
  ) v on true
  order by (pr.id = yo.teacher_id) desc, 2;
$$;