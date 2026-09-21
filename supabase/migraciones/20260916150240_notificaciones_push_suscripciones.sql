-- ============================================================================
-- Notificaciones push: a qué aparato hay que avisarle.
--
-- Una fila por APARATO, no por persona: quien entra en la compu y en el
-- celular tiene dos, y las dos reciben. La llave es el `endpoint`, que es la
-- dirección que le da el navegador a esa instalación concreta.
--
-- Las llaves VAPID (las que firman cada envío) NO están acá ni en ninguna
-- migración: las genera la propia Edge Function la primera vez y las guarda en
-- la bóveda (Vault). Así la privada no queda escrita en el historial de
-- migraciones ni en ningún archivo del repositorio.
-- ============================================================================

create table if not exists public.push_suscripciones (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  agente      text,
  activa      boolean not null default true,
  -- Cuando el navegador contesta que esa suscripción ya no vale (404/410), se
  -- apaga en vez de borrarse: así se ve si un aparato dejó de recibir.
  ultimo_error text,
  created_at  timestamptz not null default now(),
  usada_at    timestamptz
);
comment on table public.push_suscripciones is
  'A qué aparato avisarle por push. Una fila por aparato, no por persona: la llave es el endpoint que da el navegador.';

create index if not exists push_por_persona on public.push_suscripciones (user_id) where activa;

alter table public.push_suscripciones enable row level security;

-- El público no tiene nada que hacer acá.
revoke all on public.push_suscripciones from anon;

-- Cada quien maneja SOLO sus propios aparatos. Nadie lee los de nadie más —ni
-- los profesores—: para mandar un aviso no hace falta ver la suscripción, de
-- eso se encarga la Edge Function con la service role.
create policy push_lee_lo_suyo on public.push_suscripciones
  for select to authenticated using (user_id = auth.uid());
create policy push_agrega_lo_suyo on public.push_suscripciones
  for insert to authenticated with check (user_id = auth.uid());
create policy push_cambia_lo_suyo on public.push_suscripciones
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_borra_lo_suyo on public.push_suscripciones
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Las llaves VAPID, en la bóveda. Solo las toca la Edge Function con la
-- service role: a anon y a authenticated se les revoca el execute.
-- ---------------------------------------------------------------------------
create or replace function public.push_llaves_leer()
returns table (publica text, privada text)
language sql stable security definer set search_path = '' as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'push_vapid_publica'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'push_vapid_privada');
$$;
revoke all on function public.push_llaves_leer() from public, anon, authenticated;

create or replace function public.push_llaves_guardar(p_publica text, p_privada text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_publica is null or p_privada is null or p_publica = '' or p_privada = '' then
    raise exception 'Las llaves no pueden ir vacías';
  end if;
  -- Solo se crean una vez: si ya existen, no se pisan. Cambiarlas dejaría
  -- inservibles todas las suscripciones que ya hay.
  if exists (select 1 from vault.secrets where name = 'push_vapid_privada') then
    return;
  end if;
  perform vault.create_secret(p_publica, 'push_vapid_publica');
  perform vault.create_secret(p_privada, 'push_vapid_privada');
end;
$$;
revoke all on function public.push_llaves_guardar(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- El secreto con el que los disparadores de la base firman sus avisos, igual
-- que las tandas de informes y de cobros.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'tanda_push_secreto') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'tanda_push_secreto');
  end if;
end $$;

create or replace function public.secreto_tanda_push()
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'tanda_push_secreto';
$$;
revoke all on function public.secreto_tanda_push() from public, anon, authenticated;
