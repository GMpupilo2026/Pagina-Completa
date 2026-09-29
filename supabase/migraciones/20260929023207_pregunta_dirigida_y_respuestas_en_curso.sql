-- La pregunta dirigida y las respuestas que se ven mientras se piensan.
--
--  * questions.para_alumno: la pregunta es para UNA persona (la que tiene el
--    turno). Los demás la ven, pero no la contestan: lo rechaza el trigger
--    respuesta_calificar_y_plazo, no la pantalla.
--  * respuestas_en_curso: las jugadas que un alumno lleva en el tablero de la
--    pregunta, antes de mandar la respuesta. El profe las mira en vivo, como
--    las partidas de Practicar. Va aparte de question_answers a propósito: los
--    informes, los trofeos y las insignias cuentan las filas de
--    question_answers, y una respuesta a medias no es una respuesta.
--  * resumen_de_la_clase: a cada alumno le cuenta solo las preguntas que eran
--    para él (las de todos y las dirigidas a él).
alter table public.questions add column if not exists para_alumno uuid references public.profiles(id) on delete set null;

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
  -- Una pregunta dirigida la contesta solo esa persona.
  if q.para_alumno is not null and new.student_id is distinct from q.para_alumno then
    raise exception 'Esta pregunta es para otro alumno.' using errcode = 'P0001';
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

create table if not exists public.respuestas_en_curso (
  question_id uuid not null references public.questions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  moves jsonb not null default '[]'::jsonb,
  fen text,
  updated_at timestamptz not null default now(),
  primary key (question_id, student_id)
);
alter table public.respuestas_en_curso enable row level security;

-- El alumno escribe lo suyo, en una pregunta abierta de su profe que sea para
-- todos o para él.
drop policy if exists respuestas_en_curso_insert on public.respuestas_en_curso;
create policy respuestas_en_curso_insert on public.respuestas_en_curso for insert to authenticated
  with check (student_id = (select auth.uid())
    and exists (select 1 from public.questions q
                 where q.id = question_id and q.closed_at is null
                   and (q.para_alumno is null or q.para_alumno = (select auth.uid()))
                   and public.es_mi_profesor(q.created_by)));
drop policy if exists respuestas_en_curso_update on public.respuestas_en_curso;
create policy respuestas_en_curso_update on public.respuestas_en_curso for update to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid())
    and exists (select 1 from public.questions q
                 where q.id = question_id and q.closed_at is null
                   and (q.para_alumno is null or q.para_alumno = (select auth.uid()))
                   and public.es_mi_profesor(q.created_by)));
-- Lo ven el alumno, quien hizo la pregunta y administración. Los compañeros, no.
drop policy if exists respuestas_en_curso_select on public.respuestas_en_curso;
create policy respuestas_en_curso_select on public.respuestas_en_curso for select to authenticated
  using (student_id = (select auth.uid())
    or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or question_id in (select q.id from public.questions q where q.created_by = (select auth.uid())));
-- Como en question_answers: sin acceso vigente no se contesta.
drop policy if exists respuestas_en_curso_exige_acceso_ins on public.respuestas_en_curso;
create policy respuestas_en_curso_exige_acceso_ins on public.respuestas_en_curso as restrictive for insert to authenticated
  with check ((select public.acceso_vigente()));
drop policy if exists respuestas_en_curso_exige_acceso_upd on public.respuestas_en_curso;
create policy respuestas_en_curso_exige_acceso_upd on public.respuestas_en_curso as restrictive for update to authenticated
  using ((select public.acceso_vigente())) with check ((select public.acceso_vigente()));

grant select, insert, update on public.respuestas_en_curso to authenticated;
revoke all on public.respuestas_en_curso from anon;

do $$ begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'respuestas_en_curso') then
    alter publication supabase_realtime add table public.respuestas_en_curso;
  end if;
end $$;

