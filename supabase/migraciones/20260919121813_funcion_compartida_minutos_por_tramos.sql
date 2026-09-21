
-- La cuenta de "minutos activos" (unir tramos superpuestos, un tramo sin
-- cierre vale como mucho un latido de 20s) estaba copiada tal cual en
-- informes_resumen_alumnos(), informe_de_alumno() y reporte_actividades():
-- si un día hay que corregir el criterio, hay que acordarse de tocarlo en
-- los tres lugares. Ahora vive en un solo sitio.
--
-- particion es un texto libre (normalmente student_id::text, o
-- student_id::text || ':' || origen) para que el mismo array pueda traer
-- tramos de varias personas o de varios orígenes a la vez, y la función los
-- agrupe cada uno por su cuenta.
create type public.tramo_crudo as (particion text, joined_at timestamptz, left_at timestamptz);

create or replace function public.minutos_por_tramos(p_tramos public.tramo_crudo[])
returns table(particion text, minutos double precision)
language sql
stable
set search_path to 'public'
as $function$
with intervalos as (
  -- Un tramo sin left_at vale como mucho un latido (20s), nunca más que
  -- ahora: es la misma regla que aplica el navegador (ver tiempo-plataforma.js).
  select t.particion,
         t.joined_at as ini,
         greatest(t.joined_at,
                  coalesce(t.left_at, least(now(), t.joined_at + interval '20 seconds'))) as fin
  from unnest(p_tramos) as t
  where t.joined_at is not null
),
marcados as (
  -- Un tramo que empieza antes de que termine el anterior continúa la misma
  -- estancia; si no, empieza una nueva. Así dos pestañas abiertas a la vez
  -- (o un tramo que se solapa con uno más largo) no cuentan el tiempo dos veces.
  select particion, ini, fin,
         case when ini <= max(fin) over (partition by particion order by ini
                                         rows between unbounded preceding and 1 preceding)
              then 0 else 1 end as nueva
  from intervalos
),
numerados as (
  select particion, ini, fin,
         sum(nueva) over (partition by particion order by ini
                          rows between unbounded preceding and current row) as estancia
  from marcados
),
estancias as (
  select particion, min(ini) as ini, max(fin) as fin
  from numerados
  group by particion, estancia
)
select particion, sum(extract(epoch from (fin - ini))) / 60.0 as minutos
from estancias
group by particion;
$function$;
