-- Centroamericano 2026: los encargados de Fair Play con su propio QR, el sorteo con peso y la regla contra el
-- acoso. Ver «El sorteo de Fair Play» en docs/decisiones/juegos-y-torneos.md.
--
-- 1. centroamericano_fp_enlaces: como los enlaces de los árbitros, el árbitro principal (la herramienta
--    «mesa-arbitro») crea uno por encargado de Fair Play. El encargado entra SIN CUENTA con su QR a
--    centroamericano-fair-play.html; la Edge Function centroamericano-fair-play valida el token y llama a
--    estas funciones con la clave de servicio, diciendo quién es. El encargado ve SOLO lo de Fair Play;
--    los árbitros de mesa no ven nada de esto (solo el aviso de su mesa). Reparte acceso: lleva auditoría.
--
-- 2. centroamericano_fp_partidas: los emparejamientos de cada ronda leídos de chess-results (públicos, sin
--    clave), con el número de cada jugador en el torneo (snr), su Elo y el resultado. Los escribe solo la
--    Edge Function. De ahí salen la diferencia de Elo de cada mesa y quién le ganó a alguien mucho más fuerte.
--
-- 3. El sorteo con PESO. Toda mesa puede salir (peso 1); algunas salen más seguido por señales que NO
--    deciden nada por sí solas, cada una con su tope, y el peso total no pasa de 4:
--      - diferencia de Elo en la mesa: +0,5 desde 200 y +1 desde 400;
--      - se levantó en esta ronda (lo anota su árbitro): +0,5 cada vez, hasta +1,5;
--      - ilegal o irregularidad en esta ronda: +0,5;
--      - le ganó a alguien con 200 o más de Elo en rondas anteriores: +0,5 cada vez, hasta +1;
--      - se levanta seguido (3 o más veces en rondas anteriores): +0,5;
--      - una alerta de precisión de rondas anteriores, nueva o marcada «seguir» (punto 5): +1.
--    Cada mesa sorteada guarda su peso y sus motivos: el acta dice por qué pesaba.
--    El azar es el de Efraimidis y Spirakis (clave = ln(u) / peso, se toman las más grandes) con u sacado de
--    gen_random_uuid(): una mesa de peso 2 sale el doble de seguido que una de peso 1, y ninguna queda fuera.
--
-- 5. El ANÁLISIS de las partidas de los tableros electrónicos (las que se transmiten a Lichess): la Edge
--    Function baja el PGN de cada ronda, que trae la evaluación de Lichess después de cada jugada, y saca la
--    precisión de cada jugador (la fórmula pública de Lichess, desde la jugada 9 y sin las posiciones ya
--    decididas, con 15 jugadas o más). centroamericano_fp_calibrar() compara cada precisión con la esperable
--    para su Elo EN ESTE MISMO TORNEO (una recta por mínimos cuadrados con todas las partidas) y marca
--    «a mirar» desde 2 desviaciones, «alta» desde 2,5, y también «a mirar» a quien sale alto (1,4 o más) en dos
--    partidas. Es una ALERTA para el encargado de Fair Play, nunca una acusación: la mira, la marca «vista» o
--    «seguir», y las nuevas o «seguir» suman +1 al peso de las mesas de ese jugador en los sorteos siguientes.
--
-- 4. Contra el ACOSO: quien ya se revisó (o tiene una revisión aprobada y pendiente) NO APLICA en las 2 rondas
--    siguientes, y nadie pasa de 3 revisiones en el torneo. Que uno de los dos no aplique NO saca a la mesa del
--    sorteo: si sale y gana quien no aplica, la mesa queda «sin efecto» y su árbitro recibe el aviso de que no
--    hace falta retenerlo; si gana el otro, se revisa. En tablas se revisa al color sorteado entre los que
--    aplican. La mesa queda fuera solo si ninguno de los dos aplica.
--
-- 6. El RESULTADO decide: cuando el árbitro guarda el resultado de una mesa aprobada (centroamericano_registro),
--    un trigger anota a quién se revisa (o que la mesa queda sin efecto) y le manda el aviso a su árbitro.

-- ---------------------------------------------------------------- 1. los enlaces de los encargados
create table public.centroamericano_fp_enlaces (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  nombre text not null check (length(btrim(nombre)) between 1 and 80),
  vence timestamptz not null,
  revocada boolean not null default false,
  creada_por uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  creada timestamptz not null default now(),
  ultimo_uso timestamptz
);
comment on table public.centroamericano_fp_enlaces is
  'El enlace (QR) de un encargado de Fair Play del Centroamericano: su token al azar, su nombre, cuándo vence y si se apagó. Sin cuenta: el token lo valida la Edge Function centroamericano-fair-play. Lo crea y lo apaga el árbitro principal (herramienta mesa-arbitro).';
