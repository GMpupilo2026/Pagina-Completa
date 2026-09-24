-- profiles_select preguntaba el permiso UNA VEZ POR CUENTA con cinco funciones
-- SECURITY DEFINER (~1,5 ms por fila): con 129 cuentas eran ~0,2 s, y profiles
-- entra en casi todas las consultas del sitio. Crece con cada alumno nuevo.
-- Misma regla, dicha al revés: se arma una vez el conjunto de cada vía y cada
-- cuenta se busca en él (hashed subplan).
--   soy_profesor_de(id)      ⇔ id in interno.alumnos_de(auth.uid())
--   es_mi_profesor(id)       ⇔ id in interno.profesores_de(auth.uid())
--   es_companero(id)         ⇔ id in alumnos_de(cada profesor mío)
--   bajo_mi_coordinacion(id) ⇔ id in interno.bajo_mi_coordinacion_conjunto()
-- Comparado pieza por pieza en las 129 cuentas (y sin sesión): cero diferencias.

-- El inverso exacto de bajo_mi_coordinacion(): las mismas vías, recorridas
-- desde quien mira. Si hay que cambiar una, se cambian las DOS.
create or replace function interno.bajo_mi_coordinacion_conjunto()
returns setof uuid
language sql stable security definer
set search_path = public
set row_security = off
as $$
  with yo as (select coalesce(p.is_admin, false) as is_admin,
                     coalesce(p.es_coordinador, false) as es_coordinador,
                     coalesce(p.es_supervisor, false) as es_supervisor
                from public.profiles p where p.id = auth.uid())
  -- Quien administra: todo el mundo.
  select p.id from public.profiles p where (select is_admin from yo)
  union
  -- Quien supervisa: sí mismo y sus supervisados.
  select auth.uid() where (select es_supervisor from yo)
  union
  select s from interno.supervisados_por_mi() s where (select es_supervisor from yo)
  union
  -- Quien coordina: sus profesores, los alumnos de ellos, su academia,
  -- sus propios alumnos y sí mismo.
  select cp.profesor_id from public.coordinador_profesores cp
   where cp.coordinador_id = auth.uid() and (select es_coordinador from yo)
  union
  select a from public.coordinador_profesores cp
    cross join lateral interno.alumnos_de(cp.profesor_id) a
   where cp.coordinador_id = auth.uid() and (select es_coordinador from yo)
  union
  select m.persona_id from public.academia_miembros yo_m
    join public.academia_miembros m on m.academia_id = yo_m.academia_id
   where yo_m.persona_id = auth.uid() and (select es_coordinador from yo)
  union
  select a from interno.alumnos_de(auth.uid()) a where (select es_coordinador from yo)
  union
  select auth.uid() where (select es_coordinador from yo);
$$;
revoke execute on function interno.bajo_mi_coordinacion_conjunto() from public, anon;
grant execute on function interno.bajo_mi_coordinacion_conjunto() to authenticated, service_role;

alter policy profiles_select on public.profiles using (
  (auth.uid() = id)
  or (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id))
  or id in (select interno.alumnos_de(auth.uid()))
  or id in (select interno.profesores_de(auth.uid()))
  or id in (select a from interno.profesores_de(auth.uid()) pr
              cross join lateral interno.alumnos_de(pr) a)
  or id in (select interno.bajo_mi_coordinacion_conjunto()));
