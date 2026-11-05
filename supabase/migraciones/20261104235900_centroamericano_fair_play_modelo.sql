-- Centroamericano 2026, Fair Play, fase 2 del detector: el modelo por jugada al estilo del de Ken Regan (el que usa
-- FIDE), la teoría de la apertura de verdad, el análisis hondo para confirmar, la validación y las partidas de
-- referencia. Ver «El modelo por jugada, al estilo de Regan» en docs/decisiones/juegos-y-torneos.md.
--
-- 1. Cada jugada guarda cuánto peor es cada opción del motor que la mejor (deltas, en puntos de probabilidad de ganar),
--    cuántas jugadas legales había y cuánto perdió lo jugado. Con eso, la Edge Function centroamericano-fair-play
--    (acción «modelo», analisis.ts) calcula para cada posición la probabilidad de cada jugada para alguien de ese nivel
--    y, de ahí, lo esperable y su variación. Un solo número por partida y por jugador: el índice (50 es lo normal y cada
--    5 puntos es una desviación), que decide el nivel de la alerta (62,5 «muy alta», 60 «a mirar»).
-- 2. centroamericano_fp_indice: el índice de cada jugador sumando todas sus partidas del torneo (lo que mira FIDE).
-- 3. centroamericano_fp_modelo: los parámetros ajustados, el centro y el factor de variación de la gente real, y la
--    validación (alarmas falsas y cuánto detectaría si alguien usara el motor en una parte de sus jugadas).
-- 4. centroamericano_fp_referencia: partidas de otros torneos (un PGN con el Elo de cada uno) analizadas con el mismo
--    motor, para ajustar el modelo con más gente que la del torneo. No guarda nombres: solo el Elo y cada jugada.
-- 5. centroamericano_fp_partidas: hasta dónde llegó la teoría (las partidas de maestros de Lichess, por el caché del
--    explorador) y si ya se confirmó con el análisis hondo.
-- Todo se lee solo con la herramienta «mesa-arbitro» (como el resto de Fair Play) y lo escribe la función con la clave
-- de servicio.

alter table public.centroamericano_fp_jugadas
  add column deltas real[],
  add column n_legales smallint,
  add column delta_jugada real;
comment on column public.centroamericano_fp_jugadas.deltas is 'Cuánto peor es cada opción del motor (en su orden) que la mejor, en puntos de probabilidad de ganar (0 a 100) para quien mueve.';

alter table public.centroamericano_fp_partidas
  add column teoria_hasta smallint,
  add column teoria_segura boolean,
  add column profunda boolean not null default false;
comment on column public.centroamericano_fp_partidas.teoria_hasta is 'La primera jugada (0 = la primera de las blancas) que ya no está en las partidas de maestros de Lichess: desde ahí se mide.';
comment on column public.centroamericano_fp_partidas.profunda is 'Ya se volvió a analizar más hondo (profundidad 16) para confirmar una alerta.';

alter table public.centroamericano_fp_analisis
  add column desde_jugada smallint,
  add column m_jugadas integer,
  add column m_t1 integer,
  add column m_e_t1 numeric(7, 2),
  add column m_dj numeric(8, 1),
  add column m_e_dj numeric(8, 1),
  add column m_z_t1 numeric(5, 2),
  add column m_z_dj numeric(5, 2),
  add column m_z_dif numeric(5, 2),
  add column z_modelo numeric(5, 2),
  add column roi numeric(5, 1),
  add column profunda boolean;
comment on column public.centroamericano_fp_analisis.roi is 'El índice del modelo por jugada en esta partida (escala de Regan: 50 es lo normal, cada 5 puntos una desviación).';
comment on column public.centroamericano_fp_analisis.m_e_t1 is 'Cuántas veces jugaría la primera del motor alguien de su nivel, según lo difícil de cada posición.';

create table public.centroamericano_fp_indice (
  tnr text not null references public.centroamericano_torneos(tnr),
  clave text not null check (length(clave) <= 120),
  jugador text not null default '' check (length(jugador) <= 120),
  elo integer,
  comparado text check (comparado in ('elo', 'categoria')),
  partidas integer not null,
  jugadas integer not null,
  t1 integer not null,
  e_t1 numeric(7, 2) not null,
  dj numeric(9, 1) not null,
  e_dj numeric(9, 1) not null,
  dificiles integer not null default 0,
  t1_dif integer not null default 0,
  e_t1_dif numeric(7, 2) not null default 0,
  z_t1 numeric(5, 2),
  z_dj numeric(5, 2),
  z_dif numeric(5, 2),
  z numeric(5, 2),
  roi numeric(5, 1),
  rondas text not null default '' check (length(rondas) <= 60),
  actualizado timestamptz not null default now(),
  primary key (tnr, clave)
);
comment on table public.centroamericano_fp_indice is 'Fair Play: el índice del modelo por jugada de cada jugador, sumando todas sus partidas medidas del torneo (escala de Regan: 50 lo normal). Lo escribe la Edge Function centroamericano-fair-play (centroamericano_fp_modelo_guardar).';
alter table public.centroamericano_fp_indice enable row level security;
revoke all on public.centroamericano_fp_indice from public, anon, authenticated;
grant select on public.centroamericano_fp_indice to authenticated;
create policy centroamericano_fp_indice_ver on public.centroamericano_fp_indice
  for select to authenticated using ((select public.tengo_herramienta('mesa-arbitro')));

