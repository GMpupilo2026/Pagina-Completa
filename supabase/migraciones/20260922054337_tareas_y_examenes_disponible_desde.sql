-- Tareas y exámenes se pueden PROGRAMAR: el profesor las arma y elige a
-- quién van, con anticipación, y no aparecen hasta la fecha que puso. Antes
-- solo había "vence": lo único que se podía decidir era cuándo se cierra,
-- nunca cuándo se abre, así que dejar algo listo para el lunes significaba
-- mandarlo el lunes.
--
-- `disponible_desde` es NOT NULL con DEFAULT now(): lo de siempre —mandar
-- sin poner nada— sigue significando "aparece de una vez", y las filas que
-- ya existían quedan con la fecha de esta migración, que es "ya disponible"
-- para todas.
--
-- El candado lo hace cumplir la RLS, no la pantalla, con la misma regla que
-- ya usa este archivo en todos lados: `tareas_select`/`examenes_select` solo
-- le entregan la fila al alumno cuando `disponible_desde <= now()`. El
-- profesor y quien administra siguen viendo TODO, disponible o no — así se
-- prepara con anticipación y así se sigue pudiendo editar o borrar antes de
-- que llegue la fecha. `iniciar_examen()` y `examen_para_alumno()` repiten
-- el mismo chequeo a mano: las dos son SECURITY DEFINER y el dueño de las
-- funciones tiene BYPASSRLS, así que la política de la tabla no las alcanza
-- — es el mismo motivo por el que ya comprueban `alumno_id = auth.uid()` a
-- mano en vez de confiar en la RLS.
--
-- Lo que esto NO cierra, y queda anotado: el aviso push de "nueva tarea" /
-- "nuevo examen" sigue siendo un trigger de INSERT, así que si se programa
-- para más adelante el aviso simplemente NO SALE (mandarlo ahora sería un
-- push que lleva a una página que la RLS todavía no le entrega). Avisar
-- justo cuando se destapa pediría una tanda con pg_cron, como la de los
-- recordatorios de cobro o los informes a la casa, y es un cambio aparte.

alter table public.tareas
  add column disponible_desde timestamptz not null default now();

alter table public.examenes
  add column disponible_desde timestamptz not null default now();

-- ---------------- RLS: el alumno no ve lo que todavía no empieza ----------------

drop policy if exists tareas_select on public.tareas;
create policy tareas_select on public.tareas for select
  using (
    (select is_admin from public.my_profile())
    or profesor_id = auth.uid()
    or (alumno_id = auth.uid() and disponible_desde <= now())
  );

drop policy if exists tareas_update on public.tareas;
create policy tareas_update on public.tareas for update
  using (
    (select is_admin from public.my_profile())
    or profesor_id = auth.uid()
    or (alumno_id = auth.uid() and disponible_desde <= now())
  )
  with check (
    (select is_admin from public.my_profile())
    or profesor_id = auth.uid()
    or (alumno_id = auth.uid() and disponible_desde <= now())
  );

-- tarea_items_select no se toca: su `exists (select 1 from tareas t where
-- t.id = tarea_id)` ya pasa por la RLS de `tareas` que se acaba de cambiar,
-- así que hereda el candado solo. tarea_items_update sí nombra el rol del
-- alumno explícito, y ahí hay que repetir la condición.
drop policy if exists tarea_items_update on public.tarea_items;
create policy tarea_items_update on public.tarea_items for update
  using (exists (
    select 1 from public.tareas t
    where t.id = tarea_id
      and (t.profesor_id = auth.uid()
           or (t.alumno_id = auth.uid() and t.disponible_desde <= now())
           or (select is_admin from public.my_profile()))
  ))
  with check (exists (
    select 1 from public.tareas t
    where t.id = tarea_id
      and (t.profesor_id = auth.uid()
           or (t.alumno_id = auth.uid() and t.disponible_desde <= now())
           or (select is_admin from public.my_profile()))
  ));

drop policy if exists examenes_select on public.examenes;
create policy examenes_select on public.examenes for select
  using (
    (select is_admin from public.my_profile())
    or profesor_id = auth.uid()
    or (alumno_id = auth.uid() and disponible_desde <= now())
  );