alter table public.centroamericano_fp_enlaces enable row level security;
revoke all on public.centroamericano_fp_enlaces from public, anon, authenticated;
grant select on public.centroamericano_fp_enlaces to authenticated;
grant insert (nombre, vence) on public.centroamericano_fp_enlaces to authenticated;
grant update (nombre, vence, revocada) on public.centroamericano_fp_enlaces to authenticated;
create policy centroamericano_fp_enlaces_ver on public.centroamericano_fp_enlaces
  for select to authenticated using ((select public.tengo_herramienta('mesa-arbitro')));
create policy centroamericano_fp_enlaces_crear on public.centroamericano_fp_enlaces
  for insert to authenticated with check (creada_por = (select auth.uid()) and (select public.tengo_herramienta('mesa-arbitro')));
create policy centroamericano_fp_enlaces_cambiar on public.centroamericano_fp_enlaces
  for update to authenticated using ((select public.tengo_herramienta('mesa-arbitro'))) with check ((select public.tengo_herramienta('mesa-arbitro')));
create index centroamericano_fp_enlaces_creada_por_idx on public.centroamericano_fp_enlaces (creada_por);
create trigger auditar after insert or update or delete on public.centroamericano_fp_enlaces
  for each row execute function interno.auditar('nombre', 'vence', 'revocada');

-- ---------------------------------------------------------------- 2. los emparejamientos leídos
create table public.centroamericano_fp_partidas (
  tnr text not null references public.centroamericano_torneos(tnr),
  ronda integer not null check (ronda between 1 and 99),
  mesa integer not null check (mesa between 1 and 9999),
  snr_b integer, snr_n integer,
  blancas text not null default '' check (length(blancas) <= 120),
  negras text not null default '' check (length(negras) <= 120),
  elo_b integer, elo_n integer,
  resultado text not null default '' check (length(resultado) <= 20),
  leida timestamptz not null default now(),
  primary key (tnr, ronda, mesa)
);
comment on table public.centroamericano_fp_partidas is
  'Los emparejamientos de cada ronda del Centroamericano leídos de chess-results (públicos): número de cada jugador en el torneo, nombre, Elo y resultado. Para las señales del sorteo de Fair Play. La escribe solo la Edge Function centroamericano-fair-play.';
alter table public.centroamericano_fp_partidas enable row level security;
revoke all on public.centroamericano_fp_partidas from public, anon, authenticated;
grant select on public.centroamericano_fp_partidas to authenticated;
create policy centroamericano_fp_partidas_ver on public.centroamericano_fp_partidas
  for select to authenticated using ((select public.tengo_herramienta('mesa-arbitro')));

-- ---------------------------------------------------------------- 3. lo que guarda cada mesa sorteada
alter table public.centroamericano_fair_play
  add column blancas text, add column negras text,
  add column snr_b integer, add column snr_n integer,
  add column elo_b integer, add column elo_n integer,
  add column peso numeric(4, 2) not null default 1,
  add column motivos text[] not null default '{}',
  add column sorteada_por text,
  add column decidida_por_nombre text,
  add column revisada_por_nombre text,
  add column enlace_id uuid references public.centroamericano_fp_enlaces(id) on delete set null,
  add column jugador_color text check (jugador_color in ('blancas', 'negras')),
  add column jugador_snr integer,
  add column aplica_blancas boolean not null default true,
  add column aplica_negras boolean not null default true,
  add column no_aplica text,
  add column resultado_mesa text,
  add column revisar_color text check (revisar_color in ('blancas', 'negras'));
-- «sin_efecto»: ganó quien no aplicaba (o nadie jugó): no se revisa a nadie en esa mesa.
alter table public.centroamericano_fair_play drop constraint centroamericano_fair_play_estado_check;
alter table public.centroamericano_fair_play add constraint centroamericano_fair_play_estado_check
  check (estado in ('sorteada', 'aprobada', 'descartada', 'revisada', 'sin_efecto'));
create index centroamericano_fair_play_enlace_idx on public.centroamericano_fair_play (enlace_id);

-- Quién puede: el árbitro principal (la herramienta) o la Edge Function con la clave de servicio.
create function interno.fp_puede()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select public.tengo_herramienta('mesa-arbitro')), false)
      or coalesce((select auth.jwt() ->> 'role'), '') = 'service_role';
$$;
revoke all on function interno.fp_puede() from public, anon, authenticated;

-- El nombre de una persona sin comas, tildes ni mayúsculas: chess-results escribe «Garcia Tabasco, Alberto»
-- y el registro de los árbitros «Garcia Tabasco Alberto».
create function interno.fp_clave(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(translate(lower(coalesce(p, '')), 'áéíóúüñ,.', 'aeiouun  '), '\s+', ' ', 'g'));
$$;
revoke all on function interno.fp_clave(text) from public, anon, authenticated;

