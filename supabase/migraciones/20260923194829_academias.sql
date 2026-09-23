-- Academias: la unidad del negocio. Un supervisor por academia; profesores,
-- coordinadores y alumnos pueden estar en varias. El supervisor decide qué
-- funciones de coordinación tiene cada coordinador de su academia.

create table if not exists public.academias (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null check (char_length(btrim(nombre)) between 2 and 80),
  supervisor_id     uuid references public.profiles(id) on delete set null,
  whatsapp          text check (whatsapp is null or whatsapp ~ '^[0-9]{8,15}$'),
  correo_respuestas text check (correo_respuestas is null or correo_respuestas ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists academias_nombre_unico on public.academias (lower(btrim(nombre)));
create unique index if not exists academias_un_supervisor on public.academias (supervisor_id) where supervisor_id is not null;

create table if not exists public.academia_miembros (
  academia_id uuid not null references public.academias(id) on delete cascade,
  persona_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (academia_id, persona_id)
);
create index if not exists academia_miembros_persona on public.academia_miembros (persona_id);

-- Lo que se guarda es lo QUITADO: un coordinador conserva todo lo que ya
-- podía hasta que su supervisor le apague algo.
create or replace function public.funciones_coordinacion()
returns text[] language sql immutable set search_path to '' as $$
  select array['formularios','altas','solicitudes','cuentas','acceso','roles','cobros','equipos','subgrupos']::text[];
$$;

create table if not exists public.coordinador_funciones_quitadas (
  academia_id    uuid not null references public.academias(id) on delete cascade,
  coordinador_id uuid not null references public.profiles(id) on delete cascade,
  funcion        text not null check (funcion = any (public.funciones_coordinacion())),
  created_at     timestamptz not null default now(),
  primary key (academia_id, coordinador_id, funcion)
);

alter table public.academias enable row level security;
alter table public.academia_miembros enable row level security;
alter table public.coordinador_funciones_quitadas enable row level security;
revoke all on public.academias, public.academia_miembros, public.coordinador_funciones_quitadas from anon;
revoke insert, update, delete on public.academias, public.academia_miembros, public.coordinador_funciones_quitadas from authenticated;

-- ── Las preguntas ────────────────────────────────────────────────────────

create or replace function public.soy_admin()
returns boolean language sql stable security definer set search_path to 'public' set row_security to off as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.supervisa_academia(p_academia uuid)
returns boolean language sql stable security definer set search_path to 'public' set row_security to off as $$
  select exists (select 1 from public.academias a
                  join public.profiles s on s.id = a.supervisor_id and s.es_supervisor
                 where a.id = p_academia and a.supervisor_id = auth.uid());
$$;

create or replace function public.soy_de_la_academia(p_academia uuid)
returns boolean language sql stable security definer set search_path to 'public' set row_security to off as $$
  select exists (select 1 from public.academia_miembros m
                  where m.academia_id = p_academia and m.persona_id = auth.uid());
$$;

-- Quiénes supervisan a esta persona: por su academia o por asignación directa.
create or replace function public.supervisores_de(p_persona uuid)
returns setof uuid language sql stable security definer set search_path to 'public' set row_security to off as $$
  select sc.supervisor_id from public.supervisor_cuentas sc
    join public.profiles s on s.id = sc.supervisor_id and s.es_supervisor
   where sc.persona_id = p_persona or sc.persona_id in (select public.profesores_de(p_persona))
  union
  select a.supervisor_id from public.academia_miembros m
    join public.academias a on a.id = m.academia_id
    join public.profiles s on s.id = a.supervisor_id and s.es_supervisor
   where m.persona_id = p_persona and a.supervisor_id <> p_persona;
$$;

create or replace function public.supervisado_por_mi(p_persona uuid)
returns boolean language sql stable security definer set search_path to 'public' set row_security to off as $$
  select p_persona is not null and auth.uid() in (select public.supervisores_de(p_persona));
$$;

create or replace function public.coordinador_puede(p_funcion text)
returns boolean language sql stable security definer set search_path to 'public' set row_security to off as $$
  with yo as (select p.is_admin, p.es_coordinador, p.es_supervisor
                from public.profiles p where p.id = auth.uid())
  select case
    when auth.uid() is null or not coalesce(p_funcion = any (public.funciones_coordinacion()), false) then false
    when coalesce((select is_admin or es_supervisor from yo), false) then true
    when not coalesce((select es_coordinador from yo), false) then false
    -- Sin academia: como hasta hoy, lo maneja quien administra.
    when not exists (select 1 from public.academia_miembros m where m.persona_id = auth.uid()) then true
    else exists (select 1 from public.academia_miembros m
                  where m.persona_id = auth.uid()
                    and not exists (select 1 from public.coordinador_funciones_quitadas q
                                     where q.academia_id = m.academia_id
                                       and q.coordinador_id = auth.uid()
                                       and q.funcion = p_funcion))
  end;
$$;

create or replace function public.mis_funciones_coordinacion()
returns text[] language sql stable security definer set search_path to 'public' as $$
  select coalesce(array_agg(f order by o), '{}')
    from unnest(public.funciones_coordinacion()) with ordinality as t(f, o)
   where public.coordinador_puede(f);
$$;

-- ── El alcance: la academia se suma a lo que ya había ────────────────────

create or replace function public.bajo_mi_coordinacion(p_persona uuid)
returns boolean language sql stable security definer set search_path to 'public' set row_security to off as $$
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
      select 1 from public.academia_miembros yo_m
        join public.academia_miembros m on m.academia_id = yo_m.academia_id
       where yo_m.persona_id = auth.uid() and m.persona_id = p_persona
      union all
      select 1 where public.soy_profesor_de(p_persona)
      union all
      select 1 where p_persona = auth.uid()
    ))
  end;