-- examenes_update no tiene rama de alumno (solo profesor/admin editan un
-- examen ya puesto), así que no hace falta tocarla. examen_items_select
-- tampoco: el alumno nunca lee esa tabla directo, se lo sirve
-- examen_para_alumno(), que abajo suma su propio chequeo.

-- ---------------- crear_tarea(): la ventana se pone al mandarla ----------------

drop function if exists public.crear_tarea(uuid[], text, text, timestamptz, jsonb);

create or replace function public.crear_tarea(
  p_alumnos           uuid[],
  p_titulo            text,
  p_instrucciones     text,
  p_vence             timestamptz,
  p_items             jsonb,
  p_disponible_desde  timestamptz default null
)
returns integer
language plpgsql
set search_path to 'public'
as $$
declare
  v_alumno uuid;
  v_tarea  uuid;
  v_primero jsonb;
  v_n integer := 0;
  v_items integer;
  -- NULL es "de una vez", igual que dejar el campo en blanco en el
  -- formulario: se guarda como el momento en que se manda, no como NULL,
  -- porque la columna es NOT NULL (la fila vieja que no programó nada tiene
  -- que seguir leyéndose como "ya disponible", no como "sin decidir").
  v_desde timestamptz := coalesce(p_disponible_desde, now());
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
  -- Una tarea que empieza después de vencer no la vería nunca nadie, y eso
  -- no daría ningún error: se quedaría en la lista del profesor para
  -- siempre sin que el alumno la llegara a ver ni una vez.
  if v_desde >= p_vence then
    raise exception 'La tarea tiene que empezar antes de vencer.';
  end if;

  v_primero := p_items -> 0;

  foreach v_alumno in array p_alumnos loop
    -- Las cuatro columnas de material del encabezado son NOT NULL de cuando
    -- una tarea era un solo material: se llenan con el primer renglón. Lo que
    -- vale para el alumno es tarea_items (ver el comentario de la columna).
    insert into public.tareas (
      profesor_id, alumno_id, titulo, instrucciones,
      material_tipo, material_slug, material_label, material_href, leccion,
      vence_at, disponible_desde)
    values (
      auth.uid(), v_alumno, btrim(p_titulo), coalesce(p_instrucciones, ''),
      v_primero->>'material_tipo', v_primero->>'material_slug',
      v_primero->>'material_label', v_primero->>'material_href',
      nullif(v_primero->>'leccion','')::integer, p_vence, v_desde)
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

revoke execute on function public.crear_tarea(uuid[], text, text, timestamptz, jsonb, timestamptz) from anon;

-- ---------------- crear_examen(): misma ventana ----------------

drop function if exists public.crear_examen(uuid[], text, text, integer, timestamptz, jsonb, integer);

create or replace function public.crear_examen(
  p_alumnos             uuid[],
  p_titulo              text,
  p_instrucciones       text,
  p_minutos             integer,
  p_vence               timestamptz,
  p_items               jsonb,
  p_salidas_permitidas  integer default 2,
  p_disponible_desde    timestamptz default null
)
returns integer
language plpgsql
set search_path to 'public'
as $function$
declare
  v_alumno uuid;
  v_examen uuid;
  v_n integer := 0;
  v_items integer;
  v_desde timestamptz := coalesce(p_disponible_desde, now());
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

  -- Igual que el mínimo de tiempo: el tope de salidas se valida acá y no en
  -- la pantalla. NULL se deja pasar a propósito — es "no congelar nunca".
  if p_salidas_permitidas is not null
     and (p_salidas_permitidas < 0 or p_salidas_permitidas > 20) then
    raise exception 'Las salidas permitidas van de 0 a 20.';
  end if;

  if coalesce(btrim(p_titulo), '') = '' then
    raise exception 'El examen necesita un título.';
  end if;
  if p_vence is null then
    raise exception 'El examen necesita una fecha límite.';
  end if;
  if v_desde >= p_vence then
    raise exception 'El examen tiene que empezar antes de vencer.';
  end if;

  foreach v_alumno in array p_alumnos loop
    insert into public.examenes (profesor_id, alumno_id, titulo, instrucciones,
                                 minutos, vence_at, salidas_permitidas, disponible_desde)
    values (auth.uid(), v_alumno, btrim(p_titulo), coalesce(p_instrucciones,''),
            p_minutos, p_vence, p_salidas_permitidas, v_desde)
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
$function$;

