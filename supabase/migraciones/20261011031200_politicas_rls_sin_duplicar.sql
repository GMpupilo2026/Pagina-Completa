-- Políticas de RLS que se evaluaban dos o tres veces por fila: el asesor de
-- rendimiento de Supabase las marca como «multiple permissive policies» en
-- 25 tablas. Cuando dos políticas permisivas valen para la misma acción,
-- Postgres ya las junta con OR al evaluarlas; tenerlas separadas no cambia a
-- quién le llega qué, solo obliga a planear y evaluar cada una aparte en
-- cada fila. Con varias academias conectadas a la vez (clase en vivo,
-- tablero, práctica) ese costo se nota: es parte de lo que se vio en «La
-- base saturada del 29/9» (docs/decisiones/sitio-e-infraestructura.md).
--
-- El cambio es mecánico: se junta cada grupo en una sola política con el
-- mismo texto de las que reemplaza, unido por OR, así el resultado es
-- idéntico al de antes (es la misma cuenta que ya hacía Postgres). Donde la
-- política duplicada era FOR ALL de un coordinador (cobros, cobros_contacto,
-- datos_facturacion, pagos, planes_cobro, suscripciones, ajustes_academia),
-- se separó en INSERT/UPDATE/DELETE con el mismo USING/CHECK que tenía, y la
-- lectura del alumno se unió aparte en una sola política de SELECT: así la
-- escritura sigue siendo solo de coordinación y la lectura no se evalúa dos
-- veces. En jdn_resultados se borró la política de quien tiene la
-- herramienta: la de lectura pública (`using (true)`) ya cubre lo mismo para
-- quien está conectado.
--
-- Comprobado impersonando en SQL (`set local role authenticated` +
-- `request.jwt.claim.sub`) con un coordinador, un profesor, un alumno y
-- quien administra, contando filas visibles en las 33 tablas antes y
-- después: ningún conteo cambió.

-- jdn_resultados: jdn_resultados_lectura_publica (true, anon+authenticated) ya cubre
-- todo lo que jdn_resultados_con_herramienta permitía para authenticated.
drop policy if exists jdn_resultados_con_herramienta on public.jdn_resultados;

-- ajustes_academia: separa la escritura de coordinación de la lectura
-- (que ya la cubre ajustes_academia_select para cualquiera con sesión).
drop policy if exists ajustes_academia_coordinacion on public.ajustes_academia;
create policy ajustes_academia_coordinacion_escribe on public.ajustes_academia for insert
  with check (soy_coordinador());
create policy ajustes_academia_coordinacion_actualiza on public.ajustes_academia for update
  using (soy_coordinador())
  with check (soy_coordinador());
create policy ajustes_academia_coordinacion_borra on public.ajustes_academia for delete
  using (soy_coordinador());

-- cobros
drop policy if exists cobros_coordinacion on public.cobros;
create policy cobros_coordinacion_escribe on public.cobros for insert
  with check (coordinador_puede('cobros'::text) AND bajo_mi_coordinacion(student_id));
create policy cobros_coordinacion_actualiza on public.cobros for update
  using (coordinador_puede('cobros'::text) AND bajo_mi_coordinacion(student_id))
  with check (coordinador_puede('cobros'::text) AND bajo_mi_coordinacion(student_id));
create policy cobros_coordinacion_borra on public.cobros for delete
  using (coordinador_puede('cobros'::text) AND bajo_mi_coordinacion(student_id));
drop policy if exists cobros_lee_alumno on public.cobros;
create policy cobros_select on public.cobros for select
  using (
    (coordinador_puede('cobros'::text) AND bajo_mi_coordinacion(student_id)) OR
    (student_id = ( SELECT auth.uid() AS uid))
  );

-- cobros_contacto
drop policy if exists cobros_contacto_coordinacion on public.cobros_contacto;
create policy cobros_contacto_coordinacion_escribe on public.cobros_contacto for insert
  with check (coordinador_puede('cobros'::text) AND bajo_mi_coordinacion(student_id));
create policy cobros_contacto_coordinacion_actualiza on public.cobros_contacto for update
  using (coordinador_puede('cobros'::text) AND bajo_mi_coordinacion(student_id))
  with check (coordinador_puede('cobros'::text) AND bajo_mi_coordinacion(student_id));
