-- El supervisor: una marca encima de "profesor", como es_coordinador. Ve y
-- corrige SOLO las cuentas que quien administra le asignó (y los alumnos de
-- los profesores asignados), y lee toda su actividad para los informes.
alter table public.profiles add column if not exists es_supervisor boolean not null default false;
alter table public.profiles drop constraint if exists profiles_supervisor_es_profesor;
alter table public.profiles add constraint profiles_supervisor_es_profesor
  check (not es_supervisor or role = 'profesor');

create table if not exists public.supervisor_cuentas (
  supervisor_id uuid not null references public.profiles(id) on delete cascade,
  persona_id    uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (supervisor_id, persona_id),
  check (supervisor_id <> persona_id)
);
create index if not exists supervisor_cuentas_persona on public.supervisor_cuentas(persona_id);
alter table public.supervisor_cuentas enable row level security;
revoke all on public.supervisor_cuentas from anon;
revoke insert, update, delete on public.supervisor_cuentas from authenticated;
drop policy if exists supervisor_cuentas_select on public.supervisor_cuentas;
create policy supervisor_cuentas_select on public.supervisor_cuentas for select to authenticated
  using (supervisor_id = auth.uid()
         or coalesce((select mp.is_admin from public.my_profile() mp), false));

create or replace function public.soy_supervisor()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((select p.es_supervisor from public.profiles p where p.id = auth.uid()), false);
$$;

-- ¿Esta persona está a mi cargo como supervisor? Asignada directo, o alumna
-- de un profesor que me asignaron.
create or replace function public.supervisado_por_mi(p_persona uuid)
returns boolean language sql stable security definer set search_path to 'public' set row_security to off as $$
  select p_persona is not null
     and coalesce((select p.es_supervisor from public.profiles p where p.id = auth.uid()), false)
     and exists (
       select 1 from public.supervisor_cuentas sc
        where sc.supervisor_id = auth.uid()
          and (sc.persona_id = p_persona
               or sc.persona_id in (select public.profesores_de(p_persona)))
     );
$$;

create or replace function public.sesion_de_supervisado(p_sesion uuid)
returns boolean language sql stable security definer set search_path to 'public' set row_security to off as $$
  select exists (select 1 from public.class_attendance ca
                  where ca.session_id = p_sesion and public.supervisado_por_mi(ca.student_id))
      or exists (select 1 from public.class_sessions cs
                  where cs.id = p_sesion and public.supervisado_por_mi(cs.created_by));
$$;

