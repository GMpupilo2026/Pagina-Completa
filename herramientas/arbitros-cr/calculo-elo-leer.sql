-- El «Cálculo de elo» y el ritmo de los torneos nuevos de chess-results, para
-- el filtro «Solo con Elo nacional» de arbitros-cr.html (ver «Los torneos con
-- Elo nacional» en docs/decisiones/juegos-y-torneos.md). Son cuatro pasos, cada
-- uno una sentencia: correrlos en orden con execute_sql, esperando un par de
-- minutos entre uno y otro (pg_net no manda nada hasta net.wake(), y las
-- respuestas quedan unas 6 horas en net._http_response).
--
-- Por qué tantos pasos: chess-results esconde la ficha de los torneos de hace
-- más de dos semanas detrás de un botón. Hay que mandar el formulario de la
-- página (sus campos ocultos y cb_alleDetails) y solo lo acepta el mismo
-- servidor que la armó: el pie dice «Node S1», «S2» o «S3». A S0 no se llega
-- (su certificado no vale): esos se vuelven a pedir hasta que los arme otro.
--
-- :desde es el primer id que devolvió el paso 1; :hasta, el último id que
-- devolvió el paso que se está leyendo (el 2 o el 3).


-- Paso 1. Pedir la ficha de los torneos de Costa Rica que no son de FIDE y
-- todavía no están en arbitros_cr_cr_elo.
with falta as (select c.clave from public.arbitros_cr_cr c
               where coalesce(c.pais, 'CRC') = 'CRC' and c.fide_torneo is null and c.rondas > 0
                 and not exists (select 1 from public.arbitros_cr_cr_elo e where e.clave = c.clave)),
ins as (insert into net.http_request_queue(method, url, headers, body, timeout_milliseconds)
  select 'GET', 'https://chess-results.com/tnr' || clave || '.aspx?lan=2&turdet=YES&art=99', '{}'::jsonb, null, 60000
  from falta order by clave returning id)
select min(id), max(id), count(*), net.wake() from ins;


-- Paso 2. A las que volvieron sin ficha («Número de rondas» no está), mandarles
-- su formulario al servidor que dice el pie. Las de S0 quedan para el paso 3.
with g as (select id, content c, substring(content from '<form[^>]*action="\./(tnr[0-9]+\.aspx[^"]*)"') accion,
                  lower(substring(content from 'Node (S[0-9]+)')) nodo
           from net._http_response where id between :desde and :hasta and status_code = 200
             and content not like '%Número de rondas%' and content like '%cb_alleDetails%'
             and coalesce(substring(content from 'Node (S[0-9]+)'), 'S0') <> 'S0'),
oc as (select g.id, g.accion, g.nodo, string_agg(m[1]||'='||replace(replace(replace(replace(m[2],'%','%25'),'+','%2B'),'/','%2F'),'=','%3D'), '&') h
       from g, regexp_matches(g.c, '<input type="hidden" name="([^"]+)" id="[^"]*" value="([^"]*)"', 'g') m group by g.id, g.accion, g.nodo),
ins as (insert into net.http_request_queue(method, url, headers, body, timeout_milliseconds)
  select 'POST', 'https://' || nodo || '.chess-results.com/' || replace(accion, '&amp;', '&'), '{"Content-Type":"application/x-www-form-urlencoded"}'::jsonb,
    convert_to(h || '&cb_alleDetails=Mostrar+detalles+del+torneo', 'utf8'), 60000
  from oc where accion is not null order by id returning id)
select min(id), max(id), count(*), net.wake() from ins;


-- Paso 3. Las que armó S0, volver a pedirlas (otro servidor las arma). Después
-- de este, repetir el paso 2 con :desde y :hasta de este paso; si quedan de S0,
-- repetir este también.
with g as (select substring(content from '<form[^>]*action="\./tnr([0-9]+)\.aspx') clave
           from net._http_response where id between :desde and :hasta and status_code = 200
             and content not like '%Número de rondas%' and content like '%cb_alleDetails%'
             and coalesce(substring(content from 'Node (S[0-9]+)'), 'S0') = 'S0'),
ins as (insert into net.http_request_queue(method, url, headers, body, timeout_milliseconds)
  select 'GET', 'https://chess-results.com/tnr' || clave || '.aspx?lan=2&turdet=YES&art=99', '{}'::jsonb, null, 60000
  from g where clave is not null order by clave::int returning id)
select min(id), max(id), count(*), net.wake() from ins;


-- Paso 4. Leer las fichas que llegaron (de cualquiera de los pasos) y guardar
-- el cálculo y el ritmo. Solo suma los torneos nuevos: lo que ya estaba (y lo
-- corregido a mano en herramientas/datos/arbitros-cr-ritmo-corregir.json) no
-- se toca. Después, exportar la tabla al archivo y correr ritmos-raros.js.
with r as (select id, substring(content from '<form[^>]*action="\./tnr([0-9]+)\.aspx')::int clave,
        btrim(substring(content from 'Cálculo de elo</td><td[^>]*>([^<]*)')) calc,
        substring(content from 'Control de tiempo \(([A-Za-z]+)\)') ritmo
      from net._http_response where id >= :desde and status_code = 200 and content like '%Número de rondas%'),
u as (select distinct on (clave) * from r where clave is not null order by clave, id desc),
obj as (select clave from public.arbitros_cr_cr where coalesce(pais, 'CRC') = 'CRC' and fide_torneo is null),
ins as (insert into public.arbitros_cr_cr_elo (clave, calculo, ritmo, leido)
  select u.clave,
    case u.calc when 'Elo nacional' then 'nacional' when 'Elo internacional' then 'internacional' when 'Elo nacional, Elo internacional' then 'ambos' else 'ninguno' end,
    case u.ritmo when 'Standard' then 'clasico' when 'Rapid' then 'rapido' when 'Blitz' then 'blitz' end,
    (now() at time zone 'America/Costa_Rica')::date
  from u join obj using (clave)
  on conflict (clave) do nothing
  returning calculo)
select calculo, count(*) from ins group by 1 order by 2 desc;


-- Para el archivo (herramientas/datos/arbitros-cr-calculo-elo.json, la lista
-- «torneos»): toda la tabla, en el orden de la clave. Sale con lo corregido a
-- mano ya puesto; da igual, porque calculo-elo.py vuelve a ponerlo al cargar.
select json_agg(json_build_array(clave, calculo, ritmo) order by clave) from public.arbitros_cr_cr_elo;