create policy cobros_contacto_coordinacion_borra on public.cobros_contacto for delete
  using (coordinador_puede('cobros'::text) AND bajo_mi_coordinacion(student_id));
drop policy if exists cobros_contacto_lee_alumno on public.cobros_contacto;
create policy cobros_contacto_select on public.cobros_contacto for select
  using (
    (coordinador_puede('cobros'::text) AND bajo_mi_coordinacion(student_id)) OR
    (student_id = ( SELECT auth.uid() AS uid))
  );

-- datos_facturacion (ambas políticas originales eran TO authenticated)
drop policy if exists facturacion_coordinacion on public.datos_facturacion;
create policy facturacion_coordinacion_escribe on public.datos_facturacion for insert to authenticated
  with check (coordinador_puede('cobros'::text) AND bajo_mi_coordinacion(student_id));
create policy facturacion_coordinacion_actualiza on public.datos_facturacion for update to authenticated
  using (coordinador_puede('cobros'::text) AND bajo_mi_coordinacion(student_id))
  with check (coordinador_puede('cobros'::text) AND bajo_mi_coordinacion(student_id));
create policy facturacion_coordinacion_borra on public.datos_facturacion for delete to authenticated
  using (coordinador_puede('cobros'::text) AND bajo_mi_coordinacion(student_id));
drop policy if exists facturacion_lee_alumno on public.datos_facturacion;
create policy facturacion_select on public.datos_facturacion for select to authenticated
  using (
    (coordinador_puede('cobros'::text) AND bajo_mi_coordinacion(student_id)) OR
    (student_id = ( SELECT auth.uid() AS uid))
  );

-- pagos (el USING y el WITH CHECK de pagos_coordinacion no son iguales: se preservan tal cual)
drop policy if exists pagos_coordinacion on public.pagos;
create policy pagos_coordinacion_escribe on public.pagos for insert
  with check (EXISTS ( SELECT 1
   FROM cobros c
  WHERE ((c.id = pagos.cobro_id) AND interno.corrijo_cobros_de(c.student_id))));
create policy pagos_coordinacion_actualiza on public.pagos for update
  using (coordinador_puede('cobros'::text) AND (EXISTS ( SELECT 1
   FROM cobros c
  WHERE ((c.id = pagos.cobro_id) AND bajo_mi_coordinacion(c.student_id)))))
  with check (EXISTS ( SELECT 1
   FROM cobros c
  WHERE ((c.id = pagos.cobro_id) AND interno.corrijo_cobros_de(c.student_id))));
create policy pagos_coordinacion_borra on public.pagos for delete
  using (coordinador_puede('cobros'::text) AND (EXISTS ( SELECT 1
   FROM cobros c
  WHERE ((c.id = pagos.cobro_id) AND bajo_mi_coordinacion(c.student_id)))));
drop policy if exists pagos_lee_alumno on public.pagos;
create policy pagos_select on public.pagos for select
  using (
    (coordinador_puede('cobros'::text) AND (EXISTS ( SELECT 1
   FROM cobros c
  WHERE ((c.id = pagos.cobro_id) AND bajo_mi_coordinacion(c.student_id))))) OR
    (EXISTS ( SELECT 1
   FROM cobros c
  WHERE ((c.id = pagos.cobro_id) AND (c.student_id = ( SELECT auth.uid() AS uid)))))
  );

-- planes_cobro (ambas políticas originales eran TO authenticated)
drop policy if exists planes_escribe_coordinacion on public.planes_cobro;
create policy planes_coordinacion_escribe on public.planes_cobro for insert to authenticated
  with check (coordinador_puede('cobros'::text) AND bajo_mi_coordinacion(creado_por));
create policy planes_coordinacion_actualiza on public.planes_cobro for update to authenticated
  using (coordinador_puede('cobros'::text) AND bajo_mi_coordinacion(creado_por))
  with check (coordinador_puede('cobros'::text) AND bajo_mi_coordinacion(creado_por));
create policy planes_coordinacion_borra on public.planes_cobro for delete to authenticated
  using (coordinador_puede('cobros'::text) AND bajo_mi_coordinacion(creado_por));
drop policy if exists planes_lee_coordinacion on public.planes_cobro;
create policy planes_cobro_select on public.planes_cobro for select to authenticated
  using (
    (coordinador_puede('cobros'::text) AND bajo_mi_coordinacion(creado_por)) OR
    (bajo_mi_coordinacion(creado_por))
  );

