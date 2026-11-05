-- Fair Play, más allá del modelo de Regan. Ver «Más allá de Regan: más opciones, las trampas de la mirada corta, el
-- contexto, la vara según el torneo, todas las señales en una cuenta y cuánto acierta de verdad» en
-- docs/decisiones/juegos-y-torneos.md.
--
-- 1. Más opciones del motor por posición (10 en la pantalla; hasta 20 en las referencias que se analizan en una
--    computadora con herramientas/fair-play-calibrar.js): el rango de lo jugado va hasta 20.
-- 2. centroamericano_fp_jugadas y centroamericano_fp_referencia guardan, por jugada, lo que le quedaba en el reloj, lo
--    que parecía mejor a primera vista (dónde quedó entre las del motor: sup_rango, 0 si ninguna) y si fue lo que jugó
--    (cayo), y las referencias además la evaluación de antes (el contexto) y, en las de prueba, en qué proporción se usó
--    el motor (trampa_pct).
-- 3. centroamericano_fp_indice: las trampas (cuántas, en cuántas cayó, cuántas se esperaba y cuántas desviaciones), la
--    vara para el tamaño del torneo (umbral_z) y el índice con todas las señales (z_combinada, roi_combinado);
--    centroamericano_fp_modelo_guardar los escribe.

alter table public.centroamericano_fp_jugadas drop constraint if exists centroamericano_fp_jugadas_rango_check;
alter table public.centroamericano_fp_jugadas
  add constraint centroamericano_fp_jugadas_rango_check check (rango between 0 and 20),
  add column reloj integer check (reloj is null or reloj >= 0),
  add column sup_rango smallint check (sup_rango is null or sup_rango between 0 and 20),
  add column cayo boolean;
comment on column public.centroamericano_fp_jugadas.sup_rango is 'La jugada que parecía mejor a poca profundidad: en qué lugar quedó entre las del motor (1, la mejor de verdad: no hay trampa; 0, ninguna de las listadas). Para las trampas de la mirada corta.';
comment on column public.centroamericano_fp_jugadas.cayo is 'Si jugó la que parecía mejor a poca profundidad.';
comment on column public.centroamericano_fp_jugadas.reloj is 'Lo que le quedaba en el reloj después de la jugada, en segundos (de LiveChess). Para el contexto del modelo.';

alter table public.centroamericano_fp_referencia drop constraint if exists centroamericano_fp_referencia_rango_check;
alter table public.centroamericano_fp_referencia
  add constraint centroamericano_fp_referencia_rango_check check (rango between 0 and 20),
  add column antes integer,
  add column reloj integer check (reloj is null or reloj >= 0),
  add column sup_rango smallint check (sup_rango is null or sup_rango between 0 and 20),
  add column cayo boolean,
  add column trampa_pct smallint check (trampa_pct is null or trampa_pct between 1 and 100);
comment on column public.centroamericano_fp_referencia.trampa_pct is 'En una partida de prueba, en qué proporción de las jugadas usó el motor el que hizo trampa ([TrampaPorcentaje "30"]): para medir cuánto detecta el índice en cada proporción.';

alter table public.centroamericano_fp_indice
  add column trampas_n integer,
  add column trampas_cayo integer,
  add column trampas_e numeric(7, 2),
  add column trampas_z numeric(5, 2),
  add column umbral_z numeric(4, 2),
  add column z_combinada numeric(5, 2),
  add column roi_combinado numeric(5, 1);
comment on column public.centroamericano_fp_indice.trampas_z is 'Las trampas de la mirada corta: cuántas desviaciones por encima de lo esperable para su nivel las esquivó (positivo: las esquiva como el motor).';
comment on column public.centroamericano_fp_indice.umbral_z is 'La vara de su ritmo para el tamaño del torneo: lo que por azar pasaría uno de cada 20 torneos con tantos jugadores (Bonferroni al 5 %).';
comment on column public.centroamericano_fp_indice.z_combinada is 'El índice con todas las señales (el del modelo, el tiempo, el contraste de las rachas y las trampas), divididas por su correlación medida en el torneo. El índice de siempre (z, roi) no cambia.';

create or replace function public.centroamericano_fp_modelo_guardar(p_juegos jsonb, p_indice jsonb, p_modelo jsonb)
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
                                                z_t1, z_dj, z_dif, z, roi, rondas, ritmo, elo_usado, rendimiento, rendimiento_partidas,
                                                hist_partidas, hist_roi, tiempo_rho, tiempo_z, tiempo_jugadas, elo_tendencia, tendencia_mes,
                                                racha_largo, racha_log10, crit_z, facil_z, contraste_z, trampas_n, trampas_cayo, trampas_e, trampas_z,
                                                umbral_z, z_combinada, roi_combinado)
  select x.tnr, left(x.clave, 120), left(coalesce(x.jugador, ''), 120), x.elo, x.comparado, x.partidas, x.jugadas, x.t1, x.e_t1, x.dj, x.e_dj,
         coalesce(x.dificiles, 0), coalesce(x.t1_dif, 0), coalesce(x.e_t1_dif, 0), x.z_t1, x.z_dj, x.z_dif, x.z, x.roi, left(coalesce(x.rondas, ''), 60),
         case when x.ritmo in ('clasico', 'rapido') then x.ritmo end, x.elo_usado, x.rendimiento, x.rendimiento_partidas,
         x.hist_partidas, x.hist_roi, x.tiempo_rho, x.tiempo_z, x.tiempo_jugadas, x.elo_tendencia, x.tendencia_mes,
         x.racha_largo, x.racha_log10, x.crit_z, x.facil_z, x.contraste_z, x.trampas_n, x.trampas_cayo, x.trampas_e, x.trampas_z,
         x.umbral_z, x.z_combinada, x.roi_combinado
    from jsonb_to_recordset(coalesce(p_indice, '[]'::jsonb)) as x(tnr text, clave text, jugador text, elo integer, comparado text, partidas integer,
         jugadas integer, t1 integer, e_t1 numeric, dj numeric, e_dj numeric, dificiles integer, t1_dif integer, e_t1_dif numeric, z_t1 numeric,
         z_dj numeric, z_dif numeric, z numeric, roi numeric, rondas text, ritmo text, elo_usado integer, rendimiento integer,
         rendimiento_partidas integer, hist_partidas integer, hist_roi numeric, tiempo_rho numeric, tiempo_z numeric, tiempo_jugadas integer,
         elo_tendencia integer, tendencia_mes numeric, racha_largo integer, racha_log10 numeric, crit_z numeric, facil_z numeric, contraste_z numeric,
         trampas_n integer, trampas_cayo integer, trampas_e numeric, trampas_z numeric, umbral_z numeric, z_combinada numeric, roi_combinado numeric);
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
