-- Las grabaciones dicen de qué fue la sesión y cuánto dura el video: en el
-- panel de taller se ven como una galería («Sesión I · Encuadre del curso y
-- reglas básicas», con «3:12:00» en la miniatura), como lo eligió el dueño.
--
-- El tema no sale del título del horario («Sesión I»), que es lo que se ve en
-- el calendario: va con la grabación. La duración tampoco se puede preguntar a
-- YouTube desde la página (la CSP no deja y el video no tiene por qué estar
-- público): se anota al poner la grabación. Las dos son opcionales.
--
-- Las dos funciones de la migración anterior cambian de forma (un parámetro y
-- dos columnas más), y eso en Postgres pide borrarlas. Borrar pide una
-- confirmación del dueño que desde la sesión que hizo esto no le llegaba, así
-- que no se borran: se apartan con otro nombre («_apartada») y sin permiso
-- para nadie, y las nuevas toman su lugar. No las llama nadie; cualquier
-- migración posterior puede borrarlas.
--
-- Ver «Las grabaciones de las sesiones» en docs/decisiones/paneles.md.

alter table public.grabaciones_clase
  add column tema text check (tema is null or char_length(btrim(tema)) between 2 and 120),
  add column duracion_seg integer check (duracion_seg is null or duracion_seg between 1 and 86400);

alter function public.mis_grabaciones() rename to mis_grabaciones_apartada;
revoke execute on function public.mis_grabaciones_apartada() from public, anon, authenticated;
comment on function public.mis_grabaciones_apartada() is 'Apartada: la reemplazó mis_grabaciones() con tema y duración. No la llama nadie; se puede borrar.';
alter function public.grabacion_clase_poner(uuid, date, text) rename to grabacion_clase_poner_apartada;
revoke execute on function public.grabacion_clase_poner_apartada(uuid, date, text) from public, anon, authenticated;
comment on function public.grabacion_clase_poner_apartada(uuid, date, text) is 'Apartada: la reemplazó grabacion_clase_poner() con tema y duración. No la llama nadie; se puede borrar.';

create function public.mis_grabaciones()
 returns table(horario_id uuid, fecha date, inicio timestamp with time zone, fin timestamp with time zone, titulo text, modalidad text, youtube_id text, tema text, duracion_seg integer)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select g.horario_id, g.fecha, o.inicio, o.fin, nullif(btrim(h.titulo), ''), o.modalidad, g.youtube_id, g.tema, g.duracion_seg
    from public.grabaciones_clase g
    join public.horario_clases h on h.id = g.horario_id
    cross join lateral public.ocurrencias_horario(h.profesor_id, g.fecha, g.fecha) o
   where g.horario_id in (select interno.horarios_del_alumno((select auth.uid())))
     and o.horario_id = g.horario_id
   order by o.inicio
   limit 100;
$function$;
revoke execute on function public.mis_grabaciones() from public, anon;
grant execute on function public.mis_grabaciones() to authenticated;

-- El tema y la duración se guardan tal como llegan: mandarlos vacíos los quita.
create function public.grabacion_clase_poner(p_horario uuid, p_fecha date, p_video text, p_tema text default null, p_duracion_seg integer default null)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_profesor uuid;
  v_texto text := btrim(coalesce(p_video, ''));
  v_tema text := nullif(btrim(coalesce(p_tema, '')), '');
  v_id text;
begin
  select h.profesor_id into v_profesor from public.horario_clases h where h.id = p_horario;
  if not coalesce(public.soy_admin() or (v_profesor is not null and v_profesor = (select auth.uid())), false) then
    raise exception 'Solo el profe de esa clase o quien administra pone su grabación.' using errcode = '42501';
  end if;
  if v_profesor is null then
    raise exception 'Esa clase ya no está en el horario.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.ocurrencias_horario(v_profesor, p_fecha, p_fecha) o where o.horario_id = p_horario) then
    raise exception 'Ese día no hay clase en ese horario.' using errcode = '22023';
  end if;

  if v_texto = '' then
    delete from public.grabaciones_clase where horario_id = p_horario and fecha = p_fecha;
    return null;
  end if;

  if v_texto ~ '^[A-Za-z0-9_-]{11}$' then
    v_id := v_texto;
  elsif v_texto ~* '^(https?://)?([a-z0-9-]+\.)*(youtube\.com|youtube-nocookie\.com|youtu\.be)/' then
    v_id := substring(v_texto from '(?:youtu\.be/|[?&]v=|/(?:embed|live|shorts)/)([A-Za-z0-9_-]{11})(?:[^A-Za-z0-9_-]|$)');
  end if;
  if v_id is null then
    raise exception 'Ese enlace no es de un video de YouTube.' using errcode = '22023';
  end if;
  if v_tema is not null and char_length(v_tema) not between 2 and 120 then
    raise exception 'El tema va de 2 a 120 caracteres.' using errcode = '22023';
  end if;
  if p_duracion_seg is not null and p_duracion_seg not between 1 and 86400 then
    raise exception 'La duración va en segundos, de 1 a 86 400.' using errcode = '22023';
  end if;

  insert into public.grabaciones_clase (horario_id, fecha, youtube_id, tema, duracion_seg, puesta_por)
  values (p_horario, p_fecha, v_id, v_tema, p_duracion_seg, (select auth.uid()))
  on conflict (horario_id, fecha) do update
    set youtube_id = excluded.youtube_id, tema = excluded.tema, duracion_seg = excluded.duracion_seg,
        puesta_por = excluded.puesta_por, puesta_en = now();

  return (select g.youtube_id from public.grabaciones_clase g where g.horario_id = p_horario and g.fecha = p_fecha);
end;
$function$;
revoke execute on function public.grabacion_clase_poner(uuid, date, text, text, integer) from public, anon;
grant execute on function public.grabacion_clase_poner(uuid, date, text, text, integer) to authenticated;