revoke execute on function public.crear_examen(uuid[], text, text, integer, timestamptz, jsonb, integer, timestamptz) from anon;

-- ---------------- tareas_con_avance(): dice si está programada ----------------

drop function if exists public.tareas_con_avance(uuid, uuid, boolean, integer);

create or replace function public.tareas_con_avance(
  p_alumno     uuid    default null,
  p_profesor   uuid    default null,
  p_pendientes boolean default false,
  p_limite     integer default null
)
returns table (
  id uuid,
  profesor_id uuid,
  profesor_nombre text,
  alumno_id uuid,
  alumno_nombre text,
  titulo text,
  instrucciones text,
  vence_at timestamptz,
  disponible_desde timestamptz,
  created_at timestamptz,
  items jsonb,
  renglones integer,
  cumplidos integer,
  situacion text
)
language sql
stable
set search_path to 'public'
as $$
with base as (
  select t.* from public.tareas t
  where (p_alumno   is null or t.alumno_id   = p_alumno)
    and (p_profesor is null or t.profesor_id = p_profesor)
),
avance as (
  select
    i.*,
    b.id as t_id,
    case i.meta_tipo
      when 'completar' then (case when i.completada_at is not null then 1 else 0 end)::bigint

      when 'cantidad' then (
        select count(distinct coalesce(
                 tp.detail->>'puzzle_id', tp.detail->>'lesson_id',
                 tp.detail->>'set_id',    tp.detail->>'linea_id',
                 tp.detail->>'nivel_id',  tp.detail->>'diagrama',
                 tp.id::text))
        from public.training_progress tp
        where tp.student_id = b.alumno_id
          and tp.activity = any(i.actividades)
          and tp.created_at >= b.created_at
          and (i.filtro_clave is null
               or tp.detail->>'theme'    = i.filtro_clave
               or tp.detail->>'category' = i.filtro_clave
               or tp.detail->>'linea_id' = i.filtro_clave)
      )

      when 'minutos' then coalesce((
        select floor(m.minutos)::bigint
        from public.minutos_por_tramos((
          select array_agg((i.id::text, pa.joined_at, pa.left_at)::public.tramo_crudo)
          from public.platform_activity_log pa
          where pa.student_id = b.alumno_id
            and pa.activity = any(i.actividades)
            and pa.joined_at >= b.created_at
        )) m
        limit 1), 0)
    end as hecho
  from public.tarea_items i
  join base b on b.id = i.tarea_id
),
marcado as (
  select a.*,
         (case when a.meta_tipo = 'completar' then a.hecho >= 1
               else a.hecho >= a.meta_cantidad end) as cumplido
  from avance a
),
resumen as (
  select m.t_id,
         jsonb_agg(jsonb_build_object(
           'id',             m.id,
           'orden',          m.orden,
           'material_tipo',  m.material_tipo,
           'material_slug',  m.material_slug,
           'material_label', m.material_label,
           'material_href',  m.material_href,
           'filtro_clave',   m.filtro_clave,
           'filtro_label',   m.filtro_label,
           'leccion',        m.leccion,
           'meta_tipo',      m.meta_tipo,
           'meta_cantidad',  m.meta_cantidad,
           'hecho',          m.hecho,
           'cumplido',       m.cumplido
         ) order by m.orden, m.id) as items,
         count(*)                           as renglones,
         count(*) filter (where m.cumplido) as cumplidos
  from marcado m
  group by m.t_id
),
final as (
  select
    b.id, b.profesor_id, pp.full_name as profesor_nombre,
    b.alumno_id, pa.full_name as alumno_nombre,
    b.titulo, b.instrucciones, b.vence_at, b.disponible_desde, b.created_at,
    coalesce(r.items, '[]'::jsonb)      as items,
    coalesce(r.renglones, 0)::integer   as renglones,
    coalesce(r.cumplidos, 0)::integer   as cumplidos,
    case
      when b.disponible_desde > now() then 'programada'
      when coalesce(r.renglones,0) > 0 and r.cumplidos >= r.renglones then 'completada'
      when b.vence_at < now() then 'vencida'
      else 'pendiente'
    end as situacion
  from base b
  left join resumen r on r.t_id = b.id
  left join public.profiles pp on pp.id = b.profesor_id
  left join public.profiles pa on pa.id = b.alumno_id
)
select * from final
where not p_pendientes or situacion <> 'completada'
order by vence_at
limit p_limite;
$$;

