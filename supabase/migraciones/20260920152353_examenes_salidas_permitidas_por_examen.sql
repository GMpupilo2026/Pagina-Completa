-- Cuántas veces puede salirse de la pantalla antes de perder el examen lo
-- decide el profesor, examen por examen. Hasta ahora eran tres, escritas como
-- una constante DENTRO de registrar_salida_examen(): el mismo tope para un
-- quiz de práctica y para una prueba de fin de curso.
--
-- La columna guarda cuántas salidas se PERDONAN, no el tope al que congela.
-- Es lo que el profesor está decidiendo ("le permito dos") y lo que la
-- pantalla le dice al alumno ("te quedan dos"). El 2 de por omisión es el
-- comportamiento de siempre: perdona la primera y la segunda, y a la tercera
-- se congela.
--
-- NULL quiere decir "no congelar nunca": las salidas se siguen contando y van
-- igual en el informe, pero el examen no se cierra solo. Sirve para un examen
-- en el aula, con el profesor al lado, donde cerrarle la pantalla a un chico
-- porque le entró una notificación es peor que anotarlo.
alter table public.examenes
  add column if not exists salidas_permitidas integer not null default 2;

alter table public.examenes
  alter column salidas_permitidas drop not null;

alter table public.examenes
  drop constraint if exists examenes_salidas_permitidas_check;
alter table public.examenes
  add constraint examenes_salidas_permitidas_check
  check (salidas_permitidas is null or (salidas_permitidas >= 0 and salidas_permitidas <= 20));

comment on column public.examenes.salidas_permitidas is
  'Cuántas salidas de pantalla se perdonan antes de congelar. NULL = no congela nunca (se cuentan igual).';