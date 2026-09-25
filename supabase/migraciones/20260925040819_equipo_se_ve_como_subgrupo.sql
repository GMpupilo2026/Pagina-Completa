-- Cada entrenador de un equipo tiene, entre sus subgrupos, uno con la gente de
-- ese equipo.
--
-- Un equipo reparte permisos, pero no aparece en ninguna de las pantallas donde
-- el profesor elige «a quiénes»: el filtro de Informes, el selector de Tareas y
-- Exámenes, el «con quiénes» del Horario. Todas miran los subgrupos. Así que al
-- sumar a alguien como entrenador de un equipo se le crea un subgrupo con los
-- alumnos del equipo, y ese subgrupo SIGUE al equipo:
--
--   · entra un alumno al equipo       → entra al subgrupo de cada entrenador
--   · sale un alumno del equipo       → sale de esos subgrupos
--   · se quita a un entrenador        → se borra su subgrupo del equipo
--   · se renombra o se borra el equipo → lo mismo con sus subgrupos
--
-- Es una copia de otras filas, y por eso nadie la escribe a mano: el subgrupo
-- de un equipo no se renombra, no se borra ni se le cambia la gente desde la
-- pantalla (las políticas de abajo exigen `equipo_id is null`). Lo que se quiera
-- cambiar se cambia en el equipo, que es donde viven los permisos. Si el
-- profesor pudiera editarlo, al siguiente cambio del equipo se le desharía lo
-- suyo sin avisar.
--
-- El subgrupo sigue sin dar ni un permiso: lo que da acceso es el equipo, igual
-- que antes. Esto solo lo pone donde el profesor lo busca.

alter table public.subgrupos
  add column if not exists equipo_id uuid references public.equipos(id) on delete cascade;

-- Un solo subgrupo por equipo y profesor: lo garantiza el índice, no un `if`.
create unique index if not exists subgrupos_uno_por_equipo
  on public.subgrupos (profesor_id, equipo_id) where equipo_id is not null;
create index if not exists subgrupos_por_equipo
  on public.subgrupos (equipo_id) where equipo_id is not null;

-- El nombre del equipo, o uno que se le parezca si el profesor ya tiene un
-- subgrupo propio que se llama igual (el índice único es por profesor y sin
-- mayúsculas). Nunca se le cambia el nombre a uno suyo para hacer lugar.
create or replace function interno.nombre_libre_de_subgrupo(p_profesor uuid, p_base text, p_excepto uuid)
returns text
language plpgsql
stable
security definer
set search_path to ''
set row_security to 'off'
as $$
declare
  v_base text := btrim(coalesce(p_base, ''));
  v_nombre text;
  v_n integer := 1;
begin
  if v_base = '' then v_base := 'Equipo'; end if;
  loop
    v_nombre := case
      when v_n = 1 then left(v_base, 60)
      when v_n = 2 then left('Equipo ' || v_base, 60)
      else left('Equipo ' || v_base, 60 - length(' (' || v_n || ')')) || ' (' || v_n || ')'
    end;
    exit when not exists (
      select 1 from public.subgrupos s
       where s.profesor_id = p_profesor
         and lower(btrim(s.nombre)) = lower(btrim(v_nombre))
         and s.id is distinct from p_excepto);
    v_n := v_n + 1;
  end loop;
  return v_nombre;
end;
$$;

revoke execute on function interno.nombre_libre_de_subgrupo(uuid, text, uuid) from public, anon, authenticated;

-- Deja el subgrupo de (equipo, profesor) exactamente como el equipo: lo crea si
-- no está y le pone y le quita gente hasta que coincida.
create or replace function interno.subgrupo_del_equipo_al_dia(p_equipo uuid, p_profesor uuid)
returns void
language plpgsql
volatile
security definer
set search_path to ''
set row_security to 'off'
as $$
declare
  v_sub uuid;
  v_nombre text;
