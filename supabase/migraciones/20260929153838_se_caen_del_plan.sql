-- Quién se está cayendo del plan: alumnos con un plan (el del diagnóstico o
-- uno que les compartió su profesor) que llevan p_dias días o más sin
-- entrenar desde entonces.
--
-- En los datos, de 52 alumnos que hicieron el diagnóstico, 17 no volvieron a
-- entrenar y 19 lo dejaron al primer o segundo día. «Tu semana» ya dice
-- CUÁNTOS llevan 4 días sin entrenar, pero no QUIÉNES, ni cuáles de ellos
-- tenían un plan que seguir: el profe se enteraba revisando uno por uno.
--
-- SECURITY INVOKER, como informes_inactivos(): la RLS de profiles,
-- training_progress y training_plans decide de quién puede preguntar cada uno
-- (el profe, sus alumnos; quien supervisa, su gente; quien administra, todos).
--
--  * desde: lo más reciente entre el diagnóstico y el plan compartido. La
--    cuenta de días arranca ahí: un plan de ayer no es una caída aunque no
--    haya entrenado en un mes.
--  * Solo planes de los últimos 60 días: después, el plan de cuatro semanas
--    ya terminó y el alumno es un inactivo más (eso lo cuenta
--    informes_inactivos()).
--  * El diagnóstico no cuenta como entrenar: es lo que arma el plan.
create or replace function public.se_caen_del_plan(p_dias integer default 3)
returns table(id uuid, nombre text, desde timestamptz, ultima timestamptz, entreno_con_plan boolean)
language sql
stable
security invoker
set search_path = public
as $$
  with planes as (
    select d.student_id, d.fecha as desde
      from public.informes_diagnosticos_alumnos() d
     where d.fecha is not null and d.detalle is not null
    union all
    select tpl.student_id, tpl.updated_at
      from public.training_plans tpl
     where tpl.shared
  ),
  plan as (
    select pl.student_id, max(pl.desde) as desde from planes pl group by 1
  )
  select p.id, coalesce(nullif(p.full_name, ''), p.email), plan.desde, ua.ultima,
         coalesce(ua.ultima >= plan.desde, false)
    from plan
    join public.profiles p on p.id = plan.student_id and p.role = 'alumno'
    left join lateral (
      select max(tp.created_at) as ultima
        from public.training_progress tp
       where tp.student_id = plan.student_id and tp.activity <> 'diagnostico'
    ) ua on true
   where plan.desde > now() - interval '60 days'
     and greatest(coalesce(ua.ultima, plan.desde), plan.desde)
         < now() - make_interval(days => greatest(coalesce(p_dias, 3), 1))
   order by greatest(coalesce(ua.ultima, plan.desde), plan.desde) desc,
            coalesce(nullif(p.full_name, ''), p.email) collate "es-CR-x-icu";
$$;

revoke execute on function public.se_caen_del_plan(integer) from public, anon;
grant execute on function public.se_caen_del_plan(integer) to authenticated;
