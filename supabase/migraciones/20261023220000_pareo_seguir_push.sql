-- «Torneos en Pareo Integral»: los avisos de quien sigue a un jugador, también
-- como notificación en el celular (o la computadora), además del correo. Lo
-- pidió el dueño del sitio.
--
-- Sin cuenta, como el correo: se guarda lo que el navegador le da al sitio
-- para mandarle avisos a ESE aparato (el endpoint y sus dos llaves de
-- cifrado) y a quién sigue (su nombre sin tildes ni mayúsculas, o la huella
-- de su ID FIDE). Ningún nombre de persona, ningún correo. El aviso se cifra
-- para ese aparato: ni el servicio de notificaciones del navegador lo lee.
--
--   · No hace falta confirmar como con el correo: el permiso lo da la persona
--     en su propio navegador, y nadie puede suscribir el aparato de otro. Al
--     suscribirse llega un primer aviso, «Listo», que además comprueba que
--     funciona.
--   · La baja: con el endpoint, que solo conoce ese navegador (es una
--     dirección larga y secreta). Un endpoint que el servicio ya no reconoce
--     (404 o 410) se borra solo al primer aviso que falle.
--   · Como mucho 20 jugadores por aparato.
--   · Cada aviso sale una vez: la clave de pareo_avisos_push_enviados.
--
-- Solo la Edge Function pareo-publicar (service role) lee y escribe estas
-- tablas. Ver «Torneos en Pareo Integral: los avisos en el celular» en
-- docs/decisiones/juegos-y-torneos.md.

create table public.pareo_suscripciones_push (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null check (char_length(endpoint) between 20 and 1000 and endpoint ~ '^https://'),
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  clave text not null check (char_length(clave) between 2 and 100),
  ident text not null default '' check (ident ~ '^([0-9a-f]{24})?$'),
  creado timestamptz not null default now()
);
comment on table public.pareo_suscripciones_push is
  'Quien sigue a un jugador de Torneos en Pareo Integral con avisos en su aparato (push). Solo la lee y la escribe la Edge Function pareo-publicar (service role). Sin nombres de personas ni correos.';
create unique index pareo_suscripciones_push_una on public.pareo_suscripciones_push (endpoint, clave, ident);
create index pareo_suscripciones_push_clave_idx on public.pareo_suscripciones_push (clave);
create index pareo_suscripciones_push_ident_idx on public.pareo_suscripciones_push (ident) where ident <> '';
alter table public.pareo_suscripciones_push enable row level security;
revoke all on public.pareo_suscripciones_push from anon, authenticated;

create table public.pareo_avisos_push_enviados (
  suscripcion_id uuid not null references public.pareo_suscripciones_push (id) on delete cascade,
  torneo_id uuid not null references public.pareo_publicados (id) on delete cascade,
  que text not null check (que ~ '^(r[0-9]{1,2}|fin)$'),
  cuando timestamptz not null default now(),
  primary key (suscripcion_id, torneo_id, que)
);
comment on table public.pareo_avisos_push_enviados is
  'Cada aviso push que ya salió (suscripción, torneo, ronda o fin): su clave única hace que ninguno salga dos veces.';
create index pareo_avisos_push_enviados_torneo_idx on public.pareo_avisos_push_enviados (torneo_id);
alter table public.pareo_avisos_push_enviados enable row level security;
revoke all on public.pareo_avisos_push_enviados from anon, authenticated;

