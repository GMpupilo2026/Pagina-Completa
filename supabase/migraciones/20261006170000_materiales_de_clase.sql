-- Materiales de clase: administración elige con quién comparte cada material
-- (hoy, el libro «Ponte a prueba»). Ver «Los materiales de clase» en
-- docs/decisiones/cursos-y-material.md.
--
-- Con quién se comparte lo decide la BASE, no la pantalla:
--   - puede_bajar() —la que pregunta el worker antes de servir algo de
--     material/<producto>/— suma «se lo compartieron»;
--   - los cuestionarios listos que salen de un material (sus versiones) solo
--     los leen los profesores que pueden bajar ese material.
--
-- Se comparte con una persona, con una academia entera (sus miembros y quien
-- la supervisa) o con todos los profesores. Reparte accesos, así que lleva su
-- bitácora (interno.auditar).

create table if not exists public.material_compartido (
  id uuid primary key default gen_random_uuid(),
  producto text not null check (producto ~ '^[a-z0-9-]{2,60}$'),
  persona_id uuid references public.profiles(id) on delete cascade,
  academia_id uuid references public.academias(id) on delete cascade,
  todos_profesores boolean not null default false,
  otorgado_por uuid references public.profiles(id) on delete set null,
  creado_en timestamptz not null default now(),
  -- Una sola cosa por fila: una persona, una academia o «todos los profesores».
  constraint material_compartido_un_destino
    check (num_nonnulls(persona_id, academia_id) + (case when todos_profesores then 1 else 0 end) = 1)
);

-- Lo que no puede pasar dos veces lo garantiza un índice, no un if.
create unique index if not exists material_compartido_persona_unica
  on public.material_compartido (producto, persona_id) where persona_id is not null;
create unique index if not exists material_compartido_academia_unica
  on public.material_compartido (producto, academia_id) where academia_id is not null;
create unique index if not exists material_compartido_todos_unico
  on public.material_compartido (producto) where todos_profesores;
create index if not exists material_compartido_persona_idx on public.material_compartido (persona_id);
create index if not exists material_compartido_academia_idx on public.material_compartido (academia_id);
create index if not exists material_compartido_otorgado_idx on public.material_compartido (otorgado_por);

alter table public.material_compartido enable row level security;

-- La lista la ve administración. Cada persona no necesita leerla: le basta
-- con que puede_bajar() le conteste.
drop policy if exists material_compartido_select on public.material_compartido;
create policy material_compartido_select on public.material_compartido for select to authenticated
  using ((select public.soy_admin()));

revoke all on public.material_compartido from anon, authenticated;
grant select on public.material_compartido to authenticated;

drop trigger if exists auditar on public.material_compartido;
create trigger auditar after insert or update or delete on public.material_compartido
  for each row execute function interno.auditar('producto', 'persona_id', 'academia_id', 'todos_profesores');

-- ¿Me compartieron este material? Pregunta solo por quien llama.
create or replace function interno.material_compartido_conmigo(p_producto text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.material_compartido m
    where m.producto = p_producto
      and (
        m.persona_id = (select auth.uid())
        or (m.academia_id is not null and (
              exists (select 1 from public.academia_miembros am
                       where am.academia_id = m.academia_id and am.persona_id = (select auth.uid()))
              or exists (select 1 from public.academias a
                          where a.id = m.academia_id and a.supervisor_id = (select auth.uid()))))
        or (m.todos_profesores and exists (select 1 from public.profiles p
                                            where p.id = (select auth.uid()) and p.role = 'profesor'))
      )
  );
$$;
revoke execute on function interno.material_compartido_conmigo(text) from public, anon;
grant execute on function interno.material_compartido_conmigo(text) to authenticated;

-- El candado de material/<producto>/ suma «me lo compartieron».
create or replace function public.puede_bajar(p_producto text, p_basta_acceso boolean default false)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(public.soy_admin(), false)
      or (coalesce(p_basta_acceso, false) and coalesce(public.acceso_vigente(), false))
      or exists (select 1 from public.compras_tienda c
                  where c.profile_id = (select auth.uid()) and c.producto = p_producto)
      or coalesce(interno.material_compartido_conmigo(p_producto), false);
$$;
revoke execute on function public.puede_bajar(text, boolean) from public, anon;
grant execute on function public.puede_bajar(text, boolean) to authenticated;

-- Compartir o dejar de compartir. Una de las tres: p_persona, p_academia o
-- p_todos. Solo administración.
create or replace function public.material_compartir(
  p_producto text,
  p_persona uuid default null,
  p_academia uuid default null,
  p_todos boolean default false,
  p_compartir boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.soy_admin(), false) then
    raise exception 'Solo administración comparte los materiales.' using errcode = '42501';
  end if;
  if p_producto is null or p_producto !~ '^[a-z0-9-]{2,60}$' then
    raise exception 'Ese material no existe.' using errcode = '22023';
  end if;
  if num_nonnulls(p_persona, p_academia) + (case when coalesce(p_todos, false) then 1 else 0 end) <> 1 then
    raise exception 'Elige con quién: una persona, una academia o todos los profesores.' using errcode = '22023';
  end if;
  if p_persona is not null and not exists (select 1 from public.profiles where id = p_persona) then
    raise exception 'No se encontró esa cuenta.' using errcode = 'P0002';
  end if;
  if p_academia is not null and not exists (select 1 from public.academias where id = p_academia) then
    raise exception 'No se encontró esa academia.' using errcode = 'P0002';
  end if;

  if coalesce(p_compartir, true) then
    insert into public.material_compartido (producto, persona_id, academia_id, todos_profesores, otorgado_por)
    values (p_producto, p_persona, p_academia, coalesce(p_todos, false), (select auth.uid()))
    on conflict do nothing;
  else
    delete from public.material_compartido m
    where m.producto = p_producto
      and m.persona_id is not distinct from p_persona
      and m.academia_id is not distinct from p_academia
      and m.todos_profesores = coalesce(p_todos, false);
  end if;
end;
$$;
revoke execute on function public.material_compartir(text, uuid, uuid, boolean, boolean) from public, anon;
grant execute on function public.material_compartir(text, uuid, uuid, boolean, boolean) to authenticated;

-- Los cuestionarios que salen de un material: listos (sin dueño), pero
-- solo para quien puede bajar ese material.
alter table public.cuestionarios add column if not exists material text
  check (material is null or material ~ '^[a-z0-9-]{2,60}$');
alter table public.cuestionarios drop constraint if exists cuestionarios_material_solo_listos;
alter table public.cuestionarios add constraint cuestionarios_material_solo_listos
  check (material is null or listo);

drop policy if exists cuestionarios_select on public.cuestionarios;
create policy cuestionarios_select on public.cuestionarios for select to authenticated
  using (
    profesor_id = (select auth.uid())
    or (listo
        and coalesce((select (mp.role = 'profesor') or mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id)), false)
        and (material is null or public.puede_bajar(material)))
  );
