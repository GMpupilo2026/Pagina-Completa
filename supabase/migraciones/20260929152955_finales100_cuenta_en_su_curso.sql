-- La práctica de «El mapa de los finales» (y de «Estrategia en el final»)
-- contra el motor por fin se registra.
--
-- js/finales-100.js ya llamaba EntrenoProgress.log('finales100', …) al
-- terminar cada práctica, pero 'finales100' no estaba en el CHECK y la base
-- rechazaba la fila sin que nadie se enterara: esas prácticas no sumaban a la
-- meta del día, ni a la racha, ni a los logros. Quedó fuera a sabiendas
-- porque el tiempo de esas páginas se cuenta como «curso:<slug>» y la fila
-- habría salido en Informes como una sección suelta, con los minutos en otra
-- parte. Ahora la fila lleva el curso (detail.curso) y tiempo_por_seccion()
-- la cuenta dentro de ese curso, junto al rato que se pasó ahí.
--
-- Solo se agrega 'finales100'; ninguna actividad existente cambia.
alter table public.training_progress drop constraint training_progress_activity_check;
alter table public.training_progress add constraint training_progress_activity_check
  check (activity = any (array[
    '4x4', 'aprender', 'coordenadas', 'practicar', 'mates', 'tactica',
    'concentracion', 'diagnostico', 'desafios', 'temas',
    'aperturas', 'confites', 'ilumina', 'visualizacion',
    'finales', 'preparacion', 'tipos',
    'precision-posicional', 'sonar', 'batalla-naval',
    'finales100'
  ]));

comment on constraint training_progress_activity_check on public.training_progress is
  'Actividades de Entrenamiento que se registran. Al crear una actividad nueva hay que añadirla aquí, o sus filas se rechazan sin aviso.';

create or replace function public.tiempo_por_seccion(p_alumno uuid, p_desde timestamp with time zone default null::timestamp with time zone, p_hasta timestamp with time zone default null::timestamp with time zone)
 returns table(seccion text, minutos numeric, ejercicios integer)
 language sql
 stable
 set search_path to 'public'
as $function$
with alumno as (
  select p.grupo from public.profiles p where p.id = p_alumno
),
tramos as (
  select case pal.activity
           when 'tactica' then 'temas'
           when 'fichas' then 'estudio'
           else pal.activity end as seccion,
         pal.joined_at, pal.left_at
  from public.platform_activity_log pal
  where pal.student_id = p_alumno
    and (p_desde is null or pal.joined_at >= p_desde)
    and (p_hasta is null or pal.joined_at < p_hasta)
  union all
  select 'clase', cpl.joined_at, cpl.left_at
  from public.class_presence_log cpl
  where cpl.student_id = p_alumno
    and (p_desde is null or cpl.joined_at >= p_desde)
    and (p_hasta is null or cpl.joined_at < p_hasta)
),
medidos as (
  select m.particion as seccion, m.minutos
  from public.minutos_por_tramos(
    (select array_agg(ROW(t.seccion, t.joined_at, t.left_at)::public.tramo_crudo) from tramos t)
  ) m
),
hechos as (
  select case
           when tp.activity = 'tactica' then 'temas'
           when tp.activity = 'practicar' and tp.detail->>'set_id' like 'desafio\_%' then 'desafios'
           -- La práctica contra el motor de un curso de finales es tiempo de
           -- ese curso (su página lo registra como «curso:<slug>»).
           when tp.activity = 'finales100' then 'curso:' || coalesce(nullif(tp.detail->>'curso', ''), 'el-mapa-de-los-finales')
           else tp.activity end as seccion,
         -- Sin repetir el mismo ejercicio, igual que "En qué trabajó" del
         -- correo a la casa; las filas a secas son para el mínimo de CENFO.
         count(distinct coalesce(tp.detail->>'puzzle_id', tp.detail->>'lesson_id',
                                 tp.detail->>'set_id', tp.detail->>'linea_id', tp.detail->>'nivel_id',
                                 (tp.detail->>'nivel') || '/' || (tp.detail->>'ejercicio'),
                                 tp.id::text))::int as distintos,
         count(*)::int as filas
  from public.training_progress tp
  where tp.student_id = p_alumno
    and (p_desde is null or tp.created_at >= p_desde)
    and (p_hasta is null or tp.created_at < p_hasta)
  group by 1
)
select coalesce(m.seccion, h.seccion) as seccion,
       round(greatest(coalesce(m.minutos, 0)::numeric,
                      public.minutos_minimos_por_ejercicio((select grupo from alumno))
                        * coalesce(h.filas, 0)), 1) as minutos,
       coalesce(h.distintos, 0) as ejercicios
from medidos m
full join hechos h on h.seccion = m.seccion
order by 2 desc, 1;
$function$;