-- suscripciones
drop policy if exists suscripciones_coordinacion on public.suscripciones;
create policy suscripciones_coordinacion_escribe on public.suscripciones for insert
  with check (coordinador_puede('cobros'::text) AND bajo_mi_coordinacion(student_id));
create policy suscripciones_coordinacion_actualiza on public.suscripciones for update
  using (coordinador_puede('cobros'::text) AND bajo_mi_coordinacion(student_id))
  with check (coordinador_puede('cobros'::text) AND bajo_mi_coordinacion(student_id));
create policy suscripciones_coordinacion_borra on public.suscripciones for delete
  using (coordinador_puede('cobros'::text) AND bajo_mi_coordinacion(student_id));
drop policy if exists suscripciones_lee_alumno on public.suscripciones;
create policy suscripciones_select on public.suscripciones for select
  using (
    (coordinador_puede('cobros'::text) AND bajo_mi_coordinacion(student_id)) OR
    (student_id = ( SELECT auth.uid() AS uid))
  );
-- clase_elegidos: junta clase_elegidos_select, clase_elegidos_select_propio en clase_elegidos_select
drop policy if exists clase_elegidos_select on public.clase_elegidos;
drop policy if exists clase_elegidos_select_propio on public.clase_elegidos;
create policy clase_elegidos_select on public.clase_elegidos for select to authenticated
  using (
    ((EXISTS ( SELECT 1
   FROM class_sessions cs
  WHERE ((cs.id = clase_elegidos.class_session_id) AND (cs.created_by = ( SELECT auth.uid() AS uid)))))) OR
    ((student_id = ( SELECT auth.uid() AS uid)))
  );

-- class_sessions: junta class_sessions_select, class_sessions_select_coordinacion, class_sessions_select_supervisor en class_sessions_select
drop policy if exists class_sessions_select on public.class_sessions;
drop policy if exists class_sessions_select_coordinacion on public.class_sessions;
drop policy if exists class_sessions_select_supervisor on public.class_sessions;
create policy class_sessions_select on public.class_sessions for select to authenticated
  using (
    ((( SELECT my_profile.is_admin
   FROM my_profile() my_profile(role, is_admin, teacher_id)) OR (created_by = ( SELECT auth.uid() AS uid)) OR (created_by IN ( SELECT interno.profesores_de(( SELECT auth.uid() AS uid)) AS profesores_de)))) OR
    ((created_by IN ( SELECT interno.profesores_que_coordino() AS profesores_que_coordino))) OR
    ((( SELECT soy_supervisor() AS soy_supervisor) AND (id IN ( SELECT interno.sesiones_de_supervisados() AS sesiones_de_supervisados))))
  );

-- course_unlocks: junta course_unlocks_select, course_unlocks_select_supervisor en course_unlocks_select
drop policy if exists course_unlocks_select on public.course_unlocks;
drop policy if exists course_unlocks_select_supervisor on public.course_unlocks;
create policy course_unlocks_select on public.course_unlocks for select
  using (
    (((student_id = ( SELECT auth.uid() AS uid)) OR ( SELECT my_profile.is_admin
   FROM my_profile() my_profile(role, is_admin, teacher_id)) OR soy_profesor_de(student_id))) OR
    ((( SELECT soy_supervisor() AS soy_supervisor) AND supervisado_por_mi(student_id)))
  );

-- cuaderno: junta cuaderno_select_profesor, cuaderno_select_propio, cuaderno_select_supervisor en cuaderno_select
drop policy if exists cuaderno_select_profesor on public.cuaderno;
drop policy if exists cuaderno_select_propio on public.cuaderno;
drop policy if exists cuaderno_select_supervisor on public.cuaderno;
create policy cuaderno_select on public.cuaderno for select to authenticated
  using (
    ((compartida AND (( SELECT mp.is_admin
   FROM my_profile() mp(role, is_admin, teacher_id)) OR (alumno_id IN ( SELECT interno.alumnos_de(( SELECT auth.uid() AS uid)) AS alumnos_de))))) OR
    ((alumno_id = ( SELECT auth.uid() AS uid))) OR
    ((compartida AND ( SELECT soy_supervisor() AS soy_supervisor) AND (alumno_id IN ( SELECT interno.supervisados_por_mi() AS supervisados_por_mi))))
  );

