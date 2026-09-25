-- «Ver como» una persona: quien supervisa mira el panel de SUS profesores y
-- SUS coordinadores (y quien administra, el de cualquiera del equipo docente).
--
-- El modo de vista de siempre (js/modo-vista.js) cambia la pantalla y deja los
-- datos de la cuenta que mira. Para revisar a alguien eso no alcanza: hacen
-- falta SUS números. No se entra a su cuenta —eso daría también sus permisos
-- de escritura—: tres funciones de solo lectura contestan sobre esa persona,
-- cada una preguntando arriba si quien llama la supervisa (supervisado_por_mi)
-- o administra, con el permiso envuelto en coalesce(..., false) para que una
-- llamada sin usuario no pase.

-- A quién se puede mirar: el equipo docente que uno supervisa (profesores y
-- coordinadores; no otros supervisores ni la cuenta master), o todo el equipo
-- docente si se administra. A cualquier otra cuenta, ninguna fila.
create or replace function public.personas_para_ver_como()
 returns table(id uuid, nombre text, es_coordinador boolean)
 language sql
 stable security definer
 set search_path to 'public'
 set row_security to 'off'
as $function$
  with yo as (
    select p.is_admin, p.es_supervisor from public.profiles p where p.id = auth.uid()
  )
  select p.id, coalesce(nullif(btrim(p.full_name), ''), p.email), coalesce(p.es_coordinador, false)
    from public.profiles p
   where auth.uid() is not null
     and p.id <> auth.uid()
     and p.role = 'profesor'
     and not coalesce(p.is_admin, false)
     and not coalesce(p.es_supervisor, false)
     and (coalesce((select is_admin from yo), false)
          or (coalesce((select es_supervisor from yo), false)
              and p.id in (select public.mis_supervisados())))
   order by coalesce(nullif(btrim(p.full_name), ''), p.email) collate "es-CR-x-icu";
$function$;
revoke execute on function public.personas_para_ver_como() from public, anon;
grant execute on function public.personas_para_ver_como() to authenticated, service_role;

-- Los números de «Tu semana» de ESE profesor. Son los de panel_profesor(),
-- que es SECURITY INVOKER y los acota la RLS de quien llama; acá la RLS es la
-- del dueño, así que el alcance se escribe a mano con interno.alumnos_de().
create or replace function public.panel_profesor_de(p_profesor uuid)
 returns table(alumnos integer, activos_7d integer, tareas_pendientes integer, tareas_vencidas integer, tareas_puestas integer, clases_30d integer, clases_dadas integer, con_diagnostico integer, con_plan integer)
 language plpgsql
 stable security definer
 set search_path to 'public'
 set row_security to 'off'
as $function$
begin
  if p_profesor is null or not coalesce(
       public.supervisado_por_mi(p_profesor)
       or (select p.is_admin from public.profiles p where p.id = auth.uid()), false) then
    raise exception 'No supervisas a esa persona.' using errcode = '42501';
  end if;
  return query
  with suyos as (
    select a.a as id from interno.alumnos_de(p_profesor) a(a)
      join public.profiles p on p.id = a.a and p.role = 'alumno'
  ),
  mias as (
    select f.situacion from public.tareas_con_avance(null, p_profesor) f
  )
  select
    (select count(*)::int from suyos),
    (select count(distinct tp.student_id)::int
       from public.training_progress tp
      where tp.student_id in (select id from suyos)
        and tp.created_at >= now() - interval '4 days'),
    (select count(*)::int from mias where situacion <> 'completada'),
    (select count(*)::int from mias where situacion =  'vencida'),
    (select count(*)::int from public.tareas t where t.profesor_id = p_profesor),
    (select count(*)::int
       from public.class_sessions cs
      where cs.created_by = p_profesor
        and cs.started_at >= now() - interval '30 days'),
    (select count(*)::int from public.class_sessions cs where cs.created_by = p_profesor),
    (select count(*)::int
       from public.informes_diagnosticos_alumnos() d
      where d.detalle is not null and d.student_id in (select id from suyos)),
    (select count(*)::int
       from public.training_plans tpl
      where tpl.shared and tpl.student_id in (select id from suyos));
end;
$function$;
revoke execute on function public.panel_profesor_de(uuid) from public, anon;
grant execute on function public.panel_profesor_de(uuid) to authenticated, service_role;

-- Qué funciones de coordinación tiene ESE coordinador: la misma cuenta que
-- coordinador_puede(), escrita para otra persona. Así el panel que se mira
-- enseña las tarjetas que esa persona de verdad tiene, y no todas.
create or replace function public.funciones_coordinador_de(p_persona uuid)
 returns text[]
 language plpgsql
 stable security definer
 set search_path to 'public'
 set row_security to 'off'
as $function$
declare
  v_coord boolean;
begin
  if p_persona is null or not coalesce(
       public.supervisado_por_mi(p_persona)
       or (select p.is_admin from public.profiles p where p.id = auth.uid()), false) then
    raise exception 'No supervisas a esa persona.' using errcode = '42501';
  end if;
  select coalesce(p.es_coordinador, false) into v_coord from public.profiles p where p.id = p_persona;
  if not coalesce(v_coord, false) then
    return '{}';
  end if;
  -- Sin academia: como hasta hoy, todas (lo maneja quien administra).
  if not exists (select 1 from public.academia_miembros m where m.persona_id = p_persona) then
    return public.funciones_coordinacion();
  end if;
  return coalesce((
    select array_agg(f order by o)
      from unnest(public.funciones_coordinacion()) with ordinality as t(f, o)
     where exists (select 1 from public.academia_miembros m
                    where m.persona_id = p_persona
                      and not exists (select 1 from public.coordinador_funciones_quitadas q
                                       where q.academia_id = m.academia_id
                                         and q.coordinador_id = p_persona
                                         and q.funcion = t.f))), '{}');
end;
$function$;
revoke execute on function public.funciones_coordinador_de(uuid) from public, anon;
grant execute on function public.funciones_coordinador_de(uuid) to authenticated, service_role;

-- Los alumnos de ESE profesor que quien mira puede leer: los suyos, cortados
-- por lo que uno supervisa (un profesor puede estar en dos academias, y el
-- supervisor de una no ve a los alumnos de la otra). Quien administra, todos.
-- Informes filtra con esta lista cuando se mira como un profesor.
create or replace function public.alumnos_de_para_ver_como(p_profesor uuid)
 returns setof uuid
 language plpgsql
 stable security definer
 set search_path to 'public'
 set row_security to 'off'
as $function$
declare
  v_admin boolean;
begin
  v_admin := coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
  if p_profesor is null or not coalesce(public.supervisado_por_mi(p_profesor) or v_admin, false) then
    raise exception 'No supervisas a esa persona.' using errcode = '42501';
  end if;
  return query
    select a.a from interno.alumnos_de(p_profesor) a(a)
     where v_admin or a.a in (select public.mis_supervisados());
end;
$function$;
revoke execute on function public.alumnos_de_para_ver_como(uuid) from public, anon;
grant execute on function public.alumnos_de_para_ver_como(uuid) to authenticated, service_role;