-- Quién es el principal que está haciendo algo (para el acta).
create function interno.fp_quien(p_quien text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(left(btrim(coalesce(p_quien, '')), 80), ''),
                  (select nullif(btrim(full_name), '') from public.profiles where id = (select auth.uid())),
                  'Árbitro principal');
$$;
revoke all on function interno.fp_quien(text) from public, anon, authenticated;

-- La ronda abierta de cada categoría: la más alta que se sabe (avance, lectura, inicio marcado), y nunca
-- menos que la más alta de las categorías del mismo modo (real o ensayo): todas siguen el mismo calendario.
create function public.centroamericano_fp_rondas()
returns table (tnr text, nombre text, prueba boolean, ronda integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not interno.fp_puede() then raise exception 'Sin permiso para Fair Play' using errcode = '42501'; end if;
  return query
  with cat as (
    select t.tnr, t.nombre, coalesce(t.prueba, false) prueba,
           greatest(
             coalesce((select max(p.ronda) from public.centroamericano_progreso p join public.centroamericano_asignaciones a on a.id = p.asignacion_id where a.tnr = t.tnr), 0),
             coalesce((select l.ronda from public.centroamericano_lecturas l where l.tnr = t.tnr), 0),
             coalesce((select max(i.ronda) from public.centroamericano_inicios_torneo i where i.tnr = t.tnr), 0),
             coalesce((select max(f.ronda) from public.centroamericano_fp_partidas f where f.tnr = t.tnr), 0)) r
      from public.centroamericano_torneos t
     where exists (select 1 from public.centroamericano_asignaciones a where a.tnr = t.tnr and not a.revocada and a.vence > now())
  )
  select c.tnr, c.nombre, c.prueba, (max(c.r) over (partition by c.prueba))::integer
    from cat c;
end;
$$;

-- Las mesas de una categoría y ronda, con su peso, sus motivos y quién de los dos no aplica (y por qué).
create function public.centroamericano_fp_candidatas(p_tnr text, p_ronda integer)
returns table (mesa integer, blancas text, negras text, snr_b integer, snr_n integer, elo_b integer, elo_n integer,
               peso numeric, motivos text[], aplica_blancas boolean, aplica_negras boolean, no_aplica text, excluida text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not interno.fp_puede() then raise exception 'Sin permiso para Fair Play' using errcode = '42501'; end if;
  return query
  with mesas as (
    select distinct m::integer mesa
      from public.centroamericano_asignaciones a, generate_series(a.mesa_desde, a.mesa_hasta) m
     where a.tnr = p_tnr and not a.revocada and a.vence > now()
  ),
  leida as (   -- la lectura compartida de los árbitros, si es de esta ronda (sin Elo)
    select (x->>'mesa')::integer mesa, x->>'blancas' blancas, x->>'negras' negras
      from public.centroamericano_lecturas l, jsonb_array_elements(l.mesas) x
     where l.tnr = p_tnr and l.ronda = p_ronda and (x->>'mesa') ~ '^\d+$'
  ),
  par as (
    select m.mesa,
           coalesce(nullif(p.blancas, ''), le.blancas, '') blancas, coalesce(nullif(p.negras, ''), le.negras, '') negras,
           p.snr_b, p.snr_n, p.elo_b, p.elo_n
      from mesas m
      left join public.centroamericano_fp_partidas p on p.tnr = p_tnr and p.ronda = p_ronda and p.mesa = m.mesa
      left join leida le on le.mesa = m.mesa
  ),
  reg as (     -- lo que anotan los árbitros, sin lo anulado
    select r.* from public.centroamericano_registro r
     where r.tnr = p_tnr
       and not exists (select 1 from public.centroamericano_registro an where an.tipo = 'anulacion' and an.anula = r.id)
  ),
  previas as ( -- quién le ganó a alguien con 200 o más de Elo en rondas anteriores
    select q.snr, count(*)::integer n, string_agg('ronda ' || q.ronda, ', ' order by q.ronda) rondas
      from (
        select f.ronda, f.snr_b snr from public.centroamericano_fp_partidas f
         where f.tnr = p_tnr and f.ronda < p_ronda and f.resultado ~ '^1\s*-\s*0' and f.elo_n - f.elo_b >= 200
        union all
        select f.ronda, f.snr_n from public.centroamericano_fp_partidas f
         where f.tnr = p_tnr and f.ronda < p_ronda and f.resultado ~ '^0\s*-\s*1' and f.elo_b - f.elo_n >= 200
      ) q where q.snr is not null group by q.snr
  ),
  revisados as ( -- a quién ya se revisó (o se va a revisar): el ganador anotado o, si falta, los dos de la mesa
    select fp.ronda, x.snr, x.clave
      from public.centroamericano_fair_play fp,
           lateral (
             select fp.jugador_snr snr, interno.fp_clave(fp.jugador) clave where fp.estado = 'revisada'
             union all select fp.snr_b, interno.fp_clave(fp.blancas) where fp.estado = 'aprobada' and coalesce(fp.revisar_color, 'blancas') = 'blancas'
             union all select fp.snr_n, interno.fp_clave(fp.negras) where fp.estado = 'aprobada' and coalesce(fp.revisar_color, 'negras') = 'negras'
           ) x
     where fp.tnr = p_tnr and fp.estado in ('aprobada', 'revisada') and fp.ronda <= p_ronda
  ),
  alertas as ( -- precisión muy alta en rondas anteriores, todavía sin mirar o marcada «seguir»
    select interno.fp_clave(an.jugador) clave, string_agg('ronda ' || an.ronda || ', ' || round(an.precision) || ' %', '; ' order by an.ronda) cuales
      from public.centroamericano_fp_analisis an
     where an.tnr = p_tnr and an.ronda < p_ronda and an.jugador <> ''
       and ((an.nivel <> 'normal' and an.estado = 'nueva') or an.estado = 'seguir')
     group by 1
  ),
  senal as (
    select pa.*,
           (select string_agg(al.cuales, '; ') from alertas al where al.clave in (interno.fp_clave(pa.blancas), interno.fp_clave(pa.negras))) alerta,
           case when pa.elo_b > 0 and pa.elo_n > 0 then abs(pa.elo_b - pa.elo_n) end dif,
           (select count(*) from reg r where r.ronda = p_ronda and r.mesa = pa.mesa and r.tipo = 'nota' and r.articulo = 'Levantó')::integer lev,
           (select count(*) from reg r where r.ronda = p_ronda and r.mesa = pa.mesa and r.tipo in ('ilegal', 'irregularidad'))::integer irr,
           (select coalesce(sum(pv.n), 0) from previas pv where pv.snr in (pa.snr_b, pa.snr_n))::integer sorpresas,
           (select string_agg(pv.rondas, '; ') from previas pv where pv.snr in (pa.snr_b, pa.snr_n)) sorpresas_rondas,
           (select count(*) from reg r where r.ronda < p_ronda and r.tipo = 'nota' and r.articulo = 'Levantó'
              and interno.fp_clave(r.jugador) in (interno.fp_clave(pa.blancas), interno.fp_clave(pa.negras)) and r.jugador <> '')::integer lev_antes,
           (select max(rv.ronda) from revisados rv where (rv.snr is not null and rv.snr = pa.snr_b) or (rv.clave <> '' and rv.clave = interno.fp_clave(pa.blancas))) ult_b,
           (select max(rv.ronda) from revisados rv where (rv.snr is not null and rv.snr = pa.snr_n) or (rv.clave <> '' and rv.clave = interno.fp_clave(pa.negras))) ult_n,
           (select count(distinct rv.ronda) from revisados rv where (rv.snr is not null and rv.snr = pa.snr_b) or (rv.clave <> '' and rv.clave = interno.fp_clave(pa.blancas)))::integer veces_b,
           (select count(distinct rv.ronda) from revisados rv where (rv.snr is not null and rv.snr = pa.snr_n) or (rv.clave <> '' and rv.clave = interno.fp_clave(pa.negras)))::integer veces_n
      from par pa
  ),
  aplica as (  -- por qué uno de los dos no aplica: 3 revisiones en el torneo, o se revisó hace menos de 3 rondas
    select se.*,
           case when se.veces_b >= 3 then 'ya tuvo 3 revisiones en el torneo'
                when se.ult_b is not null and se.ult_b >= p_ronda - 2 then 'se revisó en la ronda ' || se.ult_b end no_b,
           case when se.veces_n >= 3 then 'ya tuvo 3 revisiones en el torneo'
                when se.ult_n is not null and se.ult_n >= p_ronda - 2 then 'se revisó en la ronda ' || se.ult_n end no_n
      from senal se
  )
  select s.mesa, nullif(s.blancas, ''), nullif(s.negras, ''), s.snr_b, s.snr_n, s.elo_b, s.elo_n,
         least(4, 1
           + case when s.dif >= 400 then 1 when s.dif >= 200 then 0.5 else 0 end
           + least(1.5, 0.5 * s.lev)
           + case when s.irr > 0 then 0.5 else 0 end
           + least(1, 0.5 * s.sorpresas)
           + case when s.lev_antes >= 3 then 0.5 else 0 end
           + case when s.alerta is not null then 1 else 0 end)::numeric,
         array_remove(array[
           case when s.dif >= 200 then 'Diferencia de ' || s.dif || ' de Elo' end,
           case when s.lev > 0 then 'Se levantó ' || s.lev || (case when s.lev = 1 then ' vez' else ' veces' end) || ' en esta ronda' end,
           case when s.irr > 0 then 'Ilegal o irregularidad en esta ronda' end,
           case when s.sorpresas > 0 then 'Le ganó a alguien con 200 o más de Elo (' || s.sorpresas_rondas || ')' end,
           case when s.lev_antes >= 3 then 'Se levanta seguido (' || s.lev_antes || ' veces antes)' end,
           case when s.alerta is not null then 'Precisión muy alta para su Elo (' || s.alerta || ')' end], null),
         s.no_b is null, s.no_n is null,
         nullif(concat_ws('; ',
           case when s.no_b is not null then coalesce(nullif(s.blancas, ''), 'Blancas') || ' no aplica: ' || s.no_b end,
           case when s.no_n is not null then coalesce(nullif(s.negras, ''), 'Negras') || ' no aplica: ' || s.no_n end), ''),
         case
           when exists (select 1 from public.centroamericano_fair_play f where f.tnr = p_tnr and f.ronda = p_ronda and f.mesa = s.mesa) then 'Ya salió en esta ronda'
           when s.blancas <> '' and s.negras = '' then 'Sin partida (bye)'
           when s.no_b is not null and s.no_n is not null then 'Ninguno de los dos aplica'
         end
    from aplica s
   order by s.mesa;
end;
$$;

-- ---------------------------------------------------------------- 5. el análisis de las partidas transmitidas
create table public.centroamericano_fp_analisis (
  tnr text not null references public.centroamericano_torneos(tnr),
  ronda integer not null check (ronda between 1 and 99),
  mesa integer not null check (mesa between 1 and 9999),
  color text not null check (color in ('blancas', 'negras')),
  jugador text not null default '' check (length(jugador) <= 120),
  elo integer,
  rival text not null default '' check (length(rival) <= 120),
  rival_elo integer,
  resultado text not null default '' check (length(resultado) <= 10),
  jugadas integer not null check (jugadas >= 0),
  precision numeric(5, 2) not null,
  acpl numeric(7, 1) not null,
  esperada numeric(5, 2),
  z numeric(5, 2),
  nivel text not null default 'normal' check (nivel in ('normal', 'a_mirar', 'alta')),
  partida_url text check (partida_url is null or length(partida_url) <= 300),
  analizada timestamptz not null default now(),
  estado text not null default 'nueva' check (estado in ('nueva', 'vista', 'seguir')),
  nota text check (nota is null or length(nota) <= 500),
  vista_en timestamptz,
  vista_por_nombre text,
  primary key (tnr, ronda, mesa, color)
);
comment on table public.centroamericano_fp_analisis is
  'La precisión de cada jugador en las partidas transmitidas a Lichess (tableros electrónicos), comparada con la esperable para su Elo en el mismo torneo. Una alerta para el encargado de Fair Play, nunca una acusación. La escribe la Edge Function centroamericano-fair-play; el estado lo cambia centroamericano_fp_alerta().';
alter table public.centroamericano_fp_analisis enable row level security;
revoke all on public.centroamericano_fp_analisis from public, anon, authenticated;
grant select on public.centroamericano_fp_analisis to authenticated;
create policy centroamericano_fp_analisis_ver on public.centroamericano_fp_analisis
  for select to authenticated using ((select public.tengo_herramienta('mesa-arbitro')));

-- La precisión esperable para el Elo, con TODAS las partidas analizadas del mismo modo (real o ensayo): la recta
-- de mínimos cuadrados y la desviación de lo que se sale de ella. Con menos de 40 partidas no hay recta: solo se
-- marca «a mirar» una precisión de 96 o más en 20 jugadas o más.
create function public.centroamericano_fp_calibrar()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prueba boolean;
  v_n integer; v_a numeric; v_b numeric; v_sd numeric;
  v_cambios integer := 0;
  v_k integer;
begin
  if not interno.fp_puede() then raise exception 'Sin permiso para Fair Play' using errcode = '42501'; end if;
  for v_prueba in select distinct coalesce(t.prueba, false) from public.centroamericano_torneos t loop
    select count(*), regr_intercept(an.precision, an.elo), regr_slope(an.precision, an.elo)
      into v_n, v_a, v_b
      from public.centroamericano_fp_analisis an join public.centroamericano_torneos t on t.tnr = an.tnr
     where coalesce(t.prueba, false) = v_prueba and an.elo > 0 and an.jugadas >= 15;
    if v_n >= 40 then
      select stddev_pop(an.precision - (v_a + v_b * an.elo)) into v_sd
        from public.centroamericano_fp_analisis an join public.centroamericano_torneos t on t.tnr = an.tnr
       where coalesce(t.prueba, false) = v_prueba and an.elo > 0 and an.jugadas >= 15;
    else v_sd := null;
    end if;
    update public.centroamericano_fp_analisis an
       set esperada = case when v_sd > 0 and an.elo > 0 then round(v_a + v_b * an.elo, 2) end,
           z = case when v_sd > 0 and an.elo > 0 then round((an.precision - (v_a + v_b * an.elo)) / v_sd, 2) end
      from public.centroamericano_torneos t
     where t.tnr = an.tnr and coalesce(t.prueba, false) = v_prueba;
    -- El nivel: por partida, o por dos partidas altas del mismo jugador en el torneo.
    update public.centroamericano_fp_analisis an
       set nivel = case
             when an.jugadas >= 15 and an.z >= 2.5 then 'alta'
             when an.jugadas >= 15 and an.z >= 2 then 'a_mirar'
             when an.jugadas >= 15 and an.z >= 1.4 and (select count(*) from public.centroamericano_fp_analisis o
                    where o.tnr = an.tnr and interno.fp_clave(o.jugador) = interno.fp_clave(an.jugador) and o.jugadas >= 15 and o.z >= 1.4) >= 2 then 'a_mirar'
             when an.z is null and an.jugadas >= 20 and an.precision >= 96 then 'a_mirar'
             else 'normal' end
      from public.centroamericano_torneos t
     where t.tnr = an.tnr and coalesce(t.prueba, false) = v_prueba;
    get diagnostics v_k = row_count;
    v_cambios := v_cambios + v_k;
  end loop;
  return v_cambios;
end;
$$;

-- Lo que decide el encargado sobre una alerta: «vista» (la miró, no hace falta más) o «seguir» (que pese en los
-- sorteos siguientes), con una nota.
create function public.centroamericano_fp_alerta(p_tnr text, p_ronda integer, p_mesa integer, p_color text,
                                                 p_estado text, p_nota text default null, p_quien text default null)
returns public.centroamericano_fp_analisis
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.centroamericano_fp_analisis;
begin
  if not interno.fp_puede() then raise exception 'Sin permiso para Fair Play' using errcode = '42501'; end if;
  if p_estado not in ('vista', 'seguir') then raise exception 'Estado inválido'; end if;
  update public.centroamericano_fp_analisis
     set estado = p_estado, nota = nullif(left(btrim(coalesce(p_nota, '')), 500), ''), vista_en = now(), vista_por_nombre = interno.fp_quien(p_quien)
   where tnr = p_tnr and ronda = p_ronda and mesa = p_mesa and color = p_color
   returning * into f;
  if not found then raise exception 'No existe ese análisis'; end if;
  return f;
end;
$$;

-- ---------------------------------------------------------------- 4. sortear, aprobar, descartar y revisar
drop function public.centroamericano_fair_play_sortear(integer, text[], integer);
drop function public.centroamericano_fair_play_aprobar(uuid);
drop function public.centroamericano_fair_play_descartar(uuid, text);
drop function public.centroamericano_fair_play_revisar(uuid, text, text, text);

create function public.centroamericano_fair_play_sortear(p_ronda integer, p_tnrs text[], p_cantidad integer default 1,
                                                         p_quien text default null, p_enlace uuid default null)
returns setof public.centroamericano_fair_play
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tnr text;
  v_quien text := interno.fp_quien(p_quien);
  v_pozo integer;
begin
  if not interno.fp_puede() then raise exception 'Sin permiso para sortear el Fair Play' using errcode = '42501'; end if;
  if p_ronda is null or p_ronda not between 1 and 99 then raise exception 'Ronda inválida'; end if;
  if p_cantidad is null or p_cantidad not between 1 and 10 then raise exception 'Se sortean de 1 a 10 mesas por categoría'; end if;
  foreach v_tnr in array coalesce(p_tnrs, '{}') loop
    select count(*) into v_pozo from public.centroamericano_fp_candidatas(v_tnr, p_ronda) c where c.excluida is null;
    if v_pozo = 0 then continue; end if;
    return query
      insert into public.centroamericano_fair_play (tnr, ronda, mesa, mesas_en_sorteo, color_si_tablas, blancas, negras, snr_b, snr_n,
                                                    elo_b, elo_n, peso, motivos, sorteada_por, enlace_id, aplica_blancas, aplica_negras, no_aplica)
      select v_tnr, p_ronda, c.mesa, v_pozo,
             -- En tablas se revisa al color sorteado, entre los que aplican.
             case when not c.aplica_negras then 'blancas' when not c.aplica_blancas then 'negras'
                  else (array['blancas', 'negras'])[1 + get_byte(uuid_send(gen_random_uuid()), 0) % 2] end,
             c.blancas, c.negras, c.snr_b, c.snr_n, c.elo_b, c.elo_n, c.peso, c.motivos, v_quien, p_enlace,
             c.aplica_blancas, c.aplica_negras, c.no_aplica
        from public.centroamericano_fp_candidatas(v_tnr, p_ronda) c
       where c.excluida is null
       -- Efraimidis y Spirakis: la clave ln(u)/peso; salen las más grandes. u en (0, 1], de gen_random_uuid().
       order by ln(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 13))::bit(52)::bigint) + 1)::float8 / 4503599627370497.0) / c.peso desc
       limit p_cantidad
      returning *;
  end loop;
