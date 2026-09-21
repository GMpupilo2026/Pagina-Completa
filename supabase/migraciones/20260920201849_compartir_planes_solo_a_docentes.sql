-- Un plan solo se comparte con quien da clase. Sin esto, el insert únicamente
-- comprobaba que quien comparte sea el dueño: nada impedía poner ahí el id de un
-- alumno y dejarle ver el plan con las soluciones de sus propios ejercicios.
create or replace function public.es_del_equipo_docente(p_persona uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.profiles p
        where p.id = p_persona
          and (p.role = 'profesor' or coalesce(p.is_admin, false))
    );
$$;

revoke all on function public.es_del_equipo_docente(uuid) from anon;
grant execute on function public.es_del_equipo_docente(uuid) to authenticated;

drop policy if exists plan_compartidos_insert on public.plan_compartidos;
create policy plan_compartidos_insert on public.plan_compartidos
    for insert with check (
        public.soy_dueno_del_plan(plan_id)
        and public.es_del_equipo_docente(profesor_id)
    );