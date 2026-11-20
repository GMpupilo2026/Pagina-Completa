-- El tope mensual de gasto de IA (consulta-arbitraje, mejorar-informe…) se
-- calculaba bajando las filas del mes al runtime y sumándolas ahí. PostgREST
-- corta a ~1000 filas sin avisar (la regla del núcleo): pasadas las 1000
-- consultas del mes, `gastado` se quedaba congelado por debajo del tope y se
-- seguía llamando a la IA sin freno real. La cuenta va en la base.
create or replace function public.ia_gastado_del_mes()
returns numeric
language sql
security definer
set search_path to 'public'
as $$
  select coalesce(sum(costo_usd), 0)
    from public.consultas_arbitraje
   where created_at >= public.ia_inicio_de_mes();
$$;

revoke all on function public.ia_gastado_del_mes() from public, anon, authenticated;
grant execute on function public.ia_gastado_del_mes() to service_role;