create table public.centroamericano_fp_modelo (
  id text primary key check (id = 'actual'),
  a numeric, b numeric, c numeric,
  centro numeric(5, 2) not null default 0,
  factor numeric(5, 2) not null default 1,
  movimientos integer not null default 0,
  jugadores integer not null default 0,
  referencia integer not null default 0,
  validacion jsonb,
  ajustado timestamptz,
  calculado timestamptz not null default now()
);
comment on table public.centroamericano_fp_modelo is 'Fair Play: los parámetros del modelo por jugada (s = exp(a + b·(Elo − 1500)/400), c), dónde queda la mitad de la gente y cuánto más varía que el modelo, y la validación. Una sola fila.';
alter table public.centroamericano_fp_modelo enable row level security;
revoke all on public.centroamericano_fp_modelo from public, anon, authenticated;
grant select on public.centroamericano_fp_modelo to authenticated;
create policy centroamericano_fp_modelo_ver on public.centroamericano_fp_modelo
  for select to authenticated using ((select public.tengo_herramienta('mesa-arbitro')));

create table public.centroamericano_fp_referencia (
  evento text not null check (length(btrim(evento)) between 1 and 80),
  partida text not null check (length(partida) between 1 and 80),
  ply integer not null check (ply between 0 and 999),
  color text not null check (color in ('blancas', 'negras')),
  elo integer not null check (elo between 100 and 3500),
  deltas real[] not null,
  n_legales smallint not null,
  rango smallint not null check (rango between 0 and 9),
  delta_jugada real not null,
  dificil boolean not null default false,
  cargado timestamptz not null default now(),
  cargado_por text check (length(cargado_por) <= 120),
  primary key (evento, partida, ply)
);
comment on table public.centroamericano_fp_referencia is 'Fair Play: jugadas de partidas de otros torneos (un PGN con el Elo de cada uno), analizadas con el mismo motor, para ajustar el modelo por jugada con más gente. Sin nombres: solo el Elo y cada jugada.';
alter table public.centroamericano_fp_referencia enable row level security;
revoke all on public.centroamericano_fp_referencia from public, anon, authenticated;
grant select on public.centroamericano_fp_referencia to authenticated;
create policy centroamericano_fp_referencia_ver on public.centroamericano_fp_referencia
  for select to authenticated using ((select public.tengo_herramienta('mesa-arbitro')));

