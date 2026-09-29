-- El alumno ve solo su propia respuesta, como decía la política original
-- (20260910022308). La de 20260914 copió a question_answers la condición de
-- questions («creada por mi profesor») y la de 20260915 la pasó a
-- es_mi_profesor(): desde entonces cualquier alumno leía las respuestas de
-- sus compañeros a las preguntas de su profe, con la calificación (el ✅/❌
-- que la pantalla promete «en privado»). Lo que la clase ve de las
-- respuestas de los demás es el conteo sin nombres de
-- resultados_de_la_pregunta(), que es SECURITY DEFINER y no depende de esto.
drop policy if exists question_answers_select on public.question_answers;
create policy question_answers_select on public.question_answers
  for select using (
    (select auth.uid()) = student_id
    or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or exists (select 1 from public.questions q
               where q.id = question_id and q.created_by = (select auth.uid()))
  );
