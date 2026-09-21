-- El tope sale del examen, no de una constante.
create or replace function public.registrar_salida_examen(p_examen uuid, p_segundos integer default 0)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  e public.examenes%rowtype;
  v_perdonadas integer;
begin
  select * into e from public.examenes where id = p_examen for update;
  if not found then raise exception 'Ese examen no existe.'; end if;
  if e.alumno_id is distinct from auth.uid() then
    raise exception 'Ese examen no es tuyo.';
  end if;
  if e.estado <> 'en_curso' then
    return jsonb_build_object('salidas', e.salidas, 'estado', e.estado,
                              'congelado', e.estado = 'congelado',
                              'permitidas', e.salidas_permitidas);
  end if;

  update public.examenes
     set salidas = e.salidas + 1,
         -- Cuánto estuvo fuera lo manda la página, así que se acota:
         -- sirve para el informe, no para calificar.
         segundos_fuera = e.segundos_fuera + least(greatest(coalesce(p_segundos,0), 0), 3600)
   where id = p_examen
   returning * into e;

  v_perdonadas := e.salidas_permitidas;

  -- NULL es "no congelar nunca": la salida se cuenta y va al informe, pero el
  -- examen sigue. Es un examen vigilado en el aula, no una barra libre — por
  -- eso se sigue contando y por eso el informe lo dice igual.
  if v_perdonadas is not null and e.salidas > v_perdonadas then
    update public.examenes set estado = 'congelado' where id = p_examen;
    -- Se califica lo que llevaba hecho: el examen terminó acá, y el
    -- informe dirá por qué.
    perform public.cerrar_examen(p_examen, 'congelado');
    update public.examenes set estado = 'congelado' where id = p_examen;
    return jsonb_build_object('salidas', e.salidas, 'estado', 'congelado', 'congelado', true,
                              'avisos_restantes', 0, 'permitidas', v_perdonadas);
  end if;

  return jsonb_build_object('salidas', e.salidas, 'estado', e.estado, 'congelado', false,
                            'avisos_restantes',
                            case when v_perdonadas is null then null
                                 else v_perdonadas - e.salidas + 1 end,
                            'permitidas', v_perdonadas);
end;
$function$;

-- El alumno necesita saber cuántas le quedan, así que el tope viaja con su
-- examen. No es información que ayude a hacer trampa: es lo contrario, es la
-- advertencia. Esconderlo solo le quitaría el aviso.
create or replace function public.examen_para_alumno(p_examen uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
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
    'salidas_permitidas', e.salidas_permitidas,
    'items', v_items,
    'respondidas', v_resp
  );
end;
$function$;