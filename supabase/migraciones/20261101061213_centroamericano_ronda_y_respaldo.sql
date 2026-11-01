-- Centroamericano 2026: terminar la ronda, el avance de cada árbitro, las planillas y el
-- respaldo. Ver «Terminar la ronda, planillas y respaldo» en
-- docs/decisiones/juegos-y-torneos.md.
--
-- 1. centroamericano_avisos suma `tipo` (ayuda | termino | finalizo) y `ronda`: además del
--    pedido de ayuda, el árbitro le avisa a la cuenta principal que TERMINÓ todas sus mesas
--    (una sola vez por ronda: índice único) y que FINALIZÓ la ronda.
-- 2. centroamericano_progreso: cuántas mesas de su rango ya tienen resultado, y cuáles
--    faltan. Lo escribe la función cada vez que lee o guarda chess-results; de ahí sale el
--    resumen de la organización y la sugerencia de a quién ir a ayudar.
-- 3. centroamericano_finales: «Finalizar la ronda» del árbitro, con lo que confirmó haber
--    revisado (resultados, planillas ordenadas y firmadas). La organización puede reabrirla.
-- 4. centroamericano_planillas: la foto de cada planilla (blancas y negras de cada partida):
--    se guarda primero en un bucket privado y de ahí pasa al Drive («Planillas
--    Centroamericano / torneo / ronda»).
-- 5. El respaldo: una instantánea de todo lo que SOLO vive en nuestra base (enlaces con su
--    token, registro, avisos, avances, finales e índice de planillas) cada 5 minutos si algo
--    cambió, cada hora, y cada 10 minutos al Drive. Los respaldos son anillos con ranuras que
--    se sobrescriben (no hay nada que borrar). `centroamericano_restaurar()` los vuelve a
--    subir sin pisar nada que ya esté. Las claves de chess-results NO van en la copia: viven
--    cifradas en la bóveda y se vuelven a poner una vez.
-- Todo se apaga solo pasado el torneo (13 de noviembre).

-- ============================================================ 1. avisos

alter table public.centroamericano_avisos
  add column tipo text not null default 'ayuda' check (tipo in ('ayuda', 'termino', 'finalizo')),
  add column ronda integer check (ronda between 1 and 99);
comment on column public.centroamericano_avisos.tipo is
  'ayuda: el árbitro pide al principal. termino: terminó todas sus mesas (una vez por ronda). finalizo: finalizó la ronda tras revisar. Los mensajes de la organización son siempre tipo ayuda.';
create unique index centroamericano_avisos_termino_uidx
  on public.centroamericano_avisos (asignacion_id, ronda) where tipo = 'termino';

-- ============================================================ 2. avance

create table public.centroamericano_progreso (
  asignacion_id uuid not null references public.centroamericano_asignaciones(id) on delete cascade,
  ronda integer not null check (ronda between 1 and 99),
  total integer not null check (total >= 0),
  con_resultado integer not null check (con_resultado >= 0),
  pendientes integer[] not null default '{}',
  actualizado timestamptz not null default now(),
  primary key (asignacion_id, ronda),
  check (con_resultado <= total)
);
comment on table public.centroamericano_progreso is
  'Cuántas mesas de su rango tiene ya con resultado cada árbitro en cada ronda, y cuáles faltan. Lo escribe la Edge Function (centroamericano-mesa al leer o guardar, centroamericano-clave al actualizar el resumen) con lo que leyó de chess-results.';

-- ============================================================ 3. finalizar la ronda

create table public.centroamericano_finales (
  id uuid primary key default gen_random_uuid(),
  asignacion_id uuid not null references public.centroamericano_asignaciones(id) on delete cascade,
  ronda integer not null check (ronda between 1 and 99),
  finalizada_en timestamptz not null default now(),
  revision jsonb not null default '{}'::jsonb,
  reabierta boolean not null default false,
  unique (asignacion_id, ronda)
);
comment on table public.centroamericano_finales is
  'El árbitro finalizó la ronda: todas sus mesas con resultado y confirmó que revisó los resultados y que tiene las planillas ordenadas y firmadas (revision). La organización puede reabrirla (reabierta) y el árbitro la vuelve a finalizar.';

