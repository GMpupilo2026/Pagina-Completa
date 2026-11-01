-- Centroamericano 2026: un árbitro con mesas de varios torneos, la presencia de los jugadores
-- y el control de tiempos. Ver «Mesas de varios torneos, presencia y control de tiempos» en
-- docs/decisiones/juegos-y-torneos.md.
--
-- 1. centroamericano_asignaciones.persona: el MISMO árbitro con mesas de varios torneos (o de
--    dos tramos del mismo). Cada tramo sigue siendo un enlace (su torneo, su rango, su avance,
--    su lista previa y su «finalizar»); `persona` los junta: el árbitro abre UNO y la página
--    le deja pasar a los otros. Es solo una etiqueta que pone la organización: sin persona,
--    el enlace es de una sola cosa, como hasta ahora.
-- 2. avisos.control_tiempos: la organización le pide a uno, a un torneo o a todos un control de
--    tiempos con un mensaje que además abre la ventana en la página del árbitro. Es una columna
--    nueva (no se toca ninguna restricción ni política: `tipo` sigue siendo cosa de la función).
-- 3. centroamericano_presencia: por partida y color, si el jugador llegó (presente) o no. De ahí
--    sale la lista de los que faltan. Una sola fila por jugador y ronda: marcar otra vez la
--    actualiza (el árbitro se corrige o el jugador llega tarde).
-- 4. centroamericano_tiempos: el control de tiempos. Cada lectura es una línea que SOLO SE AGREGA:
--    la jugada en que va la partida, a quién le toca y lo que marca cada reloj. Si un reloj falla,
--    la última lectura sirve para corregirlo.
-- La copia de seguridad y «restaurar» incluyen todo esto.

alter table public.centroamericano_asignaciones add column persona uuid;
comment on column public.centroamericano_asignaciones.persona is
  'Junta los enlaces del MISMO árbitro (varios torneos o varios tramos). Lo pone la organización al crear el enlace; null = enlace suelto.';
create index centroamericano_asignaciones_persona_idx on public.centroamericano_asignaciones (persona) where persona is not null;
grant insert (persona) on public.centroamericano_asignaciones to authenticated;
grant update (persona) on public.centroamericano_asignaciones to authenticated;

alter table public.centroamericano_avisos add column control_tiempos boolean not null default false;
comment on column public.centroamericano_avisos.control_tiempos is
  'true: es un mensaje de la organización que además pide un control de tiempos (a la página del árbitro se le abre la ventana). Solo lo escribe la organización, y solo en sus mensajes (la política exige de = organizacion).';
grant insert (control_tiempos) on public.centroamericano_avisos to authenticated;

create table public.centroamericano_presencia (
  id uuid primary key default gen_random_uuid(),
  asignacion_id uuid references public.centroamericano_asignaciones(id) on delete set null,
  arbitro text not null default '' check (length(arbitro) <= 80),
  tnr text not null references public.centroamericano_torneos(tnr),
  ronda integer not null check (ronda between 1 and 99),
  mesa integer not null check (mesa between 1 and 9999),
  color text not null check (color in ('blancas', 'negras')),
  jugador text not null default '' check (length(jugador) <= 120),
  presente boolean not null,
  marcada timestamptz not null default now(),
  unique (tnr, ronda, mesa, color)
);
comment on table public.centroamericano_presencia is
  'Si el jugador de una mesa llegó (presente) o no, según el árbitro de esa mesa. Una fila por torneo, ronda, mesa y color; marcar otra vez la actualiza. La escribe la Edge Function centroamericano-mesa con el nombre que leyó de chess-results.';

create table public.centroamericano_tiempos (
  id uuid primary key default gen_random_uuid(),
  ocurrio timestamptz not null default now(),
  asignacion_id uuid references public.centroamericano_asignaciones(id) on delete set null,
  arbitro text not null default '' check (length(arbitro) <= 80),
  tnr text not null references public.centroamericano_torneos(tnr),
  ronda integer not null check (ronda between 1 and 99),
  mesa integer not null check (mesa between 1 and 9999),
  blancas text not null default '' check (length(blancas) <= 120),
  negras text not null default '' check (length(negras) <= 120),
  jugada integer not null check (jugada between 1 and 400),
  turno text check (turno in ('blancas', 'negras')),
  t_blancas integer not null check (t_blancas between 0 and 36000),
  t_negras integer not null check (t_negras between 0 and 36000),
  nota text not null default '' check (length(nota) <= 500)
);
comment on table public.centroamericano_tiempos is
  'El control de tiempos de una partida sin terminar: jugada, a quién le toca y los segundos que le quedan a cada reloj. Solo se agrega; la escribe la Edge Function centroamericano-mesa.';
