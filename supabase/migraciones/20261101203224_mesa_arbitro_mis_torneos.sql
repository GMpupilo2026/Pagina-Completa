-- «Mis torneos» de la Mesa del árbitro: la lista de los torneos que cada persona ha trabajado, con un nombre a su
-- gusto y la opción de archivarlos, para volver a uno anterior (corregir, agregar una nota, bajar la bitácora).
--
-- La bitácora (arbitro_bitacora) ya guarda cada línea con su autor y el código del torneo; esta tabla solo agrega lo que
-- la bitácora no puede decir: el nombre propio, si está archivado y la última vez que se abrió. Cada persona ve solo lo
-- suyo. La tabla no tiene permisos directos: se lee y se escribe por funciones que piden la licencia de la herramienta
-- (una persona no puede tocar los torneos de otra). La clave (SID) del torneo NO se guarda aquí ni en ningún lado.

create table public.arbitro_torneos (
  creada_por uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  tnr text not null check (tnr ~ '^[0-9]{1,7}$'),
  torneo text not null default '' check (length(torneo) <= 200),   -- el nombre que le pone chess-results
  nombre text not null default '' check (length(nombre) <= 120),   -- el nombre que le pone la persona
  archivado boolean not null default false,
  primera_vez timestamptz not null default now(),
  ultima_vez timestamptz not null default now(),
  primary key (creada_por, tnr)
);
comment on table public.arbitro_torneos is
  'Los torneos de chess-results que cada persona ha abierto en la Mesa del árbitro (herramienta mesa-arbitro): su nombre propio, si está archivado y cuándo lo abrió. Sin permisos directos: lo leen y escriben arbitro_torneo_visto(), arbitro_torneo_ajustar() y arbitro_torneos_mis(). No guarda la clave del torneo.';
alter table public.arbitro_torneos enable row level security;
revoke all on public.arbitro_torneos from public, anon, authenticated;

-- Se llama al leer una ronda: el torneo queda en la lista (con el nombre que trae chess-results).
create function public.arbitro_torneo_visto(p_tnr text, p_torneo text)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_yo uuid := (select auth.uid());
begin
  if v_yo is null or not coalesce((select public.tengo_herramienta('mesa-arbitro')), false) then
    raise exception 'Tu cuenta no tiene la licencia de la Mesa del árbitro' using errcode = '42501';
  end if;
  if p_tnr is null or p_tnr !~ '^[0-9]{1,7}$' then raise exception 'El código del torneo son hasta 7 números' using errcode = '22023'; end if;
  insert into public.arbitro_torneos (creada_por, tnr, torneo)
  values (v_yo, p_tnr, left(coalesce(p_torneo, ''), 200))
  on conflict (creada_por, tnr) do update
    set torneo = case when excluded.torneo <> '' then excluded.torneo else public.arbitro_torneos.torneo end,
        ultima_vez = now();
end;
$$;
revoke all on function public.arbitro_torneo_visto(text, text) from public, anon;
grant execute on function public.arbitro_torneo_visto(text, text) to authenticated;

-- Ponerle nombre propio y/o archivarlo (null = no tocar). Un nombre vacío vuelve al de chess-results.
create function public.arbitro_torneo_ajustar(p_tnr text, p_nombre text, p_archivado boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_yo uuid := (select auth.uid());
begin
  if v_yo is null or not coalesce((select public.tengo_herramienta('mesa-arbitro')), false) then
    raise exception 'Tu cuenta no tiene la licencia de la Mesa del árbitro' using errcode = '42501';
  end if;
  if p_tnr is null or p_tnr !~ '^[0-9]{1,7}$' then raise exception 'El código del torneo son hasta 7 números' using errcode = '22023'; end if;
  insert into public.arbitro_torneos (creada_por, tnr, nombre, archivado)
  values (v_yo, p_tnr, left(btrim(coalesce(p_nombre, '')), 120), coalesce(p_archivado, false))
  on conflict (creada_por, tnr) do update
    set nombre = case when p_nombre is null then public.arbitro_torneos.nombre else left(btrim(p_nombre), 120) end,
        archivado = coalesce(p_archivado, public.arbitro_torneos.archivado);
end;
$$;
revoke all on function public.arbitro_torneo_ajustar(text, text, boolean) from public, anon;
grant execute on function public.arbitro_torneo_ajustar(text, text, boolean) to authenticated;

-- La lista: los torneos abiertos y los que solo tienen bitácora (de antes de esta lista), lo más reciente primero.
-- Las cuentas se hacen aquí (no se baja la bitácora entera al navegador: PostgREST corta a ~1000 filas).
create function public.arbitro_torneos_mis()
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
            from public.arbitro_bitacora where creada_por = v_yo group by tnr) b
        full join (select * from public.arbitro_torneos where creada_por = v_yo) t on t.tnr = b.tnr
    ) x
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.arbitro_torneos_mis() from public, anon;
grant execute on function public.arbitro_torneos_mis() to authenticated;