-- ============================================================ 4. planillas

create table public.centroamericano_planillas (
  id uuid primary key default gen_random_uuid(),
  asignacion_id uuid references public.centroamericano_asignaciones(id) on delete set null,
  arbitro text not null default '' check (length(arbitro) <= 80),
  tnr text not null references public.centroamericano_torneos(tnr),
  ronda integer not null check (ronda between 1 and 99),
  mesa integer not null check (mesa between 1 and 9999),
  lado text not null check (lado in ('blancas', 'negras')),
  jugador text not null default '' check (length(jugador) <= 120),
  rival text not null default '' check (length(rival) <= 120),
  ruta text not null,
  subida timestamptz not null default now(),
  bytes integer not null default 0,
  drive_ok boolean not null default false,
  drive_en timestamptz,
  drive_error text not null default '' check (length(drive_error) <= 300),
  unique (tnr, ronda, mesa, lado)
);
comment on table public.centroamericano_planillas is
  'La foto de la planilla de un jugador (blancas o negras de una mesa y ronda): ruta en el bucket privado centroamericano-planillas y si ya está en el Drive. Una sola por jugador y partida: si se toma otra foto, reemplaza a la anterior.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('centroamericano-planillas', 'centroamericano-planillas', false, 6291456, array['image/jpeg'])
on conflict (id) do nothing;

-- ============================================================ 5. respaldo

create table public.centroamericano_copias (
  anillo text not null check (anillo in ('a', 'b', 'm', 'd')),
  ranura integer not null check (ranura between 0 and 99),
  creada timestamptz not null default now(),
  huella text not null,
  contenido jsonb,
  resumen jsonb not null default '{}'::jsonb,
  primary key (anillo, ranura)
);
comment on table public.centroamericano_copias is
  'Respaldo del Centroamericano: anillos con ranuras que se sobrescriben. a = cada 5 minutos si algo cambió (36 ranuras: las últimas 3 horas), b = cada hora (72: tres días), m = a pedido (20), d = la última huella enviada al Drive (sin contenido). Se restauran con centroamericano_restaurar().';

alter table public.centroamericano_progreso enable row level security;
alter table public.centroamericano_finales enable row level security;
alter table public.centroamericano_planillas enable row level security;
alter table public.centroamericano_copias enable row level security;
revoke all on public.centroamericano_progreso, public.centroamericano_finales, public.centroamericano_planillas, public.centroamericano_copias from public, anon, authenticated;
grant select on public.centroamericano_progreso, public.centroamericano_finales, public.centroamericano_planillas, public.centroamericano_copias to authenticated;
grant update (reabierta) on public.centroamericano_finales to authenticated;

create policy centroamericano_progreso_ver on public.centroamericano_progreso
  for select to authenticated using ((select public.tengo_herramienta('mesa-arbitro')));
create policy centroamericano_finales_ver on public.centroamericano_finales
  for select to authenticated using ((select public.tengo_herramienta('mesa-arbitro')));
create policy centroamericano_finales_reabrir on public.centroamericano_finales
  for update to authenticated
  using ((select public.tengo_herramienta('mesa-arbitro')))
  with check ((select public.tengo_herramienta('mesa-arbitro')));
create policy centroamericano_planillas_ver on public.centroamericano_planillas
  for select to authenticated using ((select public.tengo_herramienta('mesa-arbitro')));
create policy centroamericano_copias_ver on public.centroamericano_copias
  for select to authenticated using ((select public.tengo_herramienta('mesa-arbitro')));

create trigger auditar after insert or update or delete on public.centroamericano_finales
  for each row execute function interno.auditar('ronda', 'reabierta');

-- ------------------------------------------------------------ la instantánea

