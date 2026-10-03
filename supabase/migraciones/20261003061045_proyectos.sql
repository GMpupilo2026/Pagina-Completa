-- Proyectos (admin.html#proyectos): un programa de clases armado de antemano
-- para varios grupos, como Campeones Colegiales 2026. Cada grupo trae su guía,
-- su calendario de sesiones (cada una con su plan de clase listo para la
-- clase en vivo) y sus tareas semanales listas para mandar.
--
-- QUIÉN VE: quien administra, todo; el profesor al que se le asignó un grupo,
-- ese grupo, su proyecto, sus sesiones y sus tareas. Nadie más.
--
-- QUIÉN ESCRIBE: nadie desde el navegador. El contenido lo siembra
-- herramientas/proyecto-campeones.js (como los planes de arranque) y la
-- asignación la hace asignar_grupo_proyecto(), que valida que quien llama
-- administre, que la cuenta sea de un profesor, y comparte con él los planes
-- de las sesiones (plan_compartidos): así le aparecen en la clase en vivo y en
-- planes.html sin copiarlos. Asignar reparte acceso a material, así que
-- proyecto_grupos queda anotado en la bitácora de auditoría.
--
-- Ver «Los proyectos» en docs/decisiones/paneles.md.

create table public.proyectos (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  nombre text not null check (char_length(btrim(nombre)) between 3 and 120),
  descripcion text not null default '' check (char_length(descripcion) <= 2000),
  periodo text not null default '' check (char_length(periodo) <= 120),
  created_at timestamptz not null default now()
);
comment on table public.proyectos is
  'Programas de clases armados de antemano (admin.html#proyectos). Los siembra un script; no se escriben desde el navegador.';

create table public.proyecto_grupos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9-]{2,60}$'),
  nombre text not null check (char_length(btrim(nombre)) between 2 and 120),
  nivel text not null check (nivel in ('inicial', 'intermedio', 'avanzado')),
  horario text not null default '' check (char_length(horario) <= 200),
  orden integer not null default 0,
  guia jsonb not null default '{}'::jsonb
    check (jsonb_typeof(guia) = 'object' and pg_column_size(guia) <= 300000),
  profesor_id uuid references public.profiles(id) on delete set null,
  asignado_at timestamptz,
  asignado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (proyecto_id, slug)
);
comment on table public.proyecto_grupos is
  'Los grupos de un proyecto. profesor_id lo escribe solo asignar_grupo_proyecto() (administración).';
create index proyecto_grupos_profesor_idx on public.proyecto_grupos (profesor_id);
create index proyecto_grupos_asignado_por_idx on public.proyecto_grupos (asignado_por);

create table public.proyecto_sesiones (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.proyecto_grupos(id) on delete cascade,
  numero integer not null check (numero between 1 and 200),
  fecha date not null,
  titulo text not null check (char_length(btrim(titulo)) between 2 and 200),
  tipo text not null check (tipo in ('clase', 'especial', 'evaluacion')),
  detalle jsonb not null default '{}'::jsonb
    check (jsonb_typeof(detalle) = 'object' and pg_column_size(detalle) <= 60000),
  plan_id uuid references public.planes_clase(id) on delete set null,
  unique (grupo_id, numero)
);
comment on table public.proyecto_sesiones is
  'El calendario de un grupo: cada sesión con su guía (detalle) y su plan de clase para la clase en vivo.';
create index proyecto_sesiones_plan_idx on public.proyecto_sesiones (plan_id);

create table public.proyecto_tareas (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.proyecto_grupos(id) on delete cascade,
  semana integer not null check (semana between 1 and 60),
  desde date not null,
  vence date not null,
  titulo text not null check (char_length(btrim(titulo)) between 2 and 200),
  instrucciones text not null default '' check (char_length(instrucciones) <= 2000),
  -- Los renglones, con la misma forma que recibe crear_tarea(): el profesor
  -- los manda tal cual, y cada uno se llena solo con lo que el alumno entrena.
  items jsonb not null
    check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 20),
  check (vence > desde),
  unique (grupo_id, semana)
);
comment on table public.proyecto_tareas is
  'Tareas semanales de un grupo, listas para que el profesor las mande con crear_tarea().';

