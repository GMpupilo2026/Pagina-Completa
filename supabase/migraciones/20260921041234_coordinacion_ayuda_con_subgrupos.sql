-- Quien coordina puede armarle los subgrupos a sus profesores.
--
-- Un subgrupo sigue sin dar ni un permiso —por eso esto no abre nada—, pero
-- un profesor nuevo con cuarenta alumnos no se pone a ordenarlos solo: parte
-- del trabajo de coordinar es dejarle los grupos hechos.
--
-- El dueño sigue siendo el profesor: quien coordina entra a los SUYOS, no se
-- los queda. Por eso `profesor_id` no cambia nunca.
drop policy if exists subgrupos_select on public.subgrupos;
create policy subgrupos_select on public.subgrupos for select
  using (profesor_id = auth.uid()
         or (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id))
         or public.bajo_mi_coordinacion(profesor_id));

drop policy if exists subgrupos_insert on public.subgrupos;
create policy subgrupos_insert on public.subgrupos for insert
  with check ((profesor_id = auth.uid()
               and (select mp.is_admin or mp.role = 'profesor'
                    from public.my_profile() mp(role, is_admin, teacher_id)))
              or (public.soy_coordinador() and public.bajo_mi_coordinacion(profesor_id)));

drop policy if exists subgrupos_update on public.subgrupos;
create policy subgrupos_update on public.subgrupos for update
  using (profesor_id = auth.uid()
         or (public.soy_coordinador() and public.bajo_mi_coordinacion(profesor_id)))
  with check (profesor_id = auth.uid()
              or (public.soy_coordinador() and public.bajo_mi_coordinacion(profesor_id)));

drop policy if exists subgrupos_delete on public.subgrupos;
create policy subgrupos_delete on public.subgrupos for delete
  using (profesor_id = auth.uid()
         or (public.soy_coordinador() and public.bajo_mi_coordinacion(profesor_id)));

-- Los renglones siguen colgando del subgrupo, así que el select se amplió
-- solo. Lo que hay que escribir es de quién puede ser el alumno: para quien
-- coordina, de su gente — no hace falta que sea alumno SUYO.
drop policy if exists subgrupo_alumnos_insert on public.subgrupo_alumnos;
create policy subgrupo_alumnos_insert on public.subgrupo_alumnos for insert
  with check (exists (select 1 from public.subgrupos s where s.id = subgrupo_id)
              and (public.soy_profesor_de(alumno_id)
                   or (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id))
                   or (public.soy_coordinador() and public.bajo_mi_coordinacion(alumno_id))));

drop policy if exists subgrupo_alumnos_delete on public.subgrupo_alumnos;
create policy subgrupo_alumnos_delete on public.subgrupo_alumnos for delete
  using (exists (select 1 from public.subgrupos s
                 where s.id = subgrupo_id
                   and (s.profesor_id = auth.uid()
                        or (public.soy_coordinador() and public.bajo_mi_coordinacion(s.profesor_id)))));

/* Los subgrupos de un profesor, con los ids de sus alumnos ya juntos.
   `mis_subgrupos()` se queda como está —es la de todos los días, la que usan
   el filtro de Informes y el selector de Tareas— y esta es la de coordinación,
   que además dice de quién son. Dos nombres para dos preguntas distintas. */
create or replace function public.subgrupos_de(p_profesor uuid)
returns table (id uuid, nombre text, alumnos uuid[], cuantos integer)
language sql
stable
security invoker
set search_path to ''
as $$
  select s.id,
         s.nombre,
         coalesce(array_agg(sa.alumno_id order by sa.created_at)
                  filter (where sa.alumno_id is not null), '{}')::uuid[],
         count(sa.alumno_id)::integer
  from public.subgrupos s
  left join public.subgrupo_alumnos sa on sa.subgrupo_id = s.id
  where s.profesor_id = p_profesor
  group by s.id, s.nombre
  order by s.nombre;
$$;

revoke execute on function public.subgrupos_de(uuid) from anon;

-- Los alumnos de un profesor, con nombre y correo, para que quien coordina
-- pueda armarle el subgrupo sin ser profesor de esa gente. SECURITY INVOKER:
-- quién ve a quién lo sigue decidiendo la RLS de `profiles`.
create or replace function public.alumnos_del_profesor_con_nombre(p_profesor uuid)
returns table (id uuid, full_name text, email text, grupo text)
language sql
stable
security invoker
set search_path to ''
as $$
  select p.id, p.full_name, p.email, p.grupo
  from public.profiles p
  where p.id in (select public.alumnos_de(p_profesor))
  order by coalesce(p.full_name, p.email);
$$;

revoke execute on function public.alumnos_del_profesor_con_nombre(uuid) from anon;