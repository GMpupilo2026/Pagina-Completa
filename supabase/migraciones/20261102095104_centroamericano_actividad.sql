-- «Actividad de los árbitros»: TODO lo que hace cada árbitro, en una sola lista en orden, para que quien administra pueda
-- supervisar desde el Registro (centroamericano-mesas.html).
--
-- La bitácora (centroamericano_registro) ya guardaba resultados, ilegales, irregularidades, incidencias, notas y los
-- controles de tiempos. Lo demás quedaba repartido en otras tablas, sin lugar donde verlo junto: marcar quién llegó y quién
-- no (presencia), subir la foto de las planillas, aprobar la revisión previa, terminar sus mesas y finalizar la ronda, pedir
-- ayuda y leer un aviso de la organización. Esta función junta todo en una línea de tiempo, con cuentas hechas en la base
-- (no se bajan las tablas enteras al navegador: PostgREST corta a ~1000 filas).
--
-- Solo lee. Pide la licencia de la Mesa del árbitro (la organización). Las tablas siguen cerradas.

create function public.centroamericano_actividad(p_tnr text default null, p_desde timestamptz default null, p_limite integer default 600)
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
        select r.ocurrio as cuando, r.tnr, r.arbitro, r.ronda, r.mesa, r.tipo,
               case r.tipo
                 when 'resultado' then coalesce(r.jugador, '') || ' → ' || coalesce(r.resultado, '')
                 when 'correccion' then coalesce(r.jugador, '') || ' → ' || coalesce(r.resultado, '') || coalesce(' (antes ' || r.anterior || ')', '')
                 when 'ilegal' then coalesce(r.jugador, '') || ' (' || coalesce(r.color, '') || ')' || case when r.texto <> '' then ': ' || r.texto else '' end
                 when 'irregularidad' then coalesce(r.jugador, '') || ' (' || coalesce(r.color, '') || ')' || case when r.texto <> '' then ': ' || r.texto else '' end
                 when 'anulacion' then 'anuló una anotación de ' || coalesce(r.jugador, '')
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
