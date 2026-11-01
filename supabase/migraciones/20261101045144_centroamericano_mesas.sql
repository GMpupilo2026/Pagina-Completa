-- Centroamericano 2026: «Mesas de los árbitros» (centroamericano-mesas.html y
-- centroamericano-arbitro.html). Quien organiza carga la clave (SID) de
-- chess-results de cada torneo, le asigna a cada árbitro un rango de mesas y
-- le manda un enlace o un QR; el árbitro entra sin cuenta, anota resultados
-- (que se mandan a chess-results), jugadas ilegales e irregularidades, y todo
-- queda en un registro que solo se agrega. Ver «Mesas de los árbitros del
-- Centroamericano» en docs/decisiones/juegos-y-torneos.md.
--
-- LAS CLAVES VAN EN LA BÓVEDA (Vault), CIFRADAS, no en una tabla común: la tabla
-- de torneos solo sabe SI hay clave (sid_en_boveda). Escribirla y leerla son
-- dos funciones SECURITY DEFINER que solo ejecuta el servicio (las Edge
-- Functions): ni quien organiza ni nadie desde el navegador puede leer una clave,
-- ni siquiera la que puso.
--
-- EL ENLACE DEL ÁRBITRO es una asignación: un token al azar de 64 caracteres, el
-- torneo, el rango de mesas, cuándo vence y si se apagó. El árbitro no tiene
-- cuenta, así que lo que valida el token y hace cumplir el rango es la Edge
-- Function centroamericano-mesa, no la pantalla. Lo que el árbitro anota lo
-- escribe esa función (la tabla de registro no admite escrituras desde afuera),
-- con la hora de la base.
--
-- EL REGISTRO NO SE EDITA NI SE BORRA: un error se corrige con una línea
-- «anulacion» que apunta a la anulada (una ilegal tocada por error cuenta para
-- perder la partida, así que tiene que poderse deshacer sin borrar nada).
-- Quien organiza ve todo con la licencia «mesa-arbitro» (administración
-- también): es el mismo candado de la Mesa del árbitro.

create table public.centroamericano_torneos (
  tnr text primary key check (tnr ~ '^[0-9]{1,7}$'),
  nombre text not null check (length(nombre) between 1 and 80),
  categoria text not null check (categoria in ('Sub-8', 'Sub-10', 'Sub-12', 'Sub-14', 'Sub-16', 'Sub-18')),
  rama text not null check (rama in ('Absoluto', 'Femenino')),
  orden integer not null,
  sid_en_boveda boolean not null default false,
  clave_puesta timestamptz,
  clave_puesta_por uuid references public.profiles(id) on delete set null
);
comment on table public.centroamericano_torneos is
  'Los 12 torneos del Centroamericano 2026 en chess-results (uno por categoría y rama). sid_en_boveda: la clave (SID) está en Vault con el nombre centroamericano_sid_<tnr>; la clave nunca está en esta tabla.';

insert into public.centroamericano_torneos (tnr, nombre, categoria, rama, orden) values
  ('1529719', 'Sub-8 Absoluto', 'Sub-8', 'Absoluto', 1),
  ('1529729', 'Sub-8 Femenino', 'Sub-8', 'Femenino', 2),
  ('1529733', 'Sub-10 Absoluto', 'Sub-10', 'Absoluto', 3),
  ('1529737', 'Sub-10 Femenino', 'Sub-10', 'Femenino', 4),
  ('1529740', 'Sub-12 Absoluto', 'Sub-12', 'Absoluto', 5),
  ('1529742', 'Sub-12 Femenino', 'Sub-12', 'Femenino', 6),
  ('1529756', 'Sub-14 Absoluto', 'Sub-14', 'Absoluto', 7),
  ('1529766', 'Sub-14 Femenino', 'Sub-14', 'Femenino', 8),
  ('1529768', 'Sub-16 Absoluto', 'Sub-16', 'Absoluto', 9),
  ('1529771', 'Sub-16 Femenino', 'Sub-16', 'Femenino', 10),
  ('1529773', 'Sub-18 Absoluto', 'Sub-18', 'Absoluto', 11),
  ('1529776', 'Sub-18 Femenino', 'Sub-18', 'Femenino', 12);

