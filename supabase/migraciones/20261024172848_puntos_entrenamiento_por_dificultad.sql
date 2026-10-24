-- Puntos Ajedrez: el entrenamiento paga según la dificultad, sin tope por
-- día, y un ejercicio ya resuelto no vuelve a pagar.
--
-- Antes (20261008054002_puntos_acumulados.sql): 2 puntos por CADA fila de
-- training_progress, fuera lo que fuera, con un tope de 40 por día de Costa
-- Rica. El tope era lo único que frenaba repetir un ejercicio fácil en bucle;
-- el dueño del sitio pidió quitarlo y que el freno sea otro: lo ya hecho no
-- paga, y lo difícil paga más que lo sencillo.
--
-- 1. interno.entrenamiento_clave(): QUÉ ejercicio es. La actividad y el id del
--    ejercicio que trae el detail (puzzle_id, lesson_id, linea_id, final_id,
--    nivel_id, set_id; el curso y la lección; el curso y el diagrama de
--    finales100; juego, nivel y ejercicio de concentración). Los juegos que
--    no tienen ejercicios con id (coordenadas, confites, memoria, sonar,
--    batalla naval, el diagnóstico, precisión posicional) se repiten por
--    naturaleza: ahí «el mismo ejercicio» es la misma variante EL MISMO DÍA
--    de Costa Rica (nivel, modo o cantidad de piezas), así que pagan una vez
--    por día y variante. Sin eso, quitar el tope dejaba una partida de
--    Confites en bucle como fuente infinita de puntos.
-- 2. interno.entrenamiento_premio(): CUÁNTO paga, de 1 a 6, según la
--    dificultad que ya trae cada actividad: el nivel del 4×4 (Fácil 1 …
--    Gran Maestro 6), el rating de Lichess en Temas, mate en 1/2/3, el nivel
--    de Tipos, Concentración, Sonar y Batalla naval, las piezas de Memoria.
--    Lo que no trae dificultad paga 2, lo mismo que antes; lo de aprender a
--    jugar, 1.
-- 3. Un intento fallido (finales100 con ok = false, Batalla naval con
--    gano = false) no paga ni cuenta como «ya hecho»: se puede volver a
--    intentar y cobrarlo al lograrlo.
-- 4. «Ya hecho» se mira en TODO training_progress, también lo de antes de
--    este cambio: un ejercicio resuelto hace un mes, que en su día pagó 2 (o
--    nada, por el tope viejo), no vuelve a pagar. Para que mirarlo no recorra
--    las miles de filas de un alumno, va un índice sobre la clave.
-- 5. La referencia del ledger pasa de 'entrenamiento:<id de la fila>' a
--    'entrenamiento:<clave>': el índice único de puntos_ajustes impide pagar
--    dos veces el mismo ejercicio aunque dos filas lleguen a la vez. Las
--    referencias viejas (con el id de la fila, un uuid) no chocan con las
--    nuevas (empiezan por la actividad). Lo ya pagado no se toca.

create or replace function interno.entrenamiento_clave(p_activity text, p_detail jsonb, p_creado timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select p_activity || ':' || coalesce(
    case p_activity
      when 'curso' then nullif(concat_ws(':', p_detail->>'curso', p_detail->>'leccion'), '')
      when 'finales100' then nullif(concat_ws(':', p_detail->>'curso', p_detail->>'diagrama'), '')
      when 'concentracion' then nullif(concat_ws(':', p_detail->>'juego', p_detail->>'nivel', p_detail->>'ejercicio'), '')
      else coalesce(p_detail->>'puzzle_id', p_detail->>'lesson_id', p_detail->>'linea_id',
                    p_detail->>'final_id', p_detail->>'nivel_id', p_detail->>'set_id')
    end,
    'dia:' || ((p_creado at time zone 'America/Costa_Rica')::date)::text || ':' ||
      concat_ws(':', p_detail->>'nivel', p_detail->>'mode', p_detail->>'orientation',
                p_detail->>'piezas', p_detail->>'modo', p_detail->>'duelo')
  );
$$;

create or replace function interno.entrenamiento_logrado(p_detail jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_detail->>'ok', '') <> 'false' and coalesce(p_detail->>'gano', '') <> 'false';
$$;

create or replace function interno.entrenamiento_premio(p_activity text, p_detail jsonb)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_num numeric;
begin
  case p_activity
    when '4x4' then
      return case p_detail->>'category'
        when 'FACIL' then 1 when 'INTERMEDIO' then 2 when 'AVANZADO' then 3
        when 'ESPECIALISTA' then 4 when 'MAESTRO' then 5 when 'GRANMAESTRO' then 6
        else 2 end;
    when 'mates' then
      return case p_detail->>'category'
        when 'mate1' then 1 when 'mate2' then 3 when 'mate3' then 5 else 2 end;
    when 'temas' then
      v_num := case when p_detail->>'rating' ~ '^\d{1,4}(\.\d+)?$' then (p_detail->>'rating')::numeric end;
      return case when v_num is null then 2
        when v_num < 1000 then 1 when v_num < 1300 then 2 when v_num < 1600 then 3
        when v_num < 1900 then 4 when v_num < 2200 then 5 else 6 end;
    when 'tipos', 'concentracion', 'sonar', 'batalla-naval' then
      v_num := case when p_detail->>'nivel' ~ '^\d{1,2}$' then (p_detail->>'nivel')::numeric end;
      return coalesce(least(greatest(v_num, 1), 5)::integer, 2);
    when 'memoria' then
      v_num := case when p_detail->>'piezas' ~ '^\d{1,2}$' then (p_detail->>'piezas')::numeric end;
      return case when v_num is null then 2
        when v_num <= 4 then 1 when v_num <= 6 then 2 when v_num <= 8 then 3 else 4 end;
    when 'finales100' then
      return case when p_detail->>'nivel' = 'max' then 5 else 3 end;
    when 'finales', 'curso' then
      return 3;
    when 'diagnostico' then
      return 5;
    when 'aprender', 'ilumina', 'coordenadas', 'confites' then
      return 1;
    else
      return 2;
  end case;
end;
$$;

-- Las usa el índice de abajo: el alumno que inserta su fila las ejecuta.
-- Son cálculos puros sobre lo que le pasan, no leen ninguna tabla.
grant execute on function interno.entrenamiento_clave(text, jsonb, timestamptz) to authenticated;
grant execute on function interno.entrenamiento_logrado(jsonb) to authenticated;
revoke execute on function interno.entrenamiento_premio(text, jsonb) from public, anon;

create index if not exists training_progress_clave_puntos
  on public.training_progress (student_id, interno.entrenamiento_clave(activity, detail, created_at));

create or replace function interno.otorgar_puntos_de_entrenamiento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clave text;
begin
  if not interno.entrenamiento_logrado(new.detail) then
    return new;
  end if;
  v_clave := interno.entrenamiento_clave(new.activity, new.detail, new.created_at);
  if exists (
    select 1 from public.training_progress tp
     where tp.student_id = new.student_id
       and interno.entrenamiento_clave(tp.activity, tp.detail, tp.created_at) = v_clave
       and tp.id <> new.id
       and interno.entrenamiento_logrado(tp.detail)
  ) then
    return new;
  end if;
  perform interno.otorgar_puntos(new.student_id, interno.entrenamiento_premio(new.activity, new.detail),
    'entrenamiento', 'Ejercicio nuevo de entrenamiento', 'entrenamiento:' || v_clave);
  return new;
end;
$$;
revoke execute on function interno.otorgar_puntos_de_entrenamiento() from public, anon, authenticated;
