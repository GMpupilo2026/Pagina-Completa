-- «Torneos en Pareo Integral»: el correo de quien organiza (para avisarle de
-- inscripciones y reportes y para recuperar su organización si la pierde),
-- pedir el sello «Verificado» y el historial de la moderación con su motivo.
-- Lo pidió el dueño del sitio (la 1, la 2, la 3 y la 8 de una lista de
-- propuestas).
--
-- El correo es opcional y no lo lee nadie de afuera: la lectura pública de
-- pareo_organizadores va por columnas y estas no están en la lista. Hasta que
-- quien organiza toca el enlace del correo de confirmación, no se usa para
-- nada (correo_confirmado nulo): así nadie llena el buzón de otro poniendo su
-- dirección. De las claves de un solo uso (confirmar, recuperar) queda solo el
-- sha256, con su vencimiento. Todo lo escribe la Edge Function pareo-publicar.
--
-- Ver «Torneos en Pareo Integral: el correo del organizador, el sello y el
-- historial» en docs/decisiones/juegos-y-torneos.md.

alter table public.pareo_organizadores
  add column correo text check (correo is null or (char_length(correo) <= 200 and correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  add column correo_confirmado timestamptz,
  add column correo_consentimiento timestamptz,
  add column correo_token_hash text check (correo_token_hash is null or correo_token_hash ~ '^[0-9a-f]{64}$'),
  add column correo_token_vence timestamptz,
  add column recuperar_token_hash text check (recuperar_token_hash is null or recuperar_token_hash ~ '^[0-9a-f]{64}$'),
  add column recuperar_token_vence timestamptz;

comment on column public.pareo_organizadores.correo is
  'Correo de quien organiza (opcional, no se lee desde afuera). Se usa solo después de confirmarlo (correo_confirmado).';

create index pareo_organizadores_correo_idx on public.pareo_organizadores (lower(correo)) where correo_confirmado is not null;

-- ---- pedir el sello ----
-- Quien organiza lo pide desde Pareo Integral (con su clave); lo lee y lo
-- resuelve solo administración (public.pareo_moderar_con_motivo).
create table public.pareo_solicitudes_sello (
  id uuid primary key default gen_random_uuid(),
  organizador_id uuid not null references public.pareo_organizadores (id) on delete cascade,
  quien text not null check (char_length(btrim(quien)) between 2 and 120),
  representa text not null check (char_length(btrim(representa)) between 2 and 200),
  contacto text not null check (char_length(btrim(contacto)) between 5 and 160),
  nota text not null default '' check (char_length(nota) <= 800),
  consentimiento timestamptz not null,
  estado text not null default 'nueva' check (estado in ('nueva', 'aprobada', 'rechazada')),
  creado timestamptz not null default now(),
  resuelto timestamptz
);

comment on table public.pareo_solicitudes_sello is
  'Quien organiza pide el sello «Verificado». La escribe la Edge Function pareo-publicar; la lee y la resuelve solo administración.';

-- Una sola pendiente por organización: pedirlo dos veces no hace dos filas.
create unique index pareo_solicitudes_sello_una_nueva on public.pareo_solicitudes_sello (organizador_id) where estado = 'nueva';
create index pareo_solicitudes_sello_estado_idx on public.pareo_solicitudes_sello (estado, creado desc);

alter table public.pareo_solicitudes_sello enable row level security;
revoke all on public.pareo_solicitudes_sello from anon, authenticated;
grant select on public.pareo_solicitudes_sello to authenticated;

create policy pareo_solicitudes_sello_admin on public.pareo_solicitudes_sello
  for select to authenticated
  using ((select public.soy_admin()));

create trigger auditar after update of estado on public.pareo_solicitudes_sello
  for each row execute function interno.auditar('estado');

-- ---- el historial de la moderación ----
-- Qué se hizo, sobre qué, quién y por qué. Lo escribe solo la función de
-- abajo; no se cambia ni se borra desde afuera.
create table public.pareo_moderaciones (
  id bigint generated always as identity primary key,
  que text not null,
  objeto_id uuid not null,
  nombre text not null default '',
  motivo text not null default '' check (char_length(motivo) <= 500),
  quien uuid,
  cuando timestamptz not null default now()
);

comment on table public.pareo_moderaciones is
  'Historial de la moderación de «Torneos en Pareo Integral»: lo escribe public.pareo_moderar_con_motivo y lo lee solo administración.';

create index pareo_moderaciones_cuando_idx on public.pareo_moderaciones (cuando desc);

alter table public.pareo_moderaciones enable row level security;
revoke all on public.pareo_moderaciones from anon, authenticated;
grant select on public.pareo_moderaciones to authenticated;

create policy pareo_moderaciones_admin on public.pareo_moderaciones
  for select to authenticated
  using ((select public.soy_admin()));

-- ---- el freno de los correos sin cuenta ----
-- Confirmar el correo, recuperar la organización y pedir el sello mandan un
-- correo: 5 por conexión en una hora y 100 en total, por ámbito.
create or replace function public.pareo_correo_frenar(p_ip text, p_ambito text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_ip text := nullif(btrim(coalesce(p_ip, '')), '');
  v_ambito text := coalesce(p_ambito, '');
begin
  if v_ambito not in ('confirmar', 'recuperar', 'sello') then
    return 'Envío desconocido.';
  end if;
  perform pg_advisory_xact_lock(hashtext('envios_publicos:pareo-correo'));
  if v_ip is not null and (select count(*) from interno.envios_publicos
        where tipo = 'pareo' and ambito = v_ambito and ip = v_ip
          and creado > now() - interval '1 hour') >= 5 then
    return 'Ya se mandaron varios correos seguidos desde tu conexión. Espera un rato e intenta de nuevo.';
  end if;
  if (select count(*) from interno.envios_publicos
        where tipo = 'pareo' and ambito = v_ambito
          and creado > now() - interval '1 hour') >= 100 then
    return 'Están saliendo demasiados correos en este momento. Intenta de nuevo en una hora.';
  end if;
  insert into interno.envios_publicos (tipo, ambito, ip, correo) values ('pareo', v_ambito, v_ip, null);
  return null;
end;
$$;
revoke all on function public.pareo_correo_frenar(text, text) from public, anon, authenticated;

-- ---- lo que hace quien administra, con su motivo ----
-- La misma puerta de antes (pareo_moderar) y además resolver una solicitud
-- del sello; cada acción queda en el historial con su motivo.
--   p_que: 'verificar' | 'quitar_sello' | 'ocultar_org' | 'mostrar_org'
--          (p_id = la organización), 'ocultar' | 'mostrar' (p_id = el
--          torneo), 'revisado' (p_id = el reporte), 'aprobar_sello' |
--          'rechazar_sello' (p_id = la solicitud).
create or replace function public.pareo_moderar_con_motivo(p_que text, p_id uuid, p_motivo text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb;
  v_nombre text := '';
  v_org uuid;
begin
  if not coalesce((select public.soy_admin()), false) then
    raise exception 'Solo administración modera la lista de torneos.' using errcode = '42501';
  end if;
  if p_que in ('verificar', 'quitar_sello', 'ocultar_org', 'mostrar_org') then
    update public.pareo_organizadores set
      verificado = case p_que when 'verificar' then true when 'quitar_sello' then false else verificado end,
      oculto = case p_que when 'ocultar_org' then true when 'mostrar_org' then false else oculto end,
      actualizado = now()
    where id = p_id;
    select jsonb_build_object('id', o.id, 'verificado', o.verificado, 'oculto', o.oculto), o.nombre into v, v_nombre
      from public.pareo_organizadores o where o.id = p_id;
  elsif p_que in ('ocultar', 'mostrar') then
    update public.pareo_publicados set oculto = (p_que = 'ocultar') where id = p_id;
    select jsonb_build_object('id', t.id, 'oculto', t.oculto), t.nombre into v, v_nombre from public.pareo_publicados t where t.id = p_id;
  elsif p_que = 'revisado' then
    update public.pareo_reportes set estado = 'revisado' where id = p_id;
    select jsonb_build_object('id', r.id, 'estado', r.estado), coalesce(t.nombre, '') into v, v_nombre
      from public.pareo_reportes r left join public.pareo_publicados t on t.id = r.publicado_id where r.id = p_id;
  elsif p_que in ('aprobar_sello', 'rechazar_sello') then
    update public.pareo_solicitudes_sello set estado = case p_que when 'aprobar_sello' then 'aprobada' else 'rechazada' end, resuelto = now()
      where id = p_id and estado = 'nueva'
      returning organizador_id into v_org;
    if v_org is not null and p_que = 'aprobar_sello' then
      update public.pareo_organizadores set verificado = true, actualizado = now() where id = v_org;
    end if;
    select jsonb_build_object('id', s.id, 'estado', s.estado, 'verificado', o.verificado), o.nombre into v, v_nombre
      from public.pareo_solicitudes_sello s join public.pareo_organizadores o on o.id = s.organizador_id where s.id = p_id;
  else
    raise exception 'Acción desconocida: %', p_que using errcode = '22023';
  end if;
  if v is null then
    raise exception 'No existe.' using errcode = 'P0002';
  end if;
  insert into public.pareo_moderaciones (que, objeto_id, nombre, motivo, quien)
    values (p_que, p_id, coalesce(v_nombre, ''), left(btrim(coalesce(p_motivo, '')), 500), (select auth.uid()));
  return v;
end;
$$;
revoke all on function public.pareo_moderar_con_motivo(text, uuid, text) from public, anon;
grant execute on function public.pareo_moderar_con_motivo(text, uuid, text) to authenticated;

-- La de antes sigue andando (una pestaña abierta con la página vieja): llama
-- a la nueva sin motivo. Una sola copia de lo que hace.
create or replace function public.pareo_moderar(p_que text, p_id uuid)
returns jsonb
language sql security definer set search_path = '' as $$
  select public.pareo_moderar_con_motivo(p_que, p_id, '');
$$;
revoke all on function public.pareo_moderar(text, uuid) from public, anon;
grant execute on function public.pareo_moderar(text, uuid) to authenticated;