end;
$$;

create function public.centroamericano_fair_play_aprobar(p_id uuid, p_quien text default null)
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
  if not interno.fp_puede() then raise exception 'Sin permiso para aprobar el Fair Play' using errcode = '42501'; end if;
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
      || ' el árbitro de Fair Play pasa a revisarlo. No le digas nada a nadie antes de que la partida termine.'
      || case when f.no_aplica is not null then ' Ojo: ' || f.no_aplica || '. Si gana esa persona, la mesa queda sin efecto; te avisamos al guardar el resultado.' else '' end)
    returning id into v_aviso;
  update public.centroamericano_fair_play
    set estado = 'aprobada', decidida_en = now(), decidida_por = (select auth.uid()), decidida_por_nombre = interno.fp_quien(p_quien),
        asignacion_id = a.id, arbitro = a.arbitro, aviso_id = v_aviso
    where id = p_id
    returning * into f;
  return f;
end;
$$;

create function public.centroamericano_fair_play_descartar(p_id uuid, p_motivo text, p_quien text default null)
returns public.centroamericano_fair_play
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.centroamericano_fair_play;
begin
  if not interno.fp_puede() then raise exception 'Sin permiso para descartar el Fair Play' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_motivo, ''))) = 0 then raise exception 'Para descartar una mesa hace falta el motivo'; end if;
  update public.centroamericano_fair_play
    set estado = 'descartada', motivo = left(btrim(p_motivo), 300), decidida_en = now(), decidida_por = (select auth.uid()),
        decidida_por_nombre = interno.fp_quien(p_quien)
    where id = p_id and estado = 'sorteada'
    returning * into f;
  if not found then raise exception 'Solo se descarta una mesa sorteada que todavía no se aprobó'; end if;
  return f;
