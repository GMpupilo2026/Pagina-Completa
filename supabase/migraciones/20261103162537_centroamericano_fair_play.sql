-- Centroamericano 2026: el sorteo de Fair Play. Ver «El sorteo de Fair Play» en docs/decisiones/juegos-y-torneos.md.
--
-- El árbitro de Fair Play (alguien con la herramienta «mesa-arbitro», en la pestaña «Fair Play» de
-- centroamericano-mesas.html) sortea MESAS de una categoría en la ronda. De la mesa sorteada se revisa al
-- GANADOR cuando termina la partida; si es tablas, al color que salió en el mismo sorteo. Si aprueba el
-- sorteo, la base le manda el aviso al árbitro que tiene esa mesa (un mensaje de la organización, de los que
-- ya le llegan a su tablet) para que retenga al jugador y no lo deje salir del local.
--
-- Por qué el sorteo lo hace la base y no el navegador: un control al azar solo vale si nadie puede elegir a
-- quién le toca. El navegador podría sortear hasta que salga la mesa que quiere; acá cada sorteo queda
-- anotado con la hora y quién lo hizo, una mesa sorteada NUNCA se vuelve a sortear en esa ronda (índice
-- único, también la descartada) y descartar una pide un motivo, que queda. La revisión anota cómo terminó.
--
-- La tabla no tiene permisos de escritura: la escriben solo las cuatro funciones, que validan.

create table public.centroamericano_fair_play (
  id uuid primary key default gen_random_uuid(),
  creado timestamptz not null default now(),
  creado_por uuid default auth.uid() references public.profiles(id) on delete set null,
  tnr text not null references public.centroamericano_torneos(tnr),
  ronda integer not null check (ronda between 1 and 99),
  mesa integer not null check (mesa between 1 and 9999),
  mesas_en_sorteo integer not null check (mesas_en_sorteo >= 1),
  color_si_tablas text not null check (color_si_tablas in ('blancas', 'negras')),
  estado text not null default 'sorteada' check (estado in ('sorteada', 'aprobada', 'descartada', 'revisada')),
  motivo text check (motivo is null or length(motivo) <= 300),
  decidida_en timestamptz,
  decidida_por uuid references public.profiles(id) on delete set null,
  asignacion_id uuid references public.centroamericano_asignaciones(id) on delete set null,
  arbitro text,
  aviso_id uuid references public.centroamericano_avisos(id) on delete set null,
  resultado text check (resultado in ('sin_novedad', 'hallazgo', 'se_nego', 'no_se_presento')),
  jugador text check (jugador is null or length(jugador) <= 120),
  nota text check (nota is null or length(nota) <= 500),
  revisada_en timestamptz,
  revisada_por uuid references public.profiles(id) on delete set null,
  check (estado <> 'descartada' or length(btrim(coalesce(motivo, ''))) > 0),
  check (estado <> 'revisada' or resultado is not null)
);
comment on table public.centroamericano_fair_play is
  'El sorteo de Fair Play del Centroamericano: las mesas sorteadas en cada categoría y ronda (de cuántas salió y el color que se revisa si es tablas), si se aprobó (con el aviso al árbitro de la mesa) o se descartó (con su motivo), y cómo terminó la revisión. La escriben solo las funciones centroamericano_fair_play_*.';
-- Una mesa sale una sola vez por categoría y ronda, aunque se descarte: así no se puede sortear hasta que salga otra.
create unique index centroamericano_fair_play_una_vez on public.centroamericano_fair_play (tnr, ronda, mesa);

alter table public.centroamericano_fair_play enable row level security;
revoke all on public.centroamericano_fair_play from public, anon, authenticated;
grant select on public.centroamericano_fair_play to authenticated;
create policy centroamericano_fair_play_ver on public.centroamericano_fair_play
  for select to authenticated using ((select public.tengo_herramienta('mesa-arbitro')));

-- Sortear: por cada categoría, «p_cantidad» mesas al azar entre las que tienen árbitro con enlace vigente y
-- todavía no salieron en esa ronda. El azar es gen_random_uuid() (aleatorio de verdad, no random()).
create function public.centroamericano_fair_play_sortear(p_ronda integer, p_tnrs text[], p_cantidad integer default 1)
returns setof public.centroamericano_fair_play
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tnr text;
  v_pozo integer[];
  v_mesa integer;
begin
  if not coalesce((select public.tengo_herramienta('mesa-arbitro')), false) then
    raise exception 'Sin permiso para sortear el Fair Play' using errcode = '42501';
  end if;
  if p_ronda is null or p_ronda not between 1 and 99 then raise exception 'Ronda inválida'; end if;
  if p_cantidad is null or p_cantidad not between 1 and 10 then raise exception 'Se sortean de 1 a 10 mesas por categoría'; end if;
  foreach v_tnr in array coalesce(p_tnrs, '{}') loop
    select coalesce(array_agg(distinct m order by m), '{}') into v_pozo
      from public.centroamericano_asignaciones a, generate_series(a.mesa_desde, a.mesa_hasta) m
      where a.tnr = v_tnr and not a.revocada and a.vence > now()
        and not exists (select 1 from public.centroamericano_fair_play f where f.tnr = v_tnr and f.ronda = p_ronda and f.mesa = m);
    if cardinality(v_pozo) = 0 then continue; end if;
    for v_mesa in select x from unnest(v_pozo) x order by gen_random_uuid() limit p_cantidad loop
      return query insert into public.centroamericano_fair_play (tnr, ronda, mesa, mesas_en_sorteo, color_si_tablas)
        values (v_tnr, p_ronda, v_mesa, cardinality(v_pozo),
                (array['blancas', 'negras'])[1 + get_byte(uuid_send(gen_random_uuid()), 0) % 2])
        returning *;
    end loop;
  end loop;
