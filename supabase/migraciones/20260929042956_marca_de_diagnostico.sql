-- La marca del PDF de un diagnóstico de visitante.
--
-- El PDF que se descarga en Informes («⬇ Descargar PDF») lleva la marca de la
-- academia por cuyo enlace llegó el diagnóstico: su logo como cabecera y como
-- marca de agua, su color y su WhatsApp. Solo si el supervisor del enlace es
-- de UNA academia, la regla de siempre (formularios, correos, la página del
-- diagnóstico). Sin academia, el PDF sale como antes, con la marca de Oscar.
--
-- La puede pedir quien puede ver ese diagnóstico: administración o el
-- supervisor dueño del enlace (la misma regla que diagnosticos_publicos_select).
-- A cualquier otro no le devuelve nada.
--
-- Ver «El PDF del diagnóstico con la marca de la academia» en
-- docs/decisiones/informes.md.

create or replace function public.marca_de_diagnostico(p_id uuid)
returns table(nombre text, color text, logo_path text, whatsapp text)
language sql
stable
security definer
set search_path to 'public'
set row_security to off
as $$
  select a.nombre, a.color, a.logo_path, a.whatsapp
    from public.diagnosticos_publicos d
    join public.academias a on a.supervisor_id = d.supervisor_id
   where d.id = p_id
     and (select count(*) from public.academias x where x.supervisor_id = d.supervisor_id) = 1
     and (coalesce((select p.is_admin from public.profiles p where p.id = (select auth.uid())), false)
          or d.supervisor_id = (select auth.uid()));
$$;
revoke execute on function public.marca_de_diagnostico(uuid) from public, anon;
grant execute on function public.marca_de_diagnostico(uuid) to authenticated;
