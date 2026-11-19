-- La grabación del audio de la llamada de la clase.
--
-- La pidió el dueño el 17/11/2026: «guardar de forma automática el audio de la
-- clase cuando se hace una llamada», «para que repasen». Aprobó (17/11) lo que
-- esto cambia en lo que el sitio promete: el permiso de cada familia, 90 días y
-- quién escucha, y el texto de privacidad.
--
-- Se graba en el NAVEGADOR DEL PROFE (MediaRecorder juntando las voces que ya
-- le llegan), no en el servidor de LiveKit, que cobra la grabación por minuto.
-- La página sube cada parte (una cada pocos minutos, para no perder la clase
-- entera si se le cierra la pestaña) a un lugar privado del almacenamiento.
--
-- 1. permisos_grabar_voz: el permiso de la familia (o del alumno mayor de
--    edad) para grabar su voz, con la versión de la Política de privacidad que
--    aceptó y la hora del servidor. Solo lo escriben dar_permiso_grabar_voz() y
--    quitar_permiso_grabar_voz(), cada uno sobre su propia cuenta. Reparte un
--    permiso: lleva la bitácora de auditoría (y va en VIGILADAS).
-- 2. game_state.llamada_grabando: el profe la pone al grabar (la grabación
--    empieza sola al abrir la llamada y él la puede pausar). Solo vale con la
--    llamada abierta en esta clase. Viaja por Realtime: todos ven «Grabando».
-- 3. llamada_de_la_clase() dice si se graba y quién tiene permiso: **mientras
--    se graba, un alumno sin permiso no puede hablar**, lo diga el turno o el
--    micrófono libre. Lo hace cumplir el servidor de LiveKit con el permiso que
--    pone la función: nunca queda grabada la voz de alguien sin permiso.
-- 4. clase_grabaciones: una fila por parte grabada. La escribe
--    guardar_parte_grabacion() (el profe, de su clase, con el archivo ya
--    subido). La escuchan el profe de la clase, los alumnos que asistieron
--    (class_attendance) y la administración, con el acceso vigente.
-- 5. El bucket privado clase-grabaciones: sube el profe a
--    <su id>/<la clase>/…, solo de una clase suya abierta (o cerrada hace menos
--    de 30 minutos: la última parte se sube al terminar), y se lee lo que tiene
--    su fila en clase_grabaciones (la RLS de esa tabla decide).
-- 6. A los 90 días se borra sola: pg_cron llama cada noche a la Edge Function
--    clase-grabaciones-limpiar con el secreto de la bóveda (la base no puede
--    borrar archivos del almacenamiento desde SQL).
--
-- Ver «La grabación de la llamada» en docs/decisiones/clase-en-vivo.md.

-- ------------------------------------------------------------------ 1
create table if not exists public.permisos_grabar_voz (
  persona_id uuid primary key references public.profiles(id) on delete cascade,
  privacidad_version text not null,
  aceptado_en timestamptz not null default now()
);
alter table public.permisos_grabar_voz enable row level security;
comment on table public.permisos_grabar_voz is
  'El permiso de la familia (o del alumno mayor de edad) para grabar su voz en la llamada de la clase. Solo con dar_permiso_grabar_voz() y quitar_permiso_grabar_voz().';

drop policy if exists permisos_grabar_voz_select on public.permisos_grabar_voz;
create policy permisos_grabar_voz_select on public.permisos_grabar_voz for select to authenticated
  using (
    persona_id = (select auth.uid())
    or persona_id in (select interno.alumnos_de((select auth.uid())))
    or (select public.soy_admin())
  );

drop trigger if exists auditar on public.permisos_grabar_voz;
create trigger auditar after insert or update or delete on public.permisos_grabar_voz
  for each row execute function interno.auditar();

