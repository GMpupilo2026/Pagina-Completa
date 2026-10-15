-- El resumen de la lista de recibos (cobros.html, ficha «Recibos»): cuántos
-- recibos hay con los mismos filtros que la lista (mes, alumno, número), por
-- moneda: los vigentes y su total, los anulados y su total, y cuántos siguen
-- por revisar y entregar.
--
-- La cuenta la hace la base, no la página: bajarse los recibos para sumarlos
-- en el navegador se corta a las 1000 filas sin avisar. SECURITY INVOKER sobre
-- recibos_vista (que también es invoker): cada quien suma solo lo que la RLS
-- de recibos ya le deja ver.
-- Ver «Recibos por academia» en docs/decisiones/cobros-acceso-y-tienda.md.

create or replace function public.recibos_resumen(
  p_desde date default null, p_hasta date default null,
  p_alumno uuid default null, p_buscar text default null)
returns table (moneda text, vigentes integer, total_vigentes numeric,
               anulados integer, total_anulados numeric, por_entregar integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(v.moneda, 'CRC'),
         (count(*) filter (where v.estado = 'emitido'))::integer,
         coalesce(sum(v.total) filter (where v.estado = 'emitido'), 0),
         (count(*) filter (where v.estado = 'anulado'))::integer,
         coalesce(sum(v.total) filter (where v.estado = 'anulado'), 0),
         (count(*) filter (where v.estado = 'emitido' and v.entrega is null))::integer
    from public.recibos_vista v
   where (p_desde is null or v.fecha >= p_desde)
     and (p_hasta is null or v.fecha <= p_hasta)
     and (p_alumno is null or v.student_id = p_alumno)
     and (nullif(btrim(p_buscar), '') is null or v.numero ilike '%' || btrim(p_buscar) || '%')
   group by 1
   order by 1;
$$;
revoke execute on function public.recibos_resumen(date, date, uuid, text) from public, anon;
grant execute on function public.recibos_resumen(date, date, uuid, text) to authenticated;