revoke execute on function public.tareas_con_avance(uuid, uuid, boolean, integer) from anon;

-- ---------------- examenes_con_nota(): dice si está programado ----------------

drop function if exists public.examenes_con_nota(uuid, uuid, integer);

create or replace function public.examenes_con_nota(
  p_alumno   uuid default null,
  p_profesor uuid default null,
  p_limite   integer default null
)
returns table (
  id uuid, profesor_id uuid, profesor_nombre text,
  alumno_id uuid, alumno_nombre text,
  titulo text, instrucciones text, minutos integer, vence_at timestamptz,
  disponible_desde timestamptz,
  estado text, iniciado_at timestamptz, termina_at timestamptz,
  entregado_at timestamptz, motivo_cierre text,
  salidas integer, nota numeric, porcentaje numeric,
  respondidas integer, total_items integer, preguntas bigint,
  created_at timestamptz
)
language sql stable set search_path to 'public'
as $$
  select e.id, e.profesor_id, pp.full_name, e.alumno_id, pa.full_name,
         e.titulo, e.instrucciones, e.minutos, e.vence_at, e.disponible_desde,
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

-- ---------------- iniciar_examen() y examen_para_alumno(): el candado a mano ----------------

create or replace function public.iniciar_examen(p_examen uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  e public.examenes%rowtype;
begin
  select * into e from public.examenes where id = p_examen for update;
  if not found then raise exception 'Ese examen no existe.'; end if;
  if e.alumno_id is distinct from auth.uid() then
    raise exception 'Ese examen no es tuyo.';
  end if;
  if e.estado = 'entregado' then raise exception 'Ese examen ya lo entregaste.'; end if;
  if e.estado = 'congelado' then
    raise exception 'El examen está congelado. Tu profe tiene que volver a abrirlo.';
  end if;
  if now() < e.disponible_desde and e.estado = 'asignado' then
    raise exception 'Todavía no está disponible este examen.';
  end if;
  if now() > e.vence_at and e.estado = 'asignado' then
    raise exception 'Se pasó la fecha para hacer este examen.';
  end if;

  if e.estado = 'asignado' then
    update public.examenes
       set estado = 'en_curso',
           iniciado_at = now(),
           termina_at = now() + make_interval(mins => e.minutos)
     where id = p_examen
     returning * into e;
  end if;

  return jsonb_build_object('estado', e.estado, 'termina_at', e.termina_at, 'ahora', now());
end;
$$;

revoke execute on function public.iniciar_examen(uuid) from anon;

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
  if now() < e.disponible_desde then
    raise exception 'Todavía no está disponible este examen.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'orden', i.orden, 'tipo', i.tipo,
           'area', i.area, 'peso', i.peso, 'visible', i.visible
         ) order by i.orden), '[]'::jsonb)
    into v_items
    from public.examen_items i where i.examen_id = p_examen;

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
    'disponible_desde', e.disponible_desde,
    'iniciado_at', e.iniciado_at,
    'termina_at', e.termina_at,
    'ahora', now(),
    'salidas', e.salidas,
    'salidas_permitidas', e.salidas_permitidas,
    'items', v_items,
    'respondidas', v_resp
  );
end;
$$;

revoke execute on function public.examen_para_alumno(uuid) from anon;

-- ---------------- Los avisos push no salen antes de tiempo ----------------

create or replace function public.avisar_tarea_asignada()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  profe text;
begin
  select coalesce(p.full_name, 'Tu profe') into profe
    from public.profiles p where p.id = new.profesor_id;

  if new.disponible_desde <= now() then
    perform public.avisar_push(
      array[new.alumno_id],
      'Nueva tarea',
      profe || ' te asignó «' || new.titulo || '». Vence el ' ||
        to_char(new.vence_at at time zone 'America/Costa_Rica', 'DD/MM HH24:MI') || '.',
      '/tareas.html',
      'tarea');
  end if;
  return new;