create function interno.centroamericano_instantanea()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'version', 1,
    'evento', 'Centroamericano 2026',
    'creada', now(),
    'asignaciones', coalesce((select jsonb_agg(to_jsonb(a) order by a.creada) from public.centroamericano_asignaciones a), '[]'::jsonb),
    'registro', coalesce((select jsonb_agg(to_jsonb(r) order by r.ocurrio) from public.centroamericano_registro r), '[]'::jsonb),
    'avisos', coalesce((select jsonb_agg(to_jsonb(v) order by v.creado) from public.centroamericano_avisos v), '[]'::jsonb),
    'progreso', coalesce((select jsonb_agg(to_jsonb(p)) from public.centroamericano_progreso p), '[]'::jsonb),
    'finales', coalesce((select jsonb_agg(to_jsonb(f)) from public.centroamericano_finales f), '[]'::jsonb),
    'planillas', coalesce((select jsonb_agg(to_jsonb(l) order by l.subida) from public.centroamericano_planillas l), '[]'::jsonb)
  );
$$;
revoke all on function interno.centroamericano_instantanea() from public, anon, authenticated;

-- Toma una copia en el anillo pedido y la devuelve. Sin `forzar`, solo corre en las fechas
-- del torneo y, en el anillo «a», solo si algo cambió desde la última.
create function interno.centroamericano_hacer_copia(p_anillo text, p_forzar boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_foto jsonb;
  v_huella text;
  v_ranura integer;
  v_ultima text;
  v_seg bigint := extract(epoch from now())::bigint;
begin
  if p_anillo not in ('a', 'b', 'm') then
    raise exception 'anillo no válido' using errcode = '22023';
  end if;
  if not p_forzar and (now() < timestamptz '2026-10-30 00:00:00-06' or now() > timestamptz '2026-11-13 00:00:00-06') then
    return null;
  end if;
  v_foto := interno.centroamericano_instantanea();
  v_huella := md5((v_foto - 'creada')::text);
  if p_anillo = 'a' and not p_forzar then
    select huella into v_ultima from public.centroamericano_copias where anillo = 'a' order by creada desc limit 1;
    if v_ultima = v_huella then return null; end if;
  end if;
  v_ranura := case p_anillo when 'a' then (v_seg / 300) % 36 when 'b' then (v_seg / 3600) % 72 else (v_seg / 60) % 20 end;
  insert into public.centroamericano_copias (anillo, ranura, creada, huella, contenido, resumen)
  values (p_anillo, v_ranura, now(), v_huella, v_foto, jsonb_build_object(
    'asignaciones', jsonb_array_length(v_foto->'asignaciones'), 'registro', jsonb_array_length(v_foto->'registro'),
    'avisos', jsonb_array_length(v_foto->'avisos'), 'planillas', jsonb_array_length(v_foto->'planillas'),
    'finales', jsonb_array_length(v_foto->'finales')))
  on conflict (anillo, ranura) do update
    set creada = excluded.creada, huella = excluded.huella, contenido = excluded.contenido, resumen = excluded.resumen;
  return v_foto;
end;
$$;
revoke all on function interno.centroamericano_hacer_copia(text, boolean) from public, anon, authenticated;

-- La copia al Drive (por el Apps Script, si está conectado): solo si algo cambió.
create function interno.centroamericano_copia_a_drive()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secreto text;
  v_foto jsonb;
  v_huella text;
  v_ultima text;
begin
  if now() < timestamptz '2026-10-30 00:00:00-06' or now() > timestamptz '2026-11-13 00:00:00-06' then return; end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'centroamericano_drive_url';
  select decrypted_secret into v_secreto from vault.decrypted_secrets where name = 'centroamericano_drive_secreto';
  if coalesce(v_url, '') = '' or coalesce(v_secreto, '') = '' then return; end if;
  v_foto := interno.centroamericano_instantanea();
  v_huella := md5((v_foto - 'creada')::text);
  select huella into v_ultima from public.centroamericano_copias where anillo = 'd' and ranura = 0;
  if v_ultima = v_huella then return; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('secreto', v_secreto, 'accion', 'copia',
      'nombre', 'copia-' || to_char(now() at time zone 'America/Costa_Rica', 'YYYY-MM-DD-HH24MI') || '.json', 'copia', v_foto),
    timeout_milliseconds := 60000);
  insert into public.centroamericano_copias (anillo, ranura, creada, huella, contenido, resumen)
  values ('d', 0, now(), v_huella, null, '{}'::jsonb)
  on conflict (anillo, ranura) do update set creada = excluded.creada, huella = excluded.huella;
