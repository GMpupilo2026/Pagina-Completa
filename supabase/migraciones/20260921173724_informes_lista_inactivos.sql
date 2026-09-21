
-- El tile "😴 Sin entrenar (7 días)" de Tu semana (clases.html) solo daba un
-- número (panel_profesor().activos_7d, restado del total de alumnos) y
-- enlazaba al resumen general de Informes -- no a la lista de QUIÉNES son.
-- Esta función da esa lista, con la MISMA definición de "entrenar" que
-- panel_profesor(): una fila en training_progress. SECURITY INVOKER, como el
-- resto de las de informes -- la RLS de profiles/training_progress decide de
-- quién es cada quien, sin filtro de profesor escrito acá.
create or replace function public.informes_inactivos(p_dias integer default 7)
returns table(id uuid, full_name text, email text, grupo text, ultima_actividad timestamptz)
language sql
stable
set search_path to 'public'
as $$
  select p.id, p.full_name, p.email, p.grupo, ua.ultima
  from public.profiles p
  left join (
    select tp.student_id, max(tp.created_at) as ultima
    from public.training_progress tp
    group by tp.student_id
  ) ua on ua.student_id = p.id
  where p.role = 'alumno'
    and (ua.ultima is null or ua.ultima < now() - (greatest(coalesce(p_dias, 7), 0) || ' days')::interval)
  order by ua.ultima asc nulls first,
           coalesce(nullif(p.full_name, ''), p.email) collate "es-CR-x-icu";
$$;