create or replace function public.soy_coordinador()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((select p.es_coordinador or p.es_supervisor or p.is_admin
                   from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.bajo_mi_coordinacion(p_persona uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  with yo as (select p.is_admin, p.es_coordinador, p.es_supervisor
                from public.profiles p where p.id = auth.uid())
  select case
    when p_persona is null then false
    when coalesce((select is_admin from yo), false) then true
    else (coalesce((select es_supervisor from yo), false)
          and (p_persona = auth.uid() or public.supervisado_por_mi(p_persona)))
      or (coalesce((select es_coordinador from yo), false) and exists (
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
    ))
  end;
$$;

create or replace function public.gente_de_mi_coordinacion()
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select p.id from public.profiles p
  where coalesce((select x.is_admin from public.profiles x where x.id = auth.uid()), false)
  union
  select cp.profesor_id from public.coordinador_profesores cp where cp.coordinador_id = auth.uid()
  union
  select a from public.coordinador_profesores cp
    cross join lateral public.alumnos_de(cp.profesor_id) a
   where cp.coordinador_id = auth.uid()
  union
  select public.alumnos_de(auth.uid())
  union
  select sc.persona_id from public.supervisor_cuentas sc
   where sc.supervisor_id = auth.uid() and public.soy_supervisor()
  union
  select a from public.supervisor_cuentas sc
    cross join lateral public.alumnos_de(sc.persona_id) a
   where sc.supervisor_id = auth.uid() and public.soy_supervisor();
$$;

create or replace function public.marcar_supervisor(p_persona uuid, p_valor boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
declare quedo boolean;
begin
  if not coalesce((select is_admin from public.profiles where id = auth.uid()), false) then
    raise exception 'Solo la persona administradora nombra supervisores';
  end if;
  if (select role from public.profiles where id = p_persona) is distinct from 'profesor' then
    raise exception 'Supervisar es un añadido al rol de profesor: primero hay que darle ese rol';
  end if;
  perform set_config('ajedrez.nombrando_supervisor', 'si', true);
  update public.profiles set es_supervisor = coalesce(p_valor, false) where id = p_persona;
  perform set_config('ajedrez.nombrando_supervisor', '', true);
  select es_supervisor into quedo from public.profiles where id = p_persona;
  if quedo is distinct from coalesce(p_valor, false) then
    raise exception 'No se pudo guardar la marca de supervisor';
  end if;
end;
$$;

-- Deja la lista EXACTAMENTE como se mandó, igual que set_teachers.
create or replace function public.set_cuentas_del_supervisor(p_supervisor uuid, p_cuentas uuid[])
returns integer language plpgsql security definer set search_path to 'public' as $$
declare n integer;
begin
  if not coalesce((select is_admin from public.profiles where id = auth.uid()), false) then
    raise exception 'Solo quien administra reparte las cuentas de un supervisor';
  end if;
  if not coalesce((select es_supervisor from public.profiles where id = p_supervisor), false) then
    raise exception 'Esa cuenta no supervisa: márcala como supervisora primero';
  end if;
  if coalesce(array_length(p_cuentas, 1), 0) > 5000 then
    raise exception 'Demasiadas cuentas de una vez (máximo 5000)';
  end if;
  if exists (select 1 from unnest(coalesce(p_cuentas, '{}')) x
             where x = p_supervisor
                or not exists (select 1 from public.profiles p
                               where p.id = x and not p.is_admin)) then
    raise exception 'La lista tiene a la cuenta que administra, a la propia supervisora o una cuenta que no existe';
  end if;
  delete from public.supervisor_cuentas
   where supervisor_id = p_supervisor and persona_id <> all (coalesce(p_cuentas, '{}'));
  insert into public.supervisor_cuentas (supervisor_id, persona_id)
  select p_supervisor, x from unnest(coalesce(p_cuentas, '{}')) x
  on conflict do nothing;
  select count(*) into n from public.supervisor_cuentas where supervisor_id = p_supervisor;
  return n;
end;
$$;

create or replace function public.protect_profiles_identity_columns()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  contando_invitaciones boolean := coalesce(current_setting('ajedrez.contando_invitaciones', true), '') = 'si';
  sincronizando boolean := coalesce(current_setting('ajedrez.sincronizando_profesores', true), '') = 'si';
  nombrando boolean := coalesce(current_setting('ajedrez.nombrando_coordinador', true), '') = 'si';
  nombrando_sup boolean := coalesce(current_setting('ajedrez.nombrando_supervisor', true), '') = 'si';
  cambiando_rol boolean := coalesce(current_setting('ajedrez.cambiando_rol', true), '') = 'si';
begin
  if auth.uid() is not null then
    if not cambiando_rol then
      if new.role is distinct from old.role then new.role := old.role; end if;
    end if;
    if new.email is distinct from old.email then new.email := old.email; end if;
    if new.is_admin is distinct from old.is_admin then new.is_admin := old.is_admin; end if;
    if not nombrando then
      if new.es_coordinador is distinct from old.es_coordinador then
        new.es_coordinador := old.es_coordinador;
      end if;
    end if;
    if not nombrando_sup then
      if new.es_supervisor is distinct from old.es_supervisor then
        new.es_supervisor := old.es_supervisor;
      end if;
    end if;
    if not sincronizando then
      if new.teacher_id is distinct from old.teacher_id then new.teacher_id := old.teacher_id; end if;
    end if;
    if not contando_invitaciones then
      if new.invitaciones_max is distinct from old.invitaciones_max then
        new.invitaciones_max := old.invitaciones_max;
      end if;
      if new.invitaciones_usadas is distinct from old.invitaciones_usadas then
        new.invitaciones_usadas := old.invitaciones_usadas;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Lectura de la actividad de sus estudiantes a cargo (solo SELECT: el
-- supervisor no escribe progreso de nadie).
do $$
declare t text;
begin
  foreach t in array array['training_progress','training_state','platform_activity_log',
                           'class_attendance','class_presence_log','question_answers',
                           'training_plans','course_unlocks','encargados'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_supervisor', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.soy_supervisor()) and public.supervisado_por_mi(student_id))',
                   t || '_select_supervisor', t);
  end loop;
  foreach t in array array['tareas','examenes'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_supervisor', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.soy_supervisor()) and public.supervisado_por_mi(alumno_id))',
                   t || '_select_supervisor', t);
  end loop;
end $$;
drop policy if exists class_sessions_select_supervisor on public.class_sessions;
create policy class_sessions_select_supervisor on public.class_sessions for select to authenticated
  using ((select public.soy_supervisor()) and public.sesion_de_supervisado(id));

revoke execute on function public.soy_supervisor() from public, anon;
revoke execute on function public.supervisado_por_mi(uuid) from public, anon;
revoke execute on function public.sesion_de_supervisado(uuid) from public, anon;
revoke execute on function public.marcar_supervisor(uuid, boolean) from public, anon;
revoke execute on function public.set_cuentas_del_supervisor(uuid, uuid[]) from public, anon;
grant execute on function public.soy_supervisor() to authenticated, service_role;
grant execute on function public.supervisado_por_mi(uuid) to authenticated, service_role;
grant execute on function public.sesion_de_supervisado(uuid) to authenticated, service_role;
grant execute on function public.marcar_supervisor(uuid, boolean) to authenticated, service_role;
grant execute on function public.set_cuentas_del_supervisor(uuid, uuid[]) to authenticated, service_role;
