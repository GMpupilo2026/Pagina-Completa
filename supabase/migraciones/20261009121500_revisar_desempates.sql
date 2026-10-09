-- «Revisa los desempates» (revisar-desempates.html): gratis y sin cuenta,
-- aparte de «Desempates explicados» (desempates.html, con licencia). La Edge
-- Function revisar-desempates trae una página de chess-results con un freno
-- por IP y la guarda dos minutos. Ver «Revisa los desempates» en
-- docs/decisiones/juegos-y-torneos.md.

-- ---- el freno: un tipo más para interno.frenar_envio_publico ----
-- No gasta dinero (no llama a la IA), pero cada lectura sale a chess-results:
-- el tope existe para que nadie use la función para bajarse chess-results
-- entero. Un torneo son una o dos lecturas; 60 por IP en una hora alcanza
-- para un árbitro revisando varios torneos de una tarde.
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
    -- Revisa los desempates (revisar-desempates.html): cada pedido es una
    -- lectura a chess-results. Sin correo: la herramienta no pide ninguno.
    when 'revisar_desempates' then tope_ip := 60; tope_correo := null; periodo_correo := null; tope_total := 600;
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

-- La IP la trae la Edge Function de SU pedido: la que vería PostgREST sería la
-- de Supabase, no la de quien pidió (mismo patrón que arbitraje_consulta_frenar).
create or replace function public.revisar_desempates_frenar(p_ip text)
returns text
language plpgsql security definer set search_path = public as $$
begin
  return interno.frenar_envio_publico('revisar_desempates', '', null, p_ip);
end;
$$;
revoke all on function public.revisar_desempates_frenar(text) from public, anon, authenticated;
grant execute on function public.revisar_desempates_frenar(text) to service_role;

-- ---- la caché ----
-- La última lectura de cada página (servidor/tnr/art). Son páginas públicas
-- de chess-results, pero solo la usa la función: nadie más la lee ni la escribe.
create table public.revisar_desempates_cache (
  clave text primary key check (clave ~ '^(s\d{1,2}\.)?chess-results\.com/\d{1,9}/(2|4)$'),
  datos jsonb not null,
  leido_en timestamptz not null default now()
);
comment on table public.revisar_desempates_cache is
  'Lo que la Edge Function revisar-desempates leyó de chess-results (servidor/tnr/art), para no pedir la misma página dos veces en dos minutos. Solo la usa la función (service role).';
alter table public.revisar_desempates_cache enable row level security;
revoke all on public.revisar_desempates_cache from public, anon, authenticated;
grant all on public.revisar_desempates_cache to service_role;