end;
$$;

-- p_color dice a quién se revisó (el ganador, o el color sorteado si fue tablas): el nombre y el número salen
-- de la mesa, así la regla contra el acoso sabe quién fue. p_jugador queda para una mesa sin emparejamiento leído.
create function public.centroamericano_fair_play_revisar(p_id uuid, p_resultado text, p_color text default null, p_jugador text default null,
                                                         p_nota text default null, p_quien text default null)
returns public.centroamericano_fair_play
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.centroamericano_fair_play;
begin
  if not interno.fp_puede() then raise exception 'Sin permiso para anotar el Fair Play' using errcode = '42501'; end if;
  if p_resultado is null or p_resultado not in ('sin_novedad', 'hallazgo', 'se_nego', 'no_se_presento') then raise exception 'Resultado inválido'; end if;
  if p_color is not null and p_color not in ('blancas', 'negras') then raise exception 'Color inválido'; end if;
  if p_resultado <> 'sin_novedad' and length(btrim(coalesce(p_nota, ''))) = 0 then raise exception 'Con ese resultado hace falta anotar qué pasó'; end if;
  update public.centroamericano_fair_play
    set estado = 'revisada', resultado = p_resultado, jugador_color = coalesce(p_color, revisar_color),
        jugador = coalesce(nullif(left(btrim(coalesce(case coalesce(p_color, revisar_color) when 'blancas' then blancas when 'negras' then negras end, '')), 120), ''),
                           nullif(left(btrim(coalesce(p_jugador, '')), 120), '')),
        jugador_snr = case coalesce(p_color, revisar_color) when 'blancas' then snr_b when 'negras' then snr_n end,
        nota = nullif(left(btrim(coalesce(p_nota, '')), 500), ''), revisada_en = now(), revisada_por = (select auth.uid()),
        revisada_por_nombre = interno.fp_quien(p_quien)
    where id = p_id and estado in ('aprobada', 'revisada')
    returning * into f;
  if not found then raise exception 'Solo se anota la revisión de una mesa aprobada'; end if;
  return f;
