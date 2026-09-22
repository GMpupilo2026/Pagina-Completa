-- La clase presencial es una class_sessions más, no una tabla nueva.
--
-- Todo lo que el sitio sabe de una clase —la asistencia, los minutos, el
-- «asistió a 4 de 5» del informe a la casa, el reporte de actividades y el
-- «clases este mes» del panel— cuelga de class_sessions + class_attendance.
-- Una tabla aparte para lo presencial obligaría a tocar las cuatro funciones
-- que las leen, y las cuatro se irían separando a la primera corrección.
--
-- Lo que hoy lo impide y se arregla acá:
--   1. no había forma de distinguirla (la columna `modalidad`);
--   2. el trigger de push avisaría «Empezó la clase» por una clase de ayer;
--   3. class_attendance solo la escribe el ALUMNO, así que el profesor no
--      podía pasar lista;
--   4. proteger_tiempos_de_presencia() pisa las horas con now(), así que el
--      tramo declarado quedaría en cero minutos.

-- ---------------------------------------------------------------- 1. la columna
alter table public.class_sessions
  add column if not exists modalidad text not null default 'en_linea';

alter table public.class_sessions drop constraint if exists class_sessions_modalidad_valida;
alter table public.class_sessions add constraint class_sessions_modalidad_valida
  check (modalidad in ('en_linea', 'presencial'));

comment on column public.class_sessions.modalidad is
  'en_linea: la clase del tablero de sesion.html, que se abre y se cierra en vivo. '
  'presencial: la ficha de asistencia que el profesor llena después, en asistencia.html. '
  'Las dos cuentan igual para los informes y el reporte de actividades.';

create index if not exists class_sessions_modalidad_idx
  on public.class_sessions (created_by, modalidad, started_at desc);

-- ------------------------------------------------- 2. el push no avisa de lo que ya pasó
-- El trigger era AFTER INSERT a secas, así que guardar la ficha de la clase
-- del martes le mandaría a todos los alumnos «Empezó la clase · Entra cuando
-- puedas» con enlace a /sesion.html — a un tablero cerrado, por una clase que
-- ya terminó. No daría ningún error: solo el aviso que no era. Es la misma
-- lección que dejó avisar_examen_reabierto con su WHEN.
--
-- Una clase que nace CERRADA tampoco avisa, sea de la modalidad que sea: no se
-- está abriendo nada.
drop trigger if exists class_sessions_avisa_push on public.class_sessions;
create trigger class_sessions_avisa_push
  after insert on public.class_sessions
  for each row
  when (new.modalidad = 'en_linea' and new.ended_at is null)
  execute function public.avisar_clase_abierta();

-- ------------------------------------------- 3. pasar lista es del profesor
-- class_attendance_insert_own exige auth.uid() = student_id: la asistencia en
-- vivo la marca el alumno al conectarse, y así está bien. Pero pasar lista es
-- justo lo contrario —lo hace quien da la clase, sobre gente que no está del
-- otro lado de ninguna pantalla— así que hacía falta su propia política.
--
-- VA ACOTADA A LAS PRESENCIALES a propósito. En una clase en vivo la
-- asistencia la registra el sistema al conectarse el alumno; dejar que se
-- escriba a mano ahí sería poder inventar que alguien entró a un tablero al
-- que nunca entró. Lo que se abre es la ficha, no la asistencia entera.
drop policy if exists class_attendance_insert_profesor on public.class_attendance;
create policy class_attendance_insert_profesor on public.class_attendance
  for insert with check (
    exists (select 1 from public.class_sessions cs
             where cs.id = session_id
               and cs.created_by = auth.uid()
               and cs.modalidad = 'presencial')
  );

-- El update es para el `on conflict do update` de guardar_clase_presencial():
-- volver a guardar la ficha con otra hora tiene que mover el joined_at, no
-- fallar.
drop policy if exists class_attendance_update_profesor on public.class_attendance;
create policy class_attendance_update_profesor on public.class_attendance
  for update using (
    exists (select 1 from public.class_sessions cs
             where cs.id = session_id
               and cs.created_by = auth.uid()
               and cs.modalidad = 'presencial')
  ) with check (
    exists (select 1 from public.class_sessions cs
             where cs.id = session_id
               and cs.created_by = auth.uid()
               and cs.modalidad = 'presencial')
  );

-- Y el delete, porque pasar lista se equivoca: marcar a quien no fue y no
-- poder desmarcarlo dejaría al alumno con una asistencia de más en el informe
-- que llega a su casa.
drop policy if exists class_attendance_delete_profesor on public.class_attendance;
create policy class_attendance_delete_profesor on public.class_attendance
  for delete using (
    exists (select 1 from public.class_sessions cs
             where cs.id = session_id
               and cs.created_by = auth.uid()
               and cs.modalidad = 'presencial')
  );