$$;

create or replace function public.gente_de_mi_coordinacion()
returns setof uuid language sql stable security definer set search_path to 'public' set row_security to off as $$
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
  select m.persona_id from public.academia_miembros yo_m
    join public.academia_miembros m on m.academia_id = yo_m.academia_id
   where yo_m.persona_id = auth.uid()
     and coalesce((select x.es_coordinador from public.profiles x where x.id = auth.uid()), false)
  union
  select s from public.mis_supervisados() s;
$$;

create or replace function public.mis_supervisados()
returns setof uuid language sql stable security definer set search_path to 'public' set row_security to off as $$
  select sc.persona_id from public.supervisor_cuentas sc
   where sc.supervisor_id = auth.uid() and public.soy_supervisor()
  union
  select a from public.supervisor_cuentas sc
    cross join lateral public.alumnos_de(sc.persona_id) a
   where sc.supervisor_id = auth.uid() and public.soy_supervisor()
  union
  select m.persona_id from public.academias ac
    join public.academia_miembros m on m.academia_id = ac.id
   where ac.supervisor_id = auth.uid() and m.persona_id <> auth.uid() and public.soy_supervisor()
  union
  select a from public.alumnos_de(auth.uid()) a where public.soy_supervisor();
$$;

create or replace function public.mis_supervisores()
returns table(id uuid, nombre text) language sql stable security definer set search_path to 'public' as $$
  select s.id, coalesce(nullif(btrim(s.full_name), ''), split_part(s.email, '@', 1))
    from public.profiles s
   where s.id in (select public.supervisores_de(auth.uid()))
   order by 2;
$$;

create or replace function public.resumen_profesores_supervisados(p_periodo date)
returns table(id uuid, nombre text, grupo text, actividad jsonb, informe_id uuid,
              enviado_at timestamptz, leido_at timestamptz, comentado boolean)
language plpgsql stable security definer set search_path to 'public' set row_security to off as $$
#variable_conflict use_column
declare
  v_admin boolean;
  v_mes   date := date_trunc('month', p_periodo)::date;
