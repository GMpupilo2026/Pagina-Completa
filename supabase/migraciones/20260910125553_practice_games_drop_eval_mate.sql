-- Un solo número basta para la barra de evaluación: eval_cp guarda el valor ya "doblado"
-- a la perspectiva de las blancas (igual que scoreToWhiteCp() en sesion.html), con los
-- mates codificados como un valor de magnitud grande (±100000ish) en vez de una columna
-- aparte — así no hay que reconstruir "cp vs. mate" al leerlo de vuelta.
alter table public.practice_games drop column if exists eval_mate;
comment on column public.practice_games.eval_cp is
  'Evaluación en centipeones desde la perspectiva de las blancas, ya "doblada" para mates (ver scoreToWhiteCp en sesion.html). NULL si aún no se calculó.';
