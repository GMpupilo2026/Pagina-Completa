-- Corrección: un examen CONGELADO dejaba al alumno sin poder ver nada.
-- Esta función exigía estado = 'entregado' para mostrarle el informe, y un
-- examen congelado queda en 'congelado' — así que quien se pasó de salidas
-- veía un error en vez de su nota, justo cuando más falta le hace entender
-- qué pasó. Los dos estados son "ya terminó": lo que no puede es ver el
-- informe mientras lo está rindiendo.
create or replace function public.examen_informe(p_examen uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  e public.examenes%rowtype;
  v_docente boolean;
  v_preguntas jsonb;
  v_areas jsonb;
begin
  select * into e from public.examenes where id = p_examen;
  if not found then raise exception 'Ese examen no existe.'; end if;

  v_docente := (e.profesor_id = auth.uid())
    or (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id));

  if not v_docente and e.alumno_id is distinct from auth.uid() then
    raise exception 'Ese examen no es tuyo.';
  end if;
  -- Mientras lo está rindiendo no hay informe que dar: sería contarle cómo
  -- va. Una vez terminado —entregado o congelado— sí.
  if not v_docente and e.estado not in ('entregado','congelado') then
    raise exception 'Todavía no has terminado este examen.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'orden', i.orden,
           'area', i.area,
           'peso', i.peso,
           'tipo', i.tipo,
           'enunciado', i.visible->>'enunciado',
           'respondida', (r.id is not null),
           'correcta', coalesce(r.correcta, false),
           'puntos', coalesce(r.puntos, 0),
           'segundos', r.segundos,
           'respuesta', r.respuesta,
           -- La clave y el porqué, solo para quien da clase.
           'clave', case when v_docente then i.clave end,
           'explica', case when v_docente then i.visible->>'explica' end
         ) order by i.orden), '[]'::jsonb)
    into v_preguntas
    from public.examen_items i
    left join public.examen_respuestas r on r.item_id = i.id
   where i.examen_id = p_examen;

  select coalesce(jsonb_agg(jsonb_build_object(
           'area', t.area,
           'preguntas', t.n,
           'aciertos', t.aciertos,
           'puntos', t.puntos,
           'posibles', t.posibles,
           'porcentaje', case when t.posibles > 0
                              then round(100.0 * t.puntos / t.posibles, 1) else 0 end
         ) order by t.area), '[]'::jsonb)
    into v_areas
    from (
      select coalesce(i.area, 'general') as area,
             count(*) as n,
             count(*) filter (where r.correcta) as aciertos,
             coalesce(sum(r.puntos), 0) as puntos,
             sum(i.peso) as posibles
        from public.examen_items i
        left join public.examen_respuestas r on r.item_id = i.id
       where i.examen_id = p_examen
       group by coalesce(i.area, 'general')
    ) t;

  return jsonb_build_object(
    'id', e.id, 'titulo', e.titulo, 'alumno_id', e.alumno_id,
    'alumno', (select p.full_name from public.profiles p where p.id = e.alumno_id),
    'profesor', (select p.full_name from public.profiles p where p.id = e.profesor_id),
    'estado', e.estado, 'minutos', e.minutos,
    'iniciado_at', e.iniciado_at, 'entregado_at', e.entregado_at,
    'motivo_cierre', e.motivo_cierre,
    'nota', e.nota, 'puntos', e.puntos, 'puntos_posibles', e.puntos_posibles,
    'porcentaje', e.porcentaje, 'respondidas', e.respondidas, 'total_items', e.total_items,
    'salidas', e.salidas, 'segundos_fuera', e.segundos_fuera,
    'areas', v_areas, 'preguntas', v_preguntas
  );
end;
$$;

revoke execute on function public.examen_informe(uuid) from anon;