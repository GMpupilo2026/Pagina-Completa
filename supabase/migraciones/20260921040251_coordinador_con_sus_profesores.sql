-- A quién coordina cada coordinador.
--
-- Hasta ahora `soy_coordinador()` contestaba una sola pregunta —"¿coordina o
-- administra?"— y con eso se abría TODO: los cobros de la Academia entera, las
-- inscripciones, los formularios. Con una academia de miles de alumnos eso no
-- es coordinar, es administrar; y quien coordina un colegio no tiene por qué
-- ver las mensualidades de otro.
--
-- Lo que faltaba era el ALCANCE, y se arma como todo lo demás acá: una tabla
-- puente que solo escribe quien administra, y una función que contesta la
-- pregunta. `soy_coordinador()` sigue diciendo QUIÉN puede entrar a una
-- pantalla; `bajo_mi_coordinacion()` dice SOBRE QUIÉN.
--
-- Igual que `profile_teachers` y `equipos`, esta tabla NO tiene política de
-- insert/update/delete: darse a sí mismo un profesor sería darse sus alumnos.
create table if not exists public.coordinador_profesores (
  coordinador_id uuid not null references public.profiles(id) on delete cascade,
  profesor_id    uuid not null references public.profiles(id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (coordinador_id, profesor_id),
  constraint coordinador_profesores_distintos check (coordinador_id <> profesor_id)
);

create index if not exists coordinador_profesores_por_profesor
  on public.coordinador_profesores (profesor_id);

alter table public.coordinador_profesores enable row level security;

-- Se lee para pintar el panel; escribirla es cosa de quien administra, y eso
-- pasa por `set_profesores_del_coordinador()`.
create policy coordinador_profesores_select on public.coordinador_profesores for select
  using (coordinador_id = auth.uid()
         or profesor_id = auth.uid()
         or (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id)));

revoke all on public.coordinador_profesores from anon;

-- Los profesores de un coordinador.
create or replace function public.profesores_del_coordinador(p_coordinador uuid)
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select profesor_id from public.coordinador_profesores where coordinador_id = p_coordinador;
$$;

/* ¿Esta persona está bajo MI coordinación?
 *
 * Es la única fuente del alcance, como `profesores_de()` lo es de "quién es
 * profesor de quién": al escribir una política o una función nueva de
 * coordinación se pregunta acá, nunca por la tabla.
 *
 * Quien administra da true siempre —la cuenta master ve todo, esa es su razón
 * de ser—. Quien coordina alcanza a tres clases de gente, y las tres hacen
 * falta: sus profesores, los alumnos de sus profesores, y sus propios alumnos
 * (coordinar no quita dar clase).
 */
create or replace function public.bajo_mi_coordinacion(p_persona uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when p_persona is null then false
    when coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false) then true
    when not coalesce((select p.es_coordinador from public.profiles p where p.id = auth.uid()), false) then false
    else exists (
      select 1 from public.coordinador_profesores cp
       where cp.coordinador_id = auth.uid() and cp.profesor_id = p_persona
      union all
      select 1 from public.coordinador_profesores cp
       cross join lateral public.alumnos_de(cp.profesor_id) a
       where cp.coordinador_id = auth.uid() and a = p_persona
      union all
      select 1 where public.soy_profesor_de(p_persona)
      union all
      select 1 where p_persona = auth.uid()
    )
  end;
$$;

-- Toda la gente que alcanzo coordinando: para las listas, que no pueden
-- preguntar una por una.
create or replace function public.gente_de_mi_coordinacion()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id from public.profiles p
  where coalesce((select x.is_admin from public.profiles x where x.id = auth.uid()), false)
  union
  select cp.profesor_id from public.coordinador_profesores cp where cp.coordinador_id = auth.uid()
  union
  select a from public.coordinador_profesores cp
    cross join lateral public.alumnos_de(cp.profesor_id) a
   where cp.coordinador_id = auth.uid()
  union
  select public.alumnos_de(auth.uid());
$$;

revoke execute on function public.profesores_del_coordinador(uuid) from anon;
revoke execute on function public.bajo_mi_coordinacion(uuid) from anon;
revoke execute on function public.gente_de_mi_coordinacion() from anon;

-- Quien coordina ve las cuentas de su gente. Antes solo veía a sus propios
-- alumnos: los profesores que coordina no le aparecían ni por nombre, así que
-- no podía ni saber a quién estaba coordinando.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (auth.uid() = id
         or (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id))
         or public.soy_profesor_de(id)
         or public.es_mi_profesor(id)
         or public.es_companero(id)
         or public.bajo_mi_coordinacion(id));

-- Quien administra ata y desata. Se manda la lista COMPLETA: lo que no esté,
-- se quita — la misma forma de `set_teachers` y de `equipo_set_alumnos`, para
-- que no haya dos maneras de decir lo mismo.
create or replace function public.set_profesores_del_coordinador(
  p_coordinador uuid, p_profesores uuid[]
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  n integer;
begin
  if not coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false) then
    raise exception 'Solo quien administra reparte la coordinación';
  end if;
  if not coalesce((select p.es_coordinador from public.profiles p where p.id = p_coordinador), false) then
    raise exception 'Esa cuenta no coordina: márcala como coordinadora primero';
  end if;
  -- Solo profesores, y nunca a sí mismo (lo impide además el CHECK).
  if exists (select 1 from unnest(coalesce(p_profesores, '{}')) x
             where x = p_coordinador
                or not exists (select 1 from public.profiles p
                               where p.id = x and (p.role = 'profesor' or p.is_admin))) then
    raise exception 'La lista tiene a alguien que no es profesor, o a la propia coordinadora';
  end if;

  delete from public.coordinador_profesores
   where coordinador_id = p_coordinador
     and profesor_id <> all (coalesce(p_profesores, '{}'));

  insert into public.coordinador_profesores (coordinador_id, profesor_id)
  select p_coordinador, x from unnest(coalesce(p_profesores, '{}')) x
  on conflict do nothing;

  select count(*) into n from public.coordinador_profesores where coordinador_id = p_coordinador;
  return n;
end;
$$;

revoke execute on function public.set_profesores_del_coordinador(uuid, uuid[]) from public;
grant execute on function public.set_profesores_del_coordinador(uuid, uuid[]) to authenticated;