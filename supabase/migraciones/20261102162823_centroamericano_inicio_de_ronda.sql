-- La hora REAL en que empezó cada ronda del Centroamericano.
--
-- El calendario dice que la ronda 1 empieza a las 9:30, pero el día del torneo empezó a las 10:48 y la organización no
-- tenía cómo decirlo: la cuenta del tiempo de espera (30 min desde el inicio, art. de las bases) seguía contando desde
-- las 9:30. Ahora la organización marca «Inició la ronda» (con la hora de ese momento) o pone la hora exacta que fue, y
-- desde ahí cuenta el tiempo de espera, en su página y en la tablet de cada árbitro.
--
-- Una fila por ronda y por «prueba» (los torneos de ensayo tienen su propia hora, para no ensuciar la de los reales).
-- Se escribe SOLO con centroamericano_inicio_ronda() (pide la licencia de la Mesa del árbitro); la tabla no tiene
-- permisos de escritura. La organización la lee por su política; el árbitro, que no tiene cuenta, la recibe de la
-- Edge Function centroamericano-mesa.

create table public.centroamericano_inicios_ronda (
  ronda integer not null check (ronda between 1 and 99),
  prueba boolean not null default false,
  inicio timestamptz not null,
  puesto_en timestamptz not null default now(),
  primary key (ronda, prueba)
);
comment on table public.centroamericano_inicios_ronda is
  'La hora real en que empezó cada ronda del Centroamericano (la marca la organización). Si no hay fila, vale la del calendario. Se escribe solo con centroamericano_inicio_ronda().';

alter table public.centroamericano_inicios_ronda enable row level security;
revoke all on public.centroamericano_inicios_ronda from public, anon, authenticated;
grant select on public.centroamericano_inicios_ronda to authenticated;
create policy centroamericano_inicios_ronda_ver on public.centroamericano_inicios_ronda
  for select to authenticated using ((select public.tengo_herramienta('mesa-arbitro')));

-- Marca la hora de inicio de una ronda; con p_inicio = null, la quita (vuelve a valer la del calendario).
-- La hora tiene que ser de las últimas 24 horas y no del futuro (1 min de margen por el reloj del aparato).
create function public.centroamericano_inicio_ronda(p_ronda integer, p_prueba boolean, p_inicio timestamptz)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce((select public.tengo_herramienta('mesa-arbitro')), false) then
    raise exception 'Tu cuenta no tiene la licencia de la Mesa del árbitro' using errcode = '42501';
  end if;
  if p_ronda is null or p_ronda < 1 or p_ronda > 99 then
    raise exception 'La ronda no es válida' using errcode = '22023';
  end if;
  if p_inicio is null then
    delete from public.centroamericano_inicios_ronda where ronda = p_ronda and prueba = coalesce(p_prueba, false);
    return jsonb_build_object('ronda', p_ronda, 'inicio', null);
  end if;
  if p_inicio > now() + interval '1 minute' then
    raise exception 'La hora de inicio no puede ser del futuro' using errcode = '22023';
  end if;
  if p_inicio < now() - interval '24 hours' then
    raise exception 'La hora de inicio tiene que ser de las últimas 24 horas' using errcode = '22023';
  end if;
  insert into public.centroamericano_inicios_ronda (ronda, prueba, inicio, puesto_en)
  values (p_ronda, coalesce(p_prueba, false), p_inicio, now())
  on conflict (ronda, prueba) do update set inicio = excluded.inicio, puesto_en = now();
  return jsonb_build_object('ronda', p_ronda, 'inicio', p_inicio);
end;
$$;
revoke all on function public.centroamericano_inicio_ronda(integer, boolean, timestamptz) from public, anon;
grant execute on function public.centroamericano_inicio_ronda(integer, boolean, timestamptz) to authenticated;
