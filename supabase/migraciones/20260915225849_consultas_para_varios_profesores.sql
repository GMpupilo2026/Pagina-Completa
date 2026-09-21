-- Las clases a las que puede entrar un alumno. Es lo que necesita el selector
-- de clases.html / sesion.html cuando tiene más de un profesor: quién es cada
-- uno, cuál es el principal (el que viene marcado) y si en este momento tiene
-- clase abierta, para que se note a cuál conviene entrar.
create or replace function public.mis_clases()
returns table (
  profesor_id uuid,
  profesor text,
  es_principal boolean,
  clase_abierta boolean,
  titulo_clase text
)
language sql stable security invoker set search_path = public as $$
  select pt.teacher_id,
         coalesce(nullif(pr.full_name, ''), pr.email) as profesor,
         pt.teacher_id = yo.teacher_id as es_principal,
         cs.id is not null as clase_abierta,
         cs.title
  from public.profile_teachers pt
  join public.profiles pr on pr.id = pt.teacher_id
  join public.profiles yo on yo.id = auth.uid()
  left join lateral (
    select c.id, c.title from public.class_sessions c
    where c.created_by = pt.teacher_id and c.ended_at is null
    order by c.started_at desc nulls last limit 1
  ) cs on true
  where pt.student_id = auth.uid()
  order by (pt.teacher_id = yo.teacher_id) desc, 2;
$$;

revoke execute on function public.mis_clases() from public, anon;
grant execute on function public.mis_clases() to authenticated;

-- Los alumnos de un profesor. La RLS de profiles ya limita a quién se puede
-- ver; esto solo dice cuáles de esos son alumnos de ESE profesor, que es lo que
-- la página del tablero necesita para su lista.
create or replace function public.alumnos_del_profesor(p_profesor uuid)
returns table (id uuid, full_name text, email text, grupo text)
language sql stable security invoker set search_path = public as $$
  select p.id, p.full_name, p.email, p.grupo
  from public.profile_teachers pt
  join public.profiles p on p.id = pt.student_id
  where pt.teacher_id = p_profesor and p.role = 'alumno'
  order by coalesce(nullif(p.full_name, ''), p.email) collate "es-CR-x-icu";
$$;

revoke execute on function public.alumnos_del_profesor(uuid) from public, anon;
grant execute on function public.alumnos_del_profesor(uuid) to authenticated;