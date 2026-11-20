-- Premios de cada academia y el rango de cada alumno.
--
-- La idea es de Chessgora («sube de rango al asistir y entrenar, y canjea
-- premios que pone su academia»). Los Puntos Ajedrez ya existían (el ledger
-- puntos_ajustes) y la tienda de premios también, pero con UN catálogo para
-- todo el sitio (premios_catalogo: títulos, accesorios, puntos dobles, cursos).
-- Lo que faltaba:
--
-- 1. Premios que pone CADA academia —una clase extra, una camiseta, elegir la
--    apertura de la clase— que su alumno canjea con sus puntos y su supervisor
--    entrega en persona y marca como entregado.
-- 2. Un rango que sube con los puntos GANADOS (no con el saldo: canjear un
--    premio no te baja de rango). Los nombres y los puntos de cada rango
--    viven en js/rangos.js (una sola copia); la base solo da los puntos
--    ganados, con permiso (puntos_ganados_de).
--
-- Decisiones:
--
-- * premios_academia y premios_academia_canjes NO tienen política de
--   escritura: el supervisor (o quien administra) arma los premios con
--   premio_academia_guardar(), el alumno canjea con
--   canjear_premio_academia() y el supervisor resuelve con
--   canje_academia_resolver(). Las tres validan con coalesce.
-- * Canjear usa el MISMO candado que canjear_premio()
--   (pg_advisory_xact_lock de 'puntos:<alumno>'): dos canjes a la vez, uno en
--   cada tienda, no pueden dejar el saldo en negativo. Las existencias se
--   bloquean con FOR UPDATE: dos alumnos no se llevan la última camiseta.
-- * Solo canjea quien es MIEMBRO de la academia (academia_miembros): las
--   academias son privadas, y un premio de ADAPZ no se ve ni se canjea en CCDR.
-- * El canje guarda una foto (nombre y costo pagado): si después el premio
--   cambia de precio o se apaga, el canje dice lo que se canjeó de verdad.
--   Los premios no se borran, se apagan (activo = false): borrar uno dejaría
--   canjes sin premio.
-- * Cancelar un canje pendiente le DEVUELVE los puntos al alumno
--   (ajuste_manual, referencia devolucion:canje_academia:<id>, que no se
--   paga dos veces) y repone la existencia. Lo devuelto no cuenta como
--   ganado: no sube el rango.
-- * Los canjes reparten puntos, igual que premios_canjeados: llevan el
--   trigger de auditoría y van en VIGILADAS de verificar-auditoria.js.

