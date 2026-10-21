-- Las grabaciones de las clases: el video de YouTube de una sesión que ya
-- pasó, para que quien la siguió la repase y quien faltó la vea. Lo pidió el
-- dueño para el taller «Formación Ajedrez» de los asesores del MEP (las
-- sesiones duran tres y cuatro horas y quedaron grabadas en Teams); salen en
-- el calendario del panel de taller.
--
-- Una grabación es de UNA ocurrencia (horario + fecha), no de la fila del
-- horario: una fila semanal es muchas clases, y cada una tiene su video. En el
-- taller cada sesión ya es su propia fila (desde = hasta), pero la regla es la
-- misma para cualquier horario.
--
-- Se guarda solo el id del video (11 caracteres), no el enlace: lo que se
-- pinta lo arma la página con youtube-nocookie, que es lo que deja la CSP. El
-- video es «No listado»: quien tiene el id lo puede ver, así que el id solo se
-- le da a quien le toca esa clase, con la misma regla de «Tu próxima clase».
--
-- La escribe grabacion_clase_poner() (el profe de esa clase o quien
-- administra), que valida; la tabla no tiene política de escritura. No
-- reparte permisos ni accesos: no lleva bitácora.
--
-- De paso, «a quién le toca esta clase» deja de estar copiado: vivía igual en
-- mis_clases_proximas() y mi_proxima_clase(), y la función nueva habría sido
-- la tercera copia. Ahora es interno.horarios_del_alumno() y las tres la usan.
--
-- Ver «Las grabaciones de las sesiones» en docs/decisiones/paneles.md.

create table public.grabaciones_clase (
  horario_id uuid not null references public.horario_clases(id) on delete cascade,
  fecha date not null,
  youtube_id text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  puesta_por uuid references public.profiles(id) on delete set null,
  puesta_en timestamptz not null default now(),
  primary key (horario_id, fecha)
);
comment on table public.grabaciones_clase is
  'El video (YouTube, no listado) de una clase que ya pasó: una ocurrencia del horario. La escribe grabacion_clase_poner(); el alumno la lee con mis_grabaciones().';
create index grabaciones_clase_puesta_por_idx on public.grabaciones_clase (puesta_por);
alter table public.grabaciones_clase enable row level security;
revoke all on public.grabaciones_clase from public, anon, authenticated;
grant select on public.grabaciones_clase to authenticated;
-- El profe ve las de sus clases y quien administra todas. El alumno no lee la
-- tabla: le llegan las suyas por mis_grabaciones().
create policy grabaciones_clase_ver on public.grabaciones_clase
  for select to authenticated
  using (
    (select public.soy_admin())
    or horario_id in (select h.id from public.horario_clases h where h.profesor_id = (select auth.uid()))
  );

-- Las clases (filas de horario_clases) que le tocan a un alumno: las de sus
-- profes, de su subgrupo o, si no tienen subgrupo, de su grupo (sin tildes ni
-- mayúsculas). Es la regla que tenían copiada mis_clases_proximas() y
-- mi_proxima_clase(). La llaman funciones SECURITY DEFINER, ninguna política.
create or replace function interno.horarios_del_alumno(p_alumno uuid)
 returns setof uuid
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  with yo as (
    select p.id, translate(lower(btrim(coalesce(p.grupo, ''))), 'áéíóúüñ', 'aeiouun') as g
      from public.profiles p
     where p.id = p_alumno
  )
  select h.id
    from public.horario_clases h, yo
   where h.profesor_id in (select interno.profesores_de(yo.id))
     and ((h.subgrupo_id is not null
           and exists (select 1 from public.subgrupo_alumnos sa
                        where sa.subgrupo_id = h.subgrupo_id and sa.alumno_id = yo.id))
       or (h.subgrupo_id is null and h.grupo is not null and yo.g <> ''
           and translate(lower(btrim(h.grupo)), 'áéíóúüñ', 'aeiouun') = yo.g));
$function$;
revoke execute on function interno.horarios_del_alumno(uuid) from public, anon, authenticated;

create or replace function public.mis_clases_proximas(p_dias integer default 28)
 returns table(horario_id uuid, inicio timestamp with time zone, fin timestamp with time zone, titulo text, modalidad text, profesor text)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select h.id, o.inicio, o.fin, nullif(btrim(h.titulo), ''), o.modalidad,
         nullif(btrim(pr.full_name), '')
    from public.horario_clases h
    cross join lateral public.ocurrencias_horario(
      h.profesor_id,
      (now() at time zone 'America/Costa_Rica')::date,
      (now() at time zone 'America/Costa_Rica')::date + least(greatest(coalesce(p_dias, 28), 1), 90)) o
    join public.profiles pr on pr.id = h.profesor_id
   where h.id in (select interno.horarios_del_alumno((select auth.uid())))
     and o.horario_id = h.id
     and o.fin > now()
   order by o.inicio
   limit 200;
$function$;

create or replace function public.mi_proxima_clase()
 returns table(inicio timestamp with time zone, fin timestamp with time zone, titulo text, modalidad text, profesor text)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select o.inicio, o.fin, nullif(btrim(h.titulo), ''), o.modalidad,
         nullif(btrim(pr.full_name), '')
    from public.horario_clases h
    cross join lateral public.ocurrencias_horario(
      h.profesor_id,
      (now() at time zone 'America/Costa_Rica')::date,
      (now() at time zone 'America/Costa_Rica')::date + 7) o
    join public.profiles pr on pr.id = h.profesor_id
   where h.id in (select interno.horarios_del_alumno((select auth.uid())))
     and o.horario_id = h.id
     and o.fin > now()
   order by o.inicio
   limit 1;
$function$;

-- Las grabaciones de las clases que me tocan, de la más vieja a la más nueva.
-- Contesta solo sobre quien pregunta. La fecha tiene que seguir siendo una
-- clase de ese horario: si el profe lo cambia y ese día ya no hay clase, la
-- grabación no se muestra (no habría con qué decir cuándo fue).
create or replace function public.mis_grabaciones()
 returns table(horario_id uuid, fecha date, inicio timestamp with time zone, fin timestamp with time zone, titulo text, modalidad text, youtube_id text)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select g.horario_id, g.fecha, o.inicio, o.fin, nullif(btrim(h.titulo), ''), o.modalidad, g.youtube_id
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

-- Pone (o cambia) la grabación de una clase; vacía, la quita. Acepta el enlace
-- tal como lo da YouTube (youtu.be/…, watch?v=…, /live/…, /embed/…, /shorts/…)
-- o el id solo. Solo el profe de esa clase o quien administra. Devuelve el id
-- que quedó, leído otra vez de la tabla.
create or replace function public.grabacion_clase_poner(p_horario uuid, p_fecha date, p_video text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_profesor uuid;
  v_texto text := btrim(coalesce(p_video, ''));
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

  insert into public.grabaciones_clase (horario_id, fecha, youtube_id, puesta_por)
  values (p_horario, p_fecha, v_id, (select auth.uid()))
  on conflict (horario_id, fecha) do update
    set youtube_id = excluded.youtube_id, puesta_por = excluded.puesta_por, puesta_en = now();

  return (select g.youtube_id from public.grabaciones_clase g where g.horario_id = p_horario and g.fecha = p_fecha);
end;
$function$;
revoke execute on function public.grabacion_clase_poner(uuid, date, text) from public, anon;
grant execute on function public.grabacion_clase_poner(uuid, date, text) to authenticated;