begin
  select coalesce(p.is_admin, false) into v_admin from public.profiles p where p.id = auth.uid();
  if p_periodo is null or not (coalesce(v_admin, false) or public.soy_supervisor()) then
    raise exception 'Solo quien supervisa o administra ve esto.' using errcode = '42501';
  end if;
  return query
  select p.id,
         coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1)),
         p.grupo,
         (select to_jsonb(a) from public.actividad_profesor(p.id, v_mes) a),
         i.id, i.enviado_at, i.leido_at, (i.comentario <> '')
    from public.profiles p
    left join public.informes_profesor i
      on i.profesor_id = p.id and i.periodo = v_mes and i.estado = 'enviado'
   where p.role = 'profesor' and p.id <> auth.uid()
     and (coalesce(v_admin, false) or public.supervisado_por_mi(p.id))
   order by 2;
end;
$$;

-- El aviso del informe mensual llega también al supervisor de su academia.
do $$
declare d text;
begin
  select pg_get_functiondef('public.guardar_informe_mensual(date,text,text,text,text,boolean)'::regprocedure) into d;
  d := replace(d,
    E'select array_agg(sc.supervisor_id) into v_sup\n        from public.supervisor_cuentas sc\n        join public.profiles s on s.id = sc.supervisor_id and s.es_supervisor\n       where sc.persona_id = auth.uid();',
    E'select array_agg(s) into v_sup from public.supervisores_de(auth.uid()) s;');
  if position('supervisores_de' in d) = 0 then
    raise exception 'guardar_informe_mensual no tiene la forma esperada';
  end if;
  execute d;
end $$;

-- ── Las funciones que el supervisor puede apagar ─────────────────────────
-- Cada una cambia soy_coordinador() por coordinador_puede('<función>'), y nada más.
do $$
declare
  r record;
  d text;
  mapa constant jsonb := '{
    "cambiar_rol": "roles",
    "coord_equipo_create": "equipos", "coord_equipo_delete": "equipos",
    "coord_equipo_rename": "equipos", "coord_equipo_set_alumnos": "equipos",
    "coord_equipo_set_entrenadores": "equipos",
    "coord_guardar_cuenta": "cuentas", "coord_set_profesores": "cuentas",
    "generar_cobros": "cobros"}';
begin
  for r in select p.oid, p.proname from pg_proc p
            where p.pronamespace = 'public'::regnamespace and mapa ? p.proname loop
    d := pg_get_functiondef(r.oid);
    if position('public.soy_coordinador()' in d) = 0 then
      raise exception '% no pregunta por soy_coordinador()', r.proname;
    end if;
    d := replace(d, 'public.soy_coordinador()',
                 format('public.coordinador_puede(%L)', mapa ->> r.proname));
    execute d;
  end loop;
end $$;

-- Cobros
drop policy if exists cobros_coordinacion on public.cobros;
create policy cobros_coordinacion on public.cobros for all
  using (public.coordinador_puede('cobros') and public.bajo_mi_coordinacion(student_id))
  with check (public.coordinador_puede('cobros') and public.bajo_mi_coordinacion(student_id));
drop policy if exists cobros_contacto_coordinacion on public.cobros_contacto;
create policy cobros_contacto_coordinacion on public.cobros_contacto for all
  using (public.coordinador_puede('cobros') and public.bajo_mi_coordinacion(student_id))
  with check (public.coordinador_puede('cobros') and public.bajo_mi_coordinacion(student_id));
drop policy if exists cobros_recordatorios_programados_coordinacion on public.cobros_recordatorios_programados;
create policy cobros_recordatorios_programados_coordinacion on public.cobros_recordatorios_programados for all
  using (public.coordinador_puede('cobros') and public.bajo_mi_coordinacion(student_id))
  with check (public.coordinador_puede('cobros') and public.bajo_mi_coordinacion(student_id));