-- ---------------- Las tablas ----------------
create table public.premios_academia (
  id                 uuid primary key default gen_random_uuid(),
  academia_id        uuid not null references public.academias(id) on delete cascade,
  nombre             text not null check (char_length(btrim(nombre)) between 1 and 80),
  descripcion        text not null default '' check (char_length(descripcion) <= 300),
  emoji              text not null default '🎁' check (char_length(emoji) between 1 and 8),
  costo_puntos       integer not null check (costo_puntos between 1 and 1000000),
  existencias        integer check (existencias between 0 and 100000),
  limite_por_alumno  integer check (limite_por_alumno between 1 and 1000),
  activo             boolean not null default true,
  creado_por         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.premios_academia is
  'Premios que pone cada academia (una clase extra, una camiseta…) para canjear con Puntos Ajedrez. existencias nulo = sin límite. No se borran: se apagan. Los escribe premio_academia_guardar().';
create index premios_academia_academia on public.premios_academia (academia_id);

create table public.premios_academia_canjes (
  id            uuid primary key default gen_random_uuid(),
  premio_id     uuid not null references public.premios_academia(id) on delete restrict,
  academia_id   uuid not null references public.academias(id) on delete cascade,
  alumno_id     uuid not null references public.profiles(id) on delete cascade,
  nombre        text not null,
  costo_pagado  integer not null check (costo_pagado > 0),
  estado        text not null default 'pendiente' check (estado in ('pendiente', 'entregado', 'cancelado')),
  created_at    timestamptz not null default now(),
  resuelto_at   timestamptz,
  resuelto_por  uuid references public.profiles(id) on delete set null
);
comment on table public.premios_academia_canjes is
  'Cada canje de un premio de academia, con la foto del nombre y el costo. Pendiente hasta que el supervisor lo entrega o lo cancela (cancelar devuelve los puntos). Lo escriben canjear_premio_academia() y canje_academia_resolver().';
create index premios_academia_canjes_academia on public.premios_academia_canjes (academia_id, estado);
create index premios_academia_canjes_alumno on public.premios_academia_canjes (alumno_id);

alter table public.premios_academia enable row level security;
alter table public.premios_academia_canjes enable row level security;
revoke all on public.premios_academia, public.premios_academia_canjes from public, anon, authenticated;
grant select on public.premios_academia, public.premios_academia_canjes to authenticated;

-- Los ve quien administra, el supervisor de la academia y su gente.
create policy premios_academia_ver on public.premios_academia for select to authenticated
  using ((select public.soy_admin())
         or academia_id in (select a.id from public.academias a where a.supervisor_id = (select auth.uid()))
         or academia_id in (select m.academia_id from public.academia_miembros m where m.persona_id = (select auth.uid())));

-- Un canje lo ven quien administra, el supervisor de la academia y el alumno que lo hizo.
create policy premios_academia_canjes_ver on public.premios_academia_canjes for select to authenticated
  using ((select public.soy_admin())
         or alumno_id = (select auth.uid())
         or academia_id in (select a.id from public.academias a where a.supervisor_id = (select auth.uid())));

create trigger auditar after insert or update on public.premios_academia_canjes
  for each row execute function interno.auditar();

-- ---------------- Armar los premios ----------------
create or replace function public.premio_academia_guardar(
  p_id                uuid,
  p_academia          uuid,
  p_nombre            text,
  p_descripcion       text,
  p_emoji             text,
  p_costo             integer,
  p_existencias       integer,
  p_limite_por_alumno integer,
  p_activo            boolean
)
returns public.premios_academia
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_fila public.premios_academia;
  v_academia uuid := p_academia;
begin
  if p_id is not null then
    select academia_id into v_academia from public.premios_academia where id = p_id;
    if v_academia is null then raise exception 'Ese premio ya no existe.'; end if;
  end if;
  if not coalesce(public.soy_admin() or public.supervisa_academia(v_academia), false) then
    raise exception 'Solo el supervisor de la academia o quien administra arma sus premios.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_nombre), '') = '' then raise exception 'El premio necesita un nombre.'; end if;
  if p_costo is null or p_costo < 1 then raise exception 'Pon cuántos puntos cuesta.'; end if;

  if p_id is null then
    insert into public.premios_academia (academia_id, nombre, descripcion, emoji, costo_puntos, existencias, limite_por_alumno, activo, creado_por)
    values (v_academia, btrim(p_nombre), coalesce(btrim(p_descripcion), ''), coalesce(nullif(btrim(p_emoji), ''), '🎁'),
            p_costo, p_existencias, p_limite_por_alumno, coalesce(p_activo, true), auth.uid())
    returning * into v_fila;
  else
    update public.premios_academia
       set nombre = btrim(p_nombre), descripcion = coalesce(btrim(p_descripcion), ''),
           emoji = coalesce(nullif(btrim(p_emoji), ''), '🎁'), costo_puntos = p_costo,
           existencias = p_existencias, limite_por_alumno = p_limite_por_alumno,
           activo = coalesce(p_activo, true), updated_at = now()
     where id = p_id
     returning * into v_fila;
  end if;
  return v_fila;
end;
$$;
revoke execute on function public.premio_academia_guardar(uuid, uuid, text, text, text, integer, integer, integer, boolean) from public, anon;
grant execute on function public.premio_academia_guardar(uuid, uuid, text, text, text, integer, integer, integer, boolean) to authenticated;

-- ---------------- Canjear ----------------
create or replace function public.canjear_premio_academia(p_premio uuid)
returns table(canje_id uuid, saldo_restante integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_yo uuid := auth.uid();
  v_premio public.premios_academia;
  v_saldo integer;
  v_veces integer;
  v_canje uuid := gen_random_uuid();
begin
  if v_yo is null then raise exception 'Hace falta iniciar sesión.' using errcode = '42501'; end if;

  -- El mismo candado que canjear_premio(): un canje a la vez por alumno.
  perform pg_advisory_xact_lock(hashtext('puntos:' || v_yo::text));

  select * into v_premio from public.premios_academia where id = p_premio and activo for update;
  if v_premio.id is null then raise exception 'Ese premio ya no está disponible.' using errcode = '22023'; end if;
  if not exists (select 1 from public.academia_miembros m where m.academia_id = v_premio.academia_id and m.persona_id = v_yo) then
    raise exception 'Ese premio es de otra academia.' using errcode = '42501';
  end if;
  if v_premio.existencias is not null and v_premio.existencias < 1 then
    raise exception 'Se acabaron: ya no quedan de ese premio.' using errcode = '22023';
  end if;
  if v_premio.limite_por_alumno is not null then
    select count(*) into v_veces from public.premios_academia_canjes
     where premio_id = p_premio and alumno_id = v_yo and estado <> 'cancelado';
    if v_veces >= v_premio.limite_por_alumno then
      raise exception 'Ya canjeaste este premio el máximo de veces permitido.' using errcode = '22023';
    end if;
  end if;

  select coalesce(sum(cantidad), 0) into v_saldo from public.puntos_ajustes where student_id = v_yo;
  if v_saldo < v_premio.costo_puntos then
    raise exception 'Te faltan % puntos para este premio.', (v_premio.costo_puntos - v_saldo) using errcode = '22023';
  end if;

  perform interno.otorgar_puntos(v_yo, -v_premio.costo_puntos, 'canje', 'Canjeado: ' || v_premio.nombre, 'canje_academia:' || v_canje::text);
  if v_premio.existencias is not null then
    update public.premios_academia set existencias = existencias - 1 where id = p_premio;
  end if;
  insert into public.premios_academia_canjes (id, premio_id, academia_id, alumno_id, nombre, costo_pagado)
  values (v_canje, p_premio, v_premio.academia_id, v_yo, v_premio.nombre, v_premio.costo_puntos);

  select coalesce(sum(cantidad), 0) into v_saldo from public.puntos_ajustes where student_id = v_yo;
  return query select v_canje, v_saldo;
end;
$$;
revoke execute on function public.canjear_premio_academia(uuid) from public, anon;
grant execute on function public.canjear_premio_academia(uuid) to authenticated;

-- ---------------- Entregar o cancelar ----------------
create or replace function public.canje_academia_resolver(p_canje uuid, p_estado text)
returns public.premios_academia_canjes
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_canje public.premios_academia_canjes;
begin
  if p_estado not in ('entregado', 'cancelado') then raise exception 'El canje se entrega o se cancela.'; end if;
  select * into v_canje from public.premios_academia_canjes where id = p_canje for update;
  if v_canje.id is null then raise exception 'Ese canje no existe.'; end if;
  if not coalesce(public.soy_admin() or public.supervisa_academia(v_canje.academia_id), false) then
    raise exception 'Solo el supervisor de la academia o quien administra entrega los premios.' using errcode = '42501';
  end if;
  if v_canje.estado <> 'pendiente' then raise exception 'Ese canje ya está %.', v_canje.estado; end if;

  if p_estado = 'cancelado' then
    -- Se le devuelven los puntos (una sola vez, por la referencia) y se repone la existencia.
    perform pg_advisory_xact_lock(hashtext('puntos:' || v_canje.alumno_id::text));
    perform interno.otorgar_puntos(v_canje.alumno_id, v_canje.costo_pagado, 'ajuste_manual',
      'Devuelto: ' || v_canje.nombre, 'devolucion:canje_academia:' || v_canje.id::text, auth.uid());
    update public.premios_academia set existencias = existencias + 1
     where id = v_canje.premio_id and existencias is not null;
  end if;

  update public.premios_academia_canjes
     set estado = p_estado, resuelto_at = now(), resuelto_por = auth.uid()
   where id = p_canje
   returning * into v_canje;
  return v_canje;
end;
$$;
revoke execute on function public.canje_academia_resolver(uuid, text) from public, anon;
grant execute on function public.canje_academia_resolver(uuid, text) to authenticated;

-- ---------------- El rango ----------------
-- Los puntos ganados (interno.puntos_ganados) de alguien, para su rango: los
-- de uno mismo, los de un alumno propio, o cualquiera para quien administra.
create or replace function public.puntos_ganados_de(p_alumno uuid default auth.uid())
returns integer
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not coalesce(p_alumno = auth.uid() or public.soy_profesor_de(p_alumno) or public.soy_admin(), false) then
    raise exception 'No puedes ver los puntos de esa cuenta.' using errcode = '42501';
  end if;
  return interno.puntos_ganados(p_alumno);
end;
$$;
revoke execute on function public.puntos_ganados_de(uuid) from public, anon;
grant execute on function public.puntos_ganados_de(uuid) to authenticated;
