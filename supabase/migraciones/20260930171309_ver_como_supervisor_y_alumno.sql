-- «Panel de:» también de un supervisor y de un estudiante (solo quien administra).
--
-- Quien administra ya podía mirar el panel de un profesor o de un coordinador
-- con SUS números (20260925002519_ver_como_persona.sql). Para dar soporte
-- —«no me aparece la tarea», «no veo a mis profesores»— le hace falta mirar
-- también el de un supervisor y el de un estudiante. Igual que antes, no se
-- entra a la cuenta de nadie: la sesión sigue siendo la de quien administra y
-- solo se leen datos.
--
-- - personas_para_ver_como() devuelve además `tipo` («profesor»,
--   «coordinador», «supervisor» o «alumno»). A quien administra le suma los
--   supervisores y los estudiantes; a quien supervisa le sigue dando solo sus
--   profesores y coordinadores (mirar a otro supervisor o a un estudiante es
--   cosa de administración). Cambia lo que devuelve, así que se borra y se
--   vuelve a crear.
-- - panel_supervisor_de() da los tres números del panel de ESE supervisor
--   (estudiantes, profesores y quién lleva 4 días sin entrenar), contados
--   sobre lo que él supervisa. Solo para quien administra.
-- - alumnos_de_para_ver_como() entiende también a un supervisor: sus
--   estudiantes a cargo, para que Informes se filtre igual que el suyo.
--
-- Del estudiante no hace falta ninguna función nueva: lo que su panel lee
-- (tareas_con_avance, examenes_con_nota, progreso_dias_y_racha,
-- mi_entreno_resumen, training_progress…) ya acepta el id del alumno y la RLS
-- se lo deja leer a quien administra.

-- A quién supervisa ESA persona, con la misma cuenta que
-- interno.supervisados_por_mi() + mis_supervisados() hacen para uno mismo,
-- escrita para otra persona: si supervisa dos academias o más, solo la gente
-- de la que tiene activa (la que eligió, o la primera por nombre); si no,
-- sus cuentas, los alumnos de sus profesores, la gente de su academia y sus
-- propios alumnos. Así el panel que se mira tiene los números que esa persona
-- ve. Es interna: la llaman las funciones de abajo.
create or replace function interno.supervisados_de(p_supervisor uuid)
 returns setof uuid
 language sql
 stable security definer
 set search_path to 'public'
 set row_security to 'off'
as $function$
  with sup as (
    select s.id from public.profiles s where s.id = p_supervisor and s.es_supervisor
  ),
  suyas as (
    select a.id, a.nombre from public.academias a where a.supervisor_id in (select id from sup)
  ),
  act as (
    select case when (select count(*) from suyas) < 2 then null else coalesce(
      (select sa.academia_id from public.supervisor_academia_activa sa
        where sa.supervisor_id = p_supervisor and sa.academia_id in (select id from suyas)),
      (select id from suyas order by nombre collate "es-CR-x-icu", id limit 1)) end as a
  )
  -- Con una academia activa: su gente y nada más.
  select m.persona_id from public.academia_miembros m
   where m.academia_id = (select a from act) and m.persona_id <> p_supervisor
  union
  -- Sin academia activa (una o ninguna): como siempre.
  select sc.persona_id from public.supervisor_cuentas sc
   where sc.supervisor_id in (select id from sup) and (select a from act) is null
  union
  select a from public.supervisor_cuentas sc
    cross join lateral interno.alumnos_de(sc.persona_id) a
   where sc.supervisor_id in (select id from sup) and (select a from act) is null
  union
  select m.persona_id from suyas ac
    join public.academia_miembros m on m.academia_id = ac.id
   where m.persona_id <> p_supervisor and (select a from act) is null
  union
  select a from interno.alumnos_de(p_supervisor) a
   where exists (select 1 from sup) and (select a from act) is null;
$function$;
revoke execute on function interno.supervisados_de(uuid) from public, anon, authenticated;

drop function if exists public.personas_para_ver_como();
create function public.personas_para_ver_como()
 returns table(id uuid, nombre text, es_coordinador boolean, tipo text)
 language sql
 stable security definer
 set search_path to 'public'
 set row_security to 'off'
as $function$
  with yo as (
    select coalesce(p.is_admin, false) as admin, coalesce(p.es_supervisor, false) as sup
      from public.profiles p where p.id = auth.uid()
  )
  select p.id, coalesce(nullif(btrim(p.full_name), ''), p.email), coalesce(p.es_coordinador, false),
         case when p.role = 'alumno' then 'alumno'
              when coalesce(p.es_supervisor, false) then 'supervisor'
              when coalesce(p.es_coordinador, false) then 'coordinador'
              else 'profesor' end
    from public.profiles p
   where auth.uid() is not null
     and p.id <> auth.uid()
     and not coalesce(p.is_admin, false)
     and (
       -- El equipo docente: quien administra, todo; quien supervisa, el suyo.
       (p.role = 'profesor' and not coalesce(p.es_supervisor, false)
        and (coalesce((select admin from yo), false)
             or (coalesce((select sup from yo), false) and p.id in (select public.mis_supervisados()))))
       -- Supervisores y estudiantes: solo quien administra.
       or (coalesce((select admin from yo), false)
           and ((p.role = 'profesor' and coalesce(p.es_supervisor, false)) or p.role = 'alumno'))
     )
   order by coalesce(nullif(btrim(p.full_name), ''), p.email) collate "es-CR-x-icu";
$function$;
revoke execute on function public.personas_para_ver_como() from public, anon;
grant execute on function public.personas_para_ver_como() to authenticated, service_role;

-- Los números del panel de ESE supervisor: los de cargarPanelSupervisor()
-- (mi_gente por rol y los inactivos de informes_inactivos(4)), contados sobre
-- lo que él supervisa. Solo quien administra.
create or replace function public.panel_supervisor_de(p_supervisor uuid)
 returns table(alumnos integer, profesores integer, inactivos integer)
 language plpgsql
 stable security definer
 set search_path to 'public'
 set row_security to 'off'
as $function$
begin
  if p_supervisor is null or not coalesce(
       (select p.is_admin from public.profiles p where p.id = auth.uid()), false) then
    raise exception 'Solo quien administra mira el panel de un supervisor.' using errcode = '42501';
  end if;
  return query
  with suyos as (
    select p.id, p.role from public.profiles p
     where p.id in (select interno.supervisados_de(p_supervisor))
       and not coalesce(p.is_admin, false)
  )
  select
    (select count(*)::int from suyos where role = 'alumno'),
    (select count(*)::int from suyos where role = 'profesor'),
    (select count(*)::int from suyos s
      where s.role = 'alumno'
        and not exists (select 1 from public.training_progress tp
                         where tp.student_id = s.id
                           and tp.created_at >= now() - interval '4 days'));
end;
$function$;
revoke execute on function public.panel_supervisor_de(uuid) from public, anon;
grant execute on function public.panel_supervisor_de(uuid) to authenticated, service_role;

-- Informes mirando como un supervisor: sus estudiantes a cargo. Lo demás,
-- como estaba.
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
  if v_admin and coalesce((select p.es_supervisor from public.profiles p where p.id = p_profesor), false) then
    return query select s from interno.supervisados_de(p_profesor) s;
    return;
  end if;
  return query
    select a.a from interno.alumnos_de(p_profesor) a(a)
     where v_admin or a.a in (select public.mis_supervisados());
end;
$function$;
revoke execute on function public.alumnos_de_para_ver_como(uuid) from public, anon;
grant execute on function public.alumnos_de_para_ver_como(uuid) to authenticated, service_role;