drop policy if exists facturacion_coordinacion on public.datos_facturacion;
create policy facturacion_coordinacion on public.datos_facturacion for all to authenticated
  using (public.coordinador_puede('cobros') and public.bajo_mi_coordinacion(student_id))
  with check (public.coordinador_puede('cobros') and public.bajo_mi_coordinacion(student_id));
drop policy if exists suscripciones_coordinacion on public.suscripciones;
create policy suscripciones_coordinacion on public.suscripciones for all
  using (public.coordinador_puede('cobros') and public.bajo_mi_coordinacion(student_id))
  with check (public.coordinador_puede('cobros') and public.bajo_mi_coordinacion(student_id));
drop policy if exists pagos_coordinacion on public.pagos;
create policy pagos_coordinacion on public.pagos for all
  using (public.coordinador_puede('cobros') and exists (
    select 1 from public.cobros c where c.id = pagos.cobro_id and public.bajo_mi_coordinacion(c.student_id)))
  with check (public.coordinador_puede('cobros') and exists (
    select 1 from public.cobros c where c.id = pagos.cobro_id and public.bajo_mi_coordinacion(c.student_id)));
drop policy if exists avisos_lee_coordinacion on public.avisos_cobro;
create policy avisos_lee_coordinacion on public.avisos_cobro for select to authenticated
  using (public.coordinador_puede('cobros') and exists (
    select 1 from public.cobros c where c.id = avisos_cobro.cobro_id and public.bajo_mi_coordinacion(c.student_id)));
drop policy if exists planes_escribe_coordinacion on public.planes_cobro;
create policy planes_escribe_coordinacion on public.planes_cobro for all to authenticated
  using (public.coordinador_puede('cobros') and public.bajo_mi_coordinacion(creado_por))
  with check (public.coordinador_puede('cobros') and public.bajo_mi_coordinacion(creado_por));

-- Formularios: sin la función, tampoco se ven los propios.
drop policy if exists formularios_insert on public.formularios;
create policy formularios_insert on public.formularios for insert
  with check (creado_por = auth.uid() and public.coordinador_puede('formularios'));
drop policy if exists formularios_select on public.formularios;
create policy formularios_select on public.formularios for select to authenticated
  using (public.soy_admin()
         or (public.coordinador_puede('formularios')
             and (creado_por = auth.uid() or public.bajo_mi_coordinacion(creado_por)
                  or public.formulario_compartido_conmigo(id))));
drop policy if exists formularios_update on public.formularios;
create policy formularios_update on public.formularios for update
  using (public.soy_admin() or (creado_por = auth.uid() and public.coordinador_puede('formularios')))
  with check (public.soy_admin() or (creado_por = auth.uid() and public.coordinador_puede('formularios')));
drop policy if exists formularios_delete on public.formularios;
create policy formularios_delete on public.formularios for delete
  using (public.soy_admin() or (creado_por = auth.uid() and public.coordinador_puede('formularios')));
drop policy if exists formulario_respuestas_select on public.formulario_respuestas;
create policy formulario_respuestas_select on public.formulario_respuestas for select to authenticated
  using (exists (select 1 from public.formularios f
                  where f.id = formulario_respuestas.formulario_id
                    and (public.soy_admin()
                         or (public.coordinador_puede('formularios')
                             and (f.creado_por = auth.uid() or public.bajo_mi_coordinacion(f.creado_por)
                                  or public.formulario_compartido_conmigo(f.id))))));
drop policy if exists formulario_respuestas_delete on public.formulario_respuestas;
create policy formulario_respuestas_delete on public.formulario_respuestas for delete
  using (exists (select 1 from public.formularios f
                  where f.id = formulario_respuestas.formulario_id
                    and (public.soy_admin()
                         or (f.creado_por = auth.uid() and public.coordinador_puede('formularios')))));

