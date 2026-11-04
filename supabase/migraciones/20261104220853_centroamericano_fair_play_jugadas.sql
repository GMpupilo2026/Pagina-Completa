-- Centroamericano 2026, Fair Play, fase 1 del detector: cada jugada con las 3 mejores del motor, la dificultad de la
-- posición, el tiempo que pensó y si fue justo después de levantarse; y en cada alerta, las señales que se explican
-- solas. Ver «El detector de Fair Play, jugada por jugada» en docs/decisiones/juegos-y-torneos.md.
--
-- 1. centroamericano_fp_jugadas: una fila por jugada medida (la escribe la Edge Function centroamericano-fair-play con
--    la clave de servicio, de la evaluación que hace la pantalla de Fair Play; la leen solo quienes tienen la
--    herramienta «mesa-arbitro», como el resto de Fair Play). Es la base de lo que viene: con muchos torneos medidos,
--    saber cómo juega de verdad un 1400 o un 1800.
-- 2. En centroamericano_fp_analisis, por jugador y partida: cuántas jugadas cuentan (sin las forzadas), cuántas fueron
--    la primera del motor y cuántas de las 3 primeras, las posiciones difíciles y cuántas acertó, lo que pensó en ellas y
--    en las demás, lo que jugó después de levantarse y las jugadas más llamativas.
-- 3. centroamericano_fp_calibrar compara cada señal con lo esperable PARA SU ELO en el torneo (como la precisión) y, si
--    no tiene Elo —casi todos en las categorías chicas—, con su categoría (comparado = 'categoria'). Las señales: la
--    precisión (z), la primera del motor (z_t1) y las difíciles (z_dif), cada una «alta» desde 2 desviaciones; el
--    tiempo raro (en las difíciles pensó menos de 6 décimos de lo que pensó en las demás, con 3 o más) solo suma junto a
--    otra. El nivel: «muy alta» con una señal de 2,5 o más, o dos señales; «a mirar» con una. Ninguna decide sola, y es
--    una alerta, nunca una acusación.
-- 4. centroamericano_fp_partidas.analisis_version: lo medido con una versión anterior se vuelve a analizar solo.

create table public.centroamericano_fp_jugadas (
  tnr text not null references public.centroamericano_torneos(tnr),
  ronda integer not null check (ronda between 1 and 99),
  mesa integer not null check (mesa between 1 and 9999),
  ply integer not null check (ply between 0 and 999),
  color text not null check (color in ('blancas', 'negras')),
  san text not null check (length(san) <= 12),
  uci text not null check (length(uci) <= 6),
  mejor text check (length(mejor) <= 6),
  rango smallint not null check (rango between 0 and 5),
  perdida integer not null check (perdida between 0 and 1000),
  forzada boolean not null,
  dificil boolean not null,
  segundos integer,
  antes integer not null,
  despues integer not null,
  tras_levantarse boolean not null default false,
  primary key (tnr, ronda, mesa, ply)
);
comment on table public.centroamericano_fp_jugadas is
  'Fair Play del Centroamericano: cada jugada medida de los tableros electrónicos (LiveChess) con la mejor del motor, en qué lugar de las 3 primeras quedó lo jugado, cuánto perdió, si era forzada o difícil, lo que pensó y si fue justo después de levantarse. La escribe la Edge Function centroamericano-fair-play; la lee quien tiene la herramienta mesa-arbitro.';
alter table public.centroamericano_fp_jugadas enable row level security;
revoke all on public.centroamericano_fp_jugadas from public, anon, authenticated;
grant select on public.centroamericano_fp_jugadas to authenticated;
create policy centroamericano_fp_jugadas_ver on public.centroamericano_fp_jugadas
  for select to authenticated using ((select public.tengo_herramienta('mesa-arbitro')));

alter table public.centroamericano_fp_partidas
  add column analisis_version smallint not null default 0;
comment on column public.centroamericano_fp_partidas.analisis_version is
  'Con qué versión del análisis se midió (VERSION_ANALISIS de analisis.ts): una menor se vuelve a analizar.';

alter table public.centroamericano_fp_analisis
  add column consideradas integer,
  add column t1 integer,
  add column top3 integer,
  add column dificiles integer,
  add column dificiles_ok integer,
  add column seg_dificil numeric(7, 1),
  add column seg_resto numeric(7, 1),
  add column tras_levantarse integer,
  add column tras_levantarse_t1 integer,
  add column momentos jsonb,
  add column comparado text check (comparado in ('elo', 'categoria')),
  add column esperada_t1 numeric(5, 2),
  add column z_t1 numeric(5, 2),
  add column esperada_dif numeric(5, 2),
  add column z_dif numeric(5, 2),
  add column tiempo_raro boolean,
  add column senales integer;
