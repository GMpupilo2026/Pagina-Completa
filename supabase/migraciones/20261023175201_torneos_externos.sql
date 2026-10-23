-- «Torneos en Pareo Integral»: los torneos próximos de Costa Rica que se
-- anuncian en ajedrezcostarica.com, para que la portada y el calendario
-- muestren todo lo que viene y no solo lo que se organiza con Pareo Integral.
-- Lo pidió el dueño del sitio.
--
-- Una vez al día pg_cron llama a la Edge Function torneos-externos (con el
-- secreto de la bóveda, como los avisos a los árbitros), que lee la portada
-- de torneos de ajedrezcostarica.com y la ficha de cada uno, y escribe acá
-- con la service role. Se guarda solo lo que se muestra (nombre, fechas,
-- provincia, lugar, ritmo, Elo, precio, modalidad, quién organiza y si la
-- inscripción está abierta), nunca los correos ni las instrucciones de pago
-- que trae la ficha. Cada fila enlaza a su ficha de allá: es su anuncio.
--
-- Lectura pública; escritura solo de la función. Lo que ya terminó se borra
-- solo (la misma función, al día siguiente).
--
-- Ver «Torneos en Pareo Integral: los torneos de ajedrezcostarica.com» en
-- docs/decisiones/juegos-y-torneos.md.

create table public.torneos_externos (
  fuente text not null check (fuente in ('ajedrezcostarica')),
  id_externo integer not null check (id_externo > 0),
  titulo text not null check (char_length(btrim(titulo)) between 1 and 160),
  inicio timestamptz,
  fin timestamptz,
  provincia text not null default '',
  lugar text not null default '' check (char_length(lugar) <= 200),
  ritmo text not null default '' check (ritmo in ('', 'bala', 'blitz', 'rapido', 'clasico')),
  minutos smallint,
  incremento smallint,
  elo text not null default '' check (elo in ('', 'no', 'nacional', 'fide', 'ambos')),
  precio numeric(12, 2),
  moneda text not null default '' check (moneda ~ '^([A-Z]{3})?$'),
  modalidad text not null default '' check (modalidad in ('', 'presencial', 'en_linea')),
  formato text not null default '' check (formato in ('', 'individual', 'equipos')),
  organizador text not null default '' check (char_length(organizador) <= 120),
  inscripcion_abierta boolean not null default false,
  chess_results text not null default '' check (chess_results = '' or chess_results ~ '^https://(s[0-9]+\.)?chess-results\.com/'),
  url text not null check (url ~ '^https://ajedrezcostarica\.com/es/tournaments/[0-9]+$'),
  visto timestamptz not null default now(),
  primary key (fuente, id_externo)
);

comment on table public.torneos_externos is
  'Torneos próximos de Costa Rica anunciados en ajedrezcostarica.com, leídos una vez al día por la Edge Function torneos-externos. Lectura pública; la escribe solo la función.';

create index torneos_externos_inicio_idx on public.torneos_externos (inicio);

alter table public.torneos_externos enable row level security;
revoke all on public.torneos_externos from anon, authenticated;
grant select on public.torneos_externos to anon, authenticated;

create policy torneos_externos_lectura on public.torneos_externos
  for select to anon, authenticated
  using (true);

-- ---- quién la dispara ----
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'torneos_externos_secreto') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'torneos_externos_secreto');
  end if;
end;
$$;

create or replace function public.secreto_torneos_externos()
returns text language sql stable security definer set search_path to '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'torneos_externos_secreto';
$$;
revoke all on function public.secreto_torneos_externos() from public, anon, authenticated;
grant execute on function public.secreto_torneos_externos() to service_role;

create or replace function public.disparar_torneos_externos()
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  secreto text;
begin
  select decrypted_secret into secreto from vault.decrypted_secrets where name = 'torneos_externos_secreto';
  if secreto is null or secreto = '' then
    raise warning 'No hay secreto de torneos_externos: no se leyeron los torneos de ajedrezcostarica.com';
    return;
  end if;
  perform net.http_post(
    url := 'https://bgtijpimpcokxatxxbki.supabase.co/functions/v1/torneos-externos',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secreto),
    body := jsonb_build_object('accion', 'leer'),
    timeout_milliseconds := 120000
  );
end;
$$;
-- La corre pg_cron (como postgres). Nadie más.
revoke execute on function public.disparar_torneos_externos() from public, anon, authenticated;

-- Todos los días a las 5:13 de Costa Rica (11:13 UTC).
select cron.schedule('torneos-externos', '13 11 * * *', 'select public.disparar_torneos_externos();');