end;
$function$;

create or replace function public.avisar_examen_asignado()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  profe   text;
  n       integer;
  s_preg  text;
  s_min   text;
begin
  select coalesce(p.full_name, 'Tu profe') into profe
    from public.profiles p where p.id = new.profesor_id;

  select count(*) into n
    from public.examen_items i where i.examen_id = new.id;

  s_preg := n || case when n = 1 then ' pregunta' else ' preguntas' end;
  s_min  := new.minutos || case when new.minutos = 1 then ' minuto' else ' minutos' end;

  if new.disponible_desde <= now() then
    perform public.avisar_push(
      array[new.alumno_id],
      'Nuevo examen',
      profe || ' te puso «' || new.titulo || '»: ' || s_preg || ' en ' || s_min ||
        '. Tienes hasta el ' ||
        to_char(new.vence_at at time zone 'America/Costa_Rica', 'DD/MM HH24:MI') || '.',
      '/examen.html?id=' || new.id,
      'examen:' || new.id);
  end if;
  return new;
end;
$$;

-- ---------------- El informe a la casa no cuenta lo que la familia no ve ----------------

create or replace function public.resumen_tareas_examenes(
  p_alumno uuid,
  p_desde  timestamptz,
  p_hasta  timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_yo      uuid := auth.uid();
  v_admin   boolean := false;
  v_tareas  jsonb;
  v_ex      jsonb;
begin
  if v_yo is not null then
    select coalesce(pr.is_admin, false) into v_admin
      from public.profiles pr where pr.id = v_yo;
    if not (p_alumno = v_yo or v_admin or public.soy_profesor_de(p_alumno)) then
      raise exception 'No puedes ver el resumen de ese alumno.';
    end if;
  end if;

  with t as (
    select * from public.tareas_con_avance(p_alumno, null, false, null)
  )
  select jsonb_build_object(
    'puestas',     count(*) filter (where created_at >= p_desde and created_at < p_hasta),
    'completadas', count(*) filter (where created_at >= p_desde and created_at < p_hasta
                                      and situacion = 'completada'),
    'vencidas',    count(*) filter (where created_at >= p_desde and created_at < p_hasta
                                      and situacion = 'vencida'),
    'sin_hacer_hoy', count(*) filter (where situacion = 'vencida'),
    'pendientes',    count(*) filter (where situacion = 'pendiente'),
    'proxima_vence', min(vence_at) filter (where situacion = 'pendiente'),
    'renglones',  coalesce(sum(renglones) filter (where created_at >= p_desde and created_at < p_hasta), 0),
    'cumplidos',  coalesce(sum(cumplidos) filter (where created_at >= p_desde and created_at < p_hasta), 0)
  ) into v_tareas from t;

  select jsonb_build_object(
    'rendidos',   count(*) filter (where e.estado in ('entregado','congelado')
                                     and e.entregado_at >= p_desde and e.entregado_at < p_hasta),
    'nota_media', round(avg(e.nota) filter (where e.estado in ('entregado','congelado')
                                     and e.entregado_at >= p_desde and e.entregado_at < p_hasta)::numeric, 2),
    'mejor_nota', max(e.nota) filter (where e.estado in ('entregado','congelado')
                                     and e.entregado_at >= p_desde and e.entregado_at < p_hasta),
    'sin_hacer_hoy', count(*) filter (where e.estado = 'asignado' and e.vence_at < now()
                                        and e.disponible_desde <= now()),
    'pendientes',    count(*) filter (where e.estado = 'asignado' and e.vence_at >= now()
                                        and e.disponible_desde <= now()),
    'proximo_vence', min(e.vence_at) filter (where e.estado = 'asignado' and e.vence_at >= now()
                                               and e.disponible_desde <= now())
  ) into v_ex
  from public.examenes e where e.alumno_id = p_alumno;

  return jsonb_build_object('tareas', v_tareas, 'examenes', v_ex);
end;
$$;

revoke execute on function public.resumen_tareas_examenes(uuid, timestamptz, timestamptz) from anon;
grant  execute on function public.resumen_tareas_examenes(uuid, timestamptz, timestamptz) to authenticated;