-- Mismo resultado que antes; solo cambia qué preguntas le cuentan a cada uno.
create or replace function public.resumen_de_la_clase(p_clase uuid)
returns table (
  student_id uuid, nombre text,
  preguntas integer, respondidas integer, correctas integer, incorrectas integer, sin_calificar integer,
  practicas integer, ganadas integer, tablas integer, perdidas integer,
  partidas integer, partidas_ganadas integer, partidas_tablas integer, partidas_perdidas integer,
  turnos integer, turnos_bien integer, turnos_casi integer
)
language sql
stable
security invoker
set search_path = public
as $$
with pq as (
  select q.id, q.para_alumno from public.questions q where q.class_session_id = p_clase
),
ps as (
  select s.id from public.practice_sessions s where s.class_session_id = p_clase
),
resp as (
  select a.student_id,
         count(*)::int as respondidas,
         count(*) filter (where a.is_correct is true)::int as correctas,
         count(*) filter (where a.is_correct is false)::int as incorrectas,
         count(*) filter (where a.is_correct is null)::int as sin_calificar
    from public.question_answers a
   where a.question_id in (select id from pq)
   group by a.student_id
),
prac as (
  select g.student_id,
         count(*)::int as practicas,
         count(*) filter (where g.status = 'checkmate_win')::int as ganadas,
         count(*) filter (where g.status = 'draw')::int as tablas,
         count(*) filter (where g.status in ('checkmate_loss', 'resigned', 'timeout'))::int as perdidas
    from public.practice_games g
   where g.session_id in (select id from ps)
   group by g.student_id
),
-- Cada partida entre alumnos cuenta para los dos, desde su lado.
lados as (
  select r.white_id as student_id, r.status, case r.result when 'white' then 'g' when 'black' then 'p' when 'draw' then 't' end as res
    from public.game_rooms r where r.class_session_id = p_clase
  union all
  select r.black_id, r.status, case r.result when 'black' then 'g' when 'white' then 'p' when 'draw' then 't' end
    from public.game_rooms r where r.class_session_id = p_clase
),
part as (
  select l.student_id,
         count(*)::int as partidas,
         count(*) filter (where l.res = 'g')::int as partidas_ganadas,
         count(*) filter (where l.res = 't')::int as partidas_tablas,
         count(*) filter (where l.res = 'p')::int as partidas_perdidas
    from lados l
   where l.student_id is not null
   group by l.student_id
),
-- La participación oral: los turnos al azar y por mano levantada.
turn as (
  select e.student_id,
         count(*)::int as turnos,
         count(*) filter (where e.resultado = 'bien')::int as turnos_bien,
         count(*) filter (where e.resultado = 'casi')::int as turnos_casi
    from public.clase_elegidos e
   where e.class_session_id = p_clase
   group by e.student_id
),
gente as (
  select ca.student_id from public.class_attendance ca where ca.session_id = p_clase
  union select student_id from resp
  union select student_id from prac
  union select student_id from part
  union select student_id from turn
)
select g.student_id,
       coalesce(nullif(p.full_name, ''), p.email, 'Alumno'),
       -- Las de toda la clase y las que eran para él; las dirigidas a otro, no.
       (select count(*)::int from pq where pq.para_alumno is null or pq.para_alumno = g.student_id),
       coalesce(r.respondidas, 0), coalesce(r.correctas, 0), coalesce(r.incorrectas, 0), coalesce(r.sin_calificar, 0),
       coalesce(x.practicas, 0), coalesce(x.ganadas, 0), coalesce(x.tablas, 0), coalesce(x.perdidas, 0),
       coalesce(y.partidas, 0), coalesce(y.partidas_ganadas, 0), coalesce(y.partidas_tablas, 0), coalesce(y.partidas_perdidas, 0),
       coalesce(t.turnos, 0), coalesce(t.turnos_bien, 0), coalesce(t.turnos_casi, 0)
  from gente g
  left join public.profiles p on p.id = g.student_id
  left join resp r on r.student_id = g.student_id
  left join prac x on x.student_id = g.student_id
  left join part y on y.student_id = g.student_id
  left join turn t on t.student_id = g.student_id
 -- Quien juega contra su profe también aparece en game_rooms: el profe no es
 -- un alumno de su propia clase.
 where g.student_id is distinct from (select cs.created_by from public.class_sessions cs where cs.id = p_clase)
 order by 2;
$$;
revoke execute on function public.resumen_de_la_clase(uuid) from public, anon;
grant execute on function public.resumen_de_la_clase(uuid) to authenticated;