begin
  select s.id into v_sub from public.subgrupos s
   where s.equipo_id = p_equipo and s.profesor_id = p_profesor;

  if v_sub is null then
    select e.nombre into v_nombre from public.equipos e where e.id = p_equipo;
    if not found then return; end if;
    insert into public.subgrupos (profesor_id, nombre, equipo_id)
    values (p_profesor, interno.nombre_libre_de_subgrupo(p_profesor, v_nombre, null), p_equipo)
    returning id into v_sub;
  end if;

  delete from public.subgrupo_alumnos sa
   where sa.subgrupo_id = v_sub
     and not exists (select 1 from public.equipo_alumnos ea
                      where ea.equipo_id = p_equipo and ea.alumno_id = sa.alumno_id);

  insert into public.subgrupo_alumnos (subgrupo_id, alumno_id)
  select v_sub, ea.alumno_id from public.equipo_alumnos ea
   where ea.equipo_id = p_equipo
  on conflict do nothing;
end;
$$;

revoke execute on function interno.subgrupo_del_equipo_al_dia(uuid, uuid) from public, anon, authenticated;

-- ── Los triggers ─────────────────────────────────────────────────────────────

create or replace function public.equipo_entrenador_subgrupo()
returns trigger
language plpgsql
security definer
set search_path to ''
set row_security to 'off'
as $$
begin
  if tg_op = 'INSERT' then
    perform interno.subgrupo_del_equipo_al_dia(new.equipo_id, new.teacher_id);
    return new;
  end if;
  delete from public.subgrupos s
   where s.equipo_id = old.equipo_id and s.profesor_id = old.teacher_id;
  return old;
end;
$$;

revoke execute on function public.equipo_entrenador_subgrupo() from public, anon, authenticated;

drop trigger if exists equipo_entrenadores_subgrupo on public.equipo_entrenadores;
create trigger equipo_entrenadores_subgrupo
  after insert or delete on public.equipo_entrenadores
  for each row execute function public.equipo_entrenador_subgrupo();

create or replace function public.equipo_alumno_subgrupo()
returns trigger
language plpgsql
security definer
set search_path to ''
set row_security to 'off'
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.subgrupo_alumnos (subgrupo_id, alumno_id)
    select s.id, new.alumno_id from public.subgrupos s
     where s.equipo_id = new.equipo_id
    on conflict do nothing;
    return new;
  end if;
  delete from public.subgrupo_alumnos sa
   using public.subgrupos s
   where s.id = sa.subgrupo_id
     and s.equipo_id = old.equipo_id
     and sa.alumno_id = old.alumno_id;
  return old;
end;
$$;

revoke execute on function public.equipo_alumno_subgrupo() from public, anon, authenticated;

drop trigger if exists equipo_alumnos_subgrupo on public.equipo_alumnos;
create trigger equipo_alumnos_subgrupo
  after insert or delete on public.equipo_alumnos
  for each row execute function public.equipo_alumno_subgrupo();

create or replace function public.equipo_renombra_subgrupos()
returns trigger
language plpgsql
security definer
set search_path to ''
set row_security to 'off'
as $$
declare
  r record;
begin
  for r in select s.id, s.profesor_id from public.subgrupos s where s.equipo_id = new.id loop
    update public.subgrupos
       set nombre = interno.nombre_libre_de_subgrupo(r.profesor_id, new.nombre, r.id)
     where id = r.id;
  end loop;
  return new;
end;
$$;

revoke execute on function public.equipo_renombra_subgrupos() from public, anon, authenticated;

drop trigger if exists equipos_renombra_subgrupos on public.equipos;
create trigger equipos_renombra_subgrupos
  after update of nombre on public.equipos
  for each row when (old.nombre is distinct from new.nombre)
  execute function public.equipo_renombra_subgrupos();

-- ── Nadie edita a mano el subgrupo de un equipo ──────────────────────────────
-- Las mismas políticas de antes, con `equipo_id is null`. Los triggers de
-- arriba son SECURITY DEFINER con row_security off: a ellos no les aplica.

drop policy if exists subgrupos_insert on public.subgrupos;
create policy subgrupos_insert on public.subgrupos for insert
  with check (equipo_id is null
              and (((profesor_id = (select auth.uid()))
                    and (select mp.is_admin or mp.role = 'profesor'
                         from public.my_profile() mp(role, is_admin, teacher_id)))
                   or (public.coordinador_puede('subgrupos') and public.bajo_mi_coordinacion(profesor_id))));

