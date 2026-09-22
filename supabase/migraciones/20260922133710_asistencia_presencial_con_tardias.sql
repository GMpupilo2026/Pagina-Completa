-- Las tardías: llegar tarde no es faltar, y tampoco es llegar.
--
-- La ficha solo sabía decir «vino» o «no vino», así que a quien entró media
-- hora después se le marcaba presente y quedaba con la clase entera de
-- «tiempo en clase». Eso no da ningún error: el informe que llega a su casa
-- dice 60 minutos donde hubo 30, y la tardanza —que es justo lo que una
-- familia quiere saber— no queda registrada en ninguna parte.
--
-- Se guarda en MINUTOS y no como una marca de «llegó tarde», por dos razones
-- que son la misma: los minutos dicen si fueron cinco o cuarenta, y son lo
-- único con lo que se puede corregir el tramo de presencia. Una marca sola
-- dejaría el tiempo mintiendo igual.

alter table public.class_attendance
  add column if not exists minutos_tarde int not null default 0;

alter table public.class_attendance drop constraint if exists class_attendance_minutos_tarde_valido;
alter table public.class_attendance add constraint class_attendance_minutos_tarde_valido
  check (minutos_tarde >= 0 and minutos_tarde <= 600);

comment on column public.class_attendance.minutos_tarde is
  'Cuántos minutos después del inicio llegó. 0 es a tiempo. Solo lo escribe '
  'guardar_clase_presencial(): en una clase en vivo la asistencia la marca el '
  'alumno al conectarse y su joined_at ya es la hora real.';

-- `joined_at` ya significaba «cuándo se unió», así que la tardanza no
-- necesita una segunda columna de hora: es la misma desplazada. Y el tramo de
-- presencia arranca ahí, así que los minutos que cuentan Informes, el informe
-- a la casa y el reporte salen bien SIN tocar ninguna de las tres funciones.
create or replace function public.guardar_clase_presencial(
  p_titulo  text,
  p_inicio  timestamptz,
  p_minutos int,
  p_notas   text,
  p_alumnos uuid[],
  p_id      uuid default null,
  p_tarde   jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_id    uuid;
  v_fin   timestamptz;
  v_lista uuid[] := coalesce(p_alumnos, '{}'::uuid[]);
  v_tarde jsonb  := coalesce(p_tarde, '{}'::jsonb);
  v_clave text;
  v_min   int;
begin
  if p_inicio is null then
    raise exception 'Falta la fecha y la hora de la clase.';
  end if;
  -- El tope de arriba no es una regla de negocio, es un error de dedo: una
  -- clase de 6000 minutos le metería cuatro días de «tiempo en clase» a cada
  -- asistente, y eso se ve perfecto en el informe que llega a su casa.
  if p_minutos is null or p_minutos < 5 or p_minutos > 600 then
    raise exception 'La clase tiene que durar entre 5 y 600 minutos.';
  end if;
  -- Una ficha de asistencia se llena DESPUÉS de la clase. El día de margen es
  -- para el huso horario, no para agendar: una clase de la semana que viene con
  -- asistentes marcados es gente que todavía no fue.
  if p_inicio > now() + interval '1 day' then
    raise exception 'Esa clase todavía no ha pasado: la ficha se llena después de darla.';
  end if;

  -- Las tardanzas se validan ANTES de escribir nada, y una que no cuadre se
  -- RECHAZA en vez de ignorarse: llegan de la pantalla, así que una tardanza
  -- de alguien que no está marcado o más larga que la clase es un error de
  -- programación, y descartarla en silencio lo dejaría escondido hasta que
  -- alguien mirara el informe.
  for v_clave, v_min in select key, value::int from jsonb_each_text(v_tarde) loop
    if not (v_clave::uuid = any (v_lista)) then
      raise exception 'Hay una tardanza de alguien que no está marcado como presente.';
    end if;
    if v_min < 0 or v_min >= p_minutos then
      raise exception 'Llegar % minutos tarde a una clase de % no es llegar.', v_min, p_minutos;
    end if;
  end loop;

  v_fin := p_inicio + make_interval(mins => p_minutos);

  if p_id is null then
    insert into public.class_sessions (title, started_at, ended_at, notes, created_by, modalidad)
    values (nullif(btrim(coalesce(p_titulo, '')), ''), p_inicio, v_fin,
            nullif(btrim(coalesce(p_notas, '')), ''), auth.uid(), 'presencial')
    returning id into v_id;
  else
    -- El `modalidad = 'presencial'` del where no es de adorno: sin él, esta
    -- función editaría también una clase EN VIVO —le movería las horas y le
    -- borraría el título— desde una pantalla que no sabe nada de ella.
    update public.class_sessions
       set title      = nullif(btrim(coalesce(p_titulo, '')), ''),
           started_at = p_inicio,
           ended_at   = v_fin,
           notes      = nullif(btrim(coalesce(p_notas, '')), '')
     where id = p_id and modalidad = 'presencial'
    returning id into v_id;
    if v_id is null then
      raise exception 'Esa ficha ya no existe, o no es tuya.';
    end if;
  end if;

  -- Lo que se quita, se quita de verdad: quien se desmarcó no puede quedarse
  -- con la asistencia ni con los minutos.
  delete from public.class_attendance
   where session_id = v_id and not (student_id = any (v_lista));
  -- Los tramos se rehacen enteros porque la hora de la clase pudo cambiar, y
  -- un tramo viejo con el horario de antes seguiría sumando minutos que nadie
  -- estuvo. En una clase presencial nadie más escribe acá.
  delete from public.class_presence_log where session_id = v_id;

  if array_length(v_lista, 1) > 0 then
    insert into public.class_attendance (session_id, student_id, joined_at, minutos_tarde)
    select v_id, a,
           p_inicio + make_interval(mins => coalesce((v_tarde ->> a::text)::int, 0)),
           coalesce((v_tarde ->> a::text)::int, 0)
      from unnest(v_lista) a
    on conflict (session_id, student_id) do update
       set joined_at = excluded.joined_at, minutos_tarde = excluded.minutos_tarde;

    -- El tramo arranca cuando llegó, no cuando empezó la clase: si no, marcar
    -- la tardanza quedaría de adorno y el tiempo seguiría diciendo que estuvo
    -- la hora entera.
    insert into public.class_presence_log (session_id, student_id, joined_at, left_at)
    select v_id, a,
           p_inicio + make_interval(mins => coalesce((v_tarde ->> a::text)::int, 0)),
           v_fin
      from unnest(v_lista) a;
  end if;

  return v_id;
end;
$function$;

-- La firma vieja se va: dejarla sería una segunda versión de la misma función
-- —PostgREST resolvería una u otra según qué parámetros lleguen— y la que
-- quedara sin tardanzas las borraría sin decir nada al volver a guardar.
drop function if exists public.guardar_clase_presencial(text, timestamptz, int, text, uuid[], uuid);

revoke execute on function public.guardar_clase_presencial(text, timestamptz, int, text, uuid[], uuid, jsonb) from public, anon;
grant  execute on function public.guardar_clase_presencial(text, timestamptz, int, text, uuid[], uuid, jsonb) to authenticated;