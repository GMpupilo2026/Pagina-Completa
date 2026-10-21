-- Cuánto vio cada persona de la grabación de una clase. Lo pidió el dueño para
-- el taller «Formación Ajedrez»: las sesiones duran tres y cuatro horas, y
-- quiere saber quién repasó la grabación y cuánto.
--
-- Se guarda QUÉ SEGUNDOS del video vio, no cuánto rato tuvo la página
-- abierta: `vistos` es un int4multirange (los tramos [desde, hasta) en
-- segundos del video), y la suma de esos tramos es `visto_seg`. Así volver a
-- ver un tramo no suma dos veces, adelantar no cuenta como visto y dejarlo en
-- pausa no cuenta nada. `visto_seg` es una columna generada: se deriva de
-- `vistos` en la misma fila y no se puede separar de ella.
--
-- Lo mide la página (el reproductor de YouTube le dice en qué segundo va) y lo
-- anota grabacion_vista_anotar(), que valida: que la grabación sea de una
-- clase de quien llama (la regla de mis_grabaciones()), que los tramos sean
-- números enteros dentro del video y que no traiga más video del que da el
-- tiempo para verlo (el doble de lo que pasó desde la última vez, que es la
-- velocidad más alta de YouTube, y un margen): un «lo vi entero» desde la
-- consola no entra de una vez. La tabla no tiene política de escritura.
--
-- La leen la persona (su avance, en la tarjeta del video), el profe de esa
-- clase y quien administra. La ficha Asesores lo pide por taller con
-- asesores_grabaciones(): una fila por persona y grabación de sus clases,
-- también las que no abrió.
--
-- No reparte permisos, accesos ni dinero: no lleva bitácora.
--
-- Ver «Cuánto vio cada uno» en docs/decisiones/paneles.md.

create function interno.segundos_vistos(p_tramos int4multirange)
 returns integer
 language sql
 immutable
 parallel safe
 set search_path to ''
as $function$
  select coalesce(sum(upper(r) - lower(r)), 0)::integer from pg_catalog.unnest(p_tramos) r;
$function$;
revoke execute on function interno.segundos_vistos(int4multirange) from public, anon, authenticated;

create table public.grabaciones_vistas (
  horario_id uuid not null,
  fecha date not null,
  persona_id uuid not null references public.profiles(id) on delete cascade,
  vistos int4multirange not null default '{}',
  visto_seg integer not null generated always as (interno.segundos_vistos(vistos)) stored,
  primera_vez timestamptz not null default now(),
  ultima_vez timestamptz not null default now(),
  primary key (horario_id, fecha, persona_id),
  foreign key (horario_id, fecha) references public.grabaciones_clase(horario_id, fecha) on delete cascade
);
comment on table public.grabaciones_vistas is
  'Qué segundos vio cada persona de la grabación de una clase (tramos sin repetir). La escribe grabacion_vista_anotar(); la leen la persona, el profe de la clase y administración.';
create index grabaciones_vistas_persona_idx on public.grabaciones_vistas (persona_id);
alter table public.grabaciones_vistas enable row level security;
revoke all on public.grabaciones_vistas from public, anon, authenticated;
grant select on public.grabaciones_vistas to authenticated;
create policy grabaciones_vistas_ver on public.grabaciones_vistas
  for select to authenticated
  using (
    persona_id = (select auth.uid())
    or (select public.soy_admin())
    or horario_id in (select h.id from public.horario_clases h where h.profesor_id = (select auth.uid()))
  );

-- p_tramos: [[desde, hasta], …] en segundos enteros del video. Lo que pase del
-- final se recorta (la duración anotada puede quedarse corta por segundos).
-- Devuelve cuántos segundos distintos lleva vistos.
create function public.grabacion_vista_anotar(p_horario uuid, p_fecha date, p_tramos jsonb)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_yo uuid := (select auth.uid());
  v_fin integer;
  v_tramo jsonb;
  v_desde integer;
  v_hasta integer;
  v_nuevos int4multirange := '{}';
  v_antes int4multirange;
  v_ultima timestamptz;
  v_tope numeric;
