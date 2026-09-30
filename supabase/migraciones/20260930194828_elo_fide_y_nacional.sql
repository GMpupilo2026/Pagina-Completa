-- El Elo oficial de cada alumno, leído solo cada mes: FIDE Estándar y Nacional
-- de Costa Rica.
--
-- El alumno (o su profe, o administración) pone su código FIDE en
-- Configuración. La Edge Function `elo-fide` lee con ese código su ficha de
-- ratings.fide.com (Estándar) y la clasificación nacional de
-- ajedrezcostarica.com (Nacional), y guarda UNA fila por alumno y mes en
-- `elo_historial`. Con dos meses guardados se sabe si subió o bajó, y eso va
-- al informe que llega a la casa.
--
-- Ver «El Elo oficial, mes a mes» en docs/decisiones/informes.md.

-- ---------------------------------------------------------------- el código
alter table public.profiles
  add column if not exists fide_id text;
alter table public.profiles drop constraint if exists profiles_fide_id_check;
alter table public.profiles add constraint profiles_fide_id_check
  check (fide_id is null or fide_id ~ '^[0-9]{4,10}$');
comment on column public.profiles.fide_id is
  'Código FIDE (FIDE ID) de la persona. Con él, elo-fide lee cada mes su Elo FIDE Estándar y Nacional de Costa Rica. Se escribe con guardar_fide_id().';

-- Quién puede cambiar el código de alguien y pedir que se le vuelva a leer el
-- Elo: la propia persona, cualquiera de sus profesores y administración. La
-- usan guardar_fide_id() y la Edge Function (con el JWT de quien llama).
create or replace function public.puedo_cambiar_fide_id(p_persona uuid)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select coalesce(
    p_persona = (select auth.uid())
    or (select mp.is_admin from public.my_profile() mp)
    or public.soy_profesor_de(p_persona),
    false);
$$;
revoke execute on function public.puedo_cambiar_fide_id(uuid) from public, anon;
grant execute on function public.puedo_cambiar_fide_id(uuid) to authenticated;

-- ------------------------------------------------------------ el historial
-- Una fila por persona y mes (el mes de Costa Rica en que se leyó). Si se lee
-- dos veces en el mismo mes, la segunda pisa a la primera: vale lo último que
-- publicó cada lista ese mes. Un rating en 0 o sin publicar es NULL, no 0.
create table if not exists public.elo_historial (
  student_id uuid not null references public.profiles(id) on delete cascade,
  periodo date not null check (extract(day from periodo) = 1),
  fide_estandar integer check (fide_estandar is null or fide_estandar between 100 and 3500),
  nacional integer check (nacional is null or nacional between 100 and 3500),
  fide_id text not null,
  nombre text,
  leido_at timestamptz not null default now(),
  primary key (student_id, periodo)
);
comment on table public.elo_historial is
  'El Elo oficial de cada alumno, un registro por mes: FIDE Estándar (ratings.fide.com) y Nacional de Costa Rica (ajedrezcostarica.com). Lo escribe solo la Edge Function elo-fide.';

alter table public.elo_historial enable row level security;

-- Lo ve quien ve al alumno para seguirlo: él mismo, sus profesores,
-- administración, su coordinación y su supervisión. Nadie escribe desde
-- afuera: solo la Edge Function, con la service role.
drop policy if exists elo_historial_select on public.elo_historial;
create policy elo_historial_select on public.elo_historial
  for select to authenticated
  using (
    student_id = (select auth.uid())
    or (select mp.is_admin from public.my_profile() mp)
    or student_id in (select interno.alumnos_de((select auth.uid())))
    or student_id in (select interno.bajo_mi_coordinacion_conjunto())
    or ((select public.soy_supervisor()) and public.supervisado_por_mi(student_id))
  );

revoke all on public.elo_historial from anon;
revoke insert, update, delete, truncate on public.elo_historial from authenticated;
grant select on public.elo_historial to authenticated;

-- ----------------------------------------------------------- guardar el código
-- Si el código cambia, el historial del código anterior se borra: era de otra
-- ficha (casi siempre un número mal copiado), y comparar el Elo de dos
-- personas distintas le diría a la casa que subió o bajó sin que pasara nada.
create or replace function public.guardar_fide_id(p_persona uuid, p_fide_id text)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_nuevo text := nullif(regexp_replace(coalesce(p_fide_id, ''), '\s', '', 'g'), '');
  v_viejo text;
