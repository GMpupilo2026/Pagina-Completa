-- «Herramientas de arbitraje» › Espacio de consultas: un árbitro o un padre o
-- madre de familia escribe su duda, sin cuenta, y recibe una respuesta escrita
-- por IA a partir del Reglamento de la FIDE. La responde una Edge Function
-- (consulta-arbitraje, verify_jwt en false) y acá queda: el freno de los
-- envíos públicos (nuevo tipo 'arbitraje_consulta'), la tabla con cada
-- pregunta y su respuesta (para que profesores y administración la revisen,
-- igual que «Exámenes del público» en arbitraje.html) y el presupuesto de IA
-- de la función, aparte del de «Mejorar informe» porque esta la usa cualquiera
-- sin sesión. Ver «Espacio de consultas» en docs/decisiones/entrenamiento.md.

-- ---- el freno: un tipo más para interno.frenar_envio_publico ----
-- Cada consulta cuesta dinero de verdad (llama a la IA), así que los topes son
-- más chicos que los de un formulario común. Por IP: una familia o una
-- delegación puede mandar varias preguntas seguidas desde la misma red. Por
-- correo (cuando lo dan): no es obligatorio, así que el tope por IP y el total
-- son los que de verdad protegen el gasto.
create or replace function interno.frenar_envio_publico(p_tipo text, p_ambito text, p_correo text, p_ip text DEFAULT NULL::text)
 returns text
 language plpgsql
 set search_path to 'public'
as $function$
declare
  cab jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_ip text := nullif(btrim(coalesce(
                 p_ip,
                 cab->>'cf-connecting-ip',
                 cab->>'x-real-ip',
                 split_part(cab->>'x-forwarded-for', ',', 1))), '');
  v_correo text := nullif(lower(btrim(coalesce(p_correo, ''))), '');
  v_ambito text := left(coalesce(p_ambito, ''), 200);
  -- Topes: por IP en una hora, por correo en el período, total por hora.
  tope_ip int;  tope_correo int;  periodo_correo interval;  tope_total int;
begin
  case p_tipo
    when 'formulario' then tope_ip := 40; tope_correo := null; periodo_correo := null;              tope_total := 300;
    when 'arbitraje'  then tope_ip := 40; tope_correo := 10;   periodo_correo := interval '1 hour'; tope_total := 200;
    when 'solicitud'  then tope_ip := 5;  tope_correo := 3;    periodo_correo := interval '1 day';  tope_total := 30;
    when 'prueba'     then tope_ip := 3;  tope_correo := null; periodo_correo := null;              tope_total := 40;
    when 'encuesta'   then tope_ip := 40; tope_correo := null; periodo_correo := null;              tope_total := 300;
    when 'quiniela'   then tope_ip := 40; tope_correo := 5;    periodo_correo := interval '1 day';  tope_total := 500;
    when 'invitado'   then tope_ip := 30; tope_correo := null; periodo_correo := null;              tope_total := 150;
    -- Espacio de consultas (herramientas-arbitraje.html): cada una llama a la
    -- IA, así que el tope existe para proteger el gasto, no solo para parar un
    -- script. Diez por IP en una hora alcanza de sobra para una familia o un
    -- club haciendo varias preguntas seguidas; cinco por correo al día frena
    -- probar la misma dirección una y otra vez.
    when 'arbitraje_consulta' then tope_ip := 10; tope_correo := 5; periodo_correo := interval '1 day'; tope_total := 80;
    else raise exception 'tipo de envío desconocido: %', p_tipo;
  end case;

  -- Dos envíos a la vez del mismo tipo no se cuentan uno al otro por fuera.
  perform pg_advisory_xact_lock(hashtext('envios_publicos:' || p_tipo));

  if v_ip is not null and (select count(*) from interno.envios_publicos
        where tipo = p_tipo and ip = v_ip and creado > now() - interval '1 hour') >= tope_ip then
    return 'Llegaron demasiados envíos seguidos desde tu conexión. Espera un rato e intenta de nuevo.';
  end if;

  if v_correo is not null and tope_correo is not null and (select count(*) from interno.envios_publicos
        where tipo = p_tipo and correo = v_correo and creado > now() - periodo_correo) >= tope_correo then
    return 'Ya recibimos varios envíos con este correo. Espera un rato antes de mandar otro.';
  end if;

  if (select count(*) from interno.envios_publicos
        where tipo = p_tipo and ambito = v_ambito and creado > now() - interval '1 hour') >= tope_total then
    return 'Este formulario está recibiendo demasiados envíos en este momento. Intenta de nuevo en una hora.';
  end if;

  insert into interno.envios_publicos (tipo, ambito, ip, correo)
  values (p_tipo, v_ambito, v_ip, v_correo);

  -- Lo de hace más de dos días ya no cuenta para ningún tope.
  delete from interno.envios_publicos where creado < now() - interval '2 days';
  return null;
end;
$function$;

-- Envuelve el freno para que lo pueda llamar la Edge Function (service role),
-- que trae la IP de su propio pedido (la de PostgREST sería la de Supabase,
-- no la de quien preguntó). Mismo patrón que jdn_frenar.
create or replace function public.arbitraje_consulta_frenar(p_ip text, p_correo text)
returns text
language plpgsql security definer set search_path = public as $$
begin
  return interno.frenar_envio_publico('arbitraje_consulta', '', p_correo, p_ip);