begin
  if not coalesce(v_yo is not null and p_horario in (select interno.horarios_del_alumno(v_yo)), false) then
    raise exception 'Esa grabación no es de una clase tuya.' using errcode = '42501';
  end if;
  select coalesce(g.duracion_seg, 86400) into v_fin
    from public.grabaciones_clase g where g.horario_id = p_horario and g.fecha = p_fecha;
  if v_fin is null then
    raise exception 'Esa clase no tiene grabación.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_tramos) is distinct from 'array' or jsonb_array_length(p_tramos) > 200 then
    raise exception 'Los tramos van en una lista de [desde, hasta], de a lo sumo 200.' using errcode = '22023';
  end if;

  for v_tramo in select t from jsonb_array_elements(p_tramos) t loop
    if jsonb_typeof(v_tramo) is distinct from 'array' or jsonb_array_length(v_tramo) <> 2
       or (v_tramo->>0) !~ '^[0-9]{1,6}$' or (v_tramo->>1) !~ '^[0-9]{1,6}$' then
      raise exception 'Cada tramo es [desde, hasta], en segundos enteros.' using errcode = '22023';
    end if;
    v_desde := (v_tramo->>0)::integer;
    v_hasta := least((v_tramo->>1)::integer, v_fin);
    if v_desde < v_hasta then
      v_nuevos := v_nuevos + int4multirange(int4range(v_desde, v_hasta));
    end if;
  end loop;

  select v.vistos, v.ultima_vez into v_antes, v_ultima
    from public.grabaciones_vistas v
   where v.horario_id = p_horario and v.fecha = p_fecha and v.persona_id = v_yo
   for update;
  if isempty(v_nuevos) then
    return coalesce(interno.segundos_vistos(v_antes), 0);
  end if;

  -- La página manda cada 30 segundos: a velocidad doble son 60 de video.
  v_tope := case when v_ultima is null then 120
                 else least(86400, 2 * extract(epoch from (now() - v_ultima)) + 60) end;
  if interno.segundos_vistos(coalesce(v_antes, '{}') + v_nuevos) - coalesce(interno.segundos_vistos(v_antes), 0) > v_tope then
    raise exception 'Eso es más video del que da el tiempo para verlo.' using errcode = '22023';
  end if;

  insert into public.grabaciones_vistas as v (horario_id, fecha, persona_id, vistos)
  values (p_horario, p_fecha, v_yo, v_nuevos)
  on conflict (horario_id, fecha, persona_id) do update
    set vistos = v.vistos + excluded.vistos, ultima_vez = now();

  return (select v.visto_seg from public.grabaciones_vistas v
           where v.horario_id = p_horario and v.fecha = p_fecha and v.persona_id = v_yo);
end;
$function$;
revoke execute on function public.grabacion_vista_anotar(uuid, date, jsonb) from public, anon;
grant execute on function public.grabacion_vista_anotar(uuid, date, jsonb) to authenticated;

-- Para la ficha Asesores: cada persona de un taller (sus cuentas temporales
-- abiertas) con cada grabación de sus clases y cuánto vio, también 0. Es
-- SECURITY DEFINER porque «sus clases» es interno.horarios_del_alumno(); la
-- usa quien administra, y cualquier otro recibe solo sus propias filas.
create function public.asesores_grabaciones(p_detalle text)
 returns table(persona_id uuid, horario_id uuid, fecha date, titulo text, inicio timestamp with time zone, duracion_seg integer, visto_seg integer, ultima_vez timestamp with time zone)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  with gente as (
    select ct.persona_id
      from public.cuentas_temporales ct
     where ct.detalle = p_detalle
       and ct.vence > now()
       and coalesce(public.soy_admin() or ct.persona_id = (select auth.uid()), false)
  ), grabadas as (
    select g.horario_id, g.fecha, g.duracion_seg, nullif(btrim(h.titulo), '') as titulo, o.inicio
      from public.grabaciones_clase g
      join public.horario_clases h on h.id = g.horario_id
      cross join lateral public.ocurrencias_horario(h.profesor_id, g.fecha, g.fecha) o
     where o.horario_id = g.horario_id
  )
  select p.persona_id, gr.horario_id, gr.fecha, gr.titulo, gr.inicio, gr.duracion_seg,
         coalesce(v.visto_seg, 0), v.ultima_vez
    from gente p
    join grabadas gr on gr.horario_id in (select interno.horarios_del_alumno(p.persona_id))
    left join public.grabaciones_vistas v
      on v.horario_id = gr.horario_id and v.fecha = gr.fecha and v.persona_id = p.persona_id
   order by gr.inicio, p.persona_id
   limit 5000;
$function$;
revoke execute on function public.asesores_grabaciones(text) from public, anon;
grant execute on function public.asesores_grabaciones(text) to authenticated;