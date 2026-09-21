-- El plan de clase: preparar la clase ANTES de darla.
--
-- Hasta ahora sesion.html se armaba sobre la marcha, con la clase mirando:
-- el editor de posición, el PDF, la lección de curso, Táctica y los archivos
-- PGN son todos potentes, pero hay que ir a buscarlos en vivo. Un plan es una
-- lista ordenada de lo que se va a enseñar, escrita el día antes.
--
-- Lo que de verdad compra es REUSARLO: el mismo plan sirve para el grupo de la
-- mañana y el de la tarde, y ahí es donde una clase suelta se vuelve un
-- programa. Por eso el plan NO está atado a una clase ni a un grupo.

create table public.planes_clase (
    id          uuid primary key default gen_random_uuid(),
    profesor_id uuid not null references public.profiles(id) on delete cascade,
    titulo      text not null check (length(btrim(titulo)) between 1 and 200),
    notas       text check (notas is null or length(notas) <= 4000),
    created_at  timestamptz not null default now(),
    updated_at  timestamptz
);

comment on table public.planes_clase is
    'Un plan de clase del profesor: la lista ordenada de lo que va a enseñar. No está atado a una clase ni a un grupo, a propósito: el mismo plan se vuelve a dar con otro grupo.';

-- Un renglón del plan. Tres tipos, y cada uno usa una puerta que la clase en
-- vivo YA tiene:
--   posicion -> aplicarPosicionEnClase(), la misma que el editor y Táctica;
--   leccion  -> abrirLeccionLocal(), que la abre solo en su pantalla;
--   nota     -> no toca el tablero; es la chuleta del profesor.
create table public.plan_items (
    id         uuid primary key default gen_random_uuid(),
    plan_id    uuid not null references public.planes_clase(id) on delete cascade,
    orden      integer not null default 0,
    tipo       text not null check (tipo in ('posicion', 'nota', 'leccion')),
    titulo     text not null check (length(btrim(titulo)) between 1 and 200),
    fen        text check (fen is null or length(fen) <= 120),
    pregunta   text check (pregunta is null or length(pregunta) <= 500),
    curso      text check (curso is null or length(curso) <= 120),
    leccion    integer,
    nota       text check (nota is null or length(nota) <= 2000),
    created_at timestamptz not null default now(),

    -- Un renglón que no trae lo que su tipo necesita NO da ningún error: el
    -- botón simplemente no hace nada, en medio de la clase y delante de todos.
    constraint plan_items_coherente check (
        (tipo = 'posicion' and fen is not null)
        or (tipo = 'leccion' and curso is not null and leccion is not null)
        or (tipo = 'nota')
    )
);

comment on column public.plan_items.pregunta is
    'Si está, el renglón además ofrece "Preguntar": la misma pregunta que el profesor ya escribió, en vez de teclearla en vivo.';

create index plan_items_plan_idx on public.plan_items (plan_id, orden);
create index planes_clase_profesor_idx on public.planes_clase (profesor_id, updated_at desc nulls last, created_at desc);

-- El plan no cambia de dueño ni de fecha de nacimiento, y updated_at lo pone
-- el reloj del servidor. Mismo patrón que proteger_notas_alumno().
create or replace function public.proteger_planes_clase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    new.profesor_id := old.profesor_id;
    new.created_at  := old.created_at;
    new.updated_at  := now();
    return new;
end;
$$;

create trigger planes_clase_proteger
    before update on public.planes_clase
    for each row execute function public.proteger_planes_clase();

alter table public.planes_clase enable row level security;
alter table public.plan_items   enable row level security;

-- El plan es del profesor que lo escribió. Quien administra ve todos, como en
-- `tareas`; el material de un colega no es de nadie más.
create policy planes_clase_select on public.planes_clase for select
    using (
        profesor_id = auth.uid()
        or (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id))
    );

-- Firmar un plan con el nombre de otro no se puede, ni administrando.
create policy planes_clase_insert on public.planes_clase for insert
    with check (
        profesor_id = auth.uid()
        and (
            (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id))
            or (select mp.role from public.my_profile() mp(role, is_admin, teacher_id)) = 'profesor'
        )
    );

create policy planes_clase_update on public.planes_clase for update
    using (profesor_id = auth.uid()) with check (profesor_id = auth.uid());

create policy planes_clase_delete on public.planes_clase for delete
    using (profesor_id = auth.uid());

-- Los renglones cuelgan del plan: quien puede el plan, puede sus renglones.
create policy plan_items_select on public.plan_items for select
    using (exists (select 1 from public.planes_clase p where p.id = plan_items.plan_id));

create policy plan_items_insert on public.plan_items for insert
    with check (exists (select 1 from public.planes_clase p
                        where p.id = plan_items.plan_id and p.profesor_id = auth.uid()));

create policy plan_items_update on public.plan_items for update
    using (exists (select 1 from public.planes_clase p
                   where p.id = plan_items.plan_id and p.profesor_id = auth.uid()))
    with check (exists (select 1 from public.planes_clase p
                        where p.id = plan_items.plan_id and p.profesor_id = auth.uid()));

create policy plan_items_delete on public.plan_items for delete
    using (exists (select 1 from public.planes_clase p
                   where p.id = plan_items.plan_id and p.profesor_id = auth.uid()));

revoke all on public.planes_clase from anon;
revoke all on public.plan_items   from anon;