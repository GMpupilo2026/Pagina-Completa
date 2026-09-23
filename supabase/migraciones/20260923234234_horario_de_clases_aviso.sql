-- El aviso dice lo que de verdad hace la ficha: los del grupo nacen marcados
-- y lo que queda es revisar quiénes llegaron, no marcarlos uno por uno.
create or replace function public.avisar_fichas_faltantes()
returns int language plpgsql security definer set search_path to 'public' set row_security to off as $$
declare
  v_hoy date := (now() at time zone 'America/Costa_Rica')::date;
  v_n   int  := 0;
  r     record;
begin
  for r in
    select o.horario_id, o.profesor_id, o.fecha, h.titulo, h.grupo,
           to_char(o.inicio at time zone 'America/Costa_Rica', 'HH24:MI') as hora
      from public.ocurrencias_horario(null, v_hoy - 1, v_hoy) o
      join public.horario_clases h on h.id = o.horario_id
     where o.modalidad = 'presencial'
       and o.fin + interval '1 hour' <= now()
       and not exists (select 1 from public.class_sessions cs
                        where cs.created_by = o.profesor_id
                          and (cs.started_at at time zone 'America/Costa_Rica')::date = o.fecha)
  loop
    insert into public.avisos_ficha_faltante (horario_id, fecha)
    values (r.horario_id, r.fecha) on conflict do nothing;
    continue when not found;
    begin
      perform public.avisar_push(array[r.profesor_id], 'Falta pasar lista',
        'La clase de las ' || r.hora
          || coalesce(' (' || nullif(btrim(coalesce(r.titulo, r.grupo)), '') || ')', '')
          || case when r.fecha = v_hoy then ' de hoy' else ' de ayer' end
          || ' todavía no tiene ficha. Ya viene llena: solo revisa quiénes llegaron.',
        '/asistencia.html?horario=' || r.horario_id || '&fecha=' || r.fecha,
        'ficha-faltante:' || r.horario_id || ':' || r.fecha);
    exception when others then null;
    end;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