-- encargados: junta encargados_select, encargados_select_supervisor en encargados_select
drop policy if exists encargados_select on public.encargados;
drop policy if exists encargados_select_supervisor on public.encargados;
create policy encargados_select on public.encargados for select
  using (
    ((( SELECT my_profile.is_admin
   FROM my_profile() my_profile(role, is_admin, teacher_id)) OR soy_profesor_de(student_id))) OR
    ((( SELECT soy_supervisor() AS soy_supervisor) AND supervisado_por_mi(student_id)))
  );

-- examenes: junta examenes_select, examenes_select_supervisor en examenes_select
drop policy if exists examenes_select on public.examenes;
drop policy if exists examenes_select_supervisor on public.examenes;
create policy examenes_select on public.examenes for select
  using (
    ((( SELECT my_profile.is_admin
   FROM my_profile() my_profile(role, is_admin, teacher_id)) OR (profesor_id = ( SELECT auth.uid() AS uid)) OR ((alumno_id = ( SELECT auth.uid() AS uid)) AND (disponible_desde <= now())))) OR
    ((( SELECT soy_supervisor() AS soy_supervisor) AND supervisado_por_mi(alumno_id)))
  );

-- game_state: junta game_state_select, game_state_select_coordinacion, game_state_select_supervisor en game_state_select
drop policy if exists game_state_select on public.game_state;
drop policy if exists game_state_select_coordinacion on public.game_state;
drop policy if exists game_state_select_supervisor on public.game_state;
create policy game_state_select on public.game_state for select to authenticated
  using (
    ((( SELECT mp.is_admin
   FROM my_profile() mp(role, is_admin, teacher_id)) OR (owner_id = ( SELECT auth.uid() AS uid)) OR (es_mi_profesor(owner_id) AND clase_abierta_de(owner_id)))) OR
    ((owner_id IN ( SELECT interno.clases_que_coordino() AS clases_que_coordino))) OR
    ((( SELECT soy_supervisor() AS soy_supervisor) AND (owner_id IN ( SELECT interno.clases_que_superviso() AS clases_que_superviso))))
  );

-- notas_alumno: junta notas_alumno_select_alumno, notas_alumno_select_profesor en notas_alumno_select
drop policy if exists notas_alumno_select_alumno on public.notas_alumno;
drop policy if exists notas_alumno_select_profesor on public.notas_alumno;
create policy notas_alumno_select on public.notas_alumno for select
  using (
    (((alumno_id = ( SELECT auth.uid() AS uid)) AND compartida)) OR
    (((profesor_id = ( SELECT auth.uid() AS uid)) OR ( SELECT mp.is_admin
   FROM my_profile() mp(role, is_admin, teacher_id))))
  );

-- partidas_torneo: junta partidas_torneo_lee, partidas_torneo_lee_supervisor en partidas_torneo_lee
drop policy if exists partidas_torneo_lee on public.partidas_torneo;
drop policy if exists partidas_torneo_lee_supervisor on public.partidas_torneo;
create policy partidas_torneo_lee on public.partidas_torneo for select to authenticated
  using (
    (((student_id = ( SELECT auth.uid() AS uid)) OR (student_id IN ( SELECT interno.alumnos_de(( SELECT auth.uid() AS uid)) AS alumnos_de)) OR ( SELECT soy_admin() AS soy_admin))) OR
    ((( SELECT soy_supervisor() AS soy_supervisor) AND (student_id IN ( SELECT interno.supervisados_por_mi() AS supervisados_por_mi))))
  );

-- platform_activity_log: junta platform_activity_log_select, platform_activity_log_select_supervisor en platform_activity_log_select
drop policy if exists platform_activity_log_select on public.platform_activity_log;
drop policy if exists platform_activity_log_select_supervisor on public.platform_activity_log;
create policy platform_activity_log_select on public.platform_activity_log for select
  using (
    (((( SELECT auth.uid() AS uid) = student_id) OR ( SELECT my_profile.is_admin
   FROM my_profile() my_profile(role, is_admin, teacher_id)) OR (student_id IN ( SELECT interno.alumnos_de(( SELECT auth.uid() AS uid)) AS alumnos_de)))) OR
    ((( SELECT soy_supervisor() AS soy_supervisor) AND (student_id IN ( SELECT interno.supervisados_por_mi() AS supervisados_por_mi))))
  );

