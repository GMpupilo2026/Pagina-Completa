-- Llena public.uni_clasificacion: la clasificación completa de los torneos
-- del catálogo (uni_torneos) que no están en uni_resultados y ya terminaron.
-- Son los de una universidad (los Blitz del club de la UCR, el interno del
-- TEC, los de CENFOTEC, la UNED y la UISIL) y los dos grupos del
-- Interuniversitario 2011. Reemplaza la tabla entera.
--
-- Lee la clasificación (art=1) de cada torneo, pedida como en cargar.sql, en
-- paginas(tnr, contenido) (la misma que usa catalogo.sql). Las columnas
-- cambian de un torneo a otro, así que se buscan por su encabezado:
--   - el Elo viene como «Elo», «FIDE» o «EloN» (el primero que tenga valor);
--   - los puntos, en «Pts.»; si no está esa columna, el primer desempate
--     («Des 1») son los puntos (así los publica chess-results);
--   - el título (FM, CM…) es la columna sin nombre que va antes de «Nombre»;
--   - un puesto vacío es un empate con el de arriba.
-- Ver «La ficha del jugador universitario» en docs/decisiones/juegos-y-torneos.md.

with pag as (
  select p.tnr, p.contenido c
    from paginas p join public.uni_torneos t using (tnr)
   where not t.en_curso and t.modalidad = 'I'
     and not exists (select 1 from public.uni_resultados r where r.tnr = t.tnr)),
tb as (select tnr, split_part(substr(c, strpos(c, 'class="CRs1"')), '</table>', 1) html from pag),
f as (
  select tb.tnr, u.o, u.p like '%<th%' cab,
         array(select btrim(regexp_replace(regexp_replace(x, '<[^>]+>', '', 'g'), '&nbsp;', '', 'g'), E' \r\n\t')
                 from unnest(regexp_split_to_array(u.p, '</t[hd]>')) x) cel
    from tb, unnest(string_to_array(substr(tb.html, strpos(tb.html, '<tr')), '</tr>')) with ordinality u(p, o)
   where u.p like '%<t%'),
h as (
  select tnr, cols, array_position(cols, 'Nombre') inom,
         array_position(cols, 'Rk.') irk,
         coalesce(array_position(cols, 'Pts.'), array_position(cols, 'Des 1')) ipts,
         array_position(cols, 'Club/Ciudad') iclub,
         array[array_position(cols, 'Elo'), array_position(cols, 'FIDE'), array_position(cols, 'EloN')] ielo
    from (select tnr, cel cols from f where cab and o = 1) x),
fi as (
  select f.tnr, f.o, nullif(f.cel[h.irk], '')::int rk0, btrim(f.cel[h.inom]) nombre,
         coalesce(nullif(f.cel[h.inom - 1], ''), '') titulo,
         coalesce(case when h.iclub is not null then f.cel[h.iclub] end, '') club,
         (select nullif(regexp_replace(f.cel[i], '\D', '', 'g'), '')::int from unnest(h.ielo) i where i is not null and f.cel[i] ~ '^\d{3,4}$' and f.cel[i]::int > 0 limit 1) elo,
         nullif(replace(f.cel[h.ipts], ',', '.'), '')::numeric puntos
    from f join h using (tnr)
   where not f.cab and h.inom is not null and btrim(coalesce(f.cel[h.inom], '')) <> ''),
num as (
  select fi.*, (row_number() over (partition by tnr order by o))::smallint orden,
         max(rk0) over (partition by tnr order by o) puesto
    from fi),
borrar as (delete from public.uni_clasificacion returning 1)
insert into public.uni_clasificacion (tnr, orden, puesto, nombre, titulo, elo, club, puntos)
select tnr, orden, puesto, left(nombre, 120), left(titulo, 8), elo, left(club, 120), puntos
  from num
 where puesto is not null and (select count(*) from borrar) >= 0;
