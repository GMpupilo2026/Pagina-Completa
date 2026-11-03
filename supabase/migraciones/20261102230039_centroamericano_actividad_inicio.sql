-- La actividad de los árbitros (la que ve la organización) trae también cuándo CADA CATEGORÍA inició la ronda: la marca el árbitro de la
-- categoría (centroamericano_inicios_torneo, la escribe la función centroamericano-mesa) y la organización la ve junto a lo demás,
-- con la hora a la que empezó de verdad. Misma función que antes (mismos permisos): solo suma una rama a la lista.

create or replace function public.centroamericano_actividad(p_tnr text default null, p_desde timestamptz default null, p_limite integer default 600)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce((select public.tengo_herramienta('mesa-arbitro')), false) then
    raise exception 'Tu cuenta no tiene la licencia de la Mesa del árbitro' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'cuando', e.cuando, 'tnr', e.tnr, 'torneo', coalesce(t.nombre, e.tnr), 'arbitro', e.arbitro,
      'ronda', e.ronda, 'mesa', e.mesa, 'tipo', e.tipo, 'detalle', e.detalle) order by e.cuando desc)
    from (
      select * from (
        -- lo que ya estaba en la bitácora
        select r.ocurrio as cuando, r.tnr, r.arbitro, r.ronda, r.mesa,
               case when r.tipo = 'nota' and r.articulo = 'Levantó' then 'levanto' else r.tipo end,
               case r.tipo
                 when 'resultado' then coalesce(r.jugador, '') || ' → ' || coalesce(r.resultado, '')
                 when 'correccion' then coalesce(r.jugador, '') || ' → ' || coalesce(r.resultado, '') || coalesce(' (antes ' || r.anterior || ')', '')
                 when 'ilegal' then coalesce(r.jugador, '') || ' (' || coalesce(r.color, '') || ')' || case when r.texto <> '' then ': ' || r.texto else '' end
                 when 'irregularidad' then coalesce(r.jugador, '') || ' (' || coalesce(r.color, '') || ')' || case when r.texto <> '' then ': ' || r.texto else '' end
                 when 'anulacion' then 'anuló una anotación de ' || coalesce(r.jugador, '')
                 when 'nota' then case when r.articulo = 'Levantó' then coalesce(r.jugador, '') || ' (' || coalesce(r.color, '') || ') se levantó de la mesa' else r.texto end
                 else r.texto end as detalle
          from public.centroamericano_registro r
        union all
        select p.marcada, p.tnr, p.arbitro, p.ronda, p.mesa, 'presencia',
               coalesce(p.jugador, '') || ' (' || p.color || '): ' || case when p.presente then 'llegó' else 'no ha llegado' end
          from public.centroamericano_presencia p
        union all
        select p.subida, p.tnr, p.arbitro, p.ronda, p.mesa, 'planilla',
               'Foto de las planillas' || case when p.drive_ok then ' (ya está en el Drive)' else ' (todavía no pasa al Drive)' end
          from public.centroamericano_planillas p
        union all
        select l.aprobada_en, a.tnr, a.arbitro, l.ronda, null::integer, 'lista',
               'Aprobó el paso «' || l.paso || '» de la revisión previa'
          from public.centroamericano_listas l join public.centroamericano_asignaciones a on a.id = l.asignacion_id
        union all
        select f.finalizada_en, a.tnr, a.arbitro, f.ronda, null::integer, 'finalizo', 'Finalizó la ronda ' || f.ronda
          from public.centroamericano_finales f join public.centroamericano_asignaciones a on a.id = f.asignacion_id
        union all
        select v.creado, a.tnr, a.arbitro, v.ronda, v.mesa,
               case v.tipo when 'termino' then 'termino' else 'ayuda' end,
               case v.tipo when 'termino' then 'Terminó sus mesas' else 'Pidió ayuda' || case when v.texto <> '' then ': ' || v.texto else '' end end
          from public.centroamericano_avisos v join public.centroamericano_asignaciones a on a.id = v.asignacion_id
         where v.de = 'arbitro' and v.tipo in ('ayuda', 'termino')
        union all
        select a.concluyo_en, a.tnr, a.arbitro, null::integer, null::integer, 'concluyo', 'Concluyó sus labores: ya no puede anotar ni guardar'
          from public.centroamericano_asignaciones a
         where a.concluyo_en is not null
        union all
        select i.inicio, i.tnr, i.arbitro, i.ronda, null::integer, 'inicio',
               'Inició la ronda ' || i.ronda || ' en su categoría: desde ahí corre el tiempo de espera'
          from public.centroamericano_inicios_torneo i
        union all
        select v.leido_en, a.tnr, a.arbitro, v.ronda, v.mesa, 'leyo', 'Leyó el aviso de la organización: «' || left(v.texto, 120) || '»'
          from public.centroamericano_avisos v join public.centroamericano_asignaciones a on a.id = v.asignacion_id
         where v.de = 'organizacion' and v.leido_en is not null
      ) u
      where u.cuando is not null
        and (p_tnr is null or p_tnr = '' or u.tnr = p_tnr)
        and (p_desde is null or u.cuando >= p_desde)
      order by u.cuando desc
      limit least(greatest(coalesce(p_limite, 600), 1), 2000)
    ) e
    left join public.centroamericano_torneos t on t.tnr = e.tnr
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.centroamericano_actividad(text, timestamptz, integer) from public, anon;
grant execute on function public.centroamericano_actividad(text, timestamptz, integer) to authenticated;