create table public.centroamericano_asignaciones (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  tnr text not null references public.centroamericano_torneos(tnr),
  arbitro text not null check (length(btrim(arbitro)) between 1 and 80),
  mesa_desde integer not null check (mesa_desde between 1 and 9999),
  mesa_hasta integer not null check (mesa_hasta between 1 and 9999),
  vence timestamptz not null,
  revocada boolean not null default false,
  creada_por uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  creada timestamptz not null default now(),
  ultimo_uso timestamptz,
  check (mesa_hasta >= mesa_desde)
);
comment on table public.centroamericano_asignaciones is
  'El enlace (QR) de un árbitro del Centroamericano: su token al azar, el torneo, el rango de mesas, cuándo vence y si se apagó. Sin cuenta: el token lo valida la Edge Function centroamericano-mesa, que también hace cumplir el rango.';
create index centroamericano_asignaciones_tnr_idx on public.centroamericano_asignaciones (tnr);

create table public.centroamericano_registro (
  id uuid primary key default gen_random_uuid(),
  ocurrio timestamptz not null default now(),
  asignacion_id uuid references public.centroamericano_asignaciones(id) on delete set null,
  arbitro text not null default '' check (length(arbitro) <= 80),
  tnr text not null references public.centroamericano_torneos(tnr),
  ronda integer not null check (ronda between 1 and 99),
  mesa integer not null check (mesa between 1 and 9999),
  color text check (color in ('blancas', 'negras')),
  jugador text not null default '' check (length(jugador) <= 120),
  tipo text not null check (tipo in ('resultado', 'correccion', 'ilegal', 'irregularidad', 'incidencia', 'nota', 'anulacion')),
  resultado text check (resultado in ('1-0', '1/2', '0-1', '1f-0f', '0f-1f', '0f-0f', 'borrado')),
  anterior text check (anterior in ('1-0', '1/2', '0-1', '1f-0f', '0f-1f', '0f-0f', 'borrado', 'sin resultado')),
  articulo text not null default '' check (length(articulo) <= 60),
  texto text not null default '' check (length(texto) <= 2000),
  enviado boolean not null default false,
  anula uuid references public.centroamericano_registro(id),
  check (
    (tipo in ('resultado', 'correccion') and resultado is not null)
    or (tipo in ('ilegal', 'irregularidad') and color is not null)
    or (tipo in ('incidencia', 'nota') and length(btrim(texto)) > 0)
    or (tipo = 'anulacion' and anula is not null)
  )
);
comment on table public.centroamericano_registro is
  'Lo que anotaron los árbitros del Centroamericano, una línea por hecho: resultado o corrección (enviado: se mandó a chess-results y se comprobó leyéndolo de vuelta), ilegal e irregularidad (por ronda, mesa y color: la segunda ilegal de una partida pierde, art. 7.5.5), incidencia, nota y anulacion (apunta a la línea que deshace). Solo se agrega; lo escribe la Edge Function centroamericano-mesa con la hora de la base.';
create index centroamericano_registro_partida_idx on public.centroamericano_registro (tnr, ronda, mesa);
create index centroamericano_registro_anula_idx on public.centroamericano_registro (anula) where anula is not null;

