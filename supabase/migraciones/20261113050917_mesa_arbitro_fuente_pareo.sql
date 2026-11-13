-- La Mesa del árbitro con torneos de Pareo Integral (ver «La Mesa del árbitro con
-- torneos de Pareo Integral» en docs/decisiones/juegos-y-torneos.md).
--
-- El modelo del Centroamericano (la organización reparte mesas a cada árbitro con
-- un QR o un código corto y el árbitro anota en su tablet) leía y escribía solo
-- chess-results. Ahora cada torneo de la Mesa tiene su FUENTE:
--   · chess-results: como siempre (tnr = el número del torneo, la clave en Vault).
--   · pareo: un torneo publicado de Pareo Integral (pareo_publicados). Las mesas se
--     leen de lo publicado y lo que anota el árbitro va a pareo_cola, de donde lo
--     toma el Pareo del árbitro principal con sus reglas (recibirDeAdjunto). Su tnr
--     es inventado: 'p' + el uuid del publicado sin guiones, y NUNCA llega a
--     chess-results (las funciones lo rechazan por su forma).
--
-- Vincular un torneo de Pareo prueba que es de quien lo vincula: la clave del
-- torneo (la que guarda su Pareo en el navegador) tiene que dar el mismo sha256
-- que pareo_publicados.clave_hash. La clave no se guarda en ningún lado.
--
-- centroamericano_eventos.marca: la cara de las páginas. Los dos eventos del
-- Centroamericano conservan la suya; los nuevos salen con la de Ajedrez Integral.

-- ---------------------------------------------------------------- torneos: la fuente
alter table public.centroamericano_torneos
  add column fuente text not null default 'chess-results' check (fuente in ('chess-results', 'pareo')),
  add column pareo_id uuid references public.pareo_publicados(id) on delete set null;

alter table public.centroamericano_torneos drop constraint centroamericano_torneos_tnr_check;
alter table public.centroamericano_torneos add constraint centroamericano_torneos_tnr_check
  check ((fuente = 'chess-results' and tnr ~ '^[0-9]{1,7}$') or (fuente = 'pareo' and tnr ~ '^p[0-9a-f]{32}$'));

create unique index centroamericano_torneos_pareo_id_idx on public.centroamericano_torneos (pareo_id) where pareo_id is not null;

comment on column public.centroamericano_torneos.fuente is
  'De dónde salen las mesas: chess-results (tnr numérico, clave en Vault) o pareo (un torneo publicado de Pareo Integral; lo anotado va a pareo_cola).';
comment on column public.centroamericano_torneos.pareo_id is
  'El torneo publicado de Pareo Integral (solo con fuente pareo). Si se deja de publicar queda en null y la tablet dice que ya no está publicado.';

-- El SELECT de esta tabla va columna por columna: sin esto la página dice «permission denied» y no muestra ningún torneo.
grant select (fuente, pareo_id) on public.centroamericano_torneos to authenticated;

-- Vincular un torneo de Pareo le da escritura en la cola del principal a unos árbitros: es un acceso y se audita.
drop trigger auditar on public.centroamericano_torneos;
create trigger auditar after insert or update or delete on public.centroamericano_torneos
  for each row execute function interno.auditar('tnr', 'sid_en_boveda', 'clave_puesta', 'acceso_tnr', 'fuente', 'pareo_id', 'evento');

-- ---------------------------------------------------------------- eventos: la cara
alter table public.centroamericano_eventos
  add column marca text not null default 'ajedrez-integral' check (marca in ('ajedrez-integral', 'centroamericano'));
update public.centroamericano_eventos set marca = 'centroamericano' where evento in ('Centroamericano 2026', 'Blitz');
comment on column public.centroamericano_eventos.marca is
  'La cara de la organización y de la tablet: la de Ajedrez Integral o la del Centroamericano 2026.';
grant select (marca) on public.centroamericano_eventos to authenticated;

-- ---------------------------------------------------------------- la cola: la vía de la Mesa
-- Una fila de la cola llega por UNA vía: el código de un adjunto de Pareo (como hasta hoy) o un
-- enlace de la Mesa del árbitro (asignacion_id, con el nombre y el rango que comprobó la función,
-- en índices de Pareo). El Pareo del principal acepta la segunda sin tener ese adjunto en su lista.
alter table public.pareo_cola alter column codigo drop not null;
alter table public.pareo_cola
  add column asignacion_id uuid references public.centroamericano_asignaciones(id) on delete cascade,
  add column nombre text not null default '' check (char_length(nombre) <= 80),
  add column desde smallint check (desde between 1 and 999),
  add column hasta smallint check (hasta between 1 and 999);
alter table public.pareo_cola add constraint pareo_cola_una_via
  check ((codigo is not null) <> (asignacion_id is not null)
         and (asignacion_id is null or (desde is not null and hasta is not null and desde <= hasta)));
