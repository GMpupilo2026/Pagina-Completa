-- Poner el examen es UN acto: el encabezado y sus preguntas entran
-- juntos o no entra nada. Partido en dos, si la segunda mitad falla
-- queda un examen sin preguntas que el alumno abre y no puede hacer.
-- Misma decisión que crear_tarea() e inscribir-alumno.
--
-- SECURITY INVOKER: los inserts pasan por la RLS igual que si los
-- hiciera el navegador, así que quién puede examinar a quién lo sigue
-- decidiendo la política (soy_profesor_de), no un `if` escrito acá.
create or replace function public.crear_examen(
  p_alumnos       uuid[],
  p_titulo        text,
  p_instrucciones text,
  p_minutos       integer,
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
  v_examen uuid;
  v_n integer := 0;
  v_items integer;
begin
  if p_alumnos is null or array_length(p_alumnos, 1) is null then
    raise exception 'Elige al menos un alumno.';
  end if;

  v_items := jsonb_array_length(coalesce(p_items, '[]'::jsonb));
  if v_items = 0 then
    raise exception 'El examen no tiene ninguna pregunta.';
  end if;
  if v_items > 100 then
    raise exception 'Un examen no puede llevar más de 100 preguntas.';
  end if;

  -- Nunca menos de un minuto por pregunta. Va acá y no en un CHECK de
  -- la tabla porque depende de cuántas preguntas trae el examen, y va
  -- en la base y no en la página porque un mínimo que solo comprueba
  -- el navegador se salta desde la consola.
  if p_minutos < v_items then
    raise exception 'Con % preguntas el examen necesita al menos % minutos.', v_items, v_items;
  end if;

  if coalesce(btrim(p_titulo), '') = '' then
    raise exception 'El examen necesita un título.';
  end if;
  if p_vence is null then
    raise exception 'El examen necesita una fecha límite.';
  end if;

  foreach v_alumno in array p_alumnos loop
    insert into public.examenes (profesor_id, alumno_id, titulo, instrucciones, minutos, vence_at)
    values (auth.uid(), v_alumno, btrim(p_titulo), coalesce(p_instrucciones,''), p_minutos, p_vence)
    returning id into v_examen;

    insert into public.examen_items (examen_id, orden, tipo, banco, item_id, area, peso, visible, clave)
    select v_examen,
           (it.orden - 1)::integer,
           it.valor->>'tipo',
           it.valor->>'banco',
           it.valor->>'item_id',
           nullif(it.valor->>'area',''),
           (it.valor->>'peso')::integer,
           it.valor->'visible',
           it.valor->'clave'
    from jsonb_array_elements(p_items) with ordinality as it(valor, orden);

    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

revoke execute on function public.crear_examen(uuid[], text, text, integer, timestamptz, jsonb) from anon;


-- Lo que el alumno ve de su examen: el enunciado y las opciones ya
-- barajadas, NUNCA la clave. Es SECURITY DEFINER —tiene que leer
-- examen_items, que el alumno no puede leer— y por eso lo primero que
-- hace es comprobar de quién es el examen.
create or replace function public.examen_para_alumno(p_examen uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  e public.examenes%rowtype;
  v_items jsonb;
  v_resp jsonb;
begin
  select * into e from public.examenes where id = p_examen;
  if not found then
    raise exception 'Ese examen no existe.';
  end if;
  if e.alumno_id is distinct from auth.uid() then
    raise exception 'Ese examen no es tuyo.';
  end if;

  -- Se eligen columna por columna. Un `select *` de aquí traería la
  -- clave: es exactamente el descuido que esta función existe para
  -- hacer imposible.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'orden', i.orden, 'tipo', i.tipo,
           'area', i.area, 'peso', i.peso, 'visible', i.visible
         ) order by i.orden), '[]'::jsonb)
    into v_items
    from public.examen_items i where i.examen_id = p_examen;

  -- Cuáles ya contestó, para poder retomar si se recarga la página.
  -- Va sin `correcta`: mientras el examen no esté entregado, saber si
  -- acertó no le corresponde.
  select coalesce(jsonb_agg(jsonb_build_object('item_id', r.item_id)), '[]'::jsonb)
    into v_resp
    from public.examen_respuestas r where r.examen_id = p_examen;

  return jsonb_build_object(
    'id', e.id,
    'titulo', e.titulo,
    'instrucciones', e.instrucciones,
    'minutos', e.minutos,
    'estado', e.estado,
    'vence_at', e.vence_at,
    'iniciado_at', e.iniciado_at,
    -- El reloj que vale es este, y va junto con la hora del servidor
    -- para que la página no dependa del reloj de la computadora.
    'termina_at', e.termina_at,
    'ahora', now(),
    'salidas', e.salidas,
    'items', v_items,
    'respondidas', v_resp
  );
end;
$$;

revoke execute on function public.examen_para_alumno(uuid) from anon;