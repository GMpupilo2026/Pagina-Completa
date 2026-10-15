-- Llena public.uni_torneos, el catálogo de «Torneos universitarios de Costa
-- Rica» (torneos-universitarios.html). Reemplaza la tabla entera.
--
-- Son tres partes:
--   1) los torneos entre universidades que ya están en uni_resultados (con su
--      edición): el nombre sale de la edición y la categoría, el podio de sus
--      tres primeros (un puesto vacío es un empate con el de arriba);
--   2) los que no van al medallero: el XXV JUNCOS 2026 mientras se juega (en
--      curso, sin podio) y los grupos de la fase 1 del Interuniversitario 2011;
--   3) los de una universidad: los Blitz del club de la UCR, sus
--      preparatorios para el JUDUCA, su aniversario y sus amistosos, el
--      interno del TEC, el Desafío Mentes Maestras de CENFOTEC, los
--      recreativos de la UNED en Pérez Zeledón y el de la UISIL en Río Claro.
-- Las partes 2 y 3 leen la clasificación (art=1) de cada torneo, pedida como
-- en cargar.sql, en paginas(tnr, contenido); la fecha, el lugar y el ritmo,
-- de arbitros_cr_cr cuando el torneo está ahí.
--
-- Fuera a propósito: los torneos de otros que solo se juegan en un recinto
-- universitario (regionales de los JDE, campeonatos nacionales de la
-- federación, abiertos como el de Golfito o el de «Ajedrez sin fronteras») y
-- el universitario «Remberto Fernández» de Cuba.
-- Ver «Torneos universitarios de Costa Rica» en
-- docs/decisiones/juegos-y-torneos.md.

with ed(edicion, titulo, organiza, fecha, lugar) as (values
  ('2010-JUDUCA', 'JUDUCA 2010', 'JUDUCA (Honduras)', date '2010-04-26', 'Honduras'),
  ('2011-JUNCOS', 'JUNCOS 2011', 'TEC', date '2011-05-10', 'Instituto Tecnológico de Costa Rica'),
  ('2011-INTER', 'Interuniversitario UNA 2011', 'UNA', date '2011-10-01', 'Universidad Nacional de Costa Rica'),
  ('2013-JUNCOS', 'JUNCOS 2013', 'UNA', date '2013-04-23', 'Universidad Nacional'),
  ('2014-FECUNDE', 'FECUNDE 2014', 'TEC', date '2014-03-22', 'TEC San José'),
  ('2014-JUDUCA', 'JUDUCA 2014', 'JUDUCA (Nicaragua)', date '2014-04-07', 'Nicaragua'),
  ('2014-LIGA', 'Liga Universitaria 2014', 'UNA', date '2014-09-13', 'Gimnasio Universidad Nacional'),
  ('2015-JUNCOS', 'JUNCOS 2015', 'UNED', date '2015-09-10', 'San José'),
  ('2016-JUDUCA', 'JUDUCA 2016', 'JUDUCA (Honduras)', date '2016-04-18', 'Honduras'),
  ('2016-GP1', 'Grand Prix universitario 2016, primera etapa', 'TEC', date '2016-08-27', 'Tecnológico de Costa Rica'),
  ('2016-GP2', 'Grand Prix universitario 2016, segunda etapa', 'UTN', date '2016-08-27', 'Universidad Técnica Nacional'),
  ('2016-GP3', 'Grand Prix universitario 2016, tercera etapa', 'UCR', date '2016-10-29', 'Universidad de Costa Rica'),
  ('2017-JUNCOS', 'JUNCOS 2017', 'UCR', date '2017-03-15', 'Universidad de Costa Rica'),
  ('2018-JUDUCA', 'JUDUCA 2018', 'JUDUCA (Panamá)', date '2018-04-16', 'Panamá'),
  ('2018-CONARE', 'Torneo CONARE 2018', 'UNED', date '2018-11-10', 'UNED Sabanilla'),
  ('2019-JUNCOS', 'JUNCOS 2019', 'TEC', date '2019-03-30', 'TEC Cartago'),
  ('2019-BLITZ', 'Blitz universitario 2019', 'TEC', date '2019-08-24', 'ITCR Barrio Amón'),
  ('2020-CENTRO', 'Centroamericano universitario 2020 (en línea)', 'Centroamérica (en línea)', date '2020-08-29', 'Lichess'),
  ('2020-FECUNDE', 'FECUNDE 2020 (en línea)', 'UNED', date '2020-10-24', 'chess.com'),
  ('2022-CONARE', 'Torneo CONARE 2022', 'TEC', date '2022-06-04', 'Tecnológico de Costa Rica'),
  ('2022-FEDEU', 'FEDEU 2022', 'UCR', date '2022-08-27', 'Escuela de Estudios Generales, UCR'),
  ('2023-JUNCOS', 'XXIV JUNCOS 2023', 'UNA', date '2023-05-08', 'Universidad Nacional, Heredia'),
  ('2023-JUDUCA', 'JUDUCA 2023', 'JUDUCA (El Salvador)', date '2023-07-11', 'El Salvador'),
  ('2023-FEDEU', 'FEDEU 2023', 'UNED', date '2023-09-24', 'Paraninfo de la UNED, Sabanilla'),
  ('2023-CONARE', 'Torneo CONARE 2023', 'UNA', date '2023-10-04', 'Heredia'),
  ('2024-FEDEU', 'FEDEU 2024', 'CENFOTEC', date '2024-05-11', 'Universidad CENFOTEC'),
  ('2024-CONARE', 'Torneo CONARE 2024', 'UCR', date '2024-10-12', 'Instalaciones Deportivas UCR, Sabanilla'),
  ('2025-FEDEU', 'FEDEU 2025', 'CENFOTEC', date '2025-05-17', 'Universidad CENFOTEC'),
  ('2025-JUDUCA', 'JUDUCA 2025', 'JUDUCA (Honduras)', date '2025-07-28', 'UNAH, Tegucigalpa, Honduras'),
  ('2025-CONARE', 'Torneo CONARE 2025', 'UNA', date '2025-09-27', 'Campus Omar Dengo, UNA'),
  ('2026-FEDEU', 'FEDEU 2026', 'CENFOTEC', date '2026-05-23', 'Universidad CENFOTEC'),
  ('2026-CONARE', 'Torneo CONARE 2026', 'UTN', date '2026-08-16', 'UTN, Alajuela'),
  ('2026-CONARE2', 'II Torneo CONARE 2026', 'UTN', date '2026-09-27', 'UTN, Alajuela')),
