-- Los gafetes de la Eliminatoria JDN de Pérez Zeledón llevan el ID FIDE de
-- cada jugador en el frente (pedido del dueño, 19/11/2026). Pareo Integral
-- no lo publica nunca (en lo publicado va como huella, `ident`), y la lista
-- de FIDE dejó de contestar a la Edge Function `pareo-listas-elo`. El que
-- sí está es el que se puso al inscribirse: `pareo_preinscripciones.fide_id`,
-- tabla que nadie lee desde afuera (solo la función pareo-publicar, con la
-- clave del torneo).
--
-- Esta función se lo da SOLO a quien administra (gafetes.html es solo de
-- administración), y solo de las inscripciones ACEPTADAS de un torneo
-- publicado: el nombre (como entra a la lista del torneo) y el ID FIDE.
-- Nada más (ni el contacto, ni la fecha de nacimiento, ni el responsable).
-- Ver «Los gafetes de la Eliminatoria Cantonal JDN de Pérez Zeledón» en
-- docs/decisiones/juegos-y-torneos.md.
create function public.pareo_fide_de_aceptados(p_publicado uuid)
returns table(nombre text, fide_id text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce((select public.soy_admin()), false) then
    raise exception 'Solo quien administra puede ver los ID FIDE de las inscripciones.' using errcode = '42501';
  end if;
  return query
    select q.nombre::text, q.fide_id::text
      from public.pareo_preinscripciones q
     where q.publicado_id = p_publicado
       and q.estado = 'aceptada'
       and q.fide_id ~ '^[1-9][0-9]*$';   -- un «0» no es un ID FIDE
end;
$$;
revoke execute on function public.pareo_fide_de_aceptados(uuid) from public, anon;
grant execute on function public.pareo_fide_de_aceptados(uuid) to authenticated;