-- practice_sessions: junta practice_sessions_select, practice_sessions_select_coordinacion, practice_sessions_select_supervisor en practice_sessions_select
drop policy if exists practice_sessions_select on public.practice_sessions;
drop policy if exists practice_sessions_select_coordinacion on public.practice_sessions;
drop policy if exists practice_sessions_select_supervisor on public.practice_sessions;
create policy practice_sessions_select on public.practice_sessions for select to authenticated
  using (
    ((( SELECT my_profile.is_admin
   FROM my_profile() my_profile(role, is_admin, teacher_id)) OR (created_by = ( SELECT auth.uid() AS uid)) OR es_mi_profesor(created_by))) OR
    ((created_by IN ( SELECT interno.clases_que_coordino() AS clases_que_coordino))) OR
    ((( SELECT soy_supervisor() AS soy_supervisor) AND (created_by IN ( SELECT interno.clases_que_superviso() AS clases_que_superviso))))
  );

-- profesor_videollamada: junta profesor_videollamada_select, profesor_videollamada_select_coordinacion, profesor_videollamada_select_supervisor en profesor_videollamada_select
drop policy if exists profesor_videollamada_select on public.profesor_videollamada;
drop policy if exists profesor_videollamada_select_coordinacion on public.profesor_videollamada;
drop policy if exists profesor_videollamada_select_supervisor on public.profesor_videollamada;
create policy profesor_videollamada_select on public.profesor_videollamada for select
  using (
    (((profesor_id = ( SELECT auth.uid() AS uid)) OR ( SELECT mp.is_admin
   FROM my_profile() mp(role, is_admin, teacher_id)) OR (es_mi_profesor(profesor_id) AND clase_abierta_de(profesor_id) AND ((grupo = ''::text) OR (grupo = COALESCE(mi_grupo(), ''::text)))))) OR
    ((profesor_id IN ( SELECT interno.clases_que_coordino() AS clases_que_coordino))) OR
    ((( SELECT soy_supervisor() AS soy_supervisor) AND (profesor_id IN ( SELECT interno.clases_que_superviso() AS clases_que_superviso))))
  );

-- question_answers: junta question_answers_select, question_answers_select_supervisor en question_answers_select
drop policy if exists question_answers_select on public.question_answers;
drop policy if exists question_answers_select_supervisor on public.question_answers;
create policy question_answers_select on public.question_answers for select to authenticated
  using (
    (((( SELECT auth.uid() AS uid) = student_id) OR ( SELECT my_profile.is_admin
   FROM my_profile() my_profile(role, is_admin, teacher_id)) OR (EXISTS ( SELECT 1
   FROM questions q
  WHERE ((q.id = question_answers.question_id) AND (q.created_by = ( SELECT auth.uid() AS uid))))))) OR
    ((( SELECT soy_supervisor() AS soy_supervisor) AND (student_id IN ( SELECT interno.supervisados_por_mi() AS supervisados_por_mi)) AND (question_id IN ( SELECT interno.preguntas_visibles_para_mi_supervision() AS preguntas_visibles_para_mi_supervision))))
  );

-- question_engine_answers: junta question_engine_answers_select, question_engine_answers_select_alumno en question_engine_answers_select
drop policy if exists question_engine_answers_select on public.question_engine_answers;
drop policy if exists question_engine_answers_select_alumno on public.question_engine_answers;
create policy question_engine_answers_select on public.question_engine_answers for select
  using (
    ((( SELECT my_profile.is_admin
   FROM my_profile() my_profile(role, is_admin, teacher_id)) OR (EXISTS ( SELECT 1
   FROM questions q
  WHERE ((q.id = question_engine_answers.question_id) AND (q.created_by = ( SELECT auth.uid() AS uid))))))) OR
    ((question_id IN ( SELECT q.id
   FROM questions q
  WHERE ((q.closed_at IS NOT NULL) AND (q.created_by IN ( SELECT interno.profesores_de(( SELECT auth.uid() AS uid)) AS profesores_de))))))
  );

-- recibos: junta recibos_coordinacion, recibos_lee_alumno en recibos_select
drop policy if exists recibos_coordinacion on public.recibos;
drop policy if exists recibos_lee_alumno on public.recibos;
create policy recibos_select on public.recibos for select to authenticated
  using (
    ((coordinador_puede('cobros'::text) AND bajo_mi_coordinacion(student_id))) OR
    ((student_id = ( SELECT auth.uid() AS uid)))
  );

