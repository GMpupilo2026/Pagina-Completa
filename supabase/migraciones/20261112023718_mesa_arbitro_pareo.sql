-- Mesa del árbitro con los torneos de Pareo Integral, sin chess-results.
--
-- Lo pidió el dueño para la Eliminatoria Cantonal JDN de Pérez Zeledón 2026,
-- que se dirige en Pareo Integral: mesa-arbitro.html se conecta con el
-- enlace de árbitro que crea el árbitro principal en Pareo (un código de 8
-- letras y un rango de mesas), anota los resultados de esas mesas por el
-- canal en vivo y lleva la misma bitácora. Hasta ahora cada línea exigía el
-- código de un torneo de chess-results (tnr).
--
-- - Una línea es de un torneo de chess-results (tnr) O de un enlace de Pareo
--   (pareo, el código del enlace de árbitro, 8 letras de Pareo): una sola de
--   las dos, nunca ninguna.
-- - Anular una ilegal o irregularidad sigue pidiendo que sea de la misma
--   partida: el mismo tnr o el mismo código de Pareo (is not distinct from,
--   para que dos nulos cuenten como iguales).
-- - «Mis torneos» (arbitro_torneos_mis) sigue siendo de chess-results: las
--   líneas de Pareo no entran ahí (sin el filtro, salían como un torneo sin
--   número).
--
-- Ver «La mesa del árbitro con los torneos de Pareo Integral» en
-- docs/decisiones/juegos-y-torneos.md.

alter table public.arbitro_bitacora
  add column pareo text check (pareo ~ '^[a-z2-9]{8}$'),
  alter column tnr drop not null,
  add constraint arbitro_bitacora_un_torneo check (num_nonnulls(tnr, pareo) = 1);

comment on column public.arbitro_bitacora.pareo is
  'El código del enlace de árbitro de un torneo de Pareo Integral (8 letras), cuando la línea no es de chess-results. Una línea tiene tnr o pareo, nunca los dos.';

create index arbitro_bitacora_persona_pareo_idx on public.arbitro_bitacora (creada_por, pareo, ocurrio) where pareo is not null;

grant insert (pareo) on public.arbitro_bitacora to authenticated;

create or replace function interno.arbitro_puede_anular_en(p_anula uuid, p_tnr text, p_pareo text, p_ronda integer, p_mesa integer, p_color text)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select exists (
    select 1 from public.arbitro_bitacora b
     where b.id = p_anula
       and b.creada_por = (select auth.uid())
       and b.tipo in ('ilegal', 'irregularidad')
       and b.tnr is not distinct from p_tnr
       and b.pareo is not distinct from p_pareo
       and b.ronda is not distinct from p_ronda
       and b.mesa is not distinct from p_mesa
       and b.color is not distinct from p_color);
$function$;
revoke execute on function interno.arbitro_puede_anular_en(uuid, text, text, integer, integer, text) from public, anon;
grant execute on function interno.arbitro_puede_anular_en(uuid, text, text, integer, integer, text) to authenticated;
comment on function interno.arbitro_puede_anular_en(uuid, text, text, integer, integer, text) is
  'Mesa del árbitro: si quien llama puede anular esa línea de su bitácora (ilegal o irregularidad propia, de la misma partida —el mismo torneo de chess-results o el mismo enlace de Pareo— y jugador). La usa la política arbitro_bitacora_anotar; es SECURITY DEFINER para no recursar en la RLS de la misma tabla.';

drop policy arbitro_bitacora_anotar on public.arbitro_bitacora;
create policy arbitro_bitacora_anotar on public.arbitro_bitacora
  for insert to authenticated
  with check (
    creada_por = (select auth.uid())
    and (select public.tengo_herramienta('mesa-arbitro'))
    and (anula is null
         or (tipo = 'anulacion' and interno.arbitro_puede_anular_en(anula, tnr, pareo, ronda, mesa, color)))
  );

-- La de antes ya no la usa ninguna política.
drop function interno.arbitro_puede_anular(uuid, text, integer, integer, text);

create or replace function public.arbitro_torneos_mis()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_yo uuid := (select auth.uid());
begin
  if v_yo is null or not coalesce((select public.tengo_herramienta('mesa-arbitro')), false) then
    raise exception 'Tu cuenta no tiene la licencia de la Mesa del árbitro' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'tnr', x.tnr,
      'nombre', coalesce(nullif(x.nombre, ''), nullif(x.torneo, ''), nullif(x.torneo_bitacora, ''), 'Torneo ' || x.tnr),
      'nombre_propio', coalesce(x.nombre, ''),
      'torneo', coalesce(nullif(x.torneo, ''), x.torneo_bitacora, ''),
      'archivado', coalesce(x.archivado, false),
      'primera', x.primera, 'ultima', x.ultima,
      'lineas', coalesce(x.lineas, 0), 'resultados', coalesce(x.resultados, 0), 'incidencias', coalesce(x.incidencias, 0)
    ) order by x.ultima desc nulls last)
    from (
      select coalesce(b.tnr, t.tnr) as tnr, t.nombre, t.torneo, t.archivado, b.torneo_bitacora,
             least(b.primera, t.primera_vez) as primera, greatest(b.ultima, t.ultima_vez) as ultima,
             b.lineas, b.resultados, b.incidencias
        from (
          select tnr, (array_agg(torneo order by ocurrio desc) filter (where torneo <> ''))[1] as torneo_bitacora,
                 min(ocurrio) as primera, max(ocurrio) as ultima, count(*) as lineas,
                 count(*) filter (where tipo in ('resultado', 'correccion')) as resultados,
                 count(*) filter (where tipo = 'incidencia') as incidencias
            from public.arbitro_bitacora where creada_por = v_yo and tnr is not null group by tnr) b
        full join (select * from public.arbitro_torneos where creada_por = v_yo) t on t.tnr = b.tnr
    ) x
  ), '[]'::jsonb);
end;
$$;
