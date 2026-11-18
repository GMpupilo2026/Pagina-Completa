-- A cada clase en vivo entran solo los alumnos que el profe asignó.
--
-- Hasta acá, con la clase abierta entraba CUALQUIER alumno del profe: el de
-- CENFO se metía a la clase del grupo de SJ por error, quedaba con asistencia
-- en una clase que no era la suya, y en el informe todos los alumnos tenían
-- «faltas» en las clases de los otros grupos. Nada de eso daba un error.
--
-- Ver «A la clase entran solo los asignados» en docs/decisiones/clase-en-vivo.md.

-- 1. La lista de cada clase -------------------------------------------------
-- `solo_asignados` NO es un dato derivado: dice qué regla tiene la clase. Las
-- en vivo que se abren desde ahora la llevan en true; las de antes y las
-- presenciales quedan en false y se cuentan como siempre (a todos los alumnos
-- del profe).
alter table public.class_sessions
  add column if not exists solo_asignados boolean not null default false;

create table public.clase_asignados (
  class_session_id uuid not null references public.class_sessions(id) on delete cascade,
  student_id       uuid not null references public.profiles(id) on delete cascade,
  created_at       timestamptz not null default now(),
  primary key (class_session_id, student_id)
);
create index clase_asignados_student_id on public.clase_asignados (student_id);

alter table public.clase_asignados enable row level security;

-- La ve el propio alumno (la suya), quien da la clase y quien administra. Sin
-- políticas de escritura: la escriben abrir_clase_en_vivo() y
-- cambiar_asignados_de_la_clase(), que validan.
create policy clase_asignados_select on public.clase_asignados
  for select to authenticated
  using (
    student_id = (select auth.uid())
    or (select mp.is_admin from public.my_profile() mp)
    or class_session_id in (select cs.id from public.class_sessions cs
                             where cs.created_by = (select auth.uid()))
  );

-- Va en Realtime (al alumno que agregan a mitad de clase se le abre sola), así
-- que lleva la restrictiva de los dos pasos como toda tabla de Realtime.
create policy verificacion_en_dos_pasos on public.clase_asignados
  as restrictive for all to authenticated
  using ((select interno.verificacion_al_dia()))
  with check ((select interno.verificacion_al_dia()));

alter publication supabase_realtime add table public.clase_asignados;

-- Las clases que ya están abiertas al aplicar esto no le cierran la puerta a
-- nadie a mitad de clase: quedan asignadas a todos los alumnos del profe.
insert into public.clase_asignados (class_session_id, student_id)
select c.id, a.id
  from public.class_sessions c
  cross join lateral interno.alumnos_de(c.created_by) as a(id)
 where c.ended_at is null and c.modalidad = 'en_linea'
on conflict do nothing;

update public.class_sessions
   set solo_asignados = true
 where ended_at is null and modalidad = 'en_linea';

-- 2. ¿Estoy en la lista? ----------------------------------------------------
create or replace function interno.asignado_a(p_clase uuid)
returns boolean
language sql stable security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1 from public.clase_asignados a
     where a.class_session_id = p_clase and a.student_id = (select auth.uid())
  );
$$;
revoke execute on function interno.asignado_a(uuid) from public, anon;
grant execute on function interno.asignado_a(uuid) to authenticated;

-- La clase abierta de ese profe me toca: está abierta y estoy en su lista.
-- Reemplaza a clase_abierta_de() en todo lo que le abre la clase a un ALUMNO
-- (clase_abierta_de() sigue para los invitados, que entran con su enlace).
create or replace function interno.me_toca_la_clase_de(p_profesor uuid)
returns boolean
language sql stable security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
      from public.class_sessions c
      join public.clase_asignados a on a.class_session_id = c.id
     where c.created_by = p_profesor
       and c.ended_at is null
       and a.student_id = (select auth.uid())
  );
$$;
revoke execute on function interno.me_toca_la_clase_de(uuid) from public, anon;
grant execute on function interno.me_toca_la_clase_de(uuid) to authenticated;

-- 3. El candado, en la base -------------------------------------------------
-- Lo mismo que había, cambiando clase_abierta_de() por me_toca_la_clase_de().
drop policy game_state_select on public.game_state;
create policy game_state_select on public.game_state
  for select
  using (
    (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id))
    or owner_id = (select auth.uid())
    or (public.es_mi_profesor(owner_id) and interno.me_toca_la_clase_de(owner_id))
    or owner_id in (select interno.clases_que_coordino())
    or ((select public.soy_supervisor()) and owner_id in (select interno.clases_que_superviso()))
  );

