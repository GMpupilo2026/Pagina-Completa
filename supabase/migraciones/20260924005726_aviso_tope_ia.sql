-- «Mejorar informe»: aviso a quien administra cuando una academia llega al 80 %
-- de su tope mensual de IA, y otro cuando lo agota (el botón deja de aparecer).
-- Sale del propio gasto: un trigger en ia_uso. Que no salga dos veces lo impide
-- la clave primaria, que lleva el tope: si se sube, el aviso se vuelve a armar.

create table public.avisos_ia_tope (
  periodo        date not null,
  academia_clave uuid not null,
  umbral         smallint not null check (umbral in (80, 100)),
  tope_usd       numeric(10,2) not null,
  gasto_usd      numeric(12,6) not null,
  enviado_at     timestamptz not null default now(),
  primary key (periodo, academia_clave, umbral, tope_usd)
);
alter table public.avisos_ia_tope enable row level security;
revoke all on public.avisos_ia_tope from public, anon, authenticated;

create or replace function public.avisar_tope_ia()
returns trigger language plpgsql security definer set search_path to 'public' set row_security to off as $$
declare
  v_tope    numeric;
  v_gasto   numeric;
  v_umbral  smallint;
  v_periodo date := date_trunc('month', now() at time zone 'America/Costa_Rica')::date;
  v_clave   uuid := coalesce(new.academia_id, '00000000-0000-0000-0000-000000000000'::uuid);
  v_nombre  text;
  v_admins  uuid[];
begin
  if coalesce(new.costo_usd, 0) <= 0 then return new; end if;
  select c.tope_mensual_usd into v_tope from public.academia_ia c
   where c.academia_id is not distinct from new.academia_id;
  if v_tope is null or v_tope <= 0 then return new; end if;
  select coalesce(sum(u.costo_usd), 0) into v_gasto from public.ia_uso u
   where u.academia_id is not distinct from new.academia_id
     and u.creado_at >= public.ia_inicio_de_mes();
  v_umbral := case when v_gasto >= v_tope then 100 when v_gasto >= v_tope * 0.8 then 80 end;
  if v_umbral is null then return new; end if;

  insert into public.avisos_ia_tope (periodo, academia_clave, umbral, tope_usd, gasto_usd)
  values (v_periodo, v_clave, v_umbral, v_tope, v_gasto) on conflict do nothing;
  if not found then return new; end if;
  -- Llegar al 100 % sin haber pasado por el aviso del 80 no lo vuelve a mandar después.
  if v_umbral = 100 then
    insert into public.avisos_ia_tope (periodo, academia_clave, umbral, tope_usd, gasto_usd)
    values (v_periodo, v_clave, 80, v_tope, v_gasto) on conflict do nothing;
  end if;

  select coalesce(a.nombre, 'el uso general') into v_nombre
    from (select 1) x left join public.academias a on a.id = new.academia_id;
  select array_agg(p.id) into v_admins from public.profiles p where p.is_admin;
  if v_admins is null then return new; end if;
  begin
    perform public.avisar_push(v_admins,
      case when v_umbral = 100 then 'Se acabó el presupuesto de IA' else 'La IA llegó al 80 % del tope' end,
      case when v_umbral = 100
           then 'Mejorar informe de ' || v_nombre || ' gastó US$' || to_char(v_gasto, 'FM999990.00')
                || ' de US$' || to_char(v_tope, 'FM999990.00') || ' este mes: sus profesores ya no ven el botón.'
           else 'Mejorar informe de ' || v_nombre || ' lleva US$' || to_char(v_gasto, 'FM999990.00')
                || ' de US$' || to_char(v_tope, 'FM999990.00') || ' este mes. Si se acaba, el botón deja de aparecer.' end,
      '/academias.html', 'ia-tope:' || v_clave);
  exception when others then null;
  end;
  return new;
end;
$$;
revoke execute on function public.avisar_tope_ia() from public, anon, authenticated;

create trigger ia_uso_avisa_tope after insert on public.ia_uso
  for each row execute function public.avisar_tope_ia();