create or replace function public.dar_permiso_grabar_voz(p_version_privacidad text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := (select auth.uid());
begin
  if yo is null then
    raise exception 'Inicia sesión.' using errcode = '42501';
  end if;
  if not coalesce(interno.version_legal_valida(p_version_privacidad), false) then
    raise exception 'Falta aceptar la Política de privacidad.' using errcode = 'check_violation';
  end if;
  insert into public.permisos_grabar_voz (persona_id, privacidad_version, aceptado_en)
  values (yo, p_version_privacidad, now())
  on conflict (persona_id) do update
    set privacidad_version = excluded.privacidad_version, aceptado_en = excluded.aceptado_en;
  return true;
end;
$$;
revoke execute on function public.dar_permiso_grabar_voz(text) from public, anon;
grant execute on function public.dar_permiso_grabar_voz(text) to authenticated;

create or replace function public.quitar_permiso_grabar_voz()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := (select auth.uid());
begin
  if yo is null then
    raise exception 'Inicia sesión.' using errcode = '42501';
  end if;
  delete from public.permisos_grabar_voz where persona_id = yo;
  return true;
end;
$$;
revoke execute on function public.quitar_permiso_grabar_voz() from public, anon;
grant execute on function public.quitar_permiso_grabar_voz() to authenticated;

-- ------------------------------------------------------------------ 2
alter table public.game_state add column if not exists llamada_grabando boolean not null default false;
comment on column public.game_state.llamada_grabando is
  'Si el profe está grabando la llamada de voz (en su navegador). Solo vale con la llamada abierta en esta clase. Solo lo pone el profe.';

create or replace function public.protect_game_state_teacher_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  is_teacher boolean;
  yo uuid := (select auth.uid());
  mio text;
  turno text;
  movido text;
  antes int;
  despues int;
begin
  select exists(select 1 from public.profiles p where p.id = yo and p.role = 'profesor')
    into is_teacher;
  if not is_teacher then
    new.arrows := old.arrows;
    new.circles := old.circles;
    new.active_player_id := old.active_player_id;
    new.active_player_color := old.active_player_color;
    new.rival_id := old.rival_id;
    new.vista := old.vista;
    new.comentarios := old.comentarios;
    new.elegido := old.elegido;
    new.pensar := old.pensar;
    new.encuesta := old.encuesta;
    new.calentamiento := old.calentamiento;
    new.podio := old.podio;
    new.equipos := old.equipos;
    new.tanda_calentamiento := old.tanda_calentamiento;
    new.presentacion := old.presentacion;
    new.planilla := old.planilla;
    new.practica := old.practica;
    new.sticker := old.sticker;
    new.reloj := old.reloj;
    -- La llamada de voz la abre y la termina el profe (ver llamada_de_la_clase).
    new.llamada_sesion := old.llamada_sesion;
    new.llamada_modo := old.llamada_modo;
    new.llamada_grabando := old.llamada_grabando;

    -- Quien juega con un solo color mueve solo ese color, de a una jugada.
    if yo is not null and (yo = old.active_player_id or yo = old.rival_id) then
      mio := case when yo = old.active_player_id then old.active_player_color
                  when old.active_player_color = 'w' then 'b'
                  when old.active_player_color = 'b' then 'w' end;
      if mio is distinct from 'both' then
        antes := coalesce(jsonb_array_length(case when jsonb_typeof(old.moves) = 'array' then old.moves end), 0);
        despues := coalesce(jsonb_array_length(case when jsonb_typeof(new.moves) = 'array' then new.moves end), 0);
        turno := coalesce(nullif(split_part(coalesce(old.fen, ''), ' ', 2), ''), 'w');
        if despues = antes + 1 then
          movido := turno;
        elsif despues = antes - 1 then
          movido := case turno when 'w' then 'b' else 'w' end;
        elsif despues = antes and new.fen is not distinct from old.fen
              and new.start_fen is not distinct from old.start_fen then
          movido := null;
        else
          raise exception 'Con un solo color se juega de a una jugada.' using errcode = 'check_violation';
        end if;
        if movido is not null and movido is distinct from mio then
          raise exception 'Ese color no es el tuyo.' using errcode = 'check_violation';
        end if;
      end if;
    end if;
  else
    -- Sin control de un solo color no hay rival.
    if new.active_player_id is null
       or new.active_player_color not in ('w', 'b')
       or new.rival_id = new.active_player_id then
      new.rival_id := null;
    end if;
    if new.pensar is not null
       and (old.pensar is null or new.pensar->>'at' is distinct from old.pensar->>'at') then
      new.pensar := jsonb_set(new.pensar, '{at}', to_jsonb(now()));
    end if;
    -- Cada sticker que se manda lleva la hora de la base: con ella cada
    -- pantalla sabe si todavía se ve (y quien entra después no ve uno viejo).
    if jsonb_typeof(new.sticker) = 'object'
       and new.sticker is distinct from old.sticker then
      new.sticker := jsonb_set(new.sticker, '{at}', to_jsonb(now()));
    end if;
    -- Una tanda nueva (otra semilla) arranca con la hora de la base.
    -- (Solo a un objeto: lo que no lo es lo rechaza el CHECK, no un error de jsonb_set.)
    if jsonb_typeof(new.tanda_calentamiento) = 'object'
       and (jsonb_typeof(old.tanda_calentamiento) is distinct from 'object'
            or new.tanda_calentamiento->>'semilla' is distinct from old.tanda_calentamiento->>'semilla') then
      new.tanda_calentamiento := jsonb_set(new.tanda_calentamiento, '{at}', to_jsonb(now()));
    elsif jsonb_typeof(new.tanda_calentamiento) = 'object' then
      -- La misma tanda (el profe la termina antes): el arranque no se mueve.
      new.tanda_calentamiento := jsonb_set(new.tanda_calentamiento, '{at}', old.tanda_calentamiento->'at');
    end if;
  end if;
  return new;
end;
$function$;

revoke execute on function public.protect_game_state_teacher_columns() from public, anon, authenticated;

-- ------------------------------------------------------------------ 3
create or replace function public.llamada_de_la_clase(p_profesor uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  yo uuid := (select auth.uid());
  v_sesion uuid;
  v_rol text;
  v_elegido uuid;
  v_texto text;
  v_nombre text;
  v_sacados jsonb;
  v_abierta boolean;
  v_modo text;
  v_grabando boolean;
  v_permiso boolean;
  v_con_permiso jsonb;
begin
  if yo is null or p_profesor is null then
    return null;
  end if;

  select c.id into v_sesion
    from public.class_sessions c
   where c.created_by = p_profesor and c.ended_at is null
   order by c.started_at desc
   limit 1;
  if v_sesion is null then
    return null;
  end if;

  if yo = p_profesor then
    if not exists (select 1 from public.profiles p where p.id = yo and p.role = 'profesor') then
      return null;
    end if;
    v_rol := 'profe';
  elsif coalesce(public.es_mi_profesor(p_profesor), false) then
    if exists (select 1 from public.clase_sacados s
                where s.class_session_id = v_sesion and s.student_id = yo and s.devuelto_at is null) then
      return null;
    end if;
    v_rol := 'alumno';
  else
    return null;
  end if;

  -- El turno de la clase. Un id que no sea un uuid no le da la palabra a nadie
  -- (y no revienta el cast).
  select g.elegido->>'id', g.llamada_sesion is not distinct from v_sesion, g.llamada_modo, g.llamada_grabando
    into v_texto, v_abierta, v_modo, v_grabando
    from public.game_state g where g.owner_id = p_profesor;
  v_abierta := coalesce(v_abierta, false);
  -- Se graba solo con la llamada abierta en esta clase.
  v_grabando := v_abierta and coalesce(v_grabando, false);
  -- Quién puede hablar solo vale con la llamada abierta en esta clase; si no,
  -- el de siempre: el turno.
  v_modo := case when v_abierta then coalesce(v_modo, 'turno') else 'turno' end;
  -- El alumno entra solo si el profe abrió la llamada en ESTA clase.
  if v_rol = 'alumno' and not v_abierta then
    return null;
  end if;
  if v_texto ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_elegido := v_texto::uuid;
  end if;

  select coalesce(nullif(trim(p.full_name), ''), 'Sin nombre') into v_nombre
    from public.profiles p where p.id = yo;

  if v_rol = 'profe' then
    select coalesce(jsonb_agg(s.student_id), '[]'::jsonb) into v_sacados
      from public.clase_sacados s
     where s.class_session_id = v_sesion and s.devuelto_at is null;
    -- Sus alumnos cuya familia dio permiso para grabar su voz: con la clase
    -- grabándose, «sincronizar» no le da la palabra a nadie fuera de esta lista.
    select coalesce(jsonb_agg(v.persona_id), '[]'::jsonb) into v_con_permiso
      from public.permisos_grabar_voz v
     where v.persona_id in (select interno.alumnos_de(yo));
  else
    v_permiso := exists (select 1 from public.permisos_grabar_voz v where v.persona_id = yo);
  end if;

  return jsonb_build_object(
    'yo', yo,
    'rol', v_rol,
    'sala', 'clase-' || v_sesion,
    'nombre', coalesce(v_nombre, 'Sin nombre'),
    'elegido', v_elegido,
    'sacados', v_sacados,
    'abierta', v_abierta,
    'modo', v_modo,
    'grabando', v_grabando,
    'permiso_voz', v_permiso,
    'con_permiso_voz', v_con_permiso
  );
end;
$$;

revoke execute on function public.llamada_de_la_clase(uuid) from public, anon;
grant execute on function public.llamada_de_la_clase(uuid) to authenticated;

-- ------------------------------------------------------------------ 4
create table if not exists public.clase_grabaciones (
  id uuid primary key default gen_random_uuid(),
  class_session_id uuid not null references public.class_sessions(id) on delete cascade,
  profesor_id uuid not null references public.profiles(id) on delete cascade,
  parte integer not null,
  ruta text not null unique,
  segundos integer not null check (segundos >= 0),
  bytes bigint,
  creado_en timestamptz not null default now(),
  unique (class_session_id, parte)
);
create index if not exists clase_grabaciones_clase_idx on public.clase_grabaciones (class_session_id);
create index if not exists clase_grabaciones_creado_idx on public.clase_grabaciones (creado_en);
create index if not exists clase_grabaciones_profesor_idx on public.clase_grabaciones (profesor_id);
alter table public.clase_grabaciones enable row level security;
comment on table public.clase_grabaciones is
  'Las partes grabadas del audio de la llamada de la clase (en el navegador del profe). Las escuchan el profe, los que asistieron y administración. Se borran a los 90 días.';

-- El conjunto de las clases a las que asistió, armado UNA vez (no fila por fila).
drop policy if exists clase_grabaciones_select on public.clase_grabaciones;
create policy clase_grabaciones_select on public.clase_grabaciones for select to authenticated
  using (
    profesor_id = (select auth.uid())
    or class_session_id in (select a.session_id from public.class_attendance a where a.student_id = (select auth.uid()))
    or (select public.soy_admin())
  );
drop policy if exists clase_grabaciones_exige_acceso_sel on public.clase_grabaciones;
create policy clase_grabaciones_exige_acceso_sel on public.clase_grabaciones as restrictive for select to authenticated
  using ((select public.acceso_vigente()));

create or replace function public.guardar_parte_grabacion(p_clase uuid, p_ruta text, p_segundos integer, p_bytes bigint)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := (select auth.uid());
  v_id uuid;
begin
  if yo is null then
    raise exception 'Inicia sesión.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.class_sessions c
                  where c.id = p_clase and c.created_by = yo
                    and (c.ended_at is null or c.ended_at > now() - interval '30 minutes')) then
    raise exception 'Esa clase no es tuya o ya se cerró.' using errcode = '42501';
  end if;
  if p_ruta is null or p_ruta not like yo::text || '/' || p_clase::text || '/%' then
    raise exception 'La parte no está en la carpeta de tu clase.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'clase-grabaciones' and o.name = p_ruta) then
    raise exception 'La parte todavía no está subida.' using errcode = 'check_violation';
  end if;
  insert into public.clase_grabaciones (class_session_id, profesor_id, parte, ruta, segundos, bytes)
  values (p_clase, yo,
          coalesce((select max(g.parte) from public.clase_grabaciones g where g.class_session_id = p_clase), 0) + 1,
          p_ruta, greatest(coalesce(p_segundos, 0), 0), p_bytes)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.guardar_parte_grabacion(uuid, text, integer, bigint) from public, anon;
grant execute on function public.guardar_parte_grabacion(uuid, text, integer, bigint) to authenticated;

-- ------------------------------------------------------------------ 5
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clase-grabaciones', 'clase-grabaciones', false, 31457280, array['audio/webm', 'audio/ogg', 'audio/mp4'])
on conflict (id) do nothing;

drop policy if exists clase_grabaciones_subir on storage.objects;
create policy clase_grabaciones_subir on storage.objects for insert to authenticated
  with check (
    bucket_id = 'clase-grabaciones'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.class_sessions c
                 where c.id::text = (storage.foldername(name))[2]
                   and c.created_by = (select auth.uid())
                   and (c.ended_at is null or c.ended_at > now() - interval '30 minutes'))
  );

