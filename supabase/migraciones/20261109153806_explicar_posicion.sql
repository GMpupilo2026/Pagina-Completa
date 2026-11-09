-- «Explícame esta posición» (Mis estudios): la IA explica en palabras las
-- líneas que ya calculó Stockfish. Usa la misma IA por academia de «Mejorar
-- informe» (`academia_ia`, `ia_uso`, el mismo tope mensual), con dos cosas
-- nuevas:
--
-- 1. `academia_ia.alumnos`: si los ALUMNOS de esa academia también lo pueden
--    usar. Lo decide quien administra; por omisión, no. Quien da clase lo usa
--    siempre que su academia tenga IA, como «Mejorar informe».
-- 2. Un tope por persona y por día (en hora de Costa Rica): 15 para un alumno,
--    50 para quien da clase. Sin eso, un solo alumno con el dedo nervioso se
--    gasta el presupuesto del mes de toda su academia.
--
-- Ver «Explícame esta posición» en docs/decisiones/entrenamiento.md.

alter table public.academia_ia add column if not exists alumnos boolean not null default false;

-- Qué configuración le toca a una persona para explicar posiciones: la misma
-- regla de ia_para_usuario() (sus academias por nombre, la fila general al
-- final), pero un alumno solo cuenta las academias que lo permiten. Devuelve
-- también cuántas lleva hoy y su tope del día. SOLO la service role: el
-- modelo y el presupuesto no son de quien llama.
create or replace function public.ia_para_explicar(p_usuario uuid)
returns table(academia_id uuid, modelo text, restante_usd numeric, usadas_hoy integer, tope_dia integer)
language sql stable security definer set search_path to 'public' set row_security to off as $$
  with yo as (
    select p.id, (p.is_admin or p.role in ('profesor', 'admin')) as da_clase, p.is_admin
      from public.profiles p where p.id = p_usuario
  ), mias as (
    select m.academia_id as id from public.academia_miembros m where m.persona_id = p_usuario
    union
    select a.id from public.academias a where a.supervisor_id = p_usuario
  ), candidatas as (
    select c.academia_id, c.modelo, c.tope_mensual_usd, c.alumnos, 0 as orden, a.nombre
      from public.academia_ia c join public.academias a on a.id = c.academia_id
     where c.academia_id in (select id from mias)
    union all
    select c.academia_id, c.modelo, c.tope_mensual_usd, c.alumnos, 1, ''
      from public.academia_ia c
     where c.academia_id is null
       and ((select is_admin from yo) or not exists (select 1 from mias))
  ), gasto as (
    select c.academia_id, c.modelo, c.tope_mensual_usd, c.alumnos, c.orden, c.nombre,
           coalesce((select sum(u.costo_usd) from public.ia_uso u
                      where u.academia_id is not distinct from c.academia_id
                        and u.creado_at >= public.ia_inicio_de_mes()), 0) as gastado
      from candidatas c
  ), hoy as (
    select count(*)::integer as n from public.ia_uso u
     where u.usuario_id = p_usuario and u.que = 'explicar_posicion'
       and u.creado_at >= (date_trunc('day', now() at time zone 'America/Costa_Rica') at time zone 'America/Costa_Rica')
  )
  select g.academia_id, g.modelo, g.tope_mensual_usd - g.gastado,
         (select n from hoy),
         case when (select da_clase from yo) then 50 else 15 end
    from gasto g
   where exists (select 1 from yo)
     and g.modelo is not null
     and (coalesce((select da_clase from yo), false) or g.alumnos)
     and g.tope_mensual_usd > g.gastado
   order by g.orden, g.nombre
   limit 1;
$$;

-- Lo único que ve quien está en Mis estudios: cuántas explicaciones le quedan
-- hoy. NULL = no tiene IA (el botón no va); 0 = ya usó las de hoy. Ni el
-- modelo ni el presupuesto.
create or replace function public.ia_explicar_quedan()
returns integer language sql stable security definer set search_path to 'public' as $$
  select greatest(e.tope_dia - e.usadas_hoy, 0) from public.ia_para_explicar(auth.uid()) e;
$$;

-- Quien administra decide si los alumnos de una academia (o los que no son de
-- ninguna: p_academia null) pueden usarlo. No toca ni el modelo ni el tope.
create or replace function public.ia_guardar_alumnos(p_academia uuid, p_alumnos boolean)
returns public.academia_ia language plpgsql security definer set search_path to 'public' as $$
declare
  v_fila public.academia_ia;
begin
  if not coalesce(public.soy_admin(), false) then
    raise exception 'Solo quien administra decide la IA de cada academia.' using errcode = '42501';
  end if;
  if p_alumnos is null then
    raise exception 'Falta decir si los alumnos lo pueden usar.';
  end if;
  if p_academia is not null and not exists (select 1 from public.academias where id = p_academia) then
    raise exception 'Esa academia ya no existe.';
  end if;
  update public.academia_ia set alumnos = p_alumnos, updated_at = now(), updated_by = auth.uid()
   where academia_id is not distinct from p_academia
  returning * into v_fila;
  if not found then
    insert into public.academia_ia (academia_id, modelo, alumnos, updated_by)
    values (p_academia, null, p_alumnos, auth.uid()) returning * into v_fila;
  end if;
  return v_fila;
end;
$$;

revoke execute on function public.ia_para_explicar(uuid) from public, anon, authenticated;
grant execute on function public.ia_para_explicar(uuid) to service_role;
revoke execute on function public.ia_explicar_quedan() from public, anon;
grant execute on function public.ia_explicar_quedan() to authenticated, service_role;
revoke execute on function public.ia_guardar_alumnos(uuid, boolean) from public, anon;
grant execute on function public.ia_guardar_alumnos(uuid, boolean) to authenticated, service_role;
