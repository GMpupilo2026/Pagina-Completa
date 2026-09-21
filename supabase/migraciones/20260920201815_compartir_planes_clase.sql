-- Compartir un plan de clase con otros profesores.
-- Un plan sigue siendo DE quien lo escribió: compartirlo deja verlo y duplicarlo,
-- nunca editarlo ni borrarlo. Quien comparte es siempre el dueño.

alter table public.planes_clase
    add column if not exists compartido_todos boolean not null default false;

create table if not exists public.plan_compartidos (
    plan_id     uuid not null references public.planes_clase(id) on delete cascade,
    profesor_id uuid not null references public.profiles(id)     on delete cascade,
    created_at  timestamptz not null default now(),
    primary key (plan_id, profesor_id)
);

create index if not exists plan_compartidos_profesor_idx
    on public.plan_compartidos (profesor_id);

alter table public.plan_compartidos enable row level security;

-- Las dos preguntas se hacen con funciones SECURITY DEFINER para que la política
-- de planes_clase (que mira plan_compartidos) y las de plan_compartidos (que miran
-- planes_clase) no se muerdan la cola: una RLS llamando a la otra es recursión.
create or replace function public.soy_dueno_del_plan(p_plan uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.planes_clase p
        where p.id = p_plan and p.profesor_id = auth.uid()
    );
$$;

create or replace function public.plan_compartido_conmigo(p_plan uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.plan_compartidos c
        where c.plan_id = p_plan and c.profesor_id = auth.uid()
    );
$$;

-- Quién es "el equipo docente" al que se le puede compartir. Hace falta una
-- SECURITY DEFINER porque la RLS de profiles no le deja a un profesor ver a sus
-- colegas: solo ve sus alumnos y a sí mismo.
create or replace function public.equipo_docente()
returns table (id uuid, nombre text, email text, es_admin boolean)
language sql
stable
security definer
set search_path = public
as $$
    select p.id,
           coalesce(nullif(trim(p.full_name), ''), p.email) as nombre,
           p.email,
           coalesce(p.is_admin, false) as es_admin
    from public.profiles p
    where (p.role = 'profesor' or coalesce(p.is_admin, false))
      and p.id <> auth.uid()
      and exists (
          select 1 from public.profiles yo
          where yo.id = auth.uid()
            and (yo.role = 'profesor' or coalesce(yo.is_admin, false))
      )
    order by nombre;
$$;

revoke all on function public.equipo_docente() from anon;
revoke all on function public.soy_dueno_del_plan(uuid) from anon;
revoke all on function public.plan_compartido_conmigo(uuid) from anon;
grant execute on function public.equipo_docente() to authenticated;
grant execute on function public.soy_dueno_del_plan(uuid) to authenticated;
grant execute on function public.plan_compartido_conmigo(uuid) to authenticated;

-- El select del plan se amplía; el update y el delete NO.
drop policy if exists planes_clase_select on public.planes_clase;
create policy planes_clase_select on public.planes_clase
    for select using (
        profesor_id = auth.uid()
        or (select mp.is_admin from public.my_profile() mp)
        or compartido_todos
        or public.plan_compartido_conmigo(id)
    );

-- Los renglones se amplían solos: su política cuelga del select del plan.

drop policy if exists plan_compartidos_select on public.plan_compartidos;
create policy plan_compartidos_select on public.plan_compartidos
    for select using (
        profesor_id = auth.uid()
        or public.soy_dueno_del_plan(plan_id)
    );

drop policy if exists plan_compartidos_insert on public.plan_compartidos;
create policy plan_compartidos_insert on public.plan_compartidos
    for insert with check (public.soy_dueno_del_plan(plan_id));

drop policy if exists plan_compartidos_delete on public.plan_compartidos;
create policy plan_compartidos_delete on public.plan_compartidos
    for delete using (public.soy_dueno_del_plan(plan_id));

-- No hay política de update: una fila de "compartido" se pone o se quita.

revoke all on table public.plan_compartidos from anon;
grant select, insert, delete on table public.plan_compartidos to authenticated;