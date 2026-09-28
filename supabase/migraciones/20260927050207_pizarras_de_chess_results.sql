-- Las pizarras de chess-results en las salas de torneos.
--
-- Una transmisión de Lichess puede traer solo algunas mesas (la de UTN trae
-- dos), y sumar sus resultados daría una tabla de posiciones que no es la del
-- torneo. Las posiciones oficiales están en chess-results.com, así que una
-- sala puede llevar una o más «pizarras»: el título que se ve en la pestaña
-- («Femenino», «Masculino») y la dirección del torneo en chess-results. Con
-- pizarras, la sala de cine muestra esas posiciones en vez de sumar.
--
-- chess-results no tiene API ni manda CORS: las lee la Edge Function
-- pizarra-torneo, que solo lee las pizarras de una sala visible (no es un
-- proxy abierto a cualquier dirección) y guarda lo leído unos minutos en
-- pizarras_cache, para que cien personas mirando la sala no sean cien
-- pedidos a chess-results. pizarras_cache no la lee nadie más que la función
-- (service role): ni anon ni authenticated tienen permiso.
--
-- Y UTN pasa a ser una sala de Lichess (la transmisión de sus dos mesas) con
-- las pizarras femenina y masculina.
--
-- Ver «Las posiciones oficiales vienen de chess-results» en
-- docs/decisiones/juegos-y-torneos.md.

create or replace function interno.pizarras_de_sala_validas(p jsonb)
 returns boolean
 language sql
 immutable
 set search_path to ''
as $function$
  select case when jsonb_typeof(p) <> 'array' then false
              else jsonb_array_length(p) <= 4
               and not exists (
                 select 1 from jsonb_array_elements(p) e
                  where case when jsonb_typeof(e) <> 'object' then true
                             else coalesce(e->>'titulo', '') !~ '^\S.{0,39}$'
                               or coalesce(e->>'url', '') !~ '^https://(s[0-9]{1,2}\.)?chess-results\.com/tnr[0-9]{1,9}\.aspx(\?[^\s"<>]*)?$'
                               or char_length(e->>'url') > 400
                               or (select count(*) from jsonb_object_keys(e)) <> 2
                        end
               )
         end;
$function$;

alter table public.salas_torneo
  add column pizarras jsonb not null default '[]'::jsonb
  check (interno.pizarras_de_sala_validas(pizarras));

create table public.pizarras_cache (
  url text primary key,
  datos jsonb not null,
  leido_en timestamptz not null default now()
);
comment on table public.pizarras_cache is
  'Lo último que la Edge Function pizarra-torneo leyó de chess-results, por dirección. Solo la usa la función (service role).';
alter table public.pizarras_cache enable row level security;
revoke all on public.pizarras_cache from public, anon, authenticated;

update public.salas_torneo
   set tipo = 'lichess',
       lichess_id = '2zDqylwI',
       descripcion = 'Las partidas del torneo universitario UTN-CONARE en la pantalla grande, con las posiciones oficiales del femenino y del masculino.',
       enlaces = '[{"texto": "Verlo directo en Lichess", "url": "https://lichess.org/broadcast/ii-interuniversitario-utn-conare-2026/2zDqylwI"},
                   {"texto": "Partida masculina en idchess", "url": "https://media.idchess.com/en/tournaments/kYfhVJ/utn-2026/desk/eyJpZCI6OTY1OTU2LCJwYXNzd29yZCI6bnVsbH0="},
                   {"texto": "Partida femenina en idchess", "url": "https://media.idchess.com/en/tournaments/b0fhVJ/utn-2026/desk/eyJpZCI6OTY1OTYxLCJwYXNzd29yZCI6bnVsbH0="}]'::jsonb,
       pizarras = '[{"titulo": "Femenino", "url": "https://s1.chess-results.com/tnr1498221.aspx?lan=2&SNode=S0"},
                    {"titulo": "Masculino", "url": "https://s3.chess-results.com/tnr1498218.aspx?lan=2&art=0&turdet=YES&flag=30&SNode=S0"}]'::jsonb
 where clave = 'utn';