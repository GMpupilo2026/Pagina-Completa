-- Centroamericano 2026, Fair Play: las partidas de los tableros electrónicos salen directo de LiveChess (sin atraso),
-- no de la transmisión de Lichess. Ver «Las partidas para Fair Play, directo de LiveChess» en
-- docs/decisiones/juegos-y-torneos.md.
--
-- LiveChess da las jugadas al instante, pero NO la evaluación del motor (la ponía Lichess). La pone ahora Stockfish en
-- la computadora de quien tiene abierta la pantalla de Fair Play (el encargado o el principal): la Edge Function
-- centroamericano-fair-play le da las partidas terminadas que faltan («vivo_pendientes», con las posiciones ya
-- armadas con chess.js), la pantalla las evalúa y devuelve la evaluación de cada posición («vivo_guardar»); la función
-- vuelve a leer la partida de LiveChess, comprueba que la evaluación sea de esa partida y calcula la precisión con la
-- MISMA fórmula de siempre (analisis.ts). Así una partida no se analiza dos veces ni a la vez en dos pantallas:
--   - centroamericano_fp_partidas.analizada_en: cuándo quedó analizada desde LiveChess (no se vuelve a dar);
--   - centroamericano_fp_partidas.en_analisis: cuándo se le dio a una pantalla (otra no la recibe en 3 minutos).
-- centroamericano_fp_analisis.fuente dice de dónde salió cada medición: las de las rondas 1 a 3 venían de Lichess y
-- se vuelven a medir desde LiveChess (la misma fila: lo que decidió el encargado no se pisa), para que la calibración
-- compare a todos con el mismo motor.

alter table public.centroamericano_fp_partidas
  add column analizada_en timestamptz,
  add column en_analisis timestamptz;
comment on column public.centroamericano_fp_partidas.analizada_en is
  'Cuándo se analizó esta partida con las jugadas de LiveChess y Stockfish (la Edge Function centroamericano-fair-play, acción vivo_guardar). Con fecha, no se vuelve a dar.';
comment on column public.centroamericano_fp_partidas.en_analisis is
  'Cuándo se le dio esta partida a una pantalla de Fair Play para analizarla: otra pantalla no la recibe en 3 minutos.';

alter table public.centroamericano_fp_analisis
  add column fuente text not null default 'lichess' check (fuente in ('lichess', 'livechess'));
comment on column public.centroamericano_fp_analisis.fuente is
  'De dónde salieron las jugadas y la evaluación: lichess (la transmisión, con la evaluación de Lichess; las primeras rondas) o livechess (los tableros directo, sin atraso, evaluados con Stockfish en la pantalla de Fair Play).';
