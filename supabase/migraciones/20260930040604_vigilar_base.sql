-- El aviso de base saturada: que quien administra se entere antes que los
-- alumnos.
--
-- El 29/9, en la hora pico de clases, la base (plan gratuito) cortó consultas
-- por statement timeout y tres grupos no pudieron dar clase; nos enteramos
-- cuando ya no entraba nadie. Los registros de Supabase lo decían desde las
-- 6:00 p. m., pero nadie los estaba mirando.
--
-- Cada cinco minutos public.vigilar_base() mide tres señales y guarda una fila
-- en interno.salud_base (dos semanas):
--   · pulso_ms: una consulta de prueba fija (contar profiles y las clases
--     abiertas) que con la base tranquila tarda 0-3 ms. Salta a 250 ms.
--   · lentas: consultas de la web (rol authenticator) activas hace más de
--     3 s. Salta con 3.
--   · cron_fallidos: tareas de pg_cron que fallaron en los últimos 10 min. En
--     los 7 días anteriores no falló ninguna, salvo 3 «job startup timeout»
--     justo durante la caída del 29/9: es la señal más limpia. Salta con 1.
-- Si alguna salta, se llama a la Edge Function alerta-base, que le escribe a
-- cada cuenta con is_admin. Como mucho un correo cada dos horas: una caída de
-- una hora no son doce correos.
--
-- Si la base está tan saturada que la propia vigilancia no arranca, su fallo
-- queda en cron.job_run_details y la vuelta siguiente lo ve (cron_fallidos).

create table if not exists interno.salud_base (
  medido_at     timestamptz primary key default now(),
  pulso_ms      integer not null,
  lentas        integer not null,
  cron_fallidos integer not null,
  lenta         boolean not null,
  aviso_enviado boolean not null default false
);
alter table interno.salud_base enable row level security;
revoke all on interno.salud_base from public, anon, authenticated;
comment on table interno.salud_base is
  'Lo que mide public.vigilar_base() cada cinco minutos (dos semanas). Sin políticas: no se lee desde la web.';

-- El secreto con que la base se presenta ante alerta-base. Lo crea la base y
-- no pasa por ningún archivo.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'alerta_base_secreto') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'alerta_base_secreto');
  end if;
end $$;

create or replace function public.secreto_alerta_base()
returns text language sql stable security definer set search_path to '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'alerta_base_secreto';
$$;
revoke all on function public.secreto_alerta_base() from public, anon, authenticated;
grant execute on function public.secreto_alerta_base() to service_role;

create or replace function public.vigilar_base()
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  t0       timestamptz;
  v_ms     integer;
  v_lentas integer;
  v_cron   integer;
  v_lenta  boolean;
  v_avisar boolean;
  secreto  text;
begin
  t0 := clock_timestamp();
  perform count(*) from public.profiles;
  perform count(*) from public.class_sessions where ended_at is null;
  v_ms := round(extract(epoch from clock_timestamp() - t0) * 1000);

  select count(*) into v_lentas
    from pg_catalog.pg_stat_activity
   where usename = 'authenticator' and state = 'active'
     and query_start < now() - interval '3 seconds';

  select count(*) into v_cron
    from cron.job_run_details
   where status = 'failed' and start_time > now() - interval '10 minutes';

  v_lenta := v_ms >= 250 or v_lentas >= 3 or v_cron >= 1;
  v_avisar := v_lenta and not exists (
    select 1 from interno.salud_base
     where aviso_enviado and medido_at > now() - interval '2 hours');

  insert into interno.salud_base (pulso_ms, lentas, cron_fallidos, lenta, aviso_enviado)
  values (v_ms, v_lentas, v_cron, v_lenta, v_avisar)
  on conflict (medido_at) do nothing;
  delete from interno.salud_base where medido_at < now() - interval '14 days';

  if not v_avisar then
    return case when v_lenta then 'lenta (ya avisado)' else 'bien' end;
  end if;

  select decrypted_secret into secreto from vault.decrypted_secrets where name = 'alerta_base_secreto';
  if secreto is null or secreto = '' then
    raise warning 'No hay secreto de alerta_base: la base está lenta y no se avisó';
    return 'lenta (sin secreto)';
  end if;
  perform net.http_post(
    url := 'https://bgtijpimpcokxatxxbki.supabase.co/functions/v1/alerta-base',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secreto),
    body := jsonb_build_object('pulso_ms', v_ms, 'lentas', v_lentas, 'cron_fallidos', v_cron, 'medido_at', now()),
    timeout_milliseconds := 30000
  );
  return 'lenta (avisado)';
end;
$$;

-- La corre pg_cron (como postgres). Nadie más.
revoke execute on function public.vigilar_base() from public, anon, authenticated;

comment on function public.vigilar_base() is
  'Cada cinco minutos (pg_cron vigilar-base): mide si la base está al límite y, si lo está, avisa por correo a administración (alerta-base), como mucho una vez cada dos horas.';

select cron.schedule('vigilar-base', '*/5 * * * *', 'select public.vigilar_base();');