-- ------------------------------------------------------------------ la RLS
alter table public.proyectos enable row level security;
alter table public.proyecto_grupos enable row level security;
alter table public.proyecto_sesiones enable row level security;
alter table public.proyecto_tareas enable row level security;

revoke all on public.proyectos, public.proyecto_grupos, public.proyecto_sesiones, public.proyecto_tareas
  from public, anon, authenticated;
grant select on public.proyectos, public.proyecto_grupos, public.proyecto_sesiones, public.proyecto_tareas
  to authenticated;

create policy proyecto_grupos_ver on public.proyecto_grupos
  for select to authenticated
  using (profesor_id = (select auth.uid()) or (select public.soy_admin()));

-- Las demás cuelgan de la de los grupos: lo que no se ve de un grupo no se ve
-- de su proyecto, sus sesiones ni sus tareas. Ninguna mira a otra que la mire
-- a ella, así que no hay recursión.
create policy proyectos_ver on public.proyectos
  for select to authenticated
  using ((select public.soy_admin())
         or id in (select g.proyecto_id from public.proyecto_grupos g
                    where g.profesor_id = (select auth.uid())));

create policy proyecto_sesiones_ver on public.proyecto_sesiones
  for select to authenticated
  using ((select public.soy_admin())
         or grupo_id in (select g.id from public.proyecto_grupos g
                          where g.profesor_id = (select auth.uid())));

create policy proyecto_tareas_ver on public.proyecto_tareas
  for select to authenticated
  using ((select public.soy_admin())
         or grupo_id in (select g.id from public.proyecto_grupos g
                          where g.profesor_id = (select auth.uid())));

-- --------------------------------------------------------------- asignar
-- Asigna (o quita, con p_profesor null) el profesor de un grupo y le comparte
-- los planes de sus sesiones; al anterior se los deja de compartir. Devuelve
-- cómo quedó, leído de la tabla y no de lo que se pidió.
create or replace function public.asignar_grupo_proyecto(p_grupo uuid, p_profesor uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_anterior uuid;
  v_quedo uuid;
begin
  if not coalesce((select public.soy_admin()), false) then
    raise exception 'Solo quien administra asigna los grupos de un proyecto.' using errcode = '42501';
  end if;
  select profesor_id into v_anterior from public.proyecto_grupos where id = p_grupo for update;
  if not found then
    raise exception 'Ese grupo no existe.' using errcode = '22023';
  end if;
  if p_profesor is not null
     and not exists (select 1 from public.profiles where id = p_profesor and role = 'profesor') then
    raise exception 'Esa cuenta no es de un profesor.' using errcode = '22023';
  end if;

  update public.proyecto_grupos
     set profesor_id = p_profesor, asignado_at = now(), asignado_por = auth.uid()
   where id = p_grupo;

  if v_anterior is not null and v_anterior is distinct from p_profesor then
    delete from public.plan_compartidos c
     using public.proyecto_sesiones s
     where s.grupo_id = p_grupo and c.plan_id = s.plan_id and c.profesor_id = v_anterior;
  end if;
  if p_profesor is not null then
    insert into public.plan_compartidos (plan_id, profesor_id)
    select distinct s.plan_id, p_profesor
      from public.proyecto_sesiones s
     where s.grupo_id = p_grupo and s.plan_id is not null
    on conflict do nothing;
  end if;

  select profesor_id into v_quedo from public.proyecto_grupos where id = p_grupo;
  return v_quedo;
end;
$function$;
revoke execute on function public.asignar_grupo_proyecto(uuid, uuid) from public, anon;
grant execute on function public.asignar_grupo_proyecto(uuid, uuid) to authenticated;

-- Asignar reparte acceso a material: queda en la bitácora. Solo las columnas
-- de la asignación: la guía es contenido, y volver a sembrarla llenaría la
-- bitácora de copias de un JSON que no reparte nada.
create trigger auditar after insert or update or delete on public.proyecto_grupos
  for each row execute function interno.auditar('profesor_id', 'asignado_por', 'nombre');