end;
$$;
revoke all on function public.arbitraje_consulta_frenar(text, text) from public, anon, authenticated;
grant execute on function public.arbitraje_consulta_frenar(text, text) to service_role;

-- ---- el presupuesto de la IA de esta herramienta ----
-- Una sola fila (no por academia: esto no pide cuenta). null = apagada.
-- Aparte del presupuesto de «Mejorar informe» (academia_ia): esta la gasta
-- cualquiera sin sesión, así que necesita su propio tope y su propio candado.
create table public.arbitraje_consulta_config (
  id               smallint primary key default 1 check (id = 1),
  modelo           text check (modelo in ('claude-haiku-4-5', 'claude-sonnet-5')),
  tope_mensual_usd numeric(10,2) not null default 10 check (tope_mensual_usd >= 0 and tope_mensual_usd <= 200),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.profiles(id) on delete set null
);
comment on table public.arbitraje_consulta_config is
  'Modelo y tope mensual del Espacio de consultas (herramientas-arbitraje.html). Una sola fila. modelo null = la consulta automática está apagada. Solo la cambia arbitraje_consulta_config_guardar(); solo la lee quien administra.';

insert into public.arbitraje_consulta_config (id, modelo, tope_mensual_usd)
values (1, 'claude-haiku-4-5', 8)
on conflict (id) do nothing;

alter table public.arbitraje_consulta_config enable row level security;
revoke all on public.arbitraje_consulta_config from public, anon, authenticated;
grant select on public.arbitraje_consulta_config to authenticated;
grant all on public.arbitraje_consulta_config to service_role;

create policy arbitraje_consulta_config_select on public.arbitraje_consulta_config
  for select to authenticated using (public.soy_admin());

create trigger auditar after insert or update or delete on public.arbitraje_consulta_config
  for each row execute function interno.auditar();

-- Quien administra prende o apaga la IA de esta herramienta y fija el tope.
create or replace function public.arbitraje_consulta_config_guardar(p_modelo text, p_tope numeric)
returns public.arbitraje_consulta_config
language plpgsql security definer set search_path = public as $$
declare
  v_modelo text := nullif(btrim(coalesce(p_modelo, '')), '');
  v_fila public.arbitraje_consulta_config;
begin
  if not public.soy_admin() then
    raise exception 'Solo quien administra decide la IA del espacio de consultas.' using errcode = '42501';
  end if;
  if v_modelo is not null and v_modelo not in ('claude-haiku-4-5', 'claude-sonnet-5') then
    raise exception 'Ese modelo no se ofrece acá.';
  end if;
  if p_tope is null or p_tope < 0 or p_tope > 200 then
    raise exception 'El tope mensual va de 0 a 200 dólares.';
  end if;
  update public.arbitraje_consulta_config
     set modelo = v_modelo, tope_mensual_usd = round(p_tope, 2), updated_at = now(), updated_by = auth.uid()
   where id = 1
  returning * into v_fila;
  return v_fila;
end;
$$;
revoke all on function public.arbitraje_consulta_config_guardar(text, numeric) from public, anon;
grant execute on function public.arbitraje_consulta_config_guardar(text, numeric) to authenticated;

-- ---- cada pregunta y su respuesta ----
create table public.consultas_arbitraje (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  nombre          text not null,
  email           text,
  quien           text not null check (quien in ('arbitro', 'padre_familia', 'otro')),
  pregunta        text not null,
  respuesta       text,
  modelo          text,
  tokens_entrada  integer not null default 0,
  tokens_salida   integer not null default 0,
  costo_usd       numeric(12,6) not null default 0,
  ok              boolean not null default true,
  detalle         text,
  revisado        boolean not null default false,
  revisado_por    uuid references public.profiles(id) on delete set null,
  revisado_at     timestamptz,
  nota_revision   text
);
comment on table public.consultas_arbitraje is
  'Preguntas del Espacio de consultas (herramientas-arbitraje.html), sin cuenta, y la respuesta que escribió la IA a partir del Reglamento de la FIDE. La escribe solo la Edge Function consulta-arbitraje (service role); profesores y administración la leen y la marcan revisada desde arbitraje.html.';

create index consultas_arbitraje_pendientes on public.consultas_arbitraje (revisado, created_at desc);

alter table public.consultas_arbitraje enable row level security;
revoke all on public.consultas_arbitraje from public, anon, authenticated;
grant select, update on public.consultas_arbitraje to authenticated;
grant all on public.consultas_arbitraje to service_role;

-- Leer y marcar revisada: solo profesores y administración, igual que
-- arbitrajes_publicos. Nadie inserta desde el navegador: la fila la escribe
-- la Edge Function, con la clave de servicio (que no pasa por RLS).
create policy consultas_arbitraje_select on public.consultas_arbitraje
  for select to authenticated
  using (
    (select is_admin from public.my_profile())
    or (select role from public.my_profile()) = 'profesor'
  );

create policy consultas_arbitraje_update on public.consultas_arbitraje
  for update to authenticated
  using (
    (select is_admin from public.my_profile())
    or (select role from public.my_profile()) = 'profesor'
  )
  with check (true);