-- repertorio: junta repertorio_select_profesor, repertorio_select_propio, repertorio_select_supervisor en repertorio_select
drop policy if exists repertorio_select_profesor on public.repertorio;
drop policy if exists repertorio_select_propio on public.repertorio;
drop policy if exists repertorio_select_supervisor on public.repertorio;
create policy repertorio_select on public.repertorio for select to authenticated
  using (
    ((( SELECT mp.is_admin
   FROM my_profile() mp(role, is_admin, teacher_id)) OR (alumno_id IN ( SELECT interno.alumnos_de(( SELECT auth.uid() AS uid)) AS alumnos_de)))) OR
    ((alumno_id = ( SELECT auth.uid() AS uid))) OR
    ((( SELECT soy_supervisor() AS soy_supervisor) AND (alumno_id IN ( SELECT interno.supervisados_por_mi() AS supervisados_por_mi))))
  );

-- saved_games: junta saved_games_select, saved_games_select_asistentes, saved_games_select_ausentes en saved_games_select
drop policy if exists saved_games_select on public.saved_games;
drop policy if exists saved_games_select_asistentes on public.saved_games;
drop policy if exists saved_games_select_ausentes on public.saved_games;
create policy saved_games_select on public.saved_games for select to authenticated
  using (
    ((( SELECT my_profile.is_admin
   FROM my_profile() my_profile(role, is_admin, teacher_id)) OR (created_by = ( SELECT auth.uid() AS uid)))) OR
    ((class_session_id IN ( SELECT ca.session_id
   FROM class_attendance ca
  WHERE (ca.student_id = ( SELECT auth.uid() AS uid))))) OR
    ((class_session_id IN ( SELECT cs.id
   FROM class_sessions cs
  WHERE (cs.para_ausentes AND (cs.created_by IN ( SELECT interno.profesores_de(( SELECT auth.uid() AS uid)) AS profesores_de))))))
  );

-- tareas: junta tareas_select, tareas_select_supervisor en tareas_select
drop policy if exists tareas_select on public.tareas;
drop policy if exists tareas_select_supervisor on public.tareas;
create policy tareas_select on public.tareas for select
  using (
    ((( SELECT my_profile.is_admin
   FROM my_profile() my_profile(role, is_admin, teacher_id)) OR (profesor_id = ( SELECT auth.uid() AS uid)) OR ((alumno_id = ( SELECT auth.uid() AS uid)) AND (disponible_desde <= now())))) OR
    ((( SELECT soy_supervisor() AS soy_supervisor) AND (alumno_id IN ( SELECT interno.supervisados_por_mi() AS supervisados_por_mi))))
  );

-- training_plans: junta training_plans_select_student, training_plans_select_supervisor, training_plans_select_teacher en training_plans_select
drop policy if exists training_plans_select_student on public.training_plans;
drop policy if exists training_plans_select_supervisor on public.training_plans;
drop policy if exists training_plans_select_teacher on public.training_plans;
create policy training_plans_select on public.training_plans for select
  using (
    (((student_id = ( SELECT auth.uid() AS uid)) AND (shared = true))) OR
    ((( SELECT soy_supervisor() AS soy_supervisor) AND supervisado_por_mi(student_id))) OR
    ((( SELECT my_profile.is_admin
   FROM my_profile() my_profile(role, is_admin, teacher_id)) OR soy_profesor_de(student_id)))
  );

-- training_progress: junta training_progress_select_own, training_progress_select_supervisor, training_progress_select_teacher en training_progress_select
drop policy if exists training_progress_select_own on public.training_progress;
drop policy if exists training_progress_select_supervisor on public.training_progress;
drop policy if exists training_progress_select_teacher on public.training_progress;
create policy training_progress_select on public.training_progress for select
  using (
    ((student_id = ( SELECT auth.uid() AS uid))) OR
    ((( SELECT soy_supervisor() AS soy_supervisor) AND (student_id IN ( SELECT interno.supervisados_por_mi() AS supervisados_por_mi)))) OR
    ((( SELECT my_profile.is_admin
   FROM my_profile() my_profile(role, is_admin, teacher_id)) OR (student_id IN ( SELECT interno.alumnos_de(( SELECT auth.uid() AS uid)) AS alumnos_de))))
  );