-- La clave, en la bóveda. Solo el servicio (las Edge Functions) las ejecuta.
create function public.centroamericano_guardar_sid(p_tnr text, p_sid text, p_persona uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text := 'centroamericano_sid_' || p_tnr;
  v_id uuid;
begin
  if p_tnr !~ '^[0-9]{1,7}$' or p_sid !~ '^[A-Za-z0-9]{8,32}$' then
    raise exception 'tnr o clave con forma no válida' using errcode = '22023';
  end if;
  if not exists (select 1 from public.centroamericano_torneos where tnr = p_tnr) then
    raise exception 'el torneo % no es del Centroamericano', p_tnr using errcode = '22023';
  end if;
  select id into v_id from vault.secrets where name = v_nombre;
  if v_id is null then
    perform vault.create_secret(p_sid, v_nombre, 'SID de chess-results del torneo ' || p_tnr);
  else
    perform vault.update_secret(v_id, p_sid, v_nombre, 'SID de chess-results del torneo ' || p_tnr);
  end if;
  update public.centroamericano_torneos
     set sid_en_boveda = true, clave_puesta = now(), clave_puesta_por = p_persona
   where tnr = p_tnr;
end;
$$;
revoke all on function public.centroamericano_guardar_sid(text, text, uuid) from public, anon, authenticated;
grant execute on function public.centroamericano_guardar_sid(text, text, uuid) to service_role;

create function public.centroamericano_sid(p_tnr text)
returns text
language sql
security definer
stable
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'centroamericano_sid_' || p_tnr;
$$;
revoke all on function public.centroamericano_sid(text) from public, anon, authenticated;
grant execute on function public.centroamericano_sid(text) to service_role;

-- Permisos: quien organiza (licencia mesa-arbitro o administración) ve y arma;
-- nadie escribe el registro ni la clave desde el navegador.
alter table public.centroamericano_torneos enable row level security;
alter table public.centroamericano_asignaciones enable row level security;
alter table public.centroamericano_registro enable row level security;
revoke all on public.centroamericano_torneos from public, anon, authenticated;
revoke all on public.centroamericano_asignaciones from public, anon, authenticated;
revoke all on public.centroamericano_registro from public, anon, authenticated;
grant select (tnr, nombre, categoria, rama, orden, sid_en_boveda, clave_puesta) on public.centroamericano_torneos to authenticated;
grant select on public.centroamericano_asignaciones to authenticated;
grant insert (tnr, arbitro, mesa_desde, mesa_hasta, vence) on public.centroamericano_asignaciones to authenticated;
grant update (revocada, vence) on public.centroamericano_asignaciones to authenticated;
grant select on public.centroamericano_registro to authenticated;

create policy centroamericano_torneos_ver on public.centroamericano_torneos
  for select to authenticated
  using ((select public.tengo_herramienta('mesa-arbitro')));
create policy centroamericano_asignaciones_ver on public.centroamericano_asignaciones
  for select to authenticated
  using ((select public.tengo_herramienta('mesa-arbitro')));
create policy centroamericano_asignaciones_crear on public.centroamericano_asignaciones
  for insert to authenticated
  with check (creada_por = (select auth.uid()) and (select public.tengo_herramienta('mesa-arbitro')));
create policy centroamericano_asignaciones_apagar on public.centroamericano_asignaciones
  for update to authenticated
  using ((select public.tengo_herramienta('mesa-arbitro')))
  with check ((select public.tengo_herramienta('mesa-arbitro')));
create policy centroamericano_registro_ver on public.centroamericano_registro
  for select to authenticated
  using ((select public.tengo_herramienta('mesa-arbitro')));

-- Reparte accesos y claves: queda anotado en la bitácora de auditoría. Se le
-- pasan las columnas que sí se anotan: el token del enlace es un secreto y no
-- debe copiarse a la bitácora.
create trigger auditar after insert or update or delete on public.centroamericano_asignaciones
  for each row execute function interno.auditar('arbitro', 'tnr', 'mesa_desde', 'mesa_hasta', 'vence', 'revocada');
create trigger auditar after insert or update or delete on public.centroamericano_torneos
  for each row execute function interno.auditar('tnr', 'sid_en_boveda', 'clave_puesta');
