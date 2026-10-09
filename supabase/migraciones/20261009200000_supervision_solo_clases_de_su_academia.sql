-- La supervisión ve las clases de su academia, no las de otra a la que también
-- va un alumno suyo.
--
-- Un alumno puede estar en dos academias (al aplicarlo, dos alumnos de ADAPZ
-- también en Campeones Colegiales Medio Juego y una también en CCDR San
-- José). La supervisión de
-- ADAPZ veía TODA su actividad de clase, también la de las clases que le da un
-- profesor de la otra academia: `sesiones_de_supervisados()` sumaba cualquier
-- clase con asistencia de alguien supervisado, y las políticas de supervisión
-- de `class_attendance`, `class_presence_log`, `question_answers` y
-- `tanda_resultados` miraban solo al alumno. Medido antes del cambio: la
-- supervisión de ADAPZ veía 42 clases, 28 de ellas de profesores de las otras
-- dos academias, y 132 asistencias, 30 de esas clases. «Las academias son privadas».
--
-- La regla: lo de una clase lo ve la supervisión si quien la dio es de una de
-- sus academias (`gente_de_mis_academias()`, que ya incluye a quien
-- administra) o no es de ninguna (la gente que maneja Ajedrez Integral
-- directo, como antes). Lo que no es de una clase (entrenamiento, tareas…)
-- no cambia.

-- Quién puede haber dado una clase que la supervisión ve: el conjunto, una vez.
create or replace function interno.autores_visibles_para_mi_supervision()
 returns setof uuid
 language sql
 stable security definer
 set search_path to 'public'
 set row_security to 'off'
as $function$
  select interno.gente_de_mis_academias()
  union
  select p.id from public.profiles p
   where not exists (select 1 from public.academia_miembros m where m.persona_id = p.id)
     and not exists (select 1 from public.academias a where a.supervisor_id = p.id);
$function$;
revoke execute on function interno.autores_visibles_para_mi_supervision() from public, anon;
grant execute on function interno.autores_visibles_para_mi_supervision() to authenticated;

-- Las clases con asistencia de alguien que superviso, solo si las dio alguien
-- de mi academia (o de ninguna); y las que da alguien que superviso.
create or replace function interno.sesiones_de_supervisados()
 returns setof uuid
 language sql
 stable security definer
 set search_path to 'public'
 set row_security to 'off'
as $function$
  select ca.session_id from public.class_attendance ca
    join public.class_sessions cs on cs.id = ca.session_id
   where ca.student_id in (select interno.supervisados_por_mi())
     and (cs.created_by is null
          or cs.created_by in (select interno.autores_visibles_para_mi_supervision()))
  union
  select cs.id from public.class_sessions cs
   where cs.created_by in (select interno.supervisados_por_mi());
$function$;

-- Su inverso fila por fila: si se cambia una, se cambia la otra.
create or replace function public.sesion_de_supervisado(p_sesion uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
 set row_security to 'off'
as $function$
  select exists (select 1 from public.class_attendance ca
                   join public.class_sessions cs on cs.id = ca.session_id
                  where ca.session_id = p_sesion and public.supervisado_por_mi(ca.student_id)
                    and (cs.created_by is null
                         or cs.created_by in (select interno.autores_visibles_para_mi_supervision())))
      or exists (select 1 from public.class_sessions cs
                  where cs.id = p_sesion and public.supervisado_por_mi(cs.created_by));
$function$;

-- Las preguntas de esos autores, como conjunto y por encima de la RLS de
-- `questions`: un subselect directo a `questions` pasa por SU política, y la
-- supervisión no lee esa tabla (con él, la supervisión de ADAPZ pasó de 462 respuestas a 0).
create or replace function interno.preguntas_visibles_para_mi_supervision()
 returns setof uuid
 language sql
 stable security definer
 set search_path to 'public'
 set row_security to 'off'
as $function$
  select q.id from public.questions q
   where q.created_by is null
      or q.created_by in (select interno.autores_visibles_para_mi_supervision());
$function$;
revoke execute on function interno.preguntas_visibles_para_mi_supervision() from public, anon;
grant execute on function interno.preguntas_visibles_para_mi_supervision() to authenticated;

-- ALTER y no DROP + CREATE: la política no queda ni un instante sin existir.
alter policy class_attendance_select_supervisor on public.class_attendance
  using ((select soy_supervisor())
         and student_id in (select interno.supervisados_por_mi())
         and session_id in (select interno.sesiones_de_supervisados()));

alter policy class_presence_log_select_supervisor on public.class_presence_log
  using ((select soy_supervisor())
         and student_id in (select interno.supervisados_por_mi())
         and session_id in (select interno.sesiones_de_supervisados()));

alter policy question_answers_select_supervisor on public.question_answers
  using ((select soy_supervisor())
         and student_id in (select interno.supervisados_por_mi())
         and question_id in (select interno.preguntas_visibles_para_mi_supervision()));

alter policy tanda_resultados_lee on public.tanda_resultados
  using ((student_id = (select auth.uid()))
         or (profe_id = (select auth.uid()))
         or (select mp.is_admin from my_profile() mp(role, is_admin, teacher_id))
         or ((select soy_supervisor())
             and student_id in (select interno.supervisados_por_mi())
             and profe_id in (select interno.autores_visibles_para_mi_supervision())));
