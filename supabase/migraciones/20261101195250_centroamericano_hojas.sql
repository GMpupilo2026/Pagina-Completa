-- «Plan B en papel»: las mesas de cada árbitro (con sus jugadores) para imprimir una hoja de resultados por árbitro,
-- por si falla la señal de la sala. Sale de la lectura compartida de chess-results (centroamericano_lecturas), la
-- misma que ven las tablets: si hace falta ponerla al día, «Actualizar desde chess-results» en la ronda en curso.
-- Solo quien tiene la licencia de la Mesa del árbitro; las tablas siguen cerradas (la lectura no tiene política).

create function public.centroamericano_hojas()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce((select public.tengo_herramienta('mesa-arbitro')), false) then
    raise exception 'Tu cuenta no tiene la licencia de la Mesa del árbitro' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'asignacion', a.id, 'arbitro', a.arbitro, 'tnr', a.tnr, 'torneo', t.nombre, 'categoria', t.categoria, 'rama', t.rama,
      'mesa_desde', a.mesa_desde, 'mesa_hasta', a.mesa_hasta, 'ronda', l.ronda, 'leida', l.leida,
      'mesas', (select coalesce(jsonb_agg(m order by (m->>'mesa')::int), '[]'::jsonb)
                  from jsonb_array_elements(coalesce(l.mesas, '[]'::jsonb)) m
                 where (m->>'mesa')::int between a.mesa_desde and a.mesa_hasta)
    ) order by t.nombre, a.mesa_desde)
    from public.centroamericano_asignaciones a
    join public.centroamericano_torneos t on t.tnr = a.tnr
    left join public.centroamericano_lecturas l on l.tnr = a.tnr and l.ronda > 0
   where not a.revocada and a.vence > now()
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.centroamericano_hojas() from public, anon;
grant execute on function public.centroamericano_hojas() to authenticated;