end;
$$;

revoke execute on function public.centroamericano_fp_rondas() from public, anon;
revoke execute on function public.centroamericano_fp_candidatas(text, integer) from public, anon;
revoke execute on function public.centroamericano_fair_play_sortear(integer, text[], integer, text, uuid) from public, anon;
revoke execute on function public.centroamericano_fair_play_aprobar(uuid, text) from public, anon;
revoke execute on function public.centroamericano_fair_play_descartar(uuid, text, text) from public, anon;
revoke execute on function public.centroamericano_fair_play_revisar(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.centroamericano_fp_rondas() to authenticated, service_role;
grant execute on function public.centroamericano_fp_candidatas(text, integer) to authenticated, service_role;
grant execute on function public.centroamericano_fair_play_sortear(integer, text[], integer, text, uuid) to authenticated, service_role;
grant execute on function public.centroamericano_fair_play_aprobar(uuid, text) to authenticated, service_role;
grant execute on function public.centroamericano_fair_play_descartar(uuid, text, text) to authenticated, service_role;
grant execute on function public.centroamericano_fair_play_revisar(uuid, text, text, text, text, text) to authenticated, service_role;
revoke execute on function public.centroamericano_fp_calibrar() from public, anon;
revoke execute on function public.centroamericano_fp_alerta(text, integer, integer, text, text, text, text) from public, anon;
grant execute on function public.centroamericano_fp_calibrar() to authenticated, service_role;
grant execute on function public.centroamericano_fp_alerta(text, integer, integer, text, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------- 6. el resultado decide a quién se revisa
-- Cuando el árbitro guarda (o corrige) el resultado de una mesa aprobada: quién ganó (en tablas, el color sorteado),
-- si aplica se revisa y, si no, la mesa queda sin efecto. Su árbitro recibe el aviso en la tablet. Un resultado
-- borrado la deja otra vez esperando. Solo avisa cuando cambia lo que hay que hacer.
create function interno.fp_tras_resultado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.centroamericano_fair_play;
  v_color text;
  v_nombre text;
  v_aplica boolean;
  v_texto text;
begin
  if new.tipo not in ('resultado', 'correccion') or new.resultado is null then return null; end if;
  select * into f from public.centroamericano_fair_play
   where tnr = new.tnr and ronda = new.ronda and mesa = new.mesa and estado in ('aprobada', 'sin_efecto')
   for update;
  if not found then return null; end if;
  if new.resultado = 'borrado' then
    update public.centroamericano_fair_play set estado = 'aprobada', revisar_color = null, resultado_mesa = null where id = f.id;
    return null;
  end if;
  v_color := case new.resultado when '1-0' then 'blancas' when '1f-0f' then 'blancas' when '0-1' then 'negras' when '0f-1f' then 'negras'
                                when '1/2' then f.color_si_tablas end;
  if v_color is null then   -- 0f-0f: nadie jugó
    update public.centroamericano_fair_play set estado = 'sin_efecto', revisar_color = null, resultado_mesa = new.resultado where id = f.id;
    v_texto := '🛡 FAIR PLAY · Ronda ' || f.ronda || ', mesa ' || f.mesa || ': no se jugó (0f-0f). La mesa queda sin efecto: no hay que retener a nadie.';
  else
    v_nombre := coalesce(nullif(case v_color when 'blancas' then f.blancas else f.negras end, ''), case v_color when 'blancas' then 'quien jugó con blancas' else 'quien jugó con negras' end);
    v_aplica := case v_color when 'blancas' then f.aplica_blancas else f.aplica_negras end;
    update public.centroamericano_fair_play
       set estado = case when v_aplica then 'aprobada' else 'sin_efecto' end, revisar_color = v_color, resultado_mesa = new.resultado
     where id = f.id;
    v_texto := '🛡 FAIR PLAY · Ronda ' || f.ronda || ', mesa ' || f.mesa || ': '
      || case when new.resultado = '1/2' then 'tablas; se revisa a ' else 'ganó ' end || v_nombre || ' (' || v_color || '). '
      || case when v_aplica then 'Retenlo y no lo dejes salir del local: el árbitro de Fair Play pasa a revisarlo.'
              else 'NO APLICA para Fair Play (' || coalesce(f.no_aplica, 'ya se revisó') || '). La mesa queda sin efecto: no hace falta retenerlo.' end;
  end if;
  if f.asignacion_id is not null and (f.resultado_mesa is distinct from new.resultado) then
    insert into public.centroamericano_avisos (de, asignacion_id, mesa, ronda, texto) values ('organizacion', f.asignacion_id, f.mesa, f.ronda, left(v_texto, 500));
  end if;
  return null;
end;
$$;
revoke all on function interno.fp_tras_resultado() from public, anon, authenticated;
create trigger fair_play_resultado after insert on public.centroamericano_registro
  for each row execute function interno.fp_tras_resultado();

-- Que la base sepa que esta migración ya se aplicó (se pega a mano en el editor SQL).
insert into supabase_migrations.schema_migrations (version, name) values ('20261103180000', 'centroamericano_fair_play_encargados')
  on conflict (version) do nothing;