-- Lo de una universidad y lo que no va al medallero: (tnr, organiza, tipo, en curso).
otros(tnr, organiza, tipo, en_curso) as (values
  (172212,'UCR','u',false),(175898,'UCR','u',false),(179992,'UCR','u',false),(183501,'UCR','u',false),(186478,'UCR','u',false),
  (189922,'UCR','u',false),(193643,'UCR','u',false),(198970,'UCR','u',false),(214439,'UCR','u',false),(214891,'UCR','u',false),
  (220726,'UCR','u',false),(228724,'UCR','u',false),(233086,'UCR','u',false),(249802,'UCR','u',false),(249803,'UCR','u',false),
  (249807,'UCR','u',false),(249804,'UCR','u',false),(252666,'UCR','u',false),(267379,'UCR','u',false),(276415,'UCR','u',false),
  (287341,'UCR','u',false),(293673,'UCR','u',false),(304349,'UCR','u',false),(314085,'UCR','u',false),(319350,'UCR','u',false),
  (346291,'UCR','u',false),(346292,'UCR','u',false),(365679,'UCR','u',false),(374599,'UCR','u',false),(378914,'UCR','u',false),
  (385312,'UCR','u',false),(392437,'UCR','u',false),(399812,'UCR','u',false),(410852,'UCR','u',false),(418531,'UCR','u',false),
  (427434,'UCR','u',false),(480966,'UCR','u',false),(798913,'UCR','u',false),(809430,'UCR','u',false),(949262,'UCR','u',false),
  (1264443,'UCR','u',false),(1409581,'UCR','u',false),(311584,'TEC','u',false),(1259931,'CENFOTEC','u',false),(1503400,'CENFOTEC','u',false),
  (1506144,'UNED','u',false),(1506164,'UNED','u',false),(1363218,'UISIL','u',false),
  (57350,'UNA','e',false),(57335,'UNA','e',false),
  (1516373,'UCR','e',true),(1516374,'UCR','e',true),(1516375,'UCR','e',true),(1516383,'UCR','e',true),(1516388,'UCR','e',true),(1516407,'UCR','e',true)),
-- 1) Entre universidades, de uni_resultados.
rk as (
  select r.*, max(r.puesto) over (partition by r.tnr order by r.orden) rk
    from public.uni_resultados r),
de_res as (
  select r.tnr, r.edicion, min(r.codigo) codigo, count(*) filas,
         jsonb_agg(jsonb_build_object('p', r.rk, 'n', r.nombre, 'u', r.comite) order by r.orden) filter (where r.rk <= 3) podio
    from rk r group by r.tnr, r.edicion),
cat as (
  select d.*, e.titulo, e.organiza, e.fecha, e.lugar, split_part(d.codigo, '-', 1) ritmo, substr(split_part(d.codigo, '-', 3), 1, 1) modalidad,
         case split_part(d.codigo, '-', 2) when 'UB' then 'División B ' when 'FUN' then 'Funcionarios ' else '' end
         || case when split_part(d.codigo, '-', 3) like '%F' then 'Femenino' else 'Absoluto' end
         || case when split_part(d.codigo, '-', 3) like 'E%' then ' por equipos' else ' individual' end
         || ' · ' || case split_part(d.codigo, '-', 1) when 'C' then 'Clásico' when 'R' then 'Rápido' else 'Blitz' end que
    from de_res d join ed e using (edicion)),