-- training_state: junta training_state_select_own, training_state_select_supervisor, training_state_select_teacher en training_state_select
drop policy if exists training_state_select_own on public.training_state;
drop policy if exists training_state_select_supervisor on public.training_state;
drop policy if exists training_state_select_teacher on public.training_state;
create policy training_state_select on public.training_state for select
  using (
    ((student_id = ( SELECT auth.uid() AS uid))) OR
    ((( SELECT soy_supervisor() AS soy_supervisor) AND (student_id IN ( SELECT interno.supervisados_por_mi() AS supervisados_por_mi)))) OR
    ((( SELECT my_profile.is_admin
   FROM my_profile() my_profile(role, is_admin, teacher_id)) OR (student_id IN ( SELECT interno.alumnos_de(( SELECT auth.uid() AS uid)) AS alumnos_de))))
  );

-- variant_nodes: junta variant_nodes_select, variant_nodes_select_coordinacion, variant_nodes_select_supervisor en variant_nodes_select
drop policy if exists variant_nodes_select on public.variant_nodes;
drop policy if exists variant_nodes_select_coordinacion on public.variant_nodes;
drop policy if exists variant_nodes_select_supervisor on public.variant_nodes;
create policy variant_nodes_select on public.variant_nodes for select to authenticated
  using (
    ((( SELECT mp.is_admin
   FROM my_profile() mp(role, is_admin, teacher_id)) OR (teacher_id = ( SELECT auth.uid() AS uid)) OR (es_mi_profesor(teacher_id) AND clase_abierta_de(teacher_id)))) OR
    ((teacher_id IN ( SELECT interno.clases_que_coordino() AS clases_que_coordino))) OR
    ((( SELECT soy_supervisor() AS soy_supervisor) AND (teacher_id IN ( SELECT interno.clases_que_superviso() AS clases_que_superviso))))
  );

-- class_attendance: junta class_attendance_insert_own, class_attendance_insert_profesor en class_attendance_insert
drop policy if exists class_attendance_insert_own on public.class_attendance;
drop policy if exists class_attendance_insert_profesor on public.class_attendance;
create policy class_attendance_insert on public.class_attendance for insert
  with check (
    (((( SELECT auth.uid() AS uid) = student_id) AND (EXISTS ( SELECT 1
   FROM class_sessions cs
  WHERE ((cs.id = class_attendance.session_id) AND es_mi_profesor(cs.created_by)))))) OR
    (((EXISTS ( SELECT 1
   FROM class_sessions cs
  WHERE ((cs.id = class_attendance.session_id) AND (cs.created_by = ( SELECT auth.uid() AS uid)) AND (cs.modalidad = 'presencial'::text)))) AND (soy_profesor_de(student_id) OR ( SELECT my_profile.is_admin
   FROM my_profile() my_profile(role, is_admin, teacher_id)))))
  );

-- class_attendance: junta class_attendance_select, class_attendance_select_supervisor en class_attendance_select
drop policy if exists class_attendance_select on public.class_attendance;
drop policy if exists class_attendance_select_supervisor on public.class_attendance;
create policy class_attendance_select on public.class_attendance for select
  using (
    (((( SELECT auth.uid() AS uid) = student_id) OR ( SELECT my_profile.is_admin
   FROM my_profile() my_profile(role, is_admin, teacher_id)) OR (EXISTS ( SELECT 1
   FROM class_sessions cs
  WHERE ((cs.id = class_attendance.session_id) AND (cs.created_by = ( SELECT auth.uid() AS uid))))))) OR
    ((( SELECT soy_supervisor() AS soy_supervisor) AND (student_id IN ( SELECT interno.supervisados_por_mi() AS supervisados_por_mi)) AND (session_id IN ( SELECT interno.sesiones_de_supervisados() AS sesiones_de_supervisados))))
  );

-- class_presence_log: junta class_presence_log_insert_own, class_presence_log_insert_profesor en class_presence_log_insert
drop policy if exists class_presence_log_insert_own on public.class_presence_log;
drop policy if exists class_presence_log_insert_profesor on public.class_presence_log;
create policy class_presence_log_insert on public.class_presence_log for insert
  with check (
    (((( SELECT auth.uid() AS uid) = student_id) AND (EXISTS ( SELECT 1
   FROM class_sessions cs
  WHERE ((cs.id = class_presence_log.session_id) AND es_mi_profesor(cs.created_by)))))) OR
    (((EXISTS ( SELECT 1
   FROM class_sessions cs
  WHERE ((cs.id = class_presence_log.session_id) AND (cs.created_by = ( SELECT auth.uid() AS uid)) AND (cs.modalidad = 'presencial'::text)))) AND (soy_profesor_de(student_id) OR ( SELECT my_profile.is_admin
   FROM my_profile() my_profile(role, is_admin, teacher_id)))))
  );