-- Lo que calcula la función con el modelo: el índice de cada partida, el de cada jugador (se reemplaza entero, torneo por
-- torneo) y los parámetros con su validación. Después se vuelve a calibrar (el nivel sale del índice). Solo la clave de
-- servicio (la Edge Function).
create function public.centroamericano_fp_modelo_guardar(p_juegos jsonb, p_indice jsonb, p_modelo jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if not interno.fp_puede() then raise exception 'Sin permiso para Fair Play' using errcode = '42501'; end if;
  update public.centroamericano_fp_analisis an
     set m_jugadas = x.m_jugadas, m_t1 = x.m_t1, m_e_t1 = x.m_e_t1, m_dj = x.m_dj, m_e_dj = x.m_e_dj,
         m_z_t1 = x.m_z_t1, m_z_dj = x.m_z_dj, m_z_dif = x.m_z_dif, z_modelo = x.z_modelo, roi = x.roi
    from jsonb_to_recordset(coalesce(p_juegos, '[]'::jsonb)) as x(tnr text, ronda integer, mesa integer, color text, m_jugadas integer, m_t1 integer,
         m_e_t1 numeric, m_dj numeric, m_e_dj numeric, m_z_t1 numeric, m_z_dj numeric, m_z_dif numeric, z_modelo numeric, roi numeric)
   where an.tnr = x.tnr and an.ronda = x.ronda and an.mesa = x.mesa and an.color = x.color;
  get diagnostics v_n = row_count;
  delete from public.centroamericano_fp_indice i
   where i.tnr in (select distinct x.tnr from jsonb_to_recordset(coalesce(p_indice, '[]'::jsonb)) as x(tnr text));
  insert into public.centroamericano_fp_indice (tnr, clave, jugador, elo, comparado, partidas, jugadas, t1, e_t1, dj, e_dj, dificiles, t1_dif, e_t1_dif,
                                                z_t1, z_dj, z_dif, z, roi, rondas)
  select x.tnr, left(x.clave, 120), left(coalesce(x.jugador, ''), 120), x.elo, x.comparado, x.partidas, x.jugadas, x.t1, x.e_t1, x.dj, x.e_dj,
         coalesce(x.dificiles, 0), coalesce(x.t1_dif, 0), coalesce(x.e_t1_dif, 0), x.z_t1, x.z_dj, x.z_dif, x.z, x.roi, left(coalesce(x.rondas, ''), 60)
    from jsonb_to_recordset(coalesce(p_indice, '[]'::jsonb)) as x(tnr text, clave text, jugador text, elo integer, comparado text, partidas integer,
         jugadas integer, t1 integer, e_t1 numeric, dj numeric, e_dj numeric, dificiles integer, t1_dif integer, e_t1_dif numeric, z_t1 numeric,
         z_dj numeric, z_dif numeric, z numeric, roi numeric, rondas text);
  if p_modelo is not null then
    insert into public.centroamericano_fp_modelo (id, a, b, c, centro, factor, movimientos, jugadores, referencia, validacion, ajustado, calculado)
    values ('actual', (p_modelo->>'a')::numeric, (p_modelo->>'b')::numeric, (p_modelo->>'c')::numeric,
            coalesce((p_modelo->>'centro')::numeric, 0), coalesce((p_modelo->>'factor')::numeric, 1),
            coalesce((p_modelo->>'movimientos')::integer, 0), coalesce((p_modelo->>'jugadores')::integer, 0),
            coalesce((p_modelo->>'referencia')::integer, 0), p_modelo->'validacion', (p_modelo->>'ajustado')::timestamptz, now())
    on conflict (id) do update set a = excluded.a, b = excluded.b, c = excluded.c, centro = excluded.centro, factor = excluded.factor,
      movimientos = excluded.movimientos, jugadores = excluded.jugadores, referencia = excluded.referencia, validacion = excluded.validacion,
      ajustado = excluded.ajustado, calculado = excluded.calculado;
  end if;
  perform public.centroamericano_fp_calibrar();
  return v_n;
end;
$$;
revoke execute on function public.centroamericano_fp_modelo_guardar(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.centroamericano_fp_modelo_guardar(jsonb, jsonb, jsonb) to service_role;

-- La calibración: igual que antes, salvo que con el índice del modelo decide el índice.
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
       set esperada = case when k.ep is not null then round(greatest(0, least(100, k.ep)), 2) end,
           z = case when k.ep is not null then round(greatest(-99, least(99, (an.precision - k.ep) / k.dp)), 2) end,
           esperada_t1 = case when k.et is not null then round(greatest(0, least(100, k.et)), 2) end,
           z_t1 = case when k.et is not null then round(greatest(-99, least(99, (100.0 * an.t1 / nullif(an.consideradas, 0) - k.et) / k.dt)), 2) end,
           esperada_dif = case when k.ed is not null then round(greatest(0, least(100, k.ed)), 2) end,
           z_dif = case when k.ed is not null then round(greatest(-99, least(99, (100.0 * an.dificiles_ok / nullif(an.dificiles, 0) - k.ed) / k.dd)), 2) end,
           comparado = case when k.ep is null and k.et is null and k.ed is null then null when k.con_elo then 'elo' else 'categoria' end,
           tiempo_raro = an.dificiles >= 3 and an.seg_resto > 0 and an.seg_dificil < 0.6 * an.seg_resto
      from cuenta k
     where k.tnr = an.tnr and k.ronda = an.ronda and k.mesa = an.mesa and k.color = an.color;
    update public.centroamericano_fp_analisis an
       set senales = (case when an.z >= 2 then 1 else 0 end) + (case when an.z_t1 >= 2 then 1 else 0 end) + (case when an.z_dif >= 2 then 1 else 0 end)
      from public.centroamericano_torneos t
     where t.tnr = an.tnr and coalesce(t.prueba, false) = v_prueba;
    -- El nivel: con el índice del modelo, el índice; sin él (antes de ajustarlo), una señal de 2,5 o más, o dos
    -- señales (o una y el tiempo raro), es «muy alta»; una, «a mirar».
    update public.centroamericano_fp_analisis an
       set nivel = case
             -- Con el modelo por jugada, decide el índice (un solo número): 62,5 o más (2,5 desviaciones) es «muy alta»;
             -- 60 o más, «a mirar». Las demás señales quedan para explicarlo.
             when an.jugadas >= 15 and an.roi is not null then case when an.roi >= 62.5 then 'alta' when an.roi >= 60 then 'a_mirar' else 'normal' end
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