-- 2) y 3) De su página de chess-results.
pag as (select p.tnr, p.contenido c, o.organiza, o.tipo, o.en_curso from paginas p join otros o using (tnr)),
tb as (select tnr, split_part(substr(c, strpos(c, 'class="CRs1"')), '</table>', 1) html from pag),
f as (
  select tb.tnr, u.o, u.p like '%<th%' cab,
         array(select btrim(regexp_replace(regexp_replace(x, '<[^>]+>', '', 'g'), '&nbsp;', '', 'g'), E' \r\n\t')
                 from unnest(regexp_split_to_array(u.p, '</t[hd]>')) x) cel
    from tb, unnest(string_to_array(substr(tb.html, strpos(tb.html, '<tr')), '</tr>')) with ordinality u(p, o)
   where u.p like '%<t%'),
h as (select tnr, cel cols from f where cab and o = 1),
fi as (
  select f.tnr, f.o, nullif(f.cel[array_position(h.cols, 'Rk.')], '')::int puesto, f.cel[array_position(h.cols, 'Nombre')] nombre,
         coalesce(nullif(f.cel[array_position(h.cols, 'Club/Ciudad')], ''), '') club
    from f join h using (tnr) where not f.cab and array_position(h.cols, 'Nombre') is not null),
ind as (
  select fi.tnr, count(*) n,
         jsonb_agg(jsonb_build_object('p', x.rk, 'n', fi.nombre, 'u', fi.club) order by fi.o) filter (where x.rk <= 3) podio
    from fi join (select tnr, o, max(puesto) over (partition by tnr order by o) rk from fi) x using (tnr, o)
   group by fi.tnr),
eq as (
  select p.tnr, jsonb_agg(jsonb_build_object('p', m[1]::int, 'n', btrim(m[2]), 'u', '') order by m[1]::int) filter (where m[1]::int <= 3) podio
    from pag p, regexp_matches(regexp_replace(regexp_replace(regexp_replace(p.c, '<[^>]+>', ' ', 'g'), '&nbsp;', ' ', 'g'), '\s+', ' ', 'g'),
                               ' (\d+)\. ([^(]+(?:\( ?[A-Z]{3} ?\))?) ?\(Elo medio', 'g') m
   group by p.tnr),
otros_cat as (
  select p.tnr, btrim(regexp_replace(regexp_replace(substring(p.c from '<h2>([^<]*)</h2>'), '&#\d+;|\|', ' ', 'g'), '\s+', ' ', 'g')) nombre,
         a.inicio,
         coalesce(a.lugar, '') lugar, p.organiza, p.tipo, p.en_curso,
         case when a.control ~* 'blitz|bullet|\m[1-9] ?min|\m[1-9] ?minutos?\M|\m[1-9]\s*\+' or btrim(substring(p.c from '<h2>([^<]*)</h2>')) ~* 'blitz|bullet' then 'B'
              when a.control ~* '\m(6\d|[7-9]\d|1\d\d) ?min|1:30|90|hora' or btrim(substring(p.c from '<h2>([^<]*)</h2>')) ~* 'standard|cl[aá]sico' then 'C' else 'R' end ritmo,
         case when e.podio is not null then 'E' else 'I' end modalidad,
         coalesce(a.jugadores, i.n, 0) jugadores,
         case when p.en_curso then '[]'::jsonb else coalesce(e.podio, i.podio, '[]'::jsonb) end podio
    from pag p left join public.arbitros_cr_cr a on a.clave = p.tnr left join ind i using (tnr) left join eq e using (tnr)),
todo as (
  select c.tnr, c.titulo || ' · ' || c.que nombre, coalesce(a.inicio, c.fecha) inicio, coalesce(nullif(a.lugar, ''), c.lugar) lugar,
         c.organiza, 'entre universidades' tipo, c.edicion, c.ritmo, c.modalidad,
         coalesce((select count(*) from public.uni_jugadores j where j.tnr = c.tnr), c.filas)::smallint jugadores, false en_curso, coalesce(c.podio, '[]'::jsonb) podio
    from cat c left join public.arbitros_cr_cr a on a.clave = c.tnr
  union all
  select o.tnr, o.nombre, coalesce(o.inicio, case o.tnr when 1506144 then date '2026-05-02' when 1506164 then date '2026-09-26' end),
         case when o.lugar = '' and o.tnr in (1506144, 1506164) then 'Sede de la UNED, Pérez Zeledón' else o.lugar end,
         o.organiza, case o.tipo when 'e' then 'entre universidades' else 'de una universidad' end, null, o.ritmo, o.modalidad,
         o.jugadores::smallint, o.en_curso, o.podio
    from otros_cat o),
borrar as (delete from public.uni_torneos returning 1)
insert into public.uni_torneos (tnr, nombre, inicio, lugar, organiza, tipo, edicion, ritmo, modalidad, jugadores, en_curso, podio)
select tnr, left(nombre, 160), inicio, left(lugar, 160), organiza, tipo, edicion, ritmo, modalidad, jugadores, en_curso, podio from todo
 where (select count(*) from borrar) >= 0;