-- Solicitudes para unirse
drop policy if exists solicitudes_academia_select on public.solicitudes_academia;
create policy solicitudes_academia_select on public.solicitudes_academia for select
  using (public.coordinador_puede('solicitudes'));
drop policy if exists solicitudes_academia_update on public.solicitudes_academia;
create policy solicitudes_academia_update on public.solicitudes_academia for update
  using (public.coordinador_puede('solicitudes'));

-- Subgrupos de otro profesor
drop policy if exists subgrupos_insert on public.subgrupos;
create policy subgrupos_insert on public.subgrupos for insert
  with check ((profesor_id = auth.uid() and (select mp.is_admin or mp.role = 'profesor' from public.my_profile() mp))
              or (public.coordinador_puede('subgrupos') and public.bajo_mi_coordinacion(profesor_id)));
drop policy if exists subgrupos_update on public.subgrupos;
create policy subgrupos_update on public.subgrupos for update
  using (profesor_id = auth.uid() or (public.coordinador_puede('subgrupos') and public.bajo_mi_coordinacion(profesor_id)))
  with check (profesor_id = auth.uid() or (public.coordinador_puede('subgrupos') and public.bajo_mi_coordinacion(profesor_id)));
drop policy if exists subgrupos_delete on public.subgrupos;
create policy subgrupos_delete on public.subgrupos for delete
  using (profesor_id = auth.uid() or (public.coordinador_puede('subgrupos') and public.bajo_mi_coordinacion(profesor_id)));
drop policy if exists subgrupo_alumnos_insert on public.subgrupo_alumnos;
create policy subgrupo_alumnos_insert on public.subgrupo_alumnos for insert
  with check (exists (select 1 from public.subgrupos s where s.id = subgrupo_alumnos.subgrupo_id)
              and (public.soy_profesor_de(alumno_id)
                   or (select mp.is_admin from public.my_profile() mp)
                   or (public.coordinador_puede('subgrupos') and public.bajo_mi_coordinacion(alumno_id))));
drop policy if exists subgrupo_alumnos_delete on public.subgrupo_alumnos;
create policy subgrupo_alumnos_delete on public.subgrupo_alumnos for delete
  using (exists (select 1 from public.subgrupos s
                  where s.id = subgrupo_alumnos.subgrupo_id
                    and (s.profesor_id = auth.uid()
                         or (public.coordinador_puede('subgrupos') and public.bajo_mi_coordinacion(s.profesor_id)))));

-- ── Quién ve las academias ───────────────────────────────────────────────

drop policy if exists academias_select on public.academias;
create policy academias_select on public.academias for select to authenticated
  using (public.soy_admin() or supervisor_id = auth.uid() or public.soy_de_la_academia(id));
drop policy if exists academia_miembros_select on public.academia_miembros;
create policy academia_miembros_select on public.academia_miembros for select to authenticated
  using (persona_id = auth.uid() or public.soy_admin() or public.supervisa_academia(academia_id)
         or (public.soy_de_la_academia(academia_id)
             and coalesce((select p.es_coordinador from public.profiles p where p.id = auth.uid()), false)));
drop policy if exists coordinador_funciones_quitadas_select on public.coordinador_funciones_quitadas;
create policy coordinador_funciones_quitadas_select on public.coordinador_funciones_quitadas for select to authenticated
  using (coordinador_id = auth.uid() or public.soy_admin() or public.supervisa_academia(academia_id));

-- ── Las escrituras: solo por funciones ───────────────────────────────────

create or replace function public.academia_guardar(p_id uuid, p_nombre text, p_supervisor uuid,
                                                   p_whatsapp text, p_correo text)
