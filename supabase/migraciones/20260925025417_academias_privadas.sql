-- Las academias son privadas: nadie ve nada de la gente de otra academia.
-- La única excepción es Juegos (el canal de presencia y el reto), que es
-- global a propósito para poder retar a cualquiera.
--
-- Lo que se ve por una relación DIRECTA (mi alumno, mi profesor, lo que
-- coordino o superviso) ya estaba acotado. Lo que se escapaba eran las vías
-- LATERALES, que no pasan por esa relación:
--   · compañeros: el alumno de un profesor que está en dos academias veía a
--     los alumnos de la otra (profiles_select y es_companero()).
--   · equipo_docente(): todo profesor recibía nombre y correo de TODOS los
--     profesores, de todas las academias.
--   · coordinadores_disponibles(): igual, con los coordinadores.
--   · planes de clase «para todo el equipo docente»: los veían los profesores
--     de todas las academias.
--   · compartir un plan o un formulario: se podía con alguien de otra academia.
--   · puzzle_rush_scores: cualquier cuenta leía la racha de todas.
--
-- La regla es UNA: interno.comparten_academia(a, b). Dos personas comparten
-- academia si están en una misma (como miembro o como su supervisor), o si
-- ninguna de las dos es de ninguna (la gente que maneja directamente Ajedrez
-- Integral también es un grupo aparte). Quien administra comparte con todos.

-- Las academias de una persona: donde es miembro y la que supervisa.
create or replace function interno.academias_de(p_persona uuid)
returns setof uuid
language sql stable security definer
set search_path = public
set row_security = off
as $$
  select m.academia_id from public.academia_miembros m where m.persona_id = p_persona
  union
  select a.id from public.academias a where a.supervisor_id = p_persona;
$$;
revoke execute on function interno.academias_de(uuid) from public, anon;
grant execute on function interno.academias_de(uuid) to authenticated, service_role;

create or replace function interno.comparten_academia(p_a uuid, p_b uuid)
returns boolean
language sql stable security definer
set search_path = public
set row_security = off
as $$
  select case
    when p_a is null or p_b is null then false
    when p_a = p_b then true
    when exists (select 1 from public.profiles x
                  where x.id in (p_a, p_b) and coalesce(x.is_admin, false)) then true
    else exists (select 1 from interno.academias_de(p_a) x(id)
                  where x.id in (select interno.academias_de(p_b)))
      or (not exists (select 1 from interno.academias_de(p_a))
          and not exists (select 1 from interno.academias_de(p_b)))
  end;
$$;
revoke execute on function interno.comparten_academia(uuid, uuid) from public, anon;
grant execute on function interno.comparten_academia(uuid, uuid) to authenticated, service_role;

-- El mismo permiso como CONJUNTO, para las políticas (ver «La RLS de las tablas
-- de actividad arma el conjunto UNA vez»): la gente con la que comparto
-- academia. Es el inverso exacto de comparten_academia(auth.uid(), x); si se
-- cambia una, se cambian las DOS.
create or replace function interno.gente_de_mis_academias()
returns setof uuid
language sql stable security definer
set search_path = public
set row_security = off
as $$
  with mias as (select interno.academias_de(auth.uid()) as id),
       con_academia as (
         select m.persona_id as id from public.academia_miembros m
         union
         select a.supervisor_id from public.academias a where a.supervisor_id is not null)
  -- Quien administra: todo el mundo.
  select p.id from public.profiles p
   where coalesce((select x.is_admin from public.profiles x where x.id = auth.uid()), false)
  union
  -- Quien administra se ve siempre.
  select p.id from public.profiles p where coalesce(p.is_admin, false)
  union
  select auth.uid() where auth.uid() is not null
  union
  -- La gente de mis academias.
  select m.persona_id from public.academia_miembros m
   where m.academia_id in (select id from mias)
  union
  select a.supervisor_id from public.academias a
   where a.id in (select id from mias) and a.supervisor_id is not null
  union
  -- Sin academia: los que tampoco tienen ninguna.
  select p.id from public.profiles p
   where auth.uid() is not null
     and not exists (select 1 from mias)
     and p.id not in (select id from con_academia);
$$;
revoke execute on function interno.gente_de_mis_academias() from public, anon;
grant execute on function interno.gente_de_mis_academias() to authenticated, service_role;

