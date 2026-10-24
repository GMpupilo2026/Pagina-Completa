-- Los avisos en el celular de una sala de Torneos (el Centroamericano 2026):
-- «Avisarme en este celular» en centroamericano-2026.html manda, cuando
-- chess-results publica una ronda, la mesa, el color y el rival de cada
-- jugador que sigue ese aparato. Lo pidió el dueño del sitio.
--
-- Sin cuenta y sin correo, como los de Pareo Integral: se guarda lo que el
-- navegador le da al sitio para avisarle a ESE aparato (el endpoint y sus dos
-- llaves), la sala, el idioma y a quién sigue (el número de torneo de
-- chess-results, su número inicial y el nombre que se muestra en el aviso,
-- que es público en chess-results). Como mucho 20 jugadores por aparato.
--
-- Solo la escribe y la lee la Edge Function sala-jugadores, con la service
-- role: ni anon ni authenticated tienen nada sobre estas tablas.
--
-- Cada aviso sale una vez: se anota antes de mandarlo en
-- sala_avisos_push_enviados, cuya clave primaria lo impide dos veces.
--
-- Quién revisa si hay ronda nueva: pg_cron, cada 5 minutos y solo del 1 al 8
-- de noviembre (UTC), llama a la función con el secreto de la bóveda, como
-- torneos-externos. Si no hay suscripciones, la función termina sin leer
-- chess-results.
--
-- Ver «Seguir a mis jugadores y los avisos en el celular» en
-- docs/decisiones/juegos-y-torneos.md.

create table public.sala_suscripciones_push (
  id uuid primary key default gen_random_uuid(),
  sala text not null check (sala ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(sala) <= 40),
  endpoint text not null check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{20,200}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{8,100}$'),
  idioma text not null default 'es' check (idioma in ('es', 'en')),
  jugadores jsonb not null check (jsonb_typeof(jugadores) = 'array' and jsonb_array_length(jugadores) between 1 and 20),
  creada timestamptz not null default now(),
  actualizada timestamptz not null default now(),
  unique (sala, endpoint)
);

comment on table public.sala_suscripciones_push is
  'Los aparatos que piden aviso cuando sale la ronda de sus jugadores en una sala de Torneos (Centroamericano 2026). Solo la usa la Edge Function sala-jugadores.';

create table public.sala_avisos_push_enviados (
  suscripcion_id uuid not null references public.sala_suscripciones_push (id) on delete cascade,
  tnr text not null check (tnr ~ '^[0-9]{1,9}$'),
  no integer not null check (no > 0),
  ronda integer not null check (ronda > 0),
  enviado timestamptz not null default now(),
  primary key (suscripcion_id, tnr, no, ronda)
);

comment on table public.sala_avisos_push_enviados is
  'Cada aviso de ronda que ya salió, para que no salga dos veces. Solo la usa la Edge Function sala-jugadores.';

alter table public.sala_suscripciones_push enable row level security;
alter table public.sala_avisos_push_enviados enable row level security;
revoke all on public.sala_suscripciones_push from public, anon, authenticated;
revoke all on public.sala_avisos_push_enviados from public, anon, authenticated;

-- ---- el freno de las altas (sin cuenta: por la conexión y en total) ----
create or replace function public.sala_avisos_frenar(p_ip text)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_ip text := nullif(btrim(coalesce(p_ip, '')), '');
begin
  perform pg_advisory_xact_lock(hashtext('envios_publicos:sala-avisos'));
  if v_ip is not null and (select count(*) from interno.envios_publicos
        where tipo = 'sala' and ambito = 'avisos' and ip = v_ip
          and creado > now() - interval '1 hour') >= 10 then
    return 'Ya se activaron varios avisos seguidos desde tu conexión. Espera un rato e intenta de nuevo.';
  end if;
  if (select count(*) from interno.envios_publicos
        where tipo = 'sala' and ambito = 'avisos'
          and creado > now() - interval '1 hour') >= 300 then
    return 'Se están activando demasiados avisos en este momento. Intenta de nuevo en una hora.';
  end if;
  insert into interno.envios_publicos (tipo, ambito, ip, correo) values ('sala', 'avisos', v_ip, null);
  return null;
end;
$$;
revoke all on function public.sala_avisos_frenar(text) from public, anon, authenticated;
grant execute on function public.sala_avisos_frenar(text) to service_role;

-- ---- quién la dispara ----
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'sala_avisos_secreto') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'sala_avisos_secreto');
  end if;
end;
$$;

create or replace function public.secreto_sala_avisos()
returns text language sql stable security definer set search_path to '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'sala_avisos_secreto';
$$;
revoke all on function public.secreto_sala_avisos() from public, anon, authenticated;
grant execute on function public.secreto_sala_avisos() to service_role;

create or replace function public.disparar_sala_avisos()
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  secreto text;
begin
  -- Sin nadie suscrito, ni siquiera se llama a la función.
  if not exists (select 1 from public.sala_suscripciones_push) then
    return;
  end if;
  select decrypted_secret into secreto from vault.decrypted_secrets where name = 'sala_avisos_secreto';
  if secreto is null or secreto = '' then
    raise warning 'No hay secreto de sala_avisos: no se revisaron las rondas';
    return;
  end if;
  perform net.http_post(
    url := 'https://bgtijpimpcokxatxxbki.supabase.co/functions/v1/sala-jugadores',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secreto),
    body := jsonb_build_object('accion', 'revisar'),
    timeout_milliseconds := 120000
  );
end;
$$;
-- La corre pg_cron (como postgres). Nadie más.
revoke execute on function public.disparar_sala_avisos() from public, anon, authenticated;

-- Cada 5 minutos, solo del 1 al 8 de noviembre (UTC): los días del festival.
select cron.schedule('sala-avisos', '*/5 * 1-8 11 *', 'select public.disparar_sala_avisos();');
