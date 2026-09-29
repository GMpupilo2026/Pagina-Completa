-- El tema de la academia en el diagnóstico de visitante.
--
-- Quien abre el enlace de un supervisor (entreno/diagnostico.html?s=<código>)
-- ve la página con la marca de SU academia: el nombre, el logo, el color y el
-- WhatsApp para escribirle. Es la misma marca que ya llevan sus formularios
-- (formulario_publico) y sus correos, y la misma regla: solo si el supervisor
-- es de UNA academia; con dos o ninguna, la página queda como siempre.
--
-- Ver «El tema de la academia en el diagnóstico» en docs/decisiones/informes.md.

create or replace function public.enlace_diagnostico_marca(p_codigo text)
returns table(nombre text, color text, logo_path text, whatsapp text)
language sql
stable
security definer
set search_path to 'public'
set row_security to off
as $$
  select a.nombre, a.color, a.logo_path, a.whatsapp
    from public.enlaces_diagnostico e
    join public.profiles p on p.id = e.supervisor_id
    join public.academias a on a.supervisor_id = p.id
   where e.codigo = p_codigo
     and (p.es_supervisor or p.is_admin)
     and (select count(*) from public.academias x where x.supervisor_id = p.id) = 1;
$$;
revoke execute on function public.enlace_diagnostico_marca(text) from public;
grant execute on function public.enlace_diagnostico_marca(text) to anon, authenticated;
