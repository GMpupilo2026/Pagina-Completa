-- Quién pagó y quién debe (cobros.html, ficha «Cobros»): las cuentas de los
-- cobros filtrados (mes en que vencen, alumno, concepto o número), por moneda.
--
--   alumnos_deben    alumnos con algo sin pagar en lo filtrado
--   alumnos_pagaron  alumnos que pagaron TODO lo filtrado
--   cobros_deben     cobros con saldo, y lo que falta (total_debe)
--   vencidos         de esos, cuántos ya vencieron
--   cobros_pagados   cobros pagados enteros
--   total_pagado     todo lo que entró por lo filtrado, abonos incluidos
--
-- Los anulados no cuentan: no cobran nada. La cuenta la hace la base y no la
-- página (la lista se corta a las 1000 filas). SECURITY INVOKER sobre
-- cobros_vista (también invoker): cada quien cuenta lo que su RLS le deja ver.
-- Ver «Quién pagó y quién debe» en docs/decisiones/cobros-acceso-y-tienda.md.

create or replace function public.cobros_quien_debe(
  p_desde date default null, p_hasta date default null,
  p_alumno uuid default null, p_buscar text default null)
returns table (moneda text, alumnos_deben integer, alumnos_pagaron integer,
               cobros_deben integer, total_debe numeric, vencidos integer,
               cobros_pagados integer, total_pagado numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  with c as (
    select v.student_id, v.moneda, v.saldo, v.pagado, v.situacion
      from public.cobros_vista v
     where v.situacion <> 'anulado'
       and (p_desde is null or v.vence >= p_desde)
       and (p_hasta is null or v.vence <= p_hasta)
       and (p_alumno is null or v.student_id = p_alumno)
       and (nullif(btrim(p_buscar), '') is null
            or v.concepto ilike '%' || btrim(p_buscar) || '%'
            or v.consecutivo ilike '%' || btrim(p_buscar) || '%')
  ), por_alumno as (
    select c.moneda, c.student_id, sum(c.saldo) as debe
      from c group by c.moneda, c.student_id
  )
  select m.moneda,
         (select count(*) from por_alumno a where a.moneda = m.moneda and a.debe > 0)::integer,
         (select count(*) from por_alumno a where a.moneda = m.moneda and a.debe <= 0)::integer,
         (count(*) filter (where c.saldo > 0))::integer,
         coalesce(sum(c.saldo) filter (where c.saldo > 0), 0),
         (count(*) filter (where c.situacion = 'vencido'))::integer,
         (count(*) filter (where c.saldo <= 0))::integer,
         coalesce(sum(c.pagado), 0)
    from (select distinct c.moneda from c) m
    join c on c.moneda = m.moneda
   group by m.moneda
   order by m.moneda;
$$;
revoke execute on function public.cobros_quien_debe(date, date, uuid, text) from public, anon;
grant execute on function public.cobros_quien_debe(date, date, uuid, text) to authenticated;
