-- «Ya terminé mis labores»: el árbitro concluye su función en el Centroamericano.
--
-- Cuando el árbitro termina, toca «Ya terminé mis labores» en su tablet: se le cierran los resultados (la función ya no le deja
-- guardar ni anotar nada) y se le habilita descargar su bitácora en PDF (todas sus rondas, los torneos que atendió y todo lo que
-- le pasó). Lo que queda guardado de esa tarde es solo `concluyo_en` en SU enlace: si tiene varios enlaces juntados con
-- `persona`, se cierran todos juntos. La organización puede REABRIRLAS (un árbitro que concluyó por error, o que se corrige una
-- ronda): `centroamericano_reabrir_labores()`, con la licencia de la Mesa del árbitro.
--
-- La actividad de los árbitros (centroamericano_actividad) trae también la línea «Concluyó sus labores».

alter table public.centroamericano_asignaciones add column concluyo_en timestamptz;
comment on column public.centroamericano_asignaciones.concluyo_en is
  'Cuándo el árbitro tocó «Ya terminé mis labores». Con valor, la función centroamericano-mesa ya no le deja escribir (solo leer y bajar su bitácora). La quita centroamericano_reabrir_labores().';

-- La organización reabre las labores de un árbitro (y de sus otros enlaces, si los juntó con `persona`).
create function public.centroamericano_reabrir_labores(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_persona uuid; v_arbitro text; v_n integer;
begin
  if not coalesce((select public.tengo_herramienta('mesa-arbitro')), false) then
    raise exception 'Tu cuenta no tiene la licencia de la Mesa del árbitro' using errcode = '42501';
  end if;
  select persona, arbitro into v_persona, v_arbitro from public.centroamericano_asignaciones where id = p_id;
  if not found then raise exception 'Ese enlace ya no existe' using errcode = 'P0002'; end if;
  update public.centroamericano_asignaciones set concluyo_en = null
   where concluyo_en is not null and (id = p_id or (v_persona is not null and persona = v_persona));
  get diagnostics v_n = row_count;
  return jsonb_build_object('arbitro', v_arbitro, 'reabiertos', v_n);
end;
$$;
revoke all on function public.centroamericano_reabrir_labores(uuid) from public, anon;
grant execute on function public.centroamericano_reabrir_labores(uuid) to authenticated;

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