drop policy if exists clase_grabaciones_leer on storage.objects;
create policy clase_grabaciones_leer on storage.objects for select to authenticated
  using (
    bucket_id = 'clase-grabaciones'
    and exists (select 1 from public.clase_grabaciones g where g.ruta = objects.name)
  );

-- ------------------------------------------------------------------ 6
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'grabaciones_limpiar_secreto') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'grabaciones_limpiar_secreto');
  end if;
end $$;

create or replace function public.secreto_grabaciones_limpiar()
returns text language sql stable security definer set search_path to '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'grabaciones_limpiar_secreto';
$$;
revoke all on function public.secreto_grabaciones_limpiar() from public, anon, authenticated;
grant execute on function public.secreto_grabaciones_limpiar() to service_role;

create or replace function public.limpiar_grabaciones_viejas()
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  secreto text;
begin
  if not exists (select 1 from public.clase_grabaciones where creado_en < now() - interval '90 days') then
    return 'nada que borrar';
  end if;
  select decrypted_secret into secreto from vault.decrypted_secrets where name = 'grabaciones_limpiar_secreto';
  if secreto is null or secreto = '' then
    raise warning 'No hay secreto de grabaciones_limpiar: no se borraron las grabaciones vencidas';
    return 'sin secreto';
  end if;
  perform net.http_post(
    url := 'https://bgtijpimpcokxatxxbki.supabase.co/functions/v1/clase-grabaciones-limpiar',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secreto),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  return 'pedido el borrado';
end;
$$;
revoke execute on function public.limpiar_grabaciones_viejas() from public, anon, authenticated;
comment on function public.limpiar_grabaciones_viejas() is
  'Cada noche (pg_cron limpiar-grabaciones): si hay grabaciones de la llamada de más de 90 días, le pide a clase-grabaciones-limpiar que las borre (archivo y fila).';

select cron.unschedule('limpiar-grabaciones') where exists (select 1 from cron.job where jobname = 'limpiar-grabaciones');
select cron.schedule('limpiar-grabaciones', '40 7 * * *', 'select public.limpiar_grabaciones_viejas();');
