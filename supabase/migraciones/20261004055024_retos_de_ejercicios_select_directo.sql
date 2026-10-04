-- La política de lectura de retos_ejercicios miraba el conjunto de
-- interno.mis_retos_ejercicios(), que no ve la fila que se está insertando:
-- un insert con RETURNING (el .select() de supabase-js) se rechazaba. La fila
-- ya dice quiénes juegan: se pregunta a sus columnas.
alter policy retos_ejercicios_select on public.retos_ejercicios
  using ((select auth.uid()) in (retador_id, rival_id));
