-- Metropolitano 2026: el árbitro, el cupo de camas del hospedaje y el enlace
-- para corregir la inscripción.
--
-- 1. El árbitro se inscribe como el entrenador: el ID FIDE si tiene, no juega
--    ni paga, y pide hospedaje y alimentación como cualquiera.
-- 2. El hospedaje del Estadio Nacional tiene camas contadas: administración
--    pone cuántas hay por noche (metropolitano_hospedaje; sin número, no hay
--    tope) y la base cuenta noche por noche quién duerme ahí —quien lo pidió,
--    con sus acompañantes, y los titulados invitados según sus días—. Llena una
--    noche, la base no deja pedirla; la página deja de ofrecerlo cuando todas
--    las noches del torneo están llenas.
-- 3. Cada envío lleva un enlace secreto para corregirse después
--    (metropolitano_enlaces, que nadie lee desde afuera): sale en la
--    confirmación de la página y en los correos.
-- Ver «El árbitro», «El cupo del hospedaje» y «Corregir la inscripción» en
-- docs/decisiones/cuentas-y-formularios.md.

alter table public.metropolitano_inscripciones drop constraint metropolitano_inscripciones_rol_check;
alter table public.metropolitano_inscripciones add constraint metropolitano_inscripciones_rol_check
  check (rol = any (array['jugador', 'entrenador', 'acompanante', 'delegado', 'arbitro']));

-- Las camas por noche. Una sola fila, con su bitácora; sin número, sin tope.
create table public.metropolitano_hospedaje (
  id              boolean primary key default true check (id),
  camas           int check (camas >= 0 and camas <= 5000),
  actualizado     timestamptz not null default now(),
  actualizado_por uuid references public.profiles(id) on delete set null
);
insert into public.metropolitano_hospedaje (id) values (true);
alter table public.metropolitano_hospedaje enable row level security;
create policy metropolitano_hospedaje_ver on public.metropolitano_hospedaje for select to authenticated
  using ((select public.soy_admin()));
revoke all on table public.metropolitano_hospedaje from anon;
revoke insert, update, delete, truncate, references, trigger on table public.metropolitano_hospedaje from authenticated;
grant select on table public.metropolitano_hospedaje to authenticated;
create trigger auditar after insert or delete or update on public.metropolitano_hospedaje
  for each row execute function interno.auditar('camas');

-- Quién duerme cada noche (del 20 de diciembre al 2 de enero): quien pidió
-- hospedaje, más sus acompañantes, y los titulados invitados del día de
-- llegada al de salida. Una inscripción anulada o con el pago rechazado no
-- ocupa cama.
create or replace function interno.metropolitano_noches()
returns table (noche date, personas int)
language sql
stable
security definer
set search_path = public
as $$
  with quien as (
    select m.hospedaje_desde d, m.hospedaje_hasta h, 1 + coalesce(m.acompanantes, 0) n
      from public.metropolitano_inscripciones m
     where m.estado = 'activa' and m.pago_estado <> 'rechazado' and m.hospedaje
    union all
    select (m.viaje->>'llegada')::date, (m.viaje->>'salida')::date, 1
      from public.metropolitano_inscripciones m
     where m.estado = 'activa' and m.rol = 'jugador' and m.titulo in ('GM', 'IM', 'WGM')
       and coalesce(m.viaje->>'llegada', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       and coalesce(m.viaje->>'salida', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
  select g::date, coalesce(sum(q.n) filter (where q.d <= g::date and g::date < q.h), 0)::int
    from generate_series(date '2026-12-20', date '2027-01-02', interval '1 day') g
    left join quien q on true
   group by g order by g;
$$;
revoke execute on function interno.metropolitano_noches() from public, anon, authenticated;

-- «27 de diciembre», para los mensajes.
create or replace function interno.metropolitano_dia(d date)
returns text
language sql
immutable
set search_path = public
as $$
  select extract(day from d)::int || ' de ' || (array['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
    'septiembre', 'octubre', 'noviembre', 'diciembre'])[extract(month from d)::int];
$$;
revoke execute on function interno.metropolitano_dia(date) from public, anon, authenticated;

-- Para la página de inscripción (sin cuenta): si hay tope, cuántas camas
-- quedan cada noche, y si las del torneo (del 25 al 29) están todas llenas.
create or replace function public.metropolitano_hospedaje_ver()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_camas int;
begin
  select h.camas into v_camas from public.metropolitano_hospedaje h where h.id;
  if v_camas is null then
    return jsonb_build_object('limite', false);
  end if;
  return (select jsonb_build_object('limite', true,
      'quedan', jsonb_object_agg(o.noche::text, greatest(v_camas - o.personas, 0)),
      'lleno', bool_and(v_camas - o.personas <= 0) filter (where o.noche between date '2026-12-25' and date '2026-12-29'))
    from interno.metropolitano_noches() o);
end;
$$;
revoke execute on function public.metropolitano_hospedaje_ver() from public;
grant execute on function public.metropolitano_hospedaje_ver() to anon, authenticated;

-- Para administración: las camas y cuántas están ocupadas cada noche.
create or replace function public.metropolitano_hospedaje_estado()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.metropolitano_hospedaje%rowtype;
begin
  if not coalesce(public.soy_admin(), false) then
    raise exception 'Solo administración ve el hospedaje.';
  end if;
  select * into v from public.metropolitano_hospedaje where id;
  return jsonb_build_object('camas', v.camas, 'actualizado', v.actualizado,
    'noches', (select jsonb_agg(jsonb_build_object('noche', o.noche, 'ocupadas', o.personas) order by o.noche) from interno.metropolitano_noches() o));
end;
$$;
revoke execute on function public.metropolitano_hospedaje_estado() from public, anon;
grant execute on function public.metropolitano_hospedaje_estado() to authenticated;

-- Las camas por noche (null: sin tope). No pueden ser menos que las ya ocupadas.
create or replace function public.metropolitano_hospedaje_configurar(p_camas int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max record;
begin
  if not coalesce(public.soy_admin(), false) then
    raise exception 'Solo administración configura el hospedaje.';
  end if;
  if p_camas is not null and (p_camas < 0 or p_camas > 5000) then
    raise exception 'Las camas van de 0 a 5000 (vacío: sin tope).';
  end if;
  perform 1 from public.metropolitano_hospedaje where id for update;
  select o.noche, o.personas into v_max from interno.metropolitano_noches() o order by o.personas desc, o.noche limit 1;
  if p_camas is not null and v_max.personas > p_camas then
    raise exception 'La noche del % ya hay % camas ocupadas: las camas no pueden ser menos.', interno.metropolitano_dia(v_max.noche), v_max.personas;
  end if;
  update public.metropolitano_hospedaje set camas = p_camas, actualizado = now(), actualizado_por = auth.uid() where id;
  return public.metropolitano_hospedaje_estado();
end;
$$;
revoke execute on function public.metropolitano_hospedaje_configurar(int) from public, anon;
grant execute on function public.metropolitano_hospedaje_configurar(int) to authenticated;

-- El enlace para corregir cada envío: solo lo leen las funciones.
create table public.metropolitano_enlaces (
  inscripcion uuid primary key references public.metropolitano_inscripciones(id) on delete cascade,
  token       text not null unique check (token ~ '^[0-9a-f]{64}$'),
  creado      timestamptz not null default now()
);
alter table public.metropolitano_enlaces enable row level security;
revoke all on table public.metropolitano_enlaces from anon, authenticated;
