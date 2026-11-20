-- Vincular un torneo de Pareo Integral que ya estaba en el evento de OTRA cuenta (ver «Cada evento
-- de la Mesa, por separado» en docs/decisiones/juegos-y-torneos.md).
--
-- Antes: «Ese torneo ya está en el evento de otro organizador», sin salida. Pasó con la Eliminatoria
-- Cantonal JDN de PZ (U12): quedó archivada en un evento de una cuenta de prueba, y su dueño de verdad
-- no podía traerla a su evento. Pero quien vincula ya probó que el torneo es suyo con la clave de Pareo
-- (sha256 contra pareo_publicados.clave_hash): esa prueba vale más que quién lo vinculó primero. Ahora
-- se lo lleva a su evento, y los enlaces de árbitros del evento anterior se borran (dejan de anotar ahí).
-- Lo demás de la función queda igual.

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
    -- Estaba en un evento ajeno (por ejemplo, vinculado antes desde otra cuenta): la clave del torneo, que se acaba de
    -- comprobar, prueba que quien llama es su dueño, así que se lo lleva. Los enlaces de los árbitros del evento anterior
    -- se borran: dejan de anotar en este torneo (y su cola con ellos).
    if not coalesce(v_previo.evento in (select interno.ca_mis_eventos()), false) then
      delete from public.centroamericano_asignaciones a where a.tnr = v_previo.tnr;
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