begin
  if not coalesce(public.puedo_cambiar_fide_id(p_persona), false) then
    raise exception 'Solo la propia persona, uno de sus profesores o administración pueden cambiar su código FIDE';
  end if;
  if v_nuevo is not null and v_nuevo !~ '^[0-9]{4,10}$' then
    raise exception 'El código FIDE son solo números (entre 4 y 10 cifras)';
  end if;
  select fide_id into v_viejo from public.profiles where id = p_persona;
  if not found then
    raise exception 'No se encontró esa persona';
  end if;
  if v_viejo is distinct from v_nuevo then
    delete from public.elo_historial where student_id = p_persona;
    update public.profiles set fide_id = v_nuevo where id = p_persona;
  end if;
  -- Se vuelve a LEER: lo que quedó es lo que se contesta.
  select fide_id into v_nuevo from public.profiles where id = p_persona;
  return v_nuevo;
end;
$$;
revoke execute on function public.guardar_fide_id(uuid, text) from public, anon;
grant execute on function public.guardar_fide_id(uuid, text) to authenticated;

-- ------------------------------------------------------- para el informe
-- El mes más reciente y el anterior que haya guardado, para decir si subió o
-- bajó. SECURITY INVOKER: la RLS de elo_historial decide, igual que en el
-- resto de informe_de_alumno(). Sin historial, `elo` es null y el bloque no
-- sale en el correo.
create or replace function public.elo_de_alumno(p_alumno uuid)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  with ult as (
    select h.periodo, h.fide_estandar, h.nacional, h.fide_id, h.leido_at,
           row_number() over (order by h.periodo desc) as n
    from public.elo_historial h
    where h.student_id = p_alumno
    order by h.periodo desc
    limit 2
  )
  select jsonb_build_object('elo', (
    select jsonb_build_object(
      'fide_id', a.fide_id,
      'actual', jsonb_build_object('periodo', a.periodo, 'fide', a.fide_estandar, 'nacional', a.nacional, 'leido_at', a.leido_at),
      'anterior', (select jsonb_build_object('periodo', b.periodo, 'fide', b.fide_estandar, 'nacional', b.nacional)
                   from ult b where b.n = 2))
    from ult a where a.n = 1));
$$;
revoke execute on function public.elo_de_alumno(uuid) from public, anon;
grant execute on function public.elo_de_alumno(uuid) to authenticated;

-- Se suma a la cola de informe_de_alumno() a partir de su definición vigente,
-- como los premios y la comparación: no se copia a mano la función entera.
do $$
declare
  d text := pg_get_functiondef('public.informe_de_alumno(uuid, timestamptz, timestamptz)'::regprocedure);
  viejo text := '|| public.entreno_comparado(p_alumno, p_desde, p_hasta)';
begin
  if position(viejo in d) = 0 then
    raise exception 'informe_de_alumno() ya no termina como se esperaba';
  end if;
  if position('elo_de_alumno' in d) = 0 then
    execute replace(d, viejo, viejo || E'\n|| public.elo_de_alumno(p_alumno)');
  end if;
end $$;

-- ----------------------------------------------------------------- la tanda
-- pg_cron dispara la Edge Function una vez al día; ella decide a quién le
-- toca (sin lectura este mes, o con la última de hace más de una semana).
-- Firmada con un secreto de la bóveda, como la tanda de los informes: la
-- función tiene verify_jwt en false porque el disparador no trae sesión.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'tanda_elo_secreto') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'tanda_elo_secreto',
      'Firma con la que pg_cron dispara la lectura del Elo FIDE y Nacional.');
  end if;
end $$;

create or replace function public.secreto_tanda_elo()
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'tanda_elo_secreto';
$$;
revoke execute on function public.secreto_tanda_elo() from public, anon, authenticated;
grant execute on function public.secreto_tanda_elo() to service_role;

create or replace function public.disparar_tanda_elo()
returns void language plpgsql security definer set search_path = '' as $$
declare
  secreto text;
begin
  select decrypted_secret into secreto from vault.decrypted_secrets where name = 'tanda_elo_secreto';
  if secreto is null or secreto = '' then
    raise warning 'No hay secreto de tanda: no se leyó el Elo FIDE y Nacional.';
    return;
  end if;
  perform net.http_post(
    url := 'https://bgtijpimpcokxatxxbki.supabase.co/functions/v1/elo-fide',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secreto),
    body := jsonb_build_object('action', 'tanda'),
    timeout_milliseconds := 150000
  );
end;
$$;
revoke execute on function public.disparar_tanda_elo() from public, anon, authenticated;

-- 9:10 UTC = 3:10 de la madrugada en Costa Rica, cuando nadie está usando la
-- plataforma. Corre todos los días: la FIDE publica su lista el día 1 y la
-- nacional cuando sale, así que a más tardar en una semana se ve el cambio.
select cron.unschedule('elo-fide-nacional')
where exists (select 1 from cron.job where jobname = 'elo-fide-nacional');

select cron.schedule('elo-fide-nacional', '10 9 * * *',
                     $$select public.disparar_tanda_elo();$$);