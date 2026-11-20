-- Cuánto habló cada alumno en la llamada de la clase.
--
-- Lo pidió el dueño el 18/11/2026: que el profe sepa quién participa y quién
-- se queda callado. Lo mide la página del profe mientras está en la llamada:
-- cada segundo mira a quién marca LiveKit como «hablando» y le suma ese
-- segundo; cada minuto (y al salir) lo manda acá.
--
-- 1. public.llamada_participacion: una fila por clase y persona, con los
--    segundos. Es una tabla aparte, no una columna de class_attendance: esa
--    fila la escribe el mismo alumno al entrar, así que podría ponerse los
--    minutos que quisiera. Esta no tiene ninguna política de escritura.
-- 2. public.sumar_segundos_hablados(clase, {persona: segundos}): la escribe.
--    Solo el profe que abrió la clase, mientras está abierta (o recién
--    cerrada: la última tanda se manda al terminar), y solo a quienes tienen
--    asistencia en esa clase. Cada tanda suma como mucho 900 segundos por
--    persona (se manda cada minuto; el tope deja margen si una tanda se
--    atrasó, y no deja inventar una hora de un solo pedido).
-- 3. La leen el profe de la clase, la propia persona, sus profes y
--    administración. La RLS arma el conjunto UNA vez (ver «La RLS de las
--    tablas de actividad arma el conjunto UNA vez»).
--
-- Ver «Los minutos hablados» en docs/decisiones/clase-en-vivo.md.

create table if not exists public.llamada_participacion (
  class_session_id uuid not null references public.class_sessions(id) on delete cascade,
  persona_id uuid not null references public.profiles(id) on delete cascade,
  segundos integer not null default 0 check (segundos >= 0),
  actualizado timestamptz not null default now(),
  primary key (class_session_id, persona_id)
);
create index if not exists llamada_participacion_persona_idx on public.llamada_participacion (persona_id);
comment on table public.llamada_participacion is
  'Segundos que habló cada persona en la llamada de una clase; los mide la página del profe y los suma sumar_segundos_hablados().';

alter table public.llamada_participacion enable row level security;

drop policy if exists llamada_participacion_select on public.llamada_participacion;
create policy llamada_participacion_select on public.llamada_participacion for select to authenticated
  using (
    persona_id = (select auth.uid())
    or class_session_id in (select c.id from public.class_sessions c where c.created_by = (select auth.uid()))
    or persona_id in (select interno.alumnos_de((select auth.uid())))
    or (select public.soy_admin())
  );

create or replace function public.sumar_segundos_hablados(p_clase uuid, p_segundos jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := (select auth.uid());
  v_cuantos integer := 0;
begin
  if not coalesce(yo is not null and exists (
        select 1 from public.class_sessions c
         where c.id = p_clase and c.created_by = yo
           and (c.ended_at is null or c.ended_at > now() - interval '30 minutes')), false) then
    raise exception 'Esa clase no es tuya o ya se cerró.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_segundos) is distinct from 'object' then
    return 0;
  end if;
  insert into public.llamada_participacion as lp (class_session_id, persona_id, segundos)
  select p_clase, a.student_id, least(greatest(round((e.value)::text::numeric)::integer, 0), 900)
    from jsonb_each(p_segundos) e
    join public.class_attendance a
      on a.session_id = p_clase and a.student_id::text = e.key
   where jsonb_typeof(e.value) = 'number'
  on conflict (class_session_id, persona_id)
  do update set segundos = lp.segundos + excluded.segundos, actualizado = now();
  get diagnostics v_cuantos = row_count;
  return v_cuantos;
end;
$$;
revoke execute on function public.sumar_segundos_hablados(uuid, jsonb) from public, anon;
grant execute on function public.sumar_segundos_hablados(uuid, jsonb) to authenticated;