comment on column public.centroamericano_fp_analisis.consideradas is 'Jugadas que cuentan para la coincidencia con el motor (sin la apertura, lo decidido ni lo forzado).';
comment on column public.centroamericano_fp_analisis.t1 is 'De las consideradas, cuántas fueron la primera opción del motor.';
comment on column public.centroamericano_fp_analisis.dificiles is 'Posiciones con una sola jugada buena que no es jaque ni captura.';
comment on column public.centroamericano_fp_analisis.comparado is 'Con qué se comparó: elo (lo esperable para su Elo en el torneo) o categoria (no tiene Elo: el promedio de su categoría).';
comment on column public.centroamericano_fp_analisis.senales is 'Cuántas señales salieron altas (precisión, primera del motor, difíciles; 2 desviaciones o más).';

-- La calibración, ahora con las tres señales y la comparación con la categoría para quien no tiene Elo.
create or replace function public.centroamericano_fp_calibrar()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prueba boolean;
  v_n integer; v_a numeric; v_b numeric; v_sd numeric;
  t_n integer; t_a numeric; t_b numeric; t_sd numeric;
  d_n integer; d_a numeric; d_b numeric; d_sd numeric;
  v_cambios integer := 0;
  v_k integer;
begin
  if not interno.fp_puede() then raise exception 'Sin permiso para Fair Play' using errcode = '42501'; end if;
  for v_prueba in select distinct coalesce(t.prueba, false) from public.centroamericano_torneos t loop
    -- La precisión contra el Elo (igual que antes).
    select count(*), regr_intercept(an.precision, an.elo), regr_slope(an.precision, an.elo) into v_n, v_a, v_b
      from public.centroamericano_fp_analisis an join public.centroamericano_torneos t on t.tnr = an.tnr
     where coalesce(t.prueba, false) = v_prueba and an.elo > 0 and an.jugadas >= 15;
    v_sd := null;
    if v_n >= 40 then
      select stddev_pop(an.precision - (v_a + v_b * an.elo)) into v_sd
        from public.centroamericano_fp_analisis an join public.centroamericano_torneos t on t.tnr = an.tnr
       where coalesce(t.prueba, false) = v_prueba and an.elo > 0 and an.jugadas >= 15;
    end if;
    -- La primera del motor (en % de las jugadas que cuentan) contra el Elo.
    select count(*), regr_intercept(100.0 * an.t1 / an.consideradas, an.elo), regr_slope(100.0 * an.t1 / an.consideradas, an.elo) into t_n, t_a, t_b
      from public.centroamericano_fp_analisis an join public.centroamericano_torneos t on t.tnr = an.tnr
     where coalesce(t.prueba, false) = v_prueba and an.elo > 0 and an.consideradas >= 10;
    t_sd := null;
    if t_n >= 40 then
      select stddev_pop(100.0 * an.t1 / an.consideradas - (t_a + t_b * an.elo)) into t_sd
        from public.centroamericano_fp_analisis an join public.centroamericano_torneos t on t.tnr = an.tnr
       where coalesce(t.prueba, false) = v_prueba and an.elo > 0 and an.consideradas >= 10;
    end if;
    -- Las difíciles acertadas (en %) contra el Elo.
    select count(*), regr_intercept(100.0 * an.dificiles_ok / an.dificiles, an.elo), regr_slope(100.0 * an.dificiles_ok / an.dificiles, an.elo) into d_n, d_a, d_b
      from public.centroamericano_fp_analisis an join public.centroamericano_torneos t on t.tnr = an.tnr
     where coalesce(t.prueba, false) = v_prueba and an.elo > 0 and an.dificiles >= 4;
    d_sd := null;
    if d_n >= 30 then
      select stddev_pop(100.0 * an.dificiles_ok / an.dificiles - (d_a + d_b * an.elo)) into d_sd
        from public.centroamericano_fp_analisis an join public.centroamericano_torneos t on t.tnr = an.tnr
       where coalesce(t.prueba, false) = v_prueba and an.elo > 0 and an.dificiles >= 4;
    end if;
    -- Sin Elo: el promedio y la dispersión de su categoría (con 8 o más medidos).
    with cat as (
      select an.tnr,
             avg(an.precision) filter (where an.jugadas >= 15) ap, stddev_pop(an.precision) filter (where an.jugadas >= 15) sp,
             count(*) filter (where an.jugadas >= 15) np,
             avg(100.0 * an.t1 / an.consideradas) filter (where an.consideradas >= 10) at1,
             stddev_pop(100.0 * an.t1 / an.consideradas) filter (where an.consideradas >= 10) st1,
             count(*) filter (where an.consideradas >= 10) nt1,
             avg(100.0 * an.dificiles_ok / an.dificiles) filter (where an.dificiles >= 4) ad,
             stddev_pop(100.0 * an.dificiles_ok / an.dificiles) filter (where an.dificiles >= 4) sdd,
             count(*) filter (where an.dificiles >= 4) nd
        from public.centroamericano_fp_analisis an join public.centroamericano_torneos t on t.tnr = an.tnr
       where coalesce(t.prueba, false) = v_prueba
       group by an.tnr
    ), cuenta as (
      select an.tnr, an.ronda, an.mesa, an.color,
             an.elo > 0 con_elo,
             case when an.jugadas >= 15 then case
               when an.elo > 0 and v_sd > 0 then v_a + v_b * an.elo
               when coalesce(an.elo, 0) <= 0 and c.np >= 8 and c.sp > 0 then c.ap end end ep,
             case when an.jugadas >= 15 then case
               when an.elo > 0 and v_sd > 0 then v_sd
               when coalesce(an.elo, 0) <= 0 and c.np >= 8 and c.sp > 0 then c.sp end end dp,
             case when an.consideradas >= 10 then case
               when an.elo > 0 and t_sd > 0 then t_a + t_b * an.elo
               when coalesce(an.elo, 0) <= 0 and c.nt1 >= 8 and c.st1 > 0 then c.at1 end end et,
             case when an.consideradas >= 10 then case
               when an.elo > 0 and t_sd > 0 then t_sd
               when coalesce(an.elo, 0) <= 0 and c.nt1 >= 8 and c.st1 > 0 then c.st1 end end dt,
             case when an.dificiles >= 4 then case
               when an.elo > 0 and d_sd > 0 then d_a + d_b * an.elo
               when coalesce(an.elo, 0) <= 0 and c.nd >= 8 and c.sdd > 0 then c.ad end end ed,
             case when an.dificiles >= 4 then case
               when an.elo > 0 and d_sd > 0 then d_sd
               when coalesce(an.elo, 0) <= 0 and c.nd >= 8 and c.sdd > 0 then c.sdd end end dd
        from public.centroamericano_fp_analisis an
        join cat c on c.tnr = an.tnr
    )
    update public.centroamericano_fp_analisis an
       set esperada = round(greatest(0, least(100, k.ep)), 2),
           z = round(greatest(-99, least(99, (an.precision - k.ep) / k.dp)), 2),
           esperada_t1 = round(greatest(0, least(100, k.et)), 2),
           z_t1 = round(greatest(-99, least(99, (100.0 * an.t1 / nullif(an.consideradas, 0) - k.et) / k.dt)), 2),
           esperada_dif = round(greatest(0, least(100, k.ed)), 2),
           z_dif = round(greatest(-99, least(99, (100.0 * an.dificiles_ok / nullif(an.dificiles, 0) - k.ed) / k.dd)), 2),
           comparado = case when k.ep is null and k.et is null and k.ed is null then null when k.con_elo then 'elo' else 'categoria' end,
           tiempo_raro = an.dificiles >= 3 and an.seg_resto > 0 and an.seg_dificil < 0.6 * an.seg_resto
      from cuenta k
     where k.tnr = an.tnr and k.ronda = an.ronda and k.mesa = an.mesa and k.color = an.color;
    update public.centroamericano_fp_analisis an
       set senales = (case when an.z >= 2 then 1 else 0 end) + (case when an.z_t1 >= 2 then 1 else 0 end) + (case when an.z_dif >= 2 then 1 else 0 end)
      from public.centroamericano_torneos t
     where t.tnr = an.tnr and coalesce(t.prueba, false) = v_prueba;
    -- El nivel: una señal de 2,5 o más, o dos señales (o una y el tiempo raro), es «muy alta»; una, «a mirar».
    update public.centroamericano_fp_analisis an
       set nivel = case
             when an.jugadas >= 15 and (greatest(coalesce(an.z, -9), coalesce(an.z_t1, -9), coalesce(an.z_dif, -9)) >= 2.5
                                        or an.senales >= 2 or (an.senales >= 1 and coalesce(an.tiempo_raro, false))) then 'alta'
             when an.jugadas >= 15 and an.senales >= 1 then 'a_mirar'
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
