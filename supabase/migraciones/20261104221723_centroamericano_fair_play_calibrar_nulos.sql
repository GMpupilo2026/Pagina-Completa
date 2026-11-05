-- Centroamericano 2026, Fair Play: arreglo de la calibración de la fase 1 (20261104220853). Ver «El detector de Fair Play,
-- jugada por jugada» en docs/decisiones/juegos-y-torneos.md.
--
-- En Postgres, greatest() y least() SALTAN los nulos: least(99, null) es 99, no null. Sin con qué comparar (una
-- categoría con menos de 8 medidos, o sin Elo y sin categoría), la señal quedaba en 99 desviaciones y el jugador en
-- «muy alta», y lo esperable en 100 %. Pasó de verdad con las primeras partidas analizadas desde LiveChess (todas
-- «muy alta» con z_t1 = 99). Ahora, sin comparación, la señal queda vacía (null) y no cuenta. Lo demás, igual.

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

-- Y se vuelve a calibrar ya, para que las alertas falsas se apaguen sin esperar la próxima partida (con el permiso de
-- la clave de servicio, que es el que usa la Edge Function; solo dentro de esta migración).
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.centroamericano_fp_calibrar();
