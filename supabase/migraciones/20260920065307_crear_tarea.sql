-- Mandar una tarea es UN acto, no dos. Partido en dos llamadas del navegador
-- —insertar el encabezado y después sus renglones— si la segunda falla queda
-- una tarea sin nada que hacer adentro, y eso NO da ningún error: el alumno
-- la ve en su lista, vacía, y nadie se entera. Es la decisión que ya tomaron
-- inscribir-alumno y create-student.
--
-- SECURITY INVOKER a propósito: los dos inserts pasan por la RLS de `tareas`
-- y `tarea_items` igual que si los hiciera el navegador, así que quién puede
-- mandarle tarea a quién lo sigue decidiendo la política (tareas_insert exige
-- profesor_id = auth.uid() y soy_profesor_de(alumno)), no un `if` escrito acá.
create or replace function public.crear_tarea(
  p_alumnos       uuid[],
  p_titulo        text,
  p_instrucciones text,
  p_vence         timestamptz,
  p_items         jsonb
)
returns integer
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_alumno uuid;
  v_tarea  uuid;
  v_primero jsonb;
  v_n integer := 0;
  v_items integer;
begin
  if p_alumnos is null or array_length(p_alumnos, 1) is null then
    raise exception 'Elige al menos un alumno.';
  end if;
  if array_length(p_alumnos, 1) > 300 then
    raise exception 'Demasiados alumnos de una vez.';
  end if;

  v_items := jsonb_array_length(coalesce(p_items, '[]'::jsonb));
  if v_items = 0 then
    raise exception 'La tarea no tiene ningún renglón.';
  end if;
  -- Tope de cordura, para atajar un error de dedo, no una regla de negocio.
  if v_items > 20 then
    raise exception 'Una tarea no puede llevar más de 20 renglones.';
  end if;
  if coalesce(btrim(p_titulo), '') = '' then
    raise exception 'La tarea necesita un título.';
  end if;
  if p_vence is null then
    raise exception 'La tarea necesita una fecha límite.';
  end if;

  v_primero := p_items -> 0;

  foreach v_alumno in array p_alumnos loop
    -- Las cuatro columnas de material del encabezado son NOT NULL de cuando
    -- una tarea era un solo material: se llenan con el primer renglón. Lo que
    -- vale para el alumno es tarea_items (ver el comentario de la columna).
    insert into public.tareas (
      profesor_id, alumno_id, titulo, instrucciones,
      material_tipo, material_slug, material_label, material_href, leccion, vence_at)
    values (
      auth.uid(), v_alumno, btrim(p_titulo), coalesce(p_instrucciones, ''),
      v_primero->>'material_tipo', v_primero->>'material_slug',
      v_primero->>'material_label', v_primero->>'material_href',
      nullif(v_primero->>'leccion','')::integer, p_vence)
    returning id into v_tarea;

    insert into public.tarea_items (
      tarea_id, orden, material_tipo, material_slug, material_label,
      material_href, filtro_clave, filtro_label, leccion, actividades,
      meta_tipo, meta_cantidad)
    select
      v_tarea,
      (it.orden - 1)::integer,
      it.valor->>'material_tipo',
      it.valor->>'material_slug',
      it.valor->>'material_label',
      it.valor->>'material_href',
      nullif(it.valor->>'filtro_clave',''),
      nullif(it.valor->>'filtro_label',''),
      nullif(it.valor->>'leccion','')::integer,
      case when it.valor->'actividades' is null then null
           else array(select jsonb_array_elements_text(it.valor->'actividades')) end,
      it.valor->>'meta_tipo',
      nullif(it.valor->>'meta_cantidad','')::integer
    from jsonb_array_elements(p_items) with ordinality as it(valor, orden);

    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

revoke execute on function public.crear_tarea(uuid[], text, text, timestamptz, jsonb) from anon;