drop policy variant_nodes_select on public.variant_nodes;
create policy variant_nodes_select on public.variant_nodes
  for select
  using (
    (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id))
    or teacher_id = (select auth.uid())
    or (public.es_mi_profesor(teacher_id) and interno.me_toca_la_clase_de(teacher_id))
    or teacher_id in (select interno.clases_que_coordino())
    or ((select public.soy_supervisor()) and teacher_id in (select interno.clases_que_superviso()))
  );

drop policy profesor_videollamada_select on public.profesor_videollamada;
create policy profesor_videollamada_select on public.profesor_videollamada
  for select
  using (
    profesor_id = (select auth.uid())
    or (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id))
    or (public.es_mi_profesor(profesor_id) and interno.me_toca_la_clase_de(profesor_id)
        and (grupo = '' or grupo = coalesce(public.mi_grupo(), '')))
    or profesor_id in (select interno.clases_que_coordino())
    or ((select public.soy_supervisor()) and profesor_id in (select interno.clases_que_superviso()))
  );

-- La asistencia y el tiempo en clase: un alumno solo se anota en una clase
-- con lista si está en ella. Restrictivas, así que valen encima de las de
-- siempre; lo que anota el profe en la ficha presencial (student_id ajeno) no
-- se toca.
create policy class_attendance_solo_asignados on public.class_attendance
  as restrictive for insert to authenticated
  with check (
    student_id is distinct from (select auth.uid())
    or not exists (select 1 from public.class_sessions cs
                    where cs.id = session_id and cs.solo_asignados)
    or interno.asignado_a(session_id)
  );

create policy class_presence_log_solo_asignados on public.class_presence_log
  as restrictive for insert to authenticated
  with check (
    student_id is distinct from (select auth.uid())
    or not exists (select 1 from public.class_sessions cs
                    where cs.id = session_id and cs.solo_asignados)
    or interno.asignado_a(session_id)
  );

-- Una clase en vivo ya no se abre con un INSERT suelto: sin lista no habría a
-- quién dejar entrar. Desde la consola solo se puede crear la ficha
-- presencial; la en vivo pasa por abrir_clase_en_vivo().
drop policy class_sessions_insert on public.class_sessions;
create policy class_sessions_insert on public.class_sessions
  for insert
  with check (
    created_by = (select auth.uid())
    and modalidad = 'presencial'
    and (select (mp.is_admin or mp.role = 'profesor') from public.my_profile() mp(role, is_admin, teacher_id))
  );

