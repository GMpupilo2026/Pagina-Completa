-- El tema más flojo de cada alumno: en qué motivo le cuesta más resolver limpio.
--
-- Desde #491 cada ejercicio de Ejercicios por tema (y los de Táctica, que viven
-- ahí) guarda en training_progress.detail si salió limpio (sin error ni pista).
-- Con eso se puede decir «su tema más flojo es la clavada: 45 % limpio de 11»,
-- que es lo que Informes y el «Hoy te toca» del hub necesitaban.
--
-- `p_temas` es la lista de temas que cuentan: los MOTIVOS (clavada, horquilla,
-- mate del pasillo…), no «Mezcla equilibrada» ni «Medio juego», que no dicen
-- qué practicar. La manda la página desde entreno/data/temas-motivos.json (lo
-- genera herramientas/temas-motivos.js desde temas.json): así la lista vive en
-- un solo lugar y la base no guarda una copia que se desactualice.
--
-- Cuenta ejercicios DISTINTOS, y un tema entra desde 5 con «cómo salió»:
-- con menos, un solo error ya lo pone en 0 % y lo haría «el más flojo».
-- Empate: el que tiene más ejercicios (la medida más firme), y después el nombre.
--
-- SECURITY INVOKER: cada quien recibe lo que la RLS de training_progress le deja
-- ver (el alumno lo suyo; el profesor, sus alumnos; administración, todos). Una
-- fila por alumno, así que no se acerca al corte de mil filas de PostgREST
-- más que la lista de alumnos misma.
create or replace function public.informes_tema_mas_flojo(p_temas text[])
returns table (
  student_id uuid,
  tema text,
  intentos integer,
  limpios integer,
  porcentaje integer
)
language sql
stable
security invoker
set search_path = public
as $$
with por_tema as (
  select tp.student_id,
         tp.detail->>'theme' as tema,
         count(distinct tp.detail->>'puzzle_id')::int as intentos,
         count(distinct tp.detail->>'puzzle_id') filter (where tp.detail->>'limpio' = 'true')::int as limpios
  from public.training_progress tp
  where tp.activity in ('temas', 'tactica')
    and tp.detail ? 'limpio'
    and tp.detail->>'theme' = any (p_temas)
    and coalesce(tp.detail->>'puzzle_id', '') <> ''
  group by 1, 2
)
select distinct on (p.student_id)
       p.student_id, p.tema, p.intentos, p.limpios,
       round(100.0 * p.limpios / p.intentos)::int
from por_tema p
where p.intentos >= 5
order by p.student_id, p.limpios::numeric / p.intentos, p.intentos desc, p.tema;
$$;
revoke execute on function public.informes_tema_mas_flojo(text[]) from public, anon;
grant execute on function public.informes_tema_mas_flojo(text[]) to authenticated;
