-- Lo que se dio del plan en UNA clase. El plan (planes_clase / plan_items) es
-- lo que se preparó; esto es lo que el profe marca, en la clase, como ya
-- dado. Es un hecho que él afirma —no se puede deducir de otras filas—, así
-- que se guarda. Va aparte del plan: el mismo plan se da en varias clases, y
-- en cada una se llega hasta donde se llega.
create table if not exists public.clase_plan_hecho (
  class_session_id uuid not null references public.class_sessions(id) on delete cascade,
  plan_item_id uuid not null references public.plan_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (class_session_id, plan_item_id)
);
create index if not exists clase_plan_hecho_item_idx on public.clase_plan_hecho (plan_item_id);
alter table public.clase_plan_hecho enable row level security;
revoke all on public.clase_plan_hecho from anon;

-- Solo quien dio la clase, y solo sobre renglones de un plan que puede leer
-- (el suyo o uno compartido con él: la RLS de plan_items decide).
drop policy if exists clase_plan_hecho_de_quien_da_la_clase on public.clase_plan_hecho;
create policy clase_plan_hecho_de_quien_da_la_clase on public.clase_plan_hecho for all to authenticated
  using (exists (select 1 from public.class_sessions cs
                  where cs.id = class_session_id and cs.created_by = (select auth.uid())))
  with check (exists (select 1 from public.class_sessions cs
                       where cs.id = class_session_id and cs.created_by = (select auth.uid()))
              and exists (select 1 from public.plan_items pi where pi.id = plan_item_id));