returns public.academias language plpgsql security definer set search_path to 'public' as $$
declare
  v_fila public.academias;
  v_wa   text := nullif(regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g'), '');
  v_co   text := nullif(lower(btrim(coalesce(p_correo, ''))), '');
begin
  if not public.soy_admin() then
    raise exception 'Solo quien administra crea y edita academias.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'La academia necesita un nombre.';
  end if;
  if v_wa is not null and char_length(v_wa) = 8 then v_wa := '506' || v_wa; end if;
  if v_co is not null and public.es_correo_interno(v_co) then
    raise exception 'Ese es un usuario de la Academia, no un correo: ahí no llega nada.';
  end if;
  if p_supervisor is not null and not coalesce((select es_supervisor from public.profiles where id = p_supervisor), false) then
    raise exception 'Esa cuenta no es supervisora: márcala como supervisora primero.';
  end if;
  if p_supervisor is not null and exists (select 1 from public.academias
                                          where supervisor_id = p_supervisor and id is distinct from p_id) then
    raise exception 'Esa persona ya supervisa otra academia: cada academia tiene su propio supervisor.';
  end if;
  if exists (select 1 from public.academias where lower(btrim(nombre)) = lower(btrim(p_nombre))
                                              and id is distinct from p_id) then
    raise exception 'Ya hay una academia con ese nombre.';
  end if;
  if p_id is null then
    insert into public.academias (nombre, supervisor_id, whatsapp, correo_respuestas, created_by)
    values (btrim(p_nombre), p_supervisor, v_wa, v_co, auth.uid()) returning * into v_fila;
  else
    update public.academias set nombre = btrim(p_nombre), supervisor_id = p_supervisor,
           whatsapp = v_wa, correo_respuestas = v_co, updated_at = now()
     where id = p_id returning * into v_fila;
    if not found then raise exception 'Esa academia ya no existe.'; end if;
  end if;
  return v_fila;
end;
$$;

-- El supervisor pone los datos de contacto de SU academia; el nombre y quién
-- la supervisa son de quien administra.
create or replace function public.academia_guardar_contacto(p_id uuid, p_whatsapp text, p_correo text)
returns public.academias language plpgsql security definer set search_path to 'public' as $$
declare
  v_fila public.academias;
  v_wa   text := nullif(regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g'), '');
  v_co   text := nullif(lower(btrim(coalesce(p_correo, ''))), '');
begin
  if not (public.soy_admin() or public.supervisa_academia(p_id)) then
    raise exception 'Solo su supervisor o quien administra cambia estos datos.' using errcode = '42501';
  end if;
  if v_wa is not null and char_length(v_wa) = 8 then v_wa := '506' || v_wa; end if;
  if v_co is not null and public.es_correo_interno(v_co) then
    raise exception 'Ese es un usuario de la Academia, no un correo: ahí no llega nada.';
  end if;
  update public.academias set whatsapp = v_wa, correo_respuestas = v_co, updated_at = now()
   where id = p_id returning * into v_fila;
  if not found then raise exception 'Esa academia ya no existe.'; end if;
  return v_fila;
end;
$$;

create or replace function public.academia_borrar(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.soy_admin() then
    raise exception 'Solo quien administra borra academias.' using errcode = '42501';
  end if;
  delete from public.academias where id = p_id;
end;
$$;

-- Deja la lista EXACTAMENTE como llega (la regla de set_teachers). El
-- supervisor solo mueve alumnos, y solo los de los profesores de su academia:
-- lo demás que ya estaba se conserva, igual que en coord_set_profesores().
create or replace function public.academia_set_miembros(p_academia uuid, p_personas uuid[])
returns integer language plpgsql security definer set search_path to 'public' set row_security to off as $$
declare
  v_admin boolean := public.soy_admin();
  v_lista uuid[]  := coalesce(p_personas, '{}');
  v_fuera integer;
  n integer;
begin
  if not (v_admin or public.supervisa_academia(p_academia)) then
    raise exception 'Solo su supervisor o quien administra cambia quién está en la academia.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.academias where id = p_academia) then
    raise exception 'Esa academia ya no existe.';
  end if;
  if coalesce(array_length(v_lista, 1), 0) > 5000 then
    raise exception 'Demasiadas cuentas de una vez (máximo 5000).';
  end if;
  if exists (select 1 from unnest(v_lista) x
              where not exists (select 1 from public.profiles p where p.id = x and not p.is_admin)) then
    raise exception 'La lista tiene la cuenta que administra o una cuenta que no existe.';
  end if;

  if not v_admin then
    -- Lo que el supervisor no puede tocar se conserva.
    v_lista := array(
      select x from unnest(v_lista) x
       where (select role from public.profiles where id = x) = 'alumno'
      union
      select m.persona_id from public.academia_miembros m
        join public.profiles p on p.id = m.persona_id
       where m.academia_id = p_academia and p.role <> 'alumno');
    select count(*) into v_fuera from unnest(v_lista) x
     where not exists (select 1 from public.academia_miembros m where m.academia_id = p_academia and m.persona_id = x)
       and not exists (select 1 from public.academia_miembros m
                         join public.profiles p on p.id = m.persona_id and p.role = 'profesor'
                        where m.academia_id = p_academia and x in (select public.alumnos_de(m.persona_id)));
    if v_fuera > 0 then
      raise exception '% de las cuentas no son alumnos de los profesores de tu academia: esas las suma quien administra.', v_fuera;
    end if;
  end if;

  delete from public.academia_miembros
   where academia_id = p_academia and persona_id <> all (v_lista);
  insert into public.academia_miembros (academia_id, persona_id)
  select p_academia, x from unnest(v_lista) x
  on conflict do nothing;
  delete from public.coordinador_funciones_quitadas q
   where q.academia_id = p_academia
     and not exists (select 1 from public.academia_miembros m
                      where m.academia_id = p_academia and m.persona_id = q.coordinador_id);
  select count(*) into n from public.academia_miembros where academia_id = p_academia;
  return n;
end;
$$;

-- Recibe las funciones PERMITIDAS, que es lo que se marca en pantalla.
create or replace function public.academia_set_funciones_coordinador(p_academia uuid, p_coordinador uuid, p_permitidas text[])
returns text[] language plpgsql security definer set search_path to 'public' set row_security to off as $$
begin
  if not (public.soy_admin() or public.supervisa_academia(p_academia)) then
    raise exception 'Solo su supervisor o quien administra decide qué hace cada coordinador.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.academia_miembros m
                   join public.profiles p on p.id = m.persona_id and p.es_coordinador
                  where m.academia_id = p_academia and m.persona_id = p_coordinador) then
    raise exception 'Esa cuenta no coordina en esta academia.';
  end if;
  if exists (select 1 from unnest(coalesce(p_permitidas, '{}')) f
              where not (f = any (public.funciones_coordinacion()))) then
    raise exception 'Hay una función que no existe.';
  end if;
  delete from public.coordinador_funciones_quitadas
   where academia_id = p_academia and coordinador_id = p_coordinador;
  insert into public.coordinador_funciones_quitadas (academia_id, coordinador_id, funcion)
  select p_academia, p_coordinador, f from unnest(public.funciones_coordinacion()) f
   where not (f = any (coalesce(p_permitidas, '{}')));
  return array(select f from unnest(public.funciones_coordinacion()) f
                where f = any (coalesce(p_permitidas, '{}')));
end;
$$;

-- Los de la academia y, para sumar, los alumnos de sus profesores. Con nombre:
-- la RLS de profiles no le deja al supervisor ver a quien todavía no es suyo.
create or replace function public.academia_personas(p_academia uuid)
returns table(id uuid, nombre text, correo text, rol text, es_coordinador boolean,
              grupo text, miembro boolean, funciones text[])
language sql stable security definer set search_path to 'public' set row_security to off as $$
  with ok as (select public.soy_admin() or public.supervisa_academia(p_academia) as si),
  gente as (
    select m.persona_id as pid, true as miembro from public.academia_miembros m
     where m.academia_id = p_academia
    union
    select a, false from public.academia_miembros m
      join public.profiles pr on pr.id = m.persona_id and pr.role = 'profesor'
     cross join lateral public.alumnos_de(m.persona_id) a
     where m.academia_id = p_academia
       and not exists (select 1 from public.academia_miembros x where x.academia_id = p_academia and x.persona_id = a))
  select p.id, coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1)), p.email,
         p.role, p.es_coordinador, p.grupo, bool_or(g.miembro),
         case when p.es_coordinador and bool_or(g.miembro) then
           array(select f from unnest(public.funciones_coordinacion()) f
                  where not exists (select 1 from public.coordinador_funciones_quitadas q
                                     where q.academia_id = p_academia and q.coordinador_id = p.id and q.funcion = f))
         end
    from gente g join public.profiles p on p.id = g.pid
   where (select si from ok)
   group by p.id
   order by 7 desc, 2;
$$;

-- A dónde contestan las familias: al supervisor de cada academia del alumno.
-- Solo para las Edge Functions, que escriben con la service role.
create or replace function public.correos_de_supervision(p_alumno uuid)
returns table(academia text, correo text)
language sql stable security definer set search_path to 'public' set row_security to off as $$
  select distinct a.nombre, lower(coalesce(nullif(btrim(a.correo_respuestas), ''), s.email))
    from public.academia_miembros m
    join public.academias a on a.id = m.academia_id
    join public.profiles s on s.id = a.supervisor_id and s.es_supervisor
   where m.persona_id = p_alumno
     and coalesce(nullif(btrim(a.correo_respuestas), ''), s.email) is not null
     and not public.es_correo_interno(coalesce(nullif(btrim(a.correo_respuestas), ''), s.email));
$$;

-- Un alumno nuevo entra solo a la academia de su profesor, si el profesor es
-- de UNA: con dos, no hay forma de saber a cuál, y lo decide quien administra.
create or replace function public.profile_teachers_suma_a_la_academia()
returns trigger language plpgsql security definer set search_path to 'public' set row_security to off as $$
declare v_academias uuid[];
begin
  if (select role from public.profiles where id = new.student_id) is distinct from 'alumno' then
    return new;
  end if;
  select array_agg(m.academia_id) into v_academias
    from public.academia_miembros m where m.persona_id = new.teacher_id;
  if coalesce(array_length(v_academias, 1), 0) = 1 then
    insert into public.academia_miembros (academia_id, persona_id)
    values (v_academias[1], new.student_id) on conflict do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists profile_teachers_suma_a_la_academia on public.profile_teachers;
