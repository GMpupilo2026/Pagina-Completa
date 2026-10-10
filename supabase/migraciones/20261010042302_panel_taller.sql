-- El panel de taller: una academia que sigue un taller con sesiones de fecha
-- fija (el de los asesores regionales del MEP) le muestra a sus alumnos el
-- calendario de clases en lugar de «Hoy te toca» y de la invitación al
-- diagnóstico, que hablan de entrenar todos los días.
--
-- Es una decisión de la academia, no de cada alumno: la enciende quien
-- administra o su supervisor (la misma regla que sus datos de contacto). El
-- cambio queda en la bitácora por el trigger `auditar` que ya tiene la tabla.
-- No reparte permisos: solo cambia qué tarjetas pinta el panel.
--
-- Las sesiones no se guardan acá: son el horario del profe (horario_clases,
-- una fila por sesión con desde = hasta), que el alumno ya lee con
-- mis_clases_proximas().
--
-- Ver «El panel de taller» en docs/decisiones/paneles.md.

alter table public.academias add column panel_taller boolean not null default false;
comment on column public.academias.panel_taller is
  'Sus alumnos ven el calendario de clases en lugar de «Hoy te toca» y del diagnóstico (js/calendario-taller.js). La cambia academia_panel_taller().';

-- ¿Soy de alguna academia con panel de taller? Contesta solo sobre quien
-- pregunta; por eso no recibe a nadie.
create or replace function public.mi_panel_taller()
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select exists (
    select 1
      from public.academia_miembros am
      join public.academias a on a.id = am.academia_id
     where am.persona_id = (select auth.uid())
       and a.panel_taller
  );
$function$;
revoke execute on function public.mi_panel_taller() from public, anon;
grant execute on function public.mi_panel_taller() to authenticated;

-- Enciende o apaga el panel de taller de una academia. Devuelve la academia
-- tal como quedó, que es lo que pinta academias.html.
create or replace function public.academia_panel_taller(p_id uuid, p_valor boolean)
 returns public.academias
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_fila public.academias;
begin
  if not coalesce(public.soy_admin() or public.supervisa_academia(p_id), false) then
    raise exception 'Solo su supervisor o quien administra cambia el panel de sus alumnos.' using errcode = '42501';
  end if;
  update public.academias set panel_taller = coalesce(p_valor, false), updated_at = now()
   where id = p_id returning * into v_fila;
  if not found then raise exception 'Esa academia ya no existe.'; end if;
  return v_fila;
end;
$function$;
revoke execute on function public.academia_panel_taller(uuid, boolean) from public, anon;
grant execute on function public.academia_panel_taller(uuid, boolean) to authenticated;
