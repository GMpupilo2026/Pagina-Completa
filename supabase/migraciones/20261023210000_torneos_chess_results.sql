-- «Torneos en Pareo Integral»: también los torneos próximos de Costa Rica que
-- ya están cargados en chess-results, como los de ajedrezcostarica.com. Lo
-- pidió el dueño del sitio.
--
-- La misma Edge Function torneos-externos, una vez al día, lee además el
-- buscador de chess-results (Costa Rica, los tocados más recientemente) y
-- guarda en public.torneos_externos, con fuente 'chess-results', los que
-- empiezan de hoy en adelante: nombre, día, lugar, quién organiza, rondas e
-- inscritos, lo mismo que el buscador muestra a cualquiera. La dirección es
-- siempre https://chess-results.com/tnr<n>.aspx?lan=2.
--
-- torneos_externos_lista() los da junto con los otros, sin repetir:
--   · un torneo de chess-results que ajedrezcostarica.com ya anuncia (su ficha
--     enlaza a ese mismo tnr<n>, o es el mismo día con un nombre parecido) no
--     sale: el anuncio de allá dice más (inscripción, costo, ritmo);
--   · uno que es el mismo que un torneo de Pareo Integral lleva su
--     repetido_de, como los de ajedrezcostarica.com.
-- La provincia de un torneo de chess-results se deduce del lugar con
-- pareo_provincia(), como la de Pareo Integral.
--
-- La lista devuelve tres columnas más (fuente, rondas, jugadores), así que se
-- vuelve a crear.
--
-- Ver «Torneos en Pareo Integral: los torneos de chess-results» en
-- docs/decisiones/juegos-y-torneos.md.

alter table public.torneos_externos drop constraint torneos_externos_fuente_check;
alter table public.torneos_externos add constraint torneos_externos_fuente_check
  check (fuente in ('ajedrezcostarica', 'chess-results'));

alter table public.torneos_externos drop constraint torneos_externos_url_check;
alter table public.torneos_externos add constraint torneos_externos_url_check
  check ((fuente = 'ajedrezcostarica' and url ~ '^https://ajedrezcostarica\.com/es/tournaments/[0-9]+$')
      or (fuente = 'chess-results' and url = 'https://chess-results.com/tnr' || id_externo || '.aspx?lan=2'));

alter table public.torneos_externos add column rondas smallint check (rondas between 1 and 99);
alter table public.torneos_externos add column jugadores smallint check (jugadores between 1 and 9999);

comment on table public.torneos_externos is
  'Torneos próximos de Costa Rica anunciados en ajedrezcostarica.com o cargados en chess-results, leídos una vez al día por la Edge Function torneos-externos. Lectura pública; la escribe solo la función.';

drop function public.torneos_externos_lista();

create function public.torneos_externos_lista()
returns table (id_externo integer, titulo text, inicio timestamptz, fin timestamptz, provincia text, lugar text, ritmo text,
               minutos smallint, incremento smallint, elo text, precio numeric, moneda text, modalidad text, formato text,
               organizador text, inscripcion_abierta boolean, url text, repetido_de uuid,
               fuente text, rondas smallint, jugadores smallint)
language sql stable security invoker set search_path = '' as $$
  select e.id_externo, e.titulo, e.inicio, e.fin,
         case when e.fuente = 'chess-results' and e.provincia = '' then public.pareo_provincia(e.lugar) else e.provincia end,
         e.lugar, e.ritmo, e.minutos, e.incremento, e.elo, e.precio, e.moneda,
         e.modalidad, e.formato, e.organizador, e.inscripcion_abierta, e.url,
         (select p.id from public.pareo_publicados p
           where e.inicio is not null and p.fecha = (e.inicio at time zone 'America/Costa_Rica')::date
             and (e.ritmo = '' or coalesce(p.datos->>'ritmoTipo', '') = '' or e.ritmo = p.datos->>'ritmoTipo')
             and (public.pareo_parecidos(p.nombre, e.titulo) or public.pareo_parecidos(p.evento, e.titulo)
                  or public.pareo_parecidos(concat_ws(' ', p.evento, p.nombre), e.titulo))
           order by p.actualizado desc limit 1) as repetido_de,
         e.fuente, e.rondas, e.jugadores
    from public.torneos_externos e
   where e.fuente <> 'chess-results'
      or not exists (select 1 from public.torneos_externos a
                      where a.fuente = 'ajedrezcostarica'
                        and (a.chess_results ~ ('/tnr' || e.id_externo || '\.aspx')
                             or (a.inicio is not null and e.inicio is not null
                                 and (a.inicio at time zone 'America/Costa_Rica')::date = (e.inicio at time zone 'America/Costa_Rica')::date
                                 and public.pareo_parecidos(a.titulo, e.titulo))))
   order by e.inicio nulls last
   limit 200;
$$;
revoke all on function public.torneos_externos_lista() from public;
grant execute on function public.torneos_externos_lista() to anon, authenticated;

-- Leer chess-results suma hasta veinte páginas más: más tiempo de espera.
create or replace function public.disparar_torneos_externos()
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  secreto text;
begin
  select decrypted_secret into secreto from vault.decrypted_secrets where name = 'torneos_externos_secreto';
  if secreto is null or secreto = '' then
    raise warning 'No hay secreto de torneos_externos: no se leyeron los torneos de ajedrezcostarica.com ni de chess-results';
    return;
  end if;
  perform net.http_post(
    url := 'https://bgtijpimpcokxatxxbki.supabase.co/functions/v1/torneos-externos',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secreto),
    body := jsonb_build_object('accion', 'leer'),
    timeout_milliseconds := 300000
  );
end;
$$;
revoke execute on function public.disparar_torneos_externos() from public, anon, authenticated;
