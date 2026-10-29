-- Una sala de enlaces lleva hasta 40 botones (antes, 6). La del
-- Centroamericano 2026 lleva uno por torneo de chess-results: las 12
-- categorías del clásico (y después las de rápidas y blitz), más «Toda la
-- información del torneo». El dueño del sitio no pudo poner el séptimo.
-- La misma regla de siempre para cada botón; solo cambia el tope, que es
-- también el del editor (js/admin-salas-torneo.js, LISTAS.enlaces.max).
-- Ver «Un torneo por categoría» en docs/decisiones/juegos-y-torneos.md.
create or replace function interno.enlaces_de_sala_validos(p jsonb)
 returns boolean
 language sql
 immutable
 set search_path to ''
as $function$
  select jsonb_typeof(p) = 'array'
     and jsonb_array_length(p) <= 40
     and not exists (
       select 1 from jsonb_array_elements(p) e
        where case when jsonb_typeof(e) <> 'object' then true
                   else coalesce(e->>'texto', '') !~ '^\S.{0,59}$'
                     or coalesce(e->>'url', '') !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[^\s"<>]*)?$'
                     or char_length(e->>'url') > 500
                     or (select count(*) from jsonb_object_keys(e)) <> 2
              end
     );
$function$;