-- Suscribir un aparato a un jugador. Devuelve 'ok', 'tope' o 'invalido'.
create or replace function public.pareo_suscribir_push(p_endpoint text, p_p256dh text, p_auth text, p_nombre text, p_ident text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_clave text := public.pareo_clave(p_nombre);
  v_ident text := coalesce(p_ident, '');
begin
  if v_clave = '' or char_length(v_clave) < 2 or coalesce(p_endpoint, '') !~ '^https://' or v_ident !~ '^([0-9a-f]{24})?$' then
    return 'invalido';
  end if;
  perform pg_advisory_xact_lock(hashtext('pareo_push:' || p_endpoint));
  if not exists (select 1 from public.pareo_suscripciones_push where endpoint = p_endpoint and clave = v_clave and ident = v_ident)
     and (select count(*) from public.pareo_suscripciones_push where endpoint = p_endpoint) >= 20 then
    return 'tope';
  end if;
  insert into public.pareo_suscripciones_push (endpoint, p256dh, auth, clave, ident)
  values (p_endpoint, p_p256dh, p_auth, v_clave, v_ident)
  on conflict (endpoint, clave, ident) do update set p256dh = excluded.p256dh, auth = excluded.auth;
  return 'ok';
end;
$$;
revoke all on function public.pareo_suscribir_push(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.pareo_suscribir_push(text, text, text, text, text) to service_role;

-- Los aparatos que siguen a alguien de este torneo (la misma regla que el
-- correo: la huella, o el nombre si se siguió sin huella).
create or replace function public.pareo_suscriptores_push_de(p_torneo uuid)
returns table (suscripcion uuid, endpoint text, p256dh text, auth text, jugador text, nombre text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.endpoint, s.p256dh, s.auth, j->>'id', j->>'nombre'
    from public.pareo_publicados p
    cross join lateral jsonb_array_elements(coalesce(p.datos->'jugadores', '[]'::jsonb)) j
    join public.pareo_suscripciones_push s
      on (s.ident <> '' and j->>'ident' = s.ident) or (s.ident = '' and public.pareo_clave(j->>'nombre') = s.clave)
   where p.id = p_torneo and not p.oculto;
$$;
revoke all on function public.pareo_suscriptores_push_de(uuid) from public, anon, authenticated;
grant execute on function public.pareo_suscriptores_push_de(uuid) to service_role;

-- Dejar de seguir en este aparato: a un jugador (con su nombre y su huella
-- tal como se siguió) o, sin nombre, a todos.
create or replace function public.pareo_baja_push(p_endpoint text, p_nombre text, p_ident text)
returns void
language sql security definer set search_path = '' as $$
  delete from public.pareo_suscripciones_push
   where endpoint = p_endpoint
     and (coalesce(p_nombre, '') = '' or (clave = public.pareo_clave(p_nombre) and ident = coalesce(p_ident, '')));
$$;
revoke all on function public.pareo_baja_push(text, text, text) from public, anon, authenticated;
grant execute on function public.pareo_baja_push(text, text, text) to service_role;

-- Las cifras para quien administra (20261023213000), con los aparatos que
-- siguen a alguien.
create or replace function public.pareo_cifras()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb;
begin
  if not coalesce(public.soy_admin(), false) then
    raise exception 'Solo administración ve las cifras de Pareo Integral' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'torneos', (select count(*) from public.pareo_publicados where not oculto),
    'ocultos', (select count(*) from public.pareo_publicados where oculto),
    'por_mes', coalesce((select jsonb_agg(jsonb_build_object('mes', mes, 'torneos', n, 'jugadores', j) order by mes) from (
        select to_char(date_trunc('month', coalesce(fecha, (creado at time zone 'America/Costa_Rica')::date)), 'YYYY-MM') as mes,
               count(*) as n, sum(jugadores) as j
          from public.pareo_publicados
         where not oculto and coalesce(fecha, (creado at time zone 'America/Costa_Rica')::date)
               >= (date_trunc('month', now() at time zone 'America/Costa_Rica') - interval '11 months')::date
         group by 1) m), '[]'::jsonb),
    'organizadores', (select count(*) from public.pareo_organizadores where not oculto),
    'organizadores_activos', (select count(distinct organizador_id) from public.pareo_publicados
                               where organizador_id is not null and not oculto and actualizado >= now() - interval '90 days'),
    'verificados', (select count(*) from public.pareo_organizadores where verificado and not oculto),
    'jugadores', (select count(distinct persona) from public.pareo_resultados()),
    'suscripciones', (select count(*) from public.pareo_suscripciones where confirmada),
    'suscripciones_sin_confirmar', (select count(*) from public.pareo_suscripciones where not confirmada),
    'seguidores', (select count(distinct correo) from public.pareo_suscripciones where confirmada),
    'aparatos', (select count(distinct endpoint) from public.pareo_suscripciones_push),
    'avisos_30_dias', (select count(*) from public.pareo_avisos_enviados where cuando >= now() - interval '30 days')
                      + (select count(*) from public.pareo_avisos_push_enviados where cuando >= now() - interval '30 days'),
    'reportes_nuevos', (select count(*) from public.pareo_reportes where estado = 'nuevo'),
    'sellos_pendientes', (select count(*) from public.pareo_solicitudes_sello where estado = 'nueva'),
    'externos', (select jsonb_object_agg(fuente, n) from (select fuente, count(*) as n from public.torneos_externos group by fuente) e)
  ) into v;
  return v;
end;
$$;
revoke all on function public.pareo_cifras() from public, anon;
grant execute on function public.pareo_cifras() to authenticated;
