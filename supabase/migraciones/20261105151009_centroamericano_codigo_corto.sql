-- El CÓDIGO CORTO del árbitro del Centroamericano (docs/decisiones/juegos-y-torneos.md, «El código corto del árbitro»).
--
-- Una tablet sin cámara y sin WhatsApp no puede abrir el enlace largo (un token de 64 caracteres) ni su QR. Cada enlace
-- (asignación) lleva ahora también un CÓDIGO de 8 caracteres que se escribe a mano en ajedrez-integral.com/m:
--   · 31 símbolos sin los que se confunden (sin 0, 1, O, I ni L): 31^8 ≈ 8,5 × 10^11 combinaciones, y solo unas decenas vivas;
--   · se canjea por el token en la función centroamericano_codigo_canjear(), que solo llama la Edge Function centroamericano-codigo
--     (service_role) y que FRENA los intentos fallidos: 40 cada 10 minutos por dirección (la huella de la IP, nunca la IP) y 400 en total.
--     Con los frenos adivinar uno llevaría millones de horas; con 30 tablets en la misma wifi de la sala, 40 fallos de más no pasan;
--   · vence y se apaga junto con su enlace: el canje mira `revocada` y `vence` cada vez.
-- El código NO reemplaza al enlace ni al QR: los que ya están repartidos siguen funcionando igual.

create function public.centroamericano_codigo_nuevo()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alfabeto constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   -- 31 símbolos: sin 0, 1, O, I ni L
  v_bytes bytea;
  v_cod text;
  v_i integer;
begin
  loop
    v_bytes := extensions.gen_random_bytes(8);
    v_cod := '';
    for v_i in 0..7 loop
      v_cod := v_cod || substr(v_alfabeto, (get_byte(v_bytes, v_i) % 31) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.centroamericano_asignaciones where codigo = v_cod);
  end loop;
  return v_cod;
end;
$$;
comment on function public.centroamericano_codigo_nuevo() is
  'Un código corto al azar (8 símbolos de un alfabeto de 31, sin 0/1/O/I/L) que no usa ningún enlace. Es el DEFAULT de centroamericano_asignaciones.codigo, así que lo llama quien inserta el enlace.';
revoke execute on function public.centroamericano_codigo_nuevo() from public, anon;
grant execute on function public.centroamericano_codigo_nuevo() to authenticated, service_role;

alter table public.centroamericano_asignaciones
  add column codigo text unique check (codigo ~ '^[A-HJKMNP-Z2-9]{8}$');
update public.centroamericano_asignaciones set codigo = public.centroamericano_codigo_nuevo() where codigo is null;
alter table public.centroamericano_asignaciones
  alter column codigo set not null,
  alter column codigo set default public.centroamericano_codigo_nuevo();
comment on column public.centroamericano_asignaciones.codigo is
  'El código corto de 8 caracteres del enlace (se escribe en ajedrez-integral.com/m). Equivale al token: quien lo tiene puede abrir la mesa. Se canjea en centroamericano_codigo_canjear().';

-- Los intentos de canje: solo para el freno. Sin permisos ni políticas: la escribe y la lee solo la función.
create table public.centroamericano_codigo_intentos (
  id bigint generated always as identity primary key,
  cuando timestamptz not null default now(),
  ip_huella text not null check (length(ip_huella) between 8 and 64),
  resultado text not null check (resultado in ('ok', 'no', 'apagado', 'vencido', 'formato'))
);
create index centroamericano_codigo_intentos_cuando_idx on public.centroamericano_codigo_intentos (cuando);
create index centroamericano_codigo_intentos_ip_idx on public.centroamericano_codigo_intentos (ip_huella, cuando);
alter table public.centroamericano_codigo_intentos enable row level security;
revoke all on table public.centroamericano_codigo_intentos from anon, authenticated;
comment on table public.centroamericano_codigo_intentos is
  'Cada intento de entrar con un código corto (sin guardar el código ni la IP: solo la huella de la IP y qué pasó). Es el freno de centroamericano_codigo_canjear(); se poda a los 2 días.';

create function public.centroamericano_codigo_canjear(p_codigo text, p_ip_huella text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cod text := upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
  v_a public.centroamericano_asignaciones%rowtype;
begin
  if random() < 0.02 then
    delete from public.centroamericano_codigo_intentos where cuando < now() - interval '2 days';
  end if;
  -- El freno: los fallos de los últimos 10 minutos de esa dirección y los de todos. Con el freno puesto no se mira ni el código.
  if (select count(*) from public.centroamericano_codigo_intentos
       where ip_huella = p_ip_huella and resultado <> 'ok' and cuando > now() - interval '10 minutes') >= 40
     or (select count(*) from public.centroamericano_codigo_intentos
          where resultado <> 'ok' and cuando > now() - interval '10 minutes') >= 400 then
    return jsonb_build_object('ok', false, 'motivo', 'demasiados');
  end if;
  if v_cod !~ '^[A-HJKMNP-Z2-9]{8}$' then
    insert into public.centroamericano_codigo_intentos (ip_huella, resultado) values (p_ip_huella, 'formato');
    return jsonb_build_object('ok', false, 'motivo', 'formato');
  end if;
  select * into v_a from public.centroamericano_asignaciones where codigo = v_cod;
  if not found then
    insert into public.centroamericano_codigo_intentos (ip_huella, resultado) values (p_ip_huella, 'no');
    return jsonb_build_object('ok', false, 'motivo', 'no');
  end if;
  if v_a.revocada then
    insert into public.centroamericano_codigo_intentos (ip_huella, resultado) values (p_ip_huella, 'apagado');
    return jsonb_build_object('ok', false, 'motivo', 'apagado');
  end if;
  if v_a.vence <= now() then
    insert into public.centroamericano_codigo_intentos (ip_huella, resultado) values (p_ip_huella, 'vencido');
    return jsonb_build_object('ok', false, 'motivo', 'vencido');
  end if;
  insert into public.centroamericano_codigo_intentos (ip_huella, resultado) values (p_ip_huella, 'ok');
  return jsonb_build_object('ok', true, 'token', v_a.token);
end;
$$;
comment on function public.centroamericano_codigo_canjear(text, text) is
  'Canjea un código corto por el token del enlace (si el enlace sigue activo), con el freno de intentos fallidos. Solo la llama la Edge Function centroamericano-codigo con la clave de servicio.';
revoke execute on function public.centroamericano_codigo_canjear(text, text) from public, anon, authenticated;
grant execute on function public.centroamericano_codigo_canjear(text, text) to service_role;