-- Compañeros: solo los de mi academia.
alter policy profiles_select on public.profiles using (
  ((select auth.uid()) = id)
  or (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id))
  or id in (select interno.alumnos_de((select auth.uid())))
  or id in (select interno.profesores_de((select auth.uid())))
  or (id in (select a from interno.profesores_de((select auth.uid())) pr
               cross join lateral interno.alumnos_de(pr) a)
      and id in (select interno.gente_de_mis_academias()))
  or id in (select interno.bajo_mi_coordinacion_conjunto()));

create or replace function public.es_companero(p_otro uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select pr from interno.profesores_de(auth.uid()) pr
    intersect
    select pr from interno.profesores_de(p_otro) pr
  ) and interno.comparten_academia(auth.uid(), p_otro);
$$;

-- El equipo docente que se le ofrece a un profesor: el de su academia.
create or replace function public.equipo_docente()
returns table(id uuid, nombre text, email text, es_admin boolean)
language sql stable security definer
set search_path = public
as $$
    select p.id,
           coalesce(nullif(trim(p.full_name), ''), p.email) as nombre,
           p.email,
           coalesce(p.is_admin, false) as es_admin
    from public.profiles p
    where (p.role = 'profesor' or coalesce(p.is_admin, false))
      and p.id <> auth.uid()
      and p.id in (select interno.gente_de_mis_academias())
      and exists (
          select 1 from public.profiles yo
          where yo.id = auth.uid()
            and (yo.role = 'profesor' or coalesce(yo.is_admin, false))
      )
    order by nombre;
$$;

create or replace function public.coordinadores_disponibles()
returns table(id uuid, nombre text, email text)
language sql stable security definer
set search_path = public
as $$
    select p.id,
           coalesce(nullif(trim(p.full_name), ''), p.email) as nombre,
           p.email
    from public.profiles p
    where (coalesce(p.es_coordinador, false) or coalesce(p.is_admin, false))
      and p.id <> auth.uid()
      and p.id in (select interno.gente_de_mis_academias())
      and public.soy_coordinador()
    order by nombre;
$$;

-- Planes de clase compartidos: solo entre gente de la misma academia, tanto
-- «con todo el equipo» como con un profesor nombrado.
alter policy planes_clase_select on public.planes_clase using (
  (profesor_id = (select auth.uid()))
  or (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id))
  or (profesor_id in (select interno.gente_de_mis_academias())
      and ((compartido_todos
            and (select (mp.role = 'profesor' or mp.is_admin)
                   from public.my_profile() mp(role, is_admin, teacher_id)))
           or plan_compartido_conmigo(id))));

create or replace function public.planes_compartidos_conmigo()
returns table(id uuid, profesor_id uuid, autor text, titulo text, notas text,
              compartido_todos boolean, created_at timestamptz, updated_at timestamptz)
language sql stable security definer
set search_path = public
as $$
    select p.id,
           p.profesor_id,
           coalesce(nullif(trim(a.full_name), ''), a.email) as autor,
           p.titulo,
           p.notas,
           p.compartido_todos,
           p.created_at,
           p.updated_at
    from public.planes_clase p
    join public.profiles a on a.id = p.profesor_id
    where p.profesor_id <> auth.uid()
      and public.es_del_equipo_docente(auth.uid())
      and p.profesor_id in (select interno.gente_de_mis_academias())
      and (
          p.compartido_todos
          or exists (
              select 1 from public.plan_compartidos c
              where c.plan_id = p.id and c.profesor_id = auth.uid()
          )
      )
    order by p.updated_at desc;
$$;

alter policy plan_compartidos_insert on public.plan_compartidos with check (
  soy_dueno_del_plan(plan_id)
  and es_del_equipo_docente(profesor_id)
  and interno.comparten_academia((select auth.uid()), profesor_id));

alter policy formulario_compartidos_insert on public.formulario_compartidos with check (
  soy_dueno_del_formulario(formulario_id)
  and es_coordinador_de(coordinador_id)
  and interno.comparten_academia((select auth.uid()), coordinador_id));

-- La racha táctica: solo la de la gente que uno ya puede ver. El subselect
-- sobre profiles pasa por SU política, así que es la misma regla de arriba.
alter policy puzzle_rush_scores_select_authenticated on public.puzzle_rush_scores using (
  student_id in (select p.id from public.profiles p));
