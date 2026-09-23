-- La lista de quién falta se lee como se dice: «Ana y Bruno», no «Ana, Bruno».

create or replace function public.recordar_informes_mensuales(p_hoy date default null)
returns jsonb language plpgsql security definer set search_path to 'public' set row_security to off as $$
declare
  v_hoy     date := coalesce(p_hoy, (now() at time zone 'America/Costa_Rica')::date);
  v_dia     int  := extract(day from v_hoy)::int;
  v_mes     date := (date_trunc('month', v_hoy) - interval '1 month')::date;
  v_tipo    text;
  v_prof    int := 0;
  v_sup     int := 0;
  r         record;
  v_ids     uuid[];
  v_nombres text[];
  v_n       int;
  v_lista   text;
begin
  if v_dia in (1, 3) then
    v_tipo := 'profesor_' || v_dia;
    -- Solo a quien tiene supervisión: a quien no la tiene nadie le pide informe.
    for r in
      select p.id, i.estado
        from public.profiles p
        left join public.informes_profesor i on i.profesor_id = p.id and i.periodo = v_mes
       where p.role = 'profesor' and not coalesce(p.es_supervisor, false)
         and exists (select 1 from public.supervisores_de(p.id))
         and coalesce(i.estado, '') <> 'enviado'
    loop
      insert into public.recordatorios_informe (periodo, tipo, persona_id)
      values (v_mes, v_tipo, r.id) on conflict do nothing;
      if found then
        begin
          perform public.avisar_push(array[r.id], 'Tu informe mensual',
            case when r.estado = 'borrador'
                 then 'Tu informe de ' || public.mes_en_palabras(v_mes) || ' sigue en borrador: falta enviarlo.'
                 else 'Todavía no mandaste tu informe de ' || public.mes_en_palabras(v_mes) || '.' end,
            '/informe-mensual.html', 'recordatorio-informe:' || v_mes);
        exception when others then null;
        end;
        v_prof := v_prof + 1;
      end if;
    end loop;
  end if;

  if v_dia = 5 then
    for r in
      select s.id from public.profiles s where s.es_supervisor
    loop
      select array_agg(f.id order by f.nombre), array_agg(f.nombre order by f.nombre)
        into v_ids, v_nombres
        from (select p.id, coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1)) as nombre
                from public.profiles p
                left join public.informes_profesor i on i.profesor_id = p.id and i.periodo = v_mes
               where p.role = 'profesor' and not coalesce(p.es_supervisor, false) and p.id <> r.id
                 and r.id in (select public.supervisores_de(p.id))
                 and coalesce(i.estado, '') <> 'enviado') f;
      v_n := coalesce(array_length(v_ids, 1), 0);
      continue when v_n = 0;
      insert into public.recordatorios_informe (periodo, tipo, persona_id)
      values (v_mes, 'supervisor_5', r.id) on conflict do nothing;
      continue when not found;
      -- «Ana», «Ana y Bruno», «Ana, Bruno y Carla», «Ana, Bruno, Carla y 2 más».
      v_lista := case
        when v_n = 1 then v_nombres[1]
        when v_n <= 3 then array_to_string(v_nombres[1:v_n - 1], ', ') || ' y ' || v_nombres[v_n]
        else array_to_string(v_nombres[1:3], ', ') || ' y ' || (v_n - 3) || ' más' end;
      begin
        perform public.avisar_push(array[r.id], 'Informes mensuales pendientes',
          case when v_n = 1 then 'Falta 1 informe de ' else 'Faltan ' || v_n || ' informes de ' end
            || public.mes_en_palabras(v_mes) || ': ' || v_lista || '.',
          '/supervision.html', 'recordatorio-supervision:' || v_mes);
      exception when others then null;
      end;
      v_sup := v_sup + 1;
    end loop;
  end if;

  return jsonb_build_object('periodo', v_mes, 'dia', v_dia, 'profesores', v_prof, 'supervisores', v_sup);
end;
$$;
