-- "Compartido con todo el equipo docente" es eso: el equipo docente.
-- Sin el filtro de rol, un alumno que preguntara por planes_clase se llevaría
-- todos los planes marcados así — y no daría ningún error.
drop policy if exists planes_clase_select on public.planes_clase;
create policy planes_clase_select on public.planes_clase
    for select using (
        profesor_id = auth.uid()
        or (select mp.is_admin from public.my_profile() mp)
        or (
            compartido_todos
            and (select (mp.role = 'profesor' or mp.is_admin) from public.my_profile() mp)
        )
        or public.plan_compartido_conmigo(id)
    );

revoke all on table public.planes_clase from anon;
revoke all on table public.plan_items from anon;