-- Los minutos: un asistente presencial deja su tramo en class_presence_log,
-- igual que un latido de la clase en vivo. Así informes_resumen_alumnos(),
-- informe_de_alumno() y reporte_actividades() cuentan los minutos presenciales
-- SIN TOCARLAS — las tres ya leen esta tabla y las tres los unen con
-- minutos_por_tramos(), así que una clase presencial que se solape con una en
-- línea no se cuenta dos veces. Sin esto, un alumno que solo va presencial
-- aparecería con «5 clases, 0 minutos» y eso no da ningún error.
drop policy if exists class_presence_log_insert_profesor on public.class_presence_log;
create policy class_presence_log_insert_profesor on public.class_presence_log
  for insert with check (
    exists (select 1 from public.class_sessions cs
             where cs.id = session_id
               and cs.created_by = auth.uid()
               and cs.modalidad = 'presencial')
  );

drop policy if exists class_presence_log_delete_profesor on public.class_presence_log;
create policy class_presence_log_delete_profesor on public.class_presence_log
  for delete using (
    exists (select 1 from public.class_sessions cs
             where cs.id = session_id
               and cs.created_by = auth.uid()
               and cs.modalidad = 'presencial')
  );

-- ------------------------------------ 4. el tramo declarado conserva sus horas
-- proteger_tiempos_de_presencia() ignora lo que mande el cliente y usa el reloj
-- del servidor: es lo que impide que un alumno se infle los minutos desde la
-- consola. En la ficha presencial el tramo NO lo mide un latido, lo DECLARA el
-- profesor —«la clase fue de 3 a 4»—, así que ahí las horas tienen que pasar.
--
-- La excepción se lee DE LA FILA y no de una marca local como
-- `ajedrez.contando_invitaciones`: una marca hay que acordarse de ponerla y de
-- quitarla, y quien escribe podría poner la suya. «Ser el creador de esa clase
-- presencial» no se puede falsificar — el alumno nunca es el creador, así que
-- para él el trigger sigue exactamente igual de cerrado que antes.
create or replace function public.proteger_tiempos_de_presencia()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if TG_OP = 'INSERT' then
    if TG_TABLE_NAME = 'class_presence_log'
       and exists (select 1 from public.class_sessions cs
                    where cs.id = new.session_id
                      and cs.modalidad = 'presencial'
                      and cs.created_by = auth.uid())
    then
      return new;                      -- el tramo que declaró quien dio la clase
    end if;
    new.joined_at := now();
    new.left_at := null;
    return new;
  end if;
  new := old;
  new.left_at := now();
  return new;
end;
$function$;

revoke execute on function public.proteger_tiempos_de_presencia() from public, anon, authenticated;

-- -------------------------------------------- 5. guardar la ficha es UNA llamada
-- Partido en dos —la clase y después la lista— si la segunda mitad falla queda
-- una clase presencial con cero asistentes, que en el reporte se lee como una
-- clase a la que no fue nadie. Es la decisión que ya tomaron crear_tarea() e
-- inscribir-alumno.
--
-- SECURITY INVOKER: quién puede crear una clase y quién puede tocar cuál lo
-- siguen decidiendo class_sessions_insert / _update y las políticas de arriba,
-- igual que si los inserts salieran del navegador. No hay ni un filtro de
-- profesor escrito acá dentro.
--
-- Deja la lista de asistentes EXACTAMENTE como se mandó —lo que no esté, se
-- quita—, que es la regla de set_teachers y equipo_set_alumnos: pasar lista se
-- corrige, y una lista que solo suma no se puede corregir.
create or replace function public.guardar_clase_presencial(
  p_titulo  text,
  p_inicio  timestamptz,
  p_minutos int,
  p_notas   text,
  p_alumnos uuid[],
  p_id      uuid default null
) returns uuid
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_id    uuid;
  v_fin   timestamptz;
  v_lista uuid[] := coalesce(p_alumnos, '{}'::uuid[]);
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
    insert into public.class_attendance (session_id, student_id, joined_at)
    select v_id, a, p_inicio from unnest(v_lista) a
    on conflict (session_id, student_id) do update set joined_at = excluded.joined_at;

    insert into public.class_presence_log (session_id, student_id, joined_at, left_at)
    select v_id, a, p_inicio, v_fin from unnest(v_lista) a;
  end if;

  return v_id;
end;
$function$;

revoke execute on function public.guardar_clase_presencial(text, timestamptz, int, text, uuid[], uuid) from public, anon;
grant  execute on function public.guardar_clase_presencial(text, timestamptz, int, text, uuid[], uuid) to authenticated;