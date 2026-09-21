-- El informe detallado: qué hizo bien y qué hizo mal, pregunta por
-- pregunta y área por área.
--
-- UNA sola función para los dos públicos, y lo que cambia es cuánto
-- devuelve: al profesor (y a quien administra) le da la respuesta
-- correcta de cada pregunta; al alumno NO. Escribir dos funciones sería
-- que se separaran a la primera corrección, y la del alumno es
-- justamente la que no puede equivocarse: enseñarle las respuestas
-- convierte el banco en un juego de memoria para el examen siguiente.
-- Es la misma decisión que ya toma nivel-de-arbitraje.html.
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
  -- Antes de entregar no hay informe que dar: sería contarle al alumno
  -- cómo va mientras lo hace.
  if not v_docente and e.estado <> 'entregado' then
    raise exception 'Todavía no has entregado este examen.';
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
           -- Lo que contestó lo ve también el alumno: es suyo.
           'respuesta', r.respuesta,
           -- La clave y el porqué, solo para quien da clase.
           'clave', case when v_docente then i.clave end,
           'explica', case when v_docente then i.visible->>'explica' end
         ) order by i.orden), '[]'::jsonb)
    into v_preguntas
    from public.examen_items i
    left join public.examen_respuestas r on r.item_id = i.id
   where i.examen_id = p_examen;

  -- Por área: es lo que de verdad sirve para decidir qué reforzar, y
  -- es lo que va en el informe a la casa.
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
    'id', e.id,
    'titulo', e.titulo,
    'alumno_id', e.alumno_id,
    'alumno', (select p.full_name from public.profiles p where p.id = e.alumno_id),
    'profesor', (select p.full_name from public.profiles p where p.id = e.profesor_id),
    'estado', e.estado,
    'minutos', e.minutos,
    'iniciado_at', e.iniciado_at,
    'entregado_at', e.entregado_at,
    'motivo_cierre', e.motivo_cierre,
    'nota', e.nota,
    'puntos', e.puntos,
    'puntos_posibles', e.puntos_posibles,
    'porcentaje', e.porcentaje,
    'respondidas', e.respondidas,
    'total_items', e.total_items,
    -- Cuántas veces salió de la ventana va en el informe SIEMPRE, no
    -- solo cuando se congeló: tres salidas cortas y ninguna congelada
    -- siguen siendo un dato que quien lee el informe tiene que tener.
    'salidas', e.salidas,
    'segundos_fuera', e.segundos_fuera,
    'areas', v_areas,
    'preguntas', v_preguntas
  );
end;
$$;

revoke execute on function public.examen_informe(uuid) from anon;


-- La lista, para las dos pantallas. SECURITY INVOKER como las de
-- informes: quién ve qué lo decide la RLS de `examenes`.
create or replace function public.examenes_con_nota(
  p_alumno   uuid default null,
  p_profesor uuid default null,
  p_limite   integer default null
)
returns table (
  id uuid, profesor_id uuid, profesor_nombre text,
  alumno_id uuid, alumno_nombre text,
  titulo text, instrucciones text, minutos integer, vence_at timestamptz,
  estado text, iniciado_at timestamptz, termina_at timestamptz,
  entregado_at timestamptz, motivo_cierre text,
  salidas integer, nota numeric, porcentaje numeric,
  respondidas integer, total_items integer, preguntas bigint,
  created_at timestamptz
)
language sql stable security invoker set search_path to 'public'
as $$
  select e.id, e.profesor_id, pp.full_name, e.alumno_id, pa.full_name,
         e.titulo, e.instrucciones, e.minutos, e.vence_at,
         e.estado, e.iniciado_at, e.termina_at, e.entregado_at, e.motivo_cierre,
         e.salidas, e.nota, e.porcentaje, e.respondidas, e.total_items,
         (select count(*) from public.examen_items i where i.examen_id = e.id),
         e.created_at
    from public.examenes e
    left join public.profiles pp on pp.id = e.profesor_id
    left join public.profiles pa on pa.id = e.alumno_id
   where (p_alumno   is null or e.alumno_id   = p_alumno)
     and (p_profesor is null or e.profesor_id = p_profesor)
   order by e.vence_at desc
   limit p_limite;
$$;

revoke execute on function public.examenes_con_nota(uuid, uuid, integer) from anon;