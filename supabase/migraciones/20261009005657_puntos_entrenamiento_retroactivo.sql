-- Puntos Ajedrez: puntos retroactivos de entrenamiento para quien ya resolvía
-- ejercicios antes de que existiera el ledger. otorgar_puntos_de_entrenamiento
-- (20261008054002_puntos_acumulados.sql) solo paga ejercicios NUEVOS: se
-- dispara con el trigger "after insert" de training_progress, así que nunca
-- vio los renglones que ya estaban ahí cuando se creó. Esto paga esos, una
-- sola vez (a diferencia de las tareas viejas, que a propósito se dejaron
-- sin pagar: ver «Qué fuentes de puntos se decidió cubrir» en
-- docs/decisiones/puntos-y-premios.md; aquí el dueño del sitio pidió lo
-- contrario para entrenamiento).
--
-- Mismo tope de 40 por día de Costa Rica que la regla en vivo, calculado
-- día por día con la fecha de CADA ejercicio (no con hoy): sin el tope, una
-- sola ráfaga vieja de cientos de ejercicios en un día (hay alumnos con más
-- de 300, hasta 395) pagaría de un golpe muchas veces lo que cualquier día
-- de verdad puede dar. Se inserta directo en puntos_ajustes (no con
-- interno.otorgar_puntos()) y con el created_at del ejercicio, no el de
-- hoy: así no pasa por el multiplicador de «puntos dobles» vigente HOY (que
-- no existía cuando se jugaron estos ejercicios) y no se suma al tope de
-- ejercicios que alguien juegue hoy mismo. El índice único
-- (student_id, origen, referencia) hace que volver a correr esto no pague
-- dos veces, con la misma referencia 'entrenamiento:<id>' que usa el trigger
-- para los ejercicios nuevos.
do $$
declare
  r record;
  v_dia date;
  v_ganado_hoy integer;
  v_premio constant integer := 2;
  v_tope constant integer := 40;
begin
  for r in
    select tp.id, tp.student_id, tp.created_at
      from public.training_progress tp
     where not exists (
             select 1 from public.puntos_ajustes pa
              where pa.student_id = tp.student_id
                and pa.origen = 'entrenamiento'
                and pa.referencia = 'entrenamiento:' || tp.id::text)
     order by tp.student_id, tp.created_at, tp.id
  loop
    v_dia := (r.created_at at time zone 'America/Costa_Rica')::date;
    select coalesce(sum(cantidad), 0) into v_ganado_hoy
      from public.puntos_ajustes
     where student_id = r.student_id
       and origen = 'entrenamiento'
       and (created_at at time zone 'America/Costa_Rica')::date = v_dia;
    if v_ganado_hoy < v_tope then
      insert into public.puntos_ajustes (student_id, cantidad, origen, motivo, referencia, created_at)
      values (
        r.student_id, least(v_premio, v_tope - v_ganado_hoy), 'entrenamiento',
        'Ejercicio de entrenamiento (puntos retroactivos, de antes de Puntos Ajedrez)',
        'entrenamiento:' || r.id::text, r.created_at)
      on conflict (student_id, origen, referencia) where referencia is not null do nothing;
    end if;
  end loop;
end;
$$;
