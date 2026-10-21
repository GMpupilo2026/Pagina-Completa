-- ¿La prueba de estilo funciona? Las cuentas para responderlo, en la base
-- (Informes → «Prueba de estilo»).
--
-- SECURITY INVOKER: cuenta solo las pruebas que quien pregunta ya puede ver
-- (las de sus alumnos; administración, todas). Devuelve números, no
-- respuestas de nadie.
--
-- p_primero: de cada posición del banco, su eje y cuál de sus dos jugadas
-- es el primer polo ({"es01": {"eje": "ataque", "primero": "a"}, …}). El
-- banco vive en js/estilo-items.js y no en la base: lo manda la página.
--
--   pruebas, alumnos, por_version   cuántas hay
--   por_posicion                    respuestas por posición (sin los
--                                   controles): la calibración pide 30
--   repeticion                      de quien la hizo dos veces con 14 días o
--                                   más entre una y otra, en las posiciones
--                                   que contestó las dos veces: cuántas
--                                   veces eligió la misma jugada
--   partidas                        por prueba y eje, qué parte de sus
--                                   respuestas y qué parte de los momentos
--                                   de sus partidas fueron al primer polo
--                                   (con 3 o más de cada uno): la página
--                                   calcula si van juntos
-- Ver «¿La prueba funciona?» en docs/decisiones/entrenamiento.md.

create or replace function public.estilo_salud(p_primero jsonb)
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $$
with pr as (
  select p.id, p.alumno_id, p.version, p.created_at, p.respuestas, p.partidas
  from public.estilo_pruebas p
),
resp as (
  select pr.id prueba, pr.alumno_id, pr.created_at, r->>'id' item, r->>'eleccion' eleccion
  from pr, jsonb_array_elements(pr.respuestas) r
  where not (r ? 'control') and r->>'eleccion' in ('a', 'b')
),
pares as (
  -- Cada prueba con la anterior del mismo alumno, si pasaron 14 días o más.
  select a.id actual, b.id anterior
  from pr a
  join lateral (
    select x.id from pr x
    where x.alumno_id = a.alumno_id and x.created_at <= a.created_at - interval '14 days'
    order by x.created_at desc limit 1
  ) b on true
),
repetidas as (
  select count(*) filter (where r1.eleccion = r2.eleccion) iguales, count(*) comparadas, count(distinct pa.actual) pares
  from pares pa
  join resp r1 on r1.prueba = pa.actual
  join resp r2 on r2.prueba = pa.anterior and r2.item = r1.item
),
de_prueba as (
  select r.prueba, p_primero->r.item->>'eje' eje,
         avg(case when r.eleccion = p_primero->r.item->>'primero' then 1.0 else 0 end) p, count(*) n
  from resp r
  where p_primero ? r.item
  group by 1, 2
),
de_partidas as (
  select pr.id prueba, m->>'eje' eje,
         avg(case when (m->>'primero')::boolean then 1.0 else 0 end) p, count(*) n
  from pr, jsonb_array_elements(coalesce(pr.partidas, '[]'::jsonb)) m
  where m->>'eje' is not null and m ? 'primero'
  group by 1, 2
)
select jsonb_build_object(
  'pruebas', (select count(*) from pr),
  'alumnos', (select count(distinct alumno_id) from pr),
  'por_version', coalesce((select jsonb_object_agg(version, n) from (select version, count(*) n from pr group by version) v), '{}'::jsonb),
  'por_posicion', coalesce((select jsonb_object_agg(item, n) from (select item, count(*) n from resp group by item) x), '{}'::jsonb),
  'repeticion', (select jsonb_build_object('pares', pares, 'comparadas', comparadas, 'iguales', iguales) from repetidas),
  'partidas', coalesce((
    select jsonb_agg(jsonb_build_object('eje', a.eje, 'prueba', round(a.p, 3), 'n_prueba', a.n, 'partidas', round(b.p, 3), 'n_partidas', b.n))
    from de_prueba a join de_partidas b on b.prueba = a.prueba and b.eje = a.eje
    where a.n >= 3 and b.n >= 3), '[]'::jsonb)
);
$$;
revoke execute on function public.estilo_salud(jsonb) from public, anon;
grant execute on function public.estilo_salud(jsonb) to authenticated;