create trigger profile_teachers_suma_a_la_academia after insert on public.profile_teachers
  for each row execute function public.profile_teachers_suma_a_la_academia();

-- ── Quién puede llamar a qué ─────────────────────────────────────────────
revoke execute on function public.profile_teachers_suma_a_la_academia() from public, anon, authenticated;
revoke execute on function public.correos_de_supervision(uuid) from public, anon, authenticated;
grant execute on function public.correos_de_supervision(uuid) to service_role;
revoke execute on function public.supervisores_de(uuid) from public, anon;
grant execute on function public.supervisores_de(uuid) to authenticated, service_role;

do $$
declare f text;
begin
  -- Estas cuatro las evalúan políticas escritas para el rol public: sin cuenta
  -- contestan que no, y quitarle el execute a anon haría tronar la consulta.
  foreach f in array array[
    'public.soy_admin()', 'public.supervisa_academia(uuid)', 'public.soy_de_la_academia(uuid)',
    'public.coordinador_puede(text)'] loop
    execute format('revoke execute on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public.mis_funciones_coordinacion()',
    'public.academia_guardar(uuid,text,uuid,text,text)', 'public.academia_guardar_contacto(uuid,text,text)',
    'public.academia_borrar(uuid)', 'public.academia_set_miembros(uuid,uuid[])',
    'public.academia_set_funciones_coordinador(uuid,uuid,text[])', 'public.academia_personas(uuid)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