create index pareo_cola_asignacion_idx on public.pareo_cola (asignacion_id);
comment on column public.pareo_cola.asignacion_id is
  'Lo anotó un árbitro de la Mesa del árbitro (enlace de centroamericano_asignaciones), no un adjunto con código de Pareo. desde/hasta: su rango en índices de Pareo.';

-- ---------------------------------------------------------------- vincular un torneo de Pareo
create or replace function public.centroamericano_pareo_vincular(
  p_evento text, p_pareo uuid, p_clave text, p_nombre text,
  p_categoria text default null, p_rama text default null, p_ritmo text default null, p_prueba boolean default false)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_pub record;
  v_tnr text;
  v_previo record;
  v_orden integer;
  v_ritmo text := case when p_ritmo in ('clasico', 'rapido', 'blitz') then p_ritmo else 'clasico' end;
  v_nombre text := left(btrim(coalesce(p_nombre, '')), 80);
begin
  if not coalesce((select public.tengo_herramienta('mesa-arbitro')), false) then
    raise exception 'Hace falta la licencia de la Mesa del árbitro' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_evento, ''))) not between 1 and 80 then raise exception 'Falta el nombre del evento' using errcode = '22023'; end if;
  if length(v_nombre) not between 1 and 80 then raise exception 'Falta el nombre del torneo' using errcode = '22023'; end if;
  if p_pareo is null or length(coalesce(p_clave, '')) not between 16 and 200 then
    raise exception 'Falta el torneo de Pareo Integral o su clave' using errcode = '22023';
  end if;

  select p.clave_hash, p.datos ->> 'tipo' as tipo into v_pub from public.pareo_publicados p where p.id = p_pareo;
  if not found then raise exception 'Ese torneo de Pareo Integral no está publicado' using errcode = 'P0002'; end if;
  if encode(extensions.digest(p_clave, 'sha256'), 'hex') <> v_pub.clave_hash then
    raise exception 'La clave no es la de ese torneo' using errcode = '42501';
  end if;
  if v_pub.tipo = 'equipos' then raise exception 'Los torneos por equipos todavía no van en la Mesa del árbitro' using errcode = '22023'; end if;

  -- El evento es de quien lo crea; uno que ya existe solo lo amplía su dueño o su equipo.
  if exists (select 1 from public.centroamericano_eventos e where e.evento = btrim(p_evento)) then
    if not coalesce(btrim(p_evento) in (select interno.ca_mis_eventos()), false) then
      raise exception 'Ya hay un evento con ese nombre y no es tuyo: ponle otro nombre' using errcode = '42501';
    end if;
  else
    insert into public.centroamericano_eventos (evento, dueno_id) values (btrim(p_evento), (select auth.uid()));
  end if;

  v_tnr := 'p' || replace(p_pareo::text, '-', '');
  select t.tnr, t.evento into v_previo from public.centroamericano_torneos t where t.tnr = v_tnr or t.pareo_id = p_pareo limit 1;
  if found then
    if not coalesce(v_previo.evento in (select interno.ca_mis_eventos()), false) then
      raise exception 'Ese torneo ya está en el evento de otro organizador' using errcode = '42501';
    end if;
    update public.centroamericano_torneos
       set evento = btrim(p_evento), nombre = v_nombre, pareo_id = p_pareo, archivado = false,
           ritmo = case when p_ritmo in ('clasico', 'rapido', 'blitz') then p_ritmo else ritmo end,
           categoria = left(coalesce(nullif(btrim(p_categoria), ''), categoria), 40),
           rama = case when p_rama in ('Absoluto', 'Femenino', 'Mixto') then p_rama else rama end
     where tnr = v_previo.tnr;
    return v_previo.tnr;
  end if;

  select coalesce(max(t.orden) filter (where not t.prueba and t.orden < 900), 0) + 1 into v_orden from public.centroamericano_torneos t;
  insert into public.centroamericano_torneos (tnr, nombre, categoria, rama, orden, evento, ritmo, prueba, archivado, fuente, pareo_id)
  values (v_tnr, v_nombre, left(coalesce(nullif(btrim(p_categoria), ''), 'Abierto'), 40),
          case when p_rama in ('Absoluto', 'Femenino', 'Mixto') then p_rama else 'Mixto' end,
          case when coalesce(p_prueba, false) then 900 + v_orden else v_orden end,
          btrim(p_evento), v_ritmo, coalesce(p_prueba, false), false, 'pareo', p_pareo);
  return v_tnr;
end;
$function$;

comment on function public.centroamericano_pareo_vincular(text, uuid, text, text, text, text, text, boolean) is
  'Lleva un torneo publicado de Pareo Integral a un evento de la Mesa del árbitro. Prueba que es de quien llama con la clave del torneo (sha256 contra clave_hash), que no se guarda.';
revoke execute on function public.centroamericano_pareo_vincular(text, uuid, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.centroamericano_pareo_vincular(text, uuid, text, text, text, text, text, boolean) to authenticated;