-- class_presence_log: junta class_presence_log_select, class_presence_log_select_supervisor en class_presence_log_select
drop policy if exists class_presence_log_select on public.class_presence_log;
drop policy if exists class_presence_log_select_supervisor on public.class_presence_log;
create policy class_presence_log_select on public.class_presence_log for select
  using (
    (((( SELECT auth.uid() AS uid) = student_id) OR ( SELECT my_profile.is_admin
   FROM my_profile() my_profile(role, is_admin, teacher_id)) OR (EXISTS ( SELECT 1
   FROM class_sessions cs
  WHERE ((cs.id = class_presence_log.session_id) AND (cs.created_by = ( SELECT auth.uid() AS uid))))))) OR
    ((( SELECT soy_supervisor() AS soy_supervisor) AND (student_id IN ( SELECT interno.supervisados_por_mi() AS supervisados_por_mi)) AND (session_id IN ( SELECT interno.sesiones_de_supervisados() AS sesiones_de_supervisados))))
  );

-- practice_games: junta practice_games_select, practice_games_select_coordinacion, practice_games_select_supervisor en practice_games_select
drop policy if exists practice_games_select on public.practice_games;
drop policy if exists practice_games_select_coordinacion on public.practice_games;
drop policy if exists practice_games_select_supervisor on public.practice_games;
create policy practice_games_select on public.practice_games for select to authenticated
  using (
    (((( SELECT auth.uid() AS uid) = student_id) OR ( SELECT my_profile.is_admin
   FROM my_profile() my_profile(role, is_admin, teacher_id)) OR (student_id IN ( SELECT interno.alumnos_de(( SELECT auth.uid() AS uid)) AS alumnos_de)))) OR
    ((session_id IN ( SELECT s.id
   FROM practice_sessions s
  WHERE (s.created_by IN ( SELECT interno.clases_que_coordino() AS clases_que_coordino))))) OR
    ((( SELECT soy_supervisor() AS soy_supervisor) AND (session_id IN ( SELECT s.id
   FROM practice_sessions s
  WHERE (s.created_by IN ( SELECT interno.clases_que_superviso() AS clases_que_superviso))))))
  );

-- practice_games: junta practice_games_update, practice_games_update_coordinacion, practice_games_update_supervisor en practice_games_update
drop policy if exists practice_games_update on public.practice_games;
drop policy if exists practice_games_update_coordinacion on public.practice_games;
drop policy if exists practice_games_update_supervisor on public.practice_games;
create policy practice_games_update on public.practice_games for update
  using (
    (((( SELECT auth.uid() AS uid) = student_id) OR ( SELECT my_profile.is_admin
   FROM my_profile() my_profile(role, is_admin, teacher_id)) OR soy_profesor_de(student_id))) OR
    ((session_id IN ( SELECT s.id
   FROM practice_sessions s
  WHERE (s.created_by IN ( SELECT interno.clases_que_coordino() AS clases_que_coordino))))) OR
    ((( SELECT soy_supervisor() AS soy_supervisor) AND (session_id IN ( SELECT s.id
   FROM practice_sessions s
  WHERE (s.created_by IN ( SELECT interno.clases_que_superviso() AS clases_que_superviso))))))
  )
  with check (
    (((( SELECT auth.uid() AS uid) = student_id) OR ( SELECT my_profile.is_admin
   FROM my_profile() my_profile(role, is_admin, teacher_id)) OR soy_profesor_de(student_id))) OR
    ((session_id IN ( SELECT s.id
   FROM practice_sessions s
  WHERE (s.created_by IN ( SELECT interno.clases_que_coordino() AS clases_que_coordino))))) OR
    ((( SELECT soy_supervisor() AS soy_supervisor) AND (session_id IN ( SELECT s.id
   FROM practice_sessions s
  WHERE (s.created_by IN ( SELECT interno.clases_que_superviso() AS clases_que_superviso))))))
  );

