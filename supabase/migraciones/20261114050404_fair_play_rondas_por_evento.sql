-- Fair Play en cualquier evento de la Mesa del árbitro, no solo en el Centroamericano.
--
-- Pedido del dueño (14/11/2026, en el Tacho Chess 2): en la cara neutra de la
-- Mesa no salían Fair Play ni Transmisión. Ahora salen, y para eso la ronda
-- de cada categoría tiene que ser la suya:
--
--  - Hasta hoy centroamericano_fp_rondas() le daba a cada categoría la ronda
--    MÁS ALTA de todas (separando solo las de prueba): en el Centroamericano
--    todas iban a la par y así una lectura atrasada no dejaba a una categoría
--    en la ronda anterior. Con dos eventos a la vez, uno le prestaba su ronda
--    al otro. Ahora el máximo es dentro de cada EVENTO.
--  - Un torneo de Pareo Integral (fuente = 'pareo') lleva SU ronda: en una sala
--    con varias categorías de Pareo cada una empareja a su ritmo (el 1er ciclo
--    puede ir en la 3 cuando el 2do va en la 2), y la ronda de otra dejaría su
--    sorteo sin mesas.
--
-- Lo demás queda igual: el permiso (interno.fp_puede), solo categorías no
-- archivadas y con algún árbitro con enlace vigente, y las mismas columnas.
-- Ver «Fair Play y Transmisión en cualquier evento» en
-- docs/decisiones/juegos-y-torneos.md.

create or replace function public.centroamericano_fp_rondas()
 returns table(tnr text, nombre text, prueba boolean, ronda integer)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
begin
  if not interno.fp_puede() then raise exception 'Sin permiso para Fair Play' using errcode = '42501'; end if;
  return query
  with cat as (
    select t.tnr, t.nombre, coalesce(t.prueba, false) prueba, coalesce(t.evento, '') evento, t.fuente = 'pareo' de_pareo,
           greatest(
             coalesce((select max(p.ronda) from public.centroamericano_progreso p join public.centroamericano_asignaciones a on a.id = p.asignacion_id where a.tnr = t.tnr), 0),
             coalesce((select l.ronda from public.centroamericano_lecturas l where l.tnr = t.tnr), 0),
             coalesce((select max(i.ronda) from public.centroamericano_inicios_torneo i where i.tnr = t.tnr), 0),
             coalesce((select max(f.ronda) from public.centroamericano_fp_partidas f where f.tnr = t.tnr), 0)) r
      from public.centroamericano_torneos t
     where not t.archivado
       and exists (select 1 from public.centroamericano_asignaciones a where a.tnr = t.tnr and not a.revocada and a.vence > now())
  )
  select c.tnr, c.nombre, c.prueba,
         (case when c.de_pareo then c.r else max(c.r) over (partition by c.prueba, c.evento) end)::integer
    from cat c;
end;
$function$;

revoke execute on function public.centroamericano_fp_rondas() from public, anon;
grant execute on function public.centroamericano_fp_rondas() to authenticated;