drop policy if exists subgrupos_update on public.subgrupos;
create policy subgrupos_update on public.subgrupos for update
  using (equipo_id is null
         and ((profesor_id = (select auth.uid()))
              or (public.coordinador_puede('subgrupos') and public.bajo_mi_coordinacion(profesor_id))))
  with check (equipo_id is null
              and ((profesor_id = (select auth.uid()))
                   or (public.coordinador_puede('subgrupos') and public.bajo_mi_coordinacion(profesor_id))));

drop policy if exists subgrupos_delete on public.subgrupos;
create policy subgrupos_delete on public.subgrupos for delete
  using (equipo_id is null
         and ((profesor_id = (select auth.uid()))
              or (public.coordinador_puede('subgrupos') and public.bajo_mi_coordinacion(profesor_id))));

drop policy if exists subgrupo_alumnos_insert on public.subgrupo_alumnos;
create policy subgrupo_alumnos_insert on public.subgrupo_alumnos for insert
  with check (exists (select 1 from public.subgrupos s
                       where s.id = subgrupo_id and s.equipo_id is null)
              and (public.soy_profesor_de(alumno_id)
                   or (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id))
                   or (public.coordinador_puede('subgrupos') and public.bajo_mi_coordinacion(alumno_id))));

drop policy if exists subgrupo_alumnos_delete on public.subgrupo_alumnos;
create policy subgrupo_alumnos_delete on public.subgrupo_alumnos for delete
  using (exists (select 1 from public.subgrupos s
                  where s.id = subgrupo_id
                    and s.equipo_id is null
                    and ((s.profesor_id = (select auth.uid()))
                         or (public.coordinador_puede('subgrupos') and public.bajo_mi_coordinacion(s.profesor_id)))));

-- ── Las funciones de lectura dicen cuál es de un equipo ──────────────────────
-- Cambia el tipo que devuelven (una columna más al final), así que van con
-- drop. La pantalla de subgrupos la usa para no ofrecer renombrar ni borrar.

drop function if exists public.mis_subgrupos();
create function public.mis_subgrupos()
returns table (id uuid, nombre text, alumnos uuid[], cuantos integer, equipo_id uuid)
language sql
stable
security invoker
set search_path to ''
as $$
  select s.id,
         s.nombre,
         coalesce(array_agg(sa.alumno_id order by sa.created_at)
                  filter (where sa.alumno_id is not null), '{}')::uuid[],
         count(sa.alumno_id)::integer,
         s.equipo_id
  from public.subgrupos s
  left join public.subgrupo_alumnos sa on sa.subgrupo_id = s.id
  where s.profesor_id = (select auth.uid())
  group by s.id, s.nombre, s.equipo_id
  order by s.nombre;
$$;

revoke execute on function public.mis_subgrupos() from public, anon;
grant execute on function public.mis_subgrupos() to authenticated;

drop function if exists public.subgrupos_de(uuid);
create function public.subgrupos_de(p_profesor uuid)
returns table (id uuid, nombre text, alumnos uuid[], cuantos integer, equipo_id uuid)
language sql
stable
security invoker
set search_path to ''
as $$
  select s.id,
         s.nombre,
         coalesce(array_agg(sa.alumno_id order by sa.created_at)
                  filter (where sa.alumno_id is not null), '{}')::uuid[],
         count(sa.alumno_id)::integer,
         s.equipo_id
  from public.subgrupos s
  left join public.subgrupo_alumnos sa on sa.subgrupo_id = s.id
  where s.profesor_id = p_profesor
  group by s.id, s.nombre, s.equipo_id
  order by s.nombre;
$$;

revoke execute on function public.subgrupos_de(uuid) from public, anon;
grant execute on function public.subgrupos_de(uuid) to authenticated;

-- ── Los equipos que ya había ─────────────────────────────────────────────────
select interno.subgrupo_del_equipo_al_dia(ee.equipo_id, ee.teacher_id)
  from public.equipo_entrenadores ee;
