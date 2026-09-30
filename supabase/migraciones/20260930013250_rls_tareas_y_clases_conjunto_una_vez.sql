-- panel_profesor() tardaba ~700 ms con una cuenta de coordinación que también
-- supervisa. No eran tareas_con_avance() (73 ms) ni
-- informes_diagnosticos_alumnos() (62 ms): eran tres cuentas simples sobre
-- tablas chicas —tareas (104 filas, 133 ms) y class_sessions dos veces (24
-- filas, 175 y 153 ms)— porque sus políticas de SELECT llamaban a una función
-- SECURITY DEFINER POR FILA: supervisado_por_mi(alumno_id),
-- sesion_de_supervisado(id) y es_mi_profesor(created_by). Es lo mismo que
-- rls_actividad_conjunto_una_vez arregló en las tablas de actividad (ver «La
-- RLS de las tablas de actividad arma el conjunto UNA vez»), dicho igual al
-- revés: el conjunto se arma una vez y cada fila se busca en él.
--   supervisado_por_mi(s)      ⇔ s in interno.supervisados_por_mi()
--   sesion_de_supervisado(id)  ⇔ id in interno.sesiones_de_supervisados()
--   es_mi_profesor(p)          ⇔ p in interno.profesores_de(auth.uid())
--
-- Comprobado antes de aplicar, con cada una de las 149 cuentas y sin sesión:
-- cada forma nueva contesta igual que la vieja fila por fila (cero
-- diferencias), y lo que ve cada cuenta con la RLS de verdad es idéntico antes
-- y después.

-- El inverso exacto de sesion_de_supervisado(): una clase a la que asistió
-- alguien que superviso, o que dio alguien que superviso. SECURITY DEFINER con
-- row_security off porque lee class_attendance entera, igual que la vieja.
create or replace function interno.sesiones_de_supervisados()
returns setof uuid
language sql stable security definer
set search_path = public
set row_security = off
as $$
  select ca.session_id from public.class_attendance ca
   where ca.student_id in (select interno.supervisados_por_mi())
  union
  select cs.id from public.class_sessions cs
   where cs.created_by in (select interno.supervisados_por_mi());
$$;
revoke execute on function interno.sesiones_de_supervisados() from public, anon;
grant execute on function interno.sesiones_de_supervisados() to authenticated, service_role;

alter policy tareas_select_supervisor on public.tareas
  using ((select public.soy_supervisor()) and alumno_id in (select interno.supervisados_por_mi()));

alter policy class_sessions_select_supervisor on public.class_sessions
  using ((select public.soy_supervisor()) and id in (select interno.sesiones_de_supervisados()));

alter policy class_sessions_select on public.class_sessions
  using ((select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
         or created_by = (select auth.uid())
         or created_by in (select interno.profesores_de((select auth.uid()))));

-- Las cuatro claves foráneas que quedaban sin índice (el aviso
-- unindexed_foreign_keys): borrar una cuenta o una clase recorría entera cada
-- tabla que la nombra.
create index if not exists compras_tienda_otorgado_por_fk on public.compras_tienda (otorgado_por);
create index if not exists notas_alumno_class_session_id_fk on public.notas_alumno (class_session_id);
create index if not exists questions_para_alumno_fk on public.questions (para_alumno);
create index if not exists respuestas_en_curso_student_id_fk on public.respuestas_en_curso (student_id);