end;
$$;

-- Aprobar: busca el árbitro que tiene la mesa (enlace vigente) y le manda el aviso. Sin árbitro, no se aprueba.
create function public.centroamericano_fair_play_aprobar(p_id uuid)
returns public.centroamericano_fair_play
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.centroamericano_fair_play;
  a public.centroamericano_asignaciones;
  v_aviso uuid;
begin
  if not coalesce((select public.tengo_herramienta('mesa-arbitro')), false) then
    raise exception 'Sin permiso para aprobar el Fair Play' using errcode = '42501';
  end if;
  select * into f from public.centroamericano_fair_play where id = p_id for update;
  if not found then raise exception 'No existe ese sorteo'; end if;
  if f.estado <> 'sorteada' then raise exception 'Ese sorteo ya se decidió'; end if;
  select * into a from public.centroamericano_asignaciones
    where tnr = f.tnr and not revocada and vence > now() and f.mesa between mesa_desde and mesa_hasta
    order by creada desc limit 1;
  if not found then raise exception 'La mesa % no tiene un árbitro con enlace vigente', f.mesa; end if;
  insert into public.centroamericano_avisos (de, asignacion_id, mesa, ronda, texto)
    values ('organizacion', a.id, f.mesa, f.ronda,
      '🛡 FAIR PLAY · Ronda ' || f.ronda || ', mesa ' || f.mesa || ': cuando TERMINE la partida, retén al GANADOR'
      || ' (si es tablas, a quien jugó con ' || upper(f.color_si_tablas) || ') y no lo dejes salir del local:'
      || ' el árbitro de Fair Play pasa a revisarlo. No le digas nada a nadie antes de que la partida termine.')
    returning id into v_aviso;
  update public.centroamericano_fair_play
    set estado = 'aprobada', decidida_en = now(), decidida_por = (select auth.uid()),
        asignacion_id = a.id, arbitro = a.arbitro, aviso_id = v_aviso
    where id = p_id
    returning * into f;
  return f;
end;
$$;

-- Descartar: solo una mesa sorteada que no se aprobó, y con motivo. La mesa no vuelve al sorteo de esa ronda.
create function public.centroamericano_fair_play_descartar(p_id uuid, p_motivo text)
returns public.centroamericano_fair_play
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.centroamericano_fair_play;
begin
  if not coalesce((select public.tengo_herramienta('mesa-arbitro')), false) then
    raise exception 'Sin permiso para descartar el Fair Play' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) = 0 then raise exception 'Para descartar una mesa hace falta el motivo'; end if;
  update public.centroamericano_fair_play
    set estado = 'descartada', motivo = left(btrim(p_motivo), 300), decidida_en = now(), decidida_por = (select auth.uid())
    where id = p_id and estado = 'sorteada'
    returning * into f;
  if not found then raise exception 'Solo se descarta una mesa sorteada que todavía no se aprobó'; end if;
  return f;
end;
$$;

-- Revisar: cómo terminó el control de una mesa aprobada (sin novedad, hallazgo, se negó o no se presentó).
create function public.centroamericano_fair_play_revisar(p_id uuid, p_resultado text, p_jugador text default null, p_nota text default null)
returns public.centroamericano_fair_play
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.centroamericano_fair_play;
begin
  if not coalesce((select public.tengo_herramienta('mesa-arbitro')), false) then
    raise exception 'Sin permiso para anotar el Fair Play' using errcode = '42501';
  end if;
  if p_resultado is null or p_resultado not in ('sin_novedad', 'hallazgo', 'se_nego', 'no_se_presento') then raise exception 'Resultado inválido'; end if;
  if p_resultado <> 'sin_novedad' and length(btrim(coalesce(p_nota, ''))) = 0 then raise exception 'Con ese resultado hace falta anotar qué pasó'; end if;
  update public.centroamericano_fair_play
    set estado = 'revisada', resultado = p_resultado, jugador = nullif(left(btrim(coalesce(p_jugador, '')), 120), ''),
        nota = nullif(left(btrim(coalesce(p_nota, '')), 500), ''), revisada_en = now(), revisada_por = (select auth.uid())
    where id = p_id and estado in ('aprobada', 'revisada')
    returning * into f;
  if not found then raise exception 'Solo se anota la revisión de una mesa aprobada'; end if;
  return f;
end;
$$;

revoke execute on function public.centroamericano_fair_play_sortear(integer, text[], integer) from public, anon;
revoke execute on function public.centroamericano_fair_play_aprobar(uuid) from public, anon;
revoke execute on function public.centroamericano_fair_play_descartar(uuid, text) from public, anon;
revoke execute on function public.centroamericano_fair_play_revisar(uuid, text, text, text) from public, anon;
grant execute on function public.centroamericano_fair_play_sortear(integer, text[], integer) to authenticated;
grant execute on function public.centroamericano_fair_play_aprobar(uuid) to authenticated;
grant execute on function public.centroamericano_fair_play_descartar(uuid, text) to authenticated;
grant execute on function public.centroamericano_fair_play_revisar(uuid, text, text, text) to authenticated;