end;
$$;
revoke all on function interno.centroamericano_copia_a_drive() from public, anon, authenticated;

select cron.schedule('centroamericano-copia-5min', '*/5 * * * *', $$select interno.centroamericano_hacer_copia('a')$$);
select cron.schedule('centroamericano-copia-hora', '0 * * * *', $$select interno.centroamericano_hacer_copia('b')$$);
select cron.schedule('centroamericano-copia-drive', '*/10 * * * *', $$select interno.centroamericano_copia_a_drive()$$);

-- «Copia ahora»: a pedido de quien organiza.
create function public.centroamericano_copia_manual()
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce((select public.tengo_herramienta('mesa-arbitro')), false) then
    raise exception 'Tu cuenta no tiene la licencia de la Mesa del árbitro' using errcode = '42501';
  end if;
  return interno.centroamericano_hacer_copia('m', true);
end;
$$;
revoke all on function public.centroamericano_copia_manual() from public, anon;
grant execute on function public.centroamericano_copia_manual() to authenticated;

-- ------------------------------------------------------------ volver a subir todo

-- Lo que ya está NO se pisa (una copia vieja no deshace lo que pasó después): solo se
-- agrega lo que falta, con las mismas claves (el token de cada enlace sigue siendo el
-- mismo, así los QR impresos siguen sirviendo). Quien restaura queda como autor.
create function public.centroamericano_restaurar(p_copia jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_yo uuid := (select auth.uid());
  v_a integer; v_r integer; v_v integer; v_p integer; v_f integer; v_l integer; v_n integer;
begin
  if not coalesce((select public.tengo_herramienta('mesa-arbitro')), false) then
    raise exception 'Tu cuenta no tiene la licencia de la Mesa del árbitro' using errcode = '42501';
  end if;
  if p_copia is null or jsonb_typeof(p_copia) <> 'object' or (p_copia->>'version') is distinct from '1' or p_copia->>'evento' is distinct from 'Centroamericano 2026' then
    raise exception 'Ese archivo no es una copia del Centroamericano 2026' using errcode = '22023';
  end if;

  insert into public.centroamericano_asignaciones (id, token, tnr, arbitro, nombrado, mesa_desde, mesa_hasta, vence, revocada, creada_por, creada, ultimo_uso)
  select r.id, r.token, r.tnr, r.arbitro, r.nombrado, r.mesa_desde, r.mesa_hasta, r.vence, r.revocada, v_yo, r.creada, r.ultimo_uso
    from jsonb_populate_recordset(null::public.centroamericano_asignaciones, p_copia->'asignaciones') r
  on conflict do nothing;
  get diagnostics v_a = row_count;

  insert into public.centroamericano_registro (id, ocurrio, asignacion_id, arbitro, tnr, ronda, mesa, color, jugador, tipo, resultado, anterior, articulo, texto, enviado, anula)
  select r.id, r.ocurrio, r.asignacion_id, r.arbitro, r.tnr, r.ronda, r.mesa, r.color, r.jugador, r.tipo, r.resultado, r.anterior, r.articulo, r.texto, r.enviado, null
    from jsonb_populate_recordset(null::public.centroamericano_registro, p_copia->'registro') r
   where r.anula is null
  on conflict do nothing;
  get diagnostics v_r = row_count;
  insert into public.centroamericano_registro (id, ocurrio, asignacion_id, arbitro, tnr, ronda, mesa, color, jugador, tipo, resultado, anterior, articulo, texto, enviado, anula)
  select r.id, r.ocurrio, r.asignacion_id, r.arbitro, r.tnr, r.ronda, r.mesa, r.color, r.jugador, r.tipo, r.resultado, r.anterior, r.articulo, r.texto, r.enviado, r.anula
    from jsonb_populate_recordset(null::public.centroamericano_registro, p_copia->'registro') r
   where r.anula is not null
  on conflict do nothing;
  get diagnostics v_n = row_count;
  v_r := v_r + v_n;

  insert into public.centroamericano_avisos (id, creado, de, asignacion_id, mesa, texto, estado, atendido_en, leido_en, creado_por, tipo, ronda)
  select r.id, r.creado, r.de, r.asignacion_id, r.mesa, r.texto, r.estado, r.atendido_en, r.leido_en, v_yo, r.tipo, r.ronda
    from jsonb_populate_recordset(null::public.centroamericano_avisos, p_copia->'avisos') r
   where exists (select 1 from public.centroamericano_asignaciones a where a.id = r.asignacion_id)
  on conflict do nothing;
  get diagnostics v_v = row_count;

  insert into public.centroamericano_progreso (asignacion_id, ronda, total, con_resultado, pendientes, actualizado)
  select r.asignacion_id, r.ronda, r.total, r.con_resultado, r.pendientes, r.actualizado
    from jsonb_populate_recordset(null::public.centroamericano_progreso, p_copia->'progreso') r
   where exists (select 1 from public.centroamericano_asignaciones a where a.id = r.asignacion_id)
  on conflict do nothing;
  get diagnostics v_p = row_count;

  insert into public.centroamericano_finales (id, asignacion_id, ronda, finalizada_en, revision, reabierta)
  select r.id, r.asignacion_id, r.ronda, r.finalizada_en, r.revision, r.reabierta
    from jsonb_populate_recordset(null::public.centroamericano_finales, p_copia->'finales') r
   where exists (select 1 from public.centroamericano_asignaciones a where a.id = r.asignacion_id)
  on conflict do nothing;
  get diagnostics v_f = row_count;

  insert into public.centroamericano_planillas (id, asignacion_id, arbitro, tnr, ronda, mesa, lado, jugador, rival, ruta, subida, bytes, drive_ok, drive_en, drive_error)
  select r.id, r.asignacion_id, r.arbitro, r.tnr, r.ronda, r.mesa, r.lado, r.jugador, r.rival, r.ruta, r.subida, r.bytes, r.drive_ok, r.drive_en, r.drive_error
    from jsonb_populate_recordset(null::public.centroamericano_planillas, p_copia->'planillas') r
  on conflict do nothing;
  get diagnostics v_l = row_count;

  return jsonb_build_object('asignaciones', v_a, 'registro', v_r, 'avisos', v_v, 'progreso', v_p, 'finales', v_f, 'planillas', v_l);
end;
$$;
revoke all on function public.centroamericano_restaurar(jsonb) from public, anon;
grant execute on function public.centroamericano_restaurar(jsonb) to authenticated;

-- ------------------------------------------------------------ el puente con el Drive

create function public.centroamericano_drive_leer()
returns table (url text, secreto text)
language sql stable security definer set search_path = '' as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'centroamericano_drive_url'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'centroamericano_drive_secreto');
$$;
revoke all on function public.centroamericano_drive_leer() from public, anon, authenticated;
grant execute on function public.centroamericano_drive_leer() to service_role;

create function public.centroamericano_drive_guardar(p_url text, p_secreto text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if coalesce(p_url, '') !~ '^https://script\.google\.com/macros/s/[A-Za-z0-9_-]{20,}/exec$' then
    raise exception 'La dirección no es la de una aplicación web de Apps Script' using errcode = '22023';
  end if;
  if length(coalesce(p_secreto, '')) < 32 then
    raise exception 'El secreto es demasiado corto' using errcode = '22023';
  end if;
  select id into v_id from vault.secrets where name = 'centroamericano_drive_url';
  if v_id is null then perform vault.create_secret(p_url, 'centroamericano_drive_url');
  else perform vault.update_secret(v_id, p_url); end if;
  select id into v_id from vault.secrets where name = 'centroamericano_drive_secreto';
  if v_id is null then perform vault.create_secret(p_secreto, 'centroamericano_drive_secreto');
  else perform vault.update_secret(v_id, p_secreto); end if;
end;
$$;
revoke all on function public.centroamericano_drive_guardar(text, text) from public, anon, authenticated;
grant execute on function public.centroamericano_drive_guardar(text, text) to service_role;