-- 4. Abrir la clase con su lista, en UNA llamada ----------------------------
-- Partido en dos (la clase y después la lista), entre una cosa y la otra la
-- clase existiría sin nadie adentro, y si la segunda falla queda así.
create or replace function public.abrir_clase_en_vivo(p_alumnos uuid[], p_titulo text default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_yo    uuid := auth.uid();
  v_admin boolean;
  v_rol   text;
  v_lista uuid[];
  v_ajeno uuid;
  v_id    uuid;
  v_profe text;
begin
  select mp.is_admin, mp.role into v_admin, v_rol
    from public.my_profile() mp(role, is_admin, teacher_id);
  if not coalesce(v_yo is not null and (v_admin or v_rol = 'profesor'), false) then
    raise exception 'Solo quien da clase puede abrirla' using errcode = '42501';
  end if;

  select array_agg(distinct x) into v_lista
    from unnest(coalesce(p_alumnos, '{}'::uuid[])) as x
   where x is not null and x <> v_yo;
  if v_lista is null then
    raise exception 'Elige al menos un alumno para la clase' using errcode = '22023';
  end if;

  select x into v_ajeno
    from unnest(v_lista) as x
   where not coalesce(public.soy_profesor_de(x) or v_admin, false)
   limit 1;
  if v_ajeno is not null then
    raise exception 'En la lista hay alguien que no es alumno tuyo' using errcode = '42501';
  end if;

  -- Si ya hay una abierta (la otra pestaña), se queda con su lista: no se la
  -- cambia por debajo a quien la abrió primero.
  select c.id into v_id from public.class_sessions c
   where c.created_by = v_yo and c.ended_at is null limit 1;
  if v_id is not null then return v_id; end if;

  begin
    insert into public.class_sessions (created_by, title, modalidad, solo_asignados)
    values (v_yo, nullif(btrim(coalesce(p_titulo, '')), ''), 'en_linea', true)
    returning id into v_id;
  exception when unique_violation then
    -- class_sessions_una_abierta_por_profesor: la abrió otra pestaña a la vez.
    select c.id into v_id from public.class_sessions c
     where c.created_by = v_yo and c.ended_at is null limit 1;
    return v_id;
  end;

  insert into public.clase_asignados (class_session_id, student_id)
  select v_id, x from unnest(v_lista) as x;

  -- El aviso al celular va SOLO a los de la lista. Antes lo mandaba un trigger
  -- de class_sessions a todos los alumnos del profe (y ese trigger corre antes
  -- de que exista la lista, por eso ahora va acá).
  select coalesce(nullif(p.full_name, ''), 'Tu profe') into v_profe
    from public.profiles p where p.id = v_yo;
  perform public.avisar_push(
    v_lista,
    'Empezó la clase',
    v_profe || ' abrió la sesión en vivo. Entra cuando puedas.',
    '/sesion.html',
    'clase-abierta');

  return v_id;
end;
$$;
revoke execute on function public.abrir_clase_en_vivo(uuid[], text) from public, anon;
grant execute on function public.abrir_clase_en_vivo(uuid[], text) to authenticated;

-- Cambiar la lista con la clase en curso: el que llegó y no estaba, o el que
-- se coló. Deja la lista EXACTAMENTE como llega (la regla de set_teachers).
create or replace function public.cambiar_asignados_de_la_clase(p_clase uuid, p_alumnos uuid[])
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_yo    uuid := auth.uid();
  v_admin boolean;
  v_lista uuid[];
  v_ajeno uuid;
  v_nuevos uuid[];
  v_profe text;
begin
  select mp.is_admin into v_admin from public.my_profile() mp(role, is_admin, teacher_id);
  if not coalesce(exists (select 1 from public.class_sessions c
                           where c.id = p_clase and c.created_by = v_yo
                             and c.ended_at is null and c.solo_asignados), false) then
    raise exception 'Esa clase no es tuya o ya se cerró' using errcode = '42501';
  end if;

  select array_agg(distinct x) into v_lista
    from unnest(coalesce(p_alumnos, '{}'::uuid[])) as x
   where x is not null and x <> v_yo;
  if v_lista is null then
    raise exception 'La clase tiene que quedar con al menos un alumno' using errcode = '22023';
  end if;

  select x into v_ajeno
    from unnest(v_lista) as x
   where not coalesce(public.soy_profesor_de(x) or v_admin, false)
   limit 1;
  if v_ajeno is not null then
    raise exception 'En la lista hay alguien que no es alumno tuyo' using errcode = '42501';
  end if;

  delete from public.clase_asignados a
   where a.class_session_id = p_clase and not (a.student_id = any (v_lista));

  with ins as (
    insert into public.clase_asignados (class_session_id, student_id)
    select p_clase, x from unnest(v_lista) as x
    on conflict do nothing
    returning student_id
  )
  select array_agg(student_id) into v_nuevos from ins;

  if v_nuevos is not null then
    select coalesce(nullif(p.full_name, ''), 'Tu profe') into v_profe
      from public.profiles p where p.id = v_yo;
    perform public.avisar_push(
      v_nuevos,
      'Empezó la clase',
      v_profe || ' te agregó a la clase en vivo. Entra cuando puedas.',
      '/sesion.html',
      'clase-abierta');
  end if;

  return cardinality(v_lista);
end;
$$;
revoke execute on function public.cambiar_asignados_de_la_clase(uuid, uuid[]) from public, anon;
grant execute on function public.cambiar_asignados_de_la_clase(uuid, uuid[]) to authenticated;

-- El aviso a todos los alumnos al abrir se va: lo manda abrir_clase_en_vivo()
-- a los de la lista. Las presenciales no avisaban (nacen cerradas).
drop trigger if exists class_sessions_avisa_push on public.class_sessions;
drop function if exists public.avisar_clase_abierta();

-- 5. mis_clases(): «abierta» quiere decir «abierta PARA MÍ» -----------------
-- Lo leen el panel (la tarjeta «Sesión en vivo» y la videollamada) y la
-- pantalla de espera de sesion.html. `abierta_sin_mi` va al final: el profe
-- tiene una clase abierta pero no estoy en su lista, y eso se dice en vez de
-- dejarlo esperando a una clase que no es la suya.
drop function public.mis_clases();
create function public.mis_clases()
returns table(profesor_id uuid, profesor text, es_principal boolean, clase_abierta boolean,
              titulo_clase text, videollamada text, abierta_sin_mi boolean)
language sql stable
set search_path = 'public'
as $$
  with yo as (
    select p.id, p.teacher_id, p.grupo from public.profiles p where p.id = (select auth.uid())
  )
  select pr.id as profesor_id,
         coalesce(nullif(pr.full_name, ''), pr.email) as profesor,
         pr.id = yo.teacher_id as es_principal,
         (cs.id is not null and interno.me_toca_la_clase_de(pr.id)) as clase_abierta,
         case when interno.me_toca_la_clase_de(pr.id) then cs.title end,
         v.enlace,
         (cs.id is not null and not interno.me_toca_la_clase_de(pr.id)) as abierta_sin_mi
  from yo
  cross join lateral interno.profesores_de(yo.id) mio(id)
  join public.profiles pr on pr.id = mio.id
  left join lateral (
    select c.id, c.title from public.class_sessions c
    where c.created_by = pr.id and c.ended_at is null
    order by c.started_at desc nulls last limit 1
  ) cs on true
  left join lateral (
    select w.enlace from public.profesor_videollamada w
    where w.profesor_id = pr.id
      and (w.grupo = coalesce(yo.grupo, '') or w.grupo = '')
    order by (w.grupo <> '') desc   -- el del grupo manda sobre el general
    limit 1
  ) v on true
  order by (pr.id = yo.teacher_id) desc, 2;
$$;
revoke execute on function public.mis_clases() from public, anon;
grant execute on function public.mis_clases() to authenticated;

-- 6. Las ausencias: solo cuentan las clases que le tocaban ------------------
-- Le tocaba una clase si estaba en su lista, si entró, o —en las de antes y
-- las presenciales, que no tienen lista— si es alumno de quien la dio. Antes
-- el «fue a 3 de N» del informe usaba el total de clases cerradas para todos:
-- las clases de los otros grupos le contaban como faltas.
create or replace function public.clases_que_le_tocaban()
returns table(student_id uuid, clases integer)
language sql stable
set search_path = 'public'
as $$
  with cerradas as (
    select cs.id, cs.created_by, cs.solo_asignados
      from public.class_sessions cs
     where cs.ended_at is not null
  ),
  profes as (
    select distinct created_by from cerradas where not solo_asignados
  ),
  alumnos_de_profe as (
    select pr.created_by, a.id as student_id
      from profes pr
      cross join lateral interno.alumnos_de(pr.created_by) as a(id)
  ),
  pares as (
    select x.class_session_id as clase, x.student_id
      from public.clase_asignados x
      join cerradas c on c.id = x.class_session_id and c.solo_asignados
    union
    select ca.session_id, ca.student_id
      from public.class_attendance ca
      join cerradas c on c.id = ca.session_id
    union
    select c.id, ap.student_id
      from cerradas c
      join alumnos_de_profe ap on ap.created_by = c.created_by
     where not c.solo_asignados
  )
  select p.student_id, count(*)::int
    from pares p
    -- Solo de quienes quien pregunta puede ver.
    join public.profiles pf on pf.id = p.student_id
   group by p.student_id;
$$;
revoke execute on function public.clases_que_le_tocaban() from public, anon;
grant execute on function public.clases_que_le_tocaban() to authenticated;

-- Una falta justificada solo cuenta en una clase que le tocaba.
create or replace function public.faltas_justificadas(p_desde date default null, p_hasta date default null)
returns table(student_id uuid, full_name text, grupo text, clases_justificadas integer)
language sql stable
set search_path = 'public'
as $$
  with j as (
    select ja.student_id, ja.fecha_desde, ja.fecha_hasta
      from public.justificaciones_ausencia ja
     where ja.estado = 'aceptada'
       and (p_hasta is null or ja.fecha_desde <= p_hasta)
       and (p_desde is null or ja.fecha_hasta >= p_desde)
  ),
  c as (
    select cs.id, cs.created_by, cs.solo_asignados,
           (cs.started_at at time zone 'America/Costa_Rica')::date as dia
      from public.class_sessions cs
     where cs.ended_at is not null
       and (p_desde is null or (cs.started_at at time zone 'America/Costa_Rica')::date >= p_desde)
       and (p_hasta is null or (cs.started_at at time zone 'America/Costa_Rica')::date <= p_hasta)
  )
  select j.student_id, p.full_name, p.grupo, count(distinct c.id)::int
    from j
    join c on c.dia between j.fecha_desde and j.fecha_hasta
          -- Solo las clases de SUS profesores: la clase de otro grupo el mismo
          -- día no es una clase a la que faltó.
          and c.created_by in (select interno.profesores_de(j.student_id))
          -- Y de esas, si la clase tenía lista, solo si estaba en ella.
          and (not c.solo_asignados
               or exists (select 1 from public.clase_asignados x
                           where x.class_session_id = c.id and x.student_id = j.student_id))
    left join public.profiles p on p.id = j.student_id
   where not exists (select 1 from public.class_attendance ca
                      where ca.session_id = c.id and ca.student_id = j.student_id)
   group by j.student_id, p.full_name, p.grupo;
$$;
