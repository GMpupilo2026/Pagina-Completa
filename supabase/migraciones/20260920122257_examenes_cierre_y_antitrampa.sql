-- Cierra el examen y saca la nota. La nota PONDERA POR DIFICULTAD:
-- cada pregunta vale su peso (1 a 5), así que acertar cinco fáciles no
-- es lo mismo que acertar dos difíciles. Lo que no alcanzó a contestar
-- vale cero — que es lo que significa que se le acabó el tiempo — y
-- aparte se guarda cuántas de cuántas llegó a responder, que es otra
-- cosa y el informe la dice por separado.
--
-- Se guarda y no se recalcula al mirarla: es el acta del examen.
-- Recalcularla mañana, con un banco que cambió, daría otro número.
create or replace function public.cerrar_examen(p_examen uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  e public.examenes%rowtype;
  v_posibles integer;
  v_total integer;
  v_puntos integer;
  v_resp integer;
begin
  select * into e from public.examenes where id = p_examen for update;
  if not found then raise exception 'Ese examen no existe.'; end if;
  -- Lo puede cerrar quien lo rinde (al entregar) o quien lo puso.
  if e.alumno_id is distinct from auth.uid()
     and e.profesor_id is distinct from auth.uid()
     and not (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id)) then
    raise exception 'No puedes cerrar este examen.';
  end if;
  if e.estado = 'entregado' then
    return jsonb_build_object('ya', true, 'nota', e.nota);
  end if;

  select coalesce(sum(peso),0), count(*) into v_posibles, v_total
    from public.examen_items where examen_id = p_examen;
  select coalesce(sum(puntos),0), count(*) into v_puntos, v_resp
    from public.examen_respuestas where examen_id = p_examen;

  update public.examenes
     set estado = 'entregado',
         entregado_at = now(),
         motivo_cierre = case when p_motivo in ('entregado','tiempo','congelado')
                              then p_motivo else 'entregado' end,
         puntos = v_puntos,
         puntos_posibles = v_posibles,
         respondidas = v_resp,
         total_items = v_total,
         nota = case when v_posibles > 0
                     then round(10.0 * v_puntos / v_posibles, 2) else 0 end,
         porcentaje = case when v_posibles > 0
                           then round(100.0 * v_puntos / v_posibles, 2) else 0 end
   where id = p_examen
   returning * into e;

  return jsonb_build_object('nota', e.nota, 'puntos', e.puntos,
    'puntos_posibles', e.puntos_posibles, 'porcentaje', e.porcentaje,
    'respondidas', e.respondidas, 'total_items', e.total_items);
end;
$$;

revoke execute on function public.cerrar_examen(uuid, text) from anon;


-- Antitrampa: el conteo lo lleva el SERVIDOR.
--
-- Un navegador no puede impedir que alguien cambie de pestaña — ninguna
-- página web puede, y decir lo contrario sería mentir. Lo que sí puede
-- es darse cuenta al instante (visibilitychange, blur, salir de pantalla
-- completa) y avisar. Los dos primeros avisos perdonan; al TERCERO el
-- examen se congela y solo el profesor puede volver a abrirlo.
--
-- El contador vive acá y no en la página por la razón de siempre: un
-- contador del cliente se pone en cero desde la consola, y eso no daría
-- ningún error — el examen seguiría como si nada.
create or replace function public.registrar_salida_examen(
  p_examen uuid,
  p_segundos integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  e public.examenes%rowtype;
  v_tope constant integer := 3;
begin
  select * into e from public.examenes where id = p_examen for update;
  if not found then raise exception 'Ese examen no existe.'; end if;
  if e.alumno_id is distinct from auth.uid() then
    raise exception 'Ese examen no es tuyo.';
  end if;
  if e.estado <> 'en_curso' then
    return jsonb_build_object('salidas', e.salidas, 'estado', e.estado, 'congelado', e.estado = 'congelado');
  end if;

  update public.examenes
     set salidas = e.salidas + 1,
         -- Cuánto estuvo fuera lo manda la página, así que se acota:
         -- sirve para el informe, no para calificar.
         segundos_fuera = e.segundos_fuera + least(greatest(coalesce(p_segundos,0), 0), 3600)
   where id = p_examen
   returning * into e;

  if e.salidas >= v_tope then
    update public.examenes set estado = 'congelado' where id = p_examen;
    -- Se califica lo que llevaba hecho: el examen terminó acá, y el
    -- informe dirá por qué.
    perform public.cerrar_examen(p_examen, 'congelado');
    update public.examenes set estado = 'congelado' where id = p_examen;
    return jsonb_build_object('salidas', e.salidas, 'estado', 'congelado', 'congelado', true,
                              'avisos_restantes', 0);
  end if;

  return jsonb_build_object('salidas', e.salidas, 'estado', e.estado, 'congelado', false,
                            'avisos_restantes', v_tope - e.salidas);
end;
$$;

revoke execute on function public.registrar_salida_examen(uuid, integer) from anon;