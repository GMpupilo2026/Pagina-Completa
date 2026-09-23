-- Recordatorios del informe mensual: al profesor los días 1 y 3 si no mandó el
-- del mes pasado, y el día 5 a su supervisión con quién falta. Lo dispara
-- pg_cron una vez al día; el índice único de recordatorios_informe hace que
-- volver a correrlo no mande nada dos veces.

create table public.recordatorios_informe (
  periodo    date not null,
  tipo       text not null check (tipo in ('profesor_1', 'profesor_3', 'supervisor_5')),
  persona_id uuid not null references public.profiles(id) on delete cascade,
  enviado_at timestamptz not null default now(),
  primary key (periodo, tipo, persona_id)
);
alter table public.recordatorios_informe enable row level security;
revoke all on public.recordatorios_informe from public, anon, authenticated;

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
      v_lista := array_to_string(v_nombres[1:3], ', ')
              || case when v_n > 3 then ' y ' || (v_n - 3) || ' más' else '' end;
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
revoke execute on function public.recordar_informes_mensuales(date) from public, anon, authenticated;

select cron.schedule('recordar-informes-mensuales', '0 14 * * *', 'select public.recordar_informes_mensuales();');