create index centroamericano_tiempos_partida_idx on public.centroamericano_tiempos (tnr, ronda, mesa, ocurrio);

alter table public.centroamericano_presencia enable row level security;
alter table public.centroamericano_tiempos enable row level security;
revoke all on public.centroamericano_presencia, public.centroamericano_tiempos from public, anon, authenticated;
grant select on public.centroamericano_presencia, public.centroamericano_tiempos to authenticated;
create policy centroamericano_presencia_ver on public.centroamericano_presencia
  for select to authenticated using ((select public.tengo_herramienta('mesa-arbitro')));
create policy centroamericano_tiempos_ver on public.centroamericano_tiempos
  for select to authenticated using ((select public.tengo_herramienta('mesa-arbitro')));

-- La instantánea y restaurar, con lo nuevo.
create or replace function interno.centroamericano_instantanea()
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
    'planillas', coalesce((select jsonb_agg(to_jsonb(l) order by l.subida) from public.centroamericano_planillas l), '[]'::jsonb),
    'presencia', coalesce((select jsonb_agg(to_jsonb(s) order by s.marcada) from public.centroamericano_presencia s), '[]'::jsonb),
    'tiempos', coalesce((select jsonb_agg(to_jsonb(t) order by t.ocurrio) from public.centroamericano_tiempos t), '[]'::jsonb)
  );
$$;

create or replace function public.centroamericano_restaurar(p_copia jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_yo uuid := (select auth.uid());
  v_a integer; v_r integer; v_v integer; v_p integer; v_f integer; v_l integer; v_n integer; v_s integer; v_t integer;
begin
  if not coalesce((select public.tengo_herramienta('mesa-arbitro')), false) then
    raise exception 'Tu cuenta no tiene la licencia de la Mesa del árbitro' using errcode = '42501';
  end if;
  if p_copia is null or jsonb_typeof(p_copia) <> 'object' or (p_copia->>'version') is distinct from '1' or p_copia->>'evento' is distinct from 'Centroamericano 2026' then
    raise exception 'Ese archivo no es una copia del Centroamericano 2026' using errcode = '22023';
  end if;

  insert into public.centroamericano_asignaciones (id, token, tnr, arbitro, nombrado, persona, mesa_desde, mesa_hasta, vence, revocada, creada_por, creada, ultimo_uso)
  select r.id, r.token, r.tnr, r.arbitro, r.nombrado, r.persona, r.mesa_desde, r.mesa_hasta, r.vence, r.revocada, v_yo, r.creada, r.ultimo_uso
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

  insert into public.centroamericano_presencia (id, asignacion_id, arbitro, tnr, ronda, mesa, color, jugador, presente, marcada)
  select r.id, r.asignacion_id, r.arbitro, r.tnr, r.ronda, r.mesa, r.color, r.jugador, r.presente, r.marcada
    from jsonb_populate_recordset(null::public.centroamericano_presencia, p_copia->'presencia') r
  on conflict do nothing;
  get diagnostics v_s = row_count;

  insert into public.centroamericano_tiempos (id, ocurrio, asignacion_id, arbitro, tnr, ronda, mesa, blancas, negras, jugada, turno, t_blancas, t_negras, nota)
  select r.id, r.ocurrio, r.asignacion_id, r.arbitro, r.tnr, r.ronda, r.mesa, r.blancas, r.negras, r.jugada, r.turno, r.t_blancas, r.t_negras, r.nota
    from jsonb_populate_recordset(null::public.centroamericano_tiempos, p_copia->'tiempos') r
  on conflict do nothing;
  get diagnostics v_t = row_count;

  return jsonb_build_object('asignaciones', v_a, 'registro', v_r, 'avisos', v_v, 'progreso', v_p, 'finales', v_f, 'planillas', v_l, 'presencia', v_s, 'tiempos', v_t);
end;
$$;
