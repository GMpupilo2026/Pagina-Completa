-- Los accesorios de avatar (gorro, lentes, corona...) también los ven los
-- compañeros de clase, no solo el profesor: es la categoría pensada a
-- propósito para notarse delante de otros (ver «Los accesorios de avatar»
-- en docs/decisiones/puntos-y-premios.md). Los títulos, marcos de perfil y
-- demás tipo_efecto siguen privados: solo se agrega esta excepción para
-- tipo_efecto = 'accesorio_avatar'.
set local lock_timeout = '8s';

alter policy premios_canjeados_ver on public.premios_canjeados using (
  student_id = (select auth.uid())
  or regalo_de = (select auth.uid())
  or (select public.soy_admin())
  or student_id in (select interno.alumnos_de((select auth.uid())))
  or ((select public.soy_supervisor()) and student_id in (select interno.supervisados_por_mi()))
  or (
    exists (
      select 1 from public.premios_catalogo cat
       where cat.id = premios_canjeados.premio_id and cat.tipo_efecto = 'accesorio_avatar'
    )
    and student_id in (
      select a from interno.profesores_de((select auth.uid())) pr
        cross join lateral interno.alumnos_de(pr) a
       where a in (select interno.gente_de_mis_academias())
    )
  )
);