-- Puntos Ajedrez: quien no entrena al menos 4 días en la semana pierde la
-- mitad de sus puntos. Pedido por el dueño del sitio (24/10/2026). Ver «La
-- semana sin entrenar: se pierde la mitad» en docs/decisiones/puntos-y-premios.md.
--
-- · La semana va de lunes a domingo en hora de Costa Rica (la misma de los
--   retos de la semana). Un día cuenta si tiene AL MENOS UN ejercicio en
--   training_progress (el reto «Cuatro días» pide 5 por día: aquel es un
--   premio, esto es un castigo, y se cuenta con la vara más baja).
-- · El lunes a las 00:10 (hora de CR) pg_cron cobra la semana que terminó:
--   -floor(saldo / 2), con el saldo de ese momento. Referencia
--   'semana:<lunes>', así que correrla dos veces no cobra dos veces.
-- · Solo alumnos (role = 'alumno') con al menos 2 puntos y cuya cuenta ya
--   existía el lunes en que empezó la semana: a quien entró el jueves no se
--   le pueden pedir 4 días.
-- · Arranca con la semana del lunes 26/10/2026 (primer cobro el lunes 2/11):
--   cobrar una semana en la que nadie sabía de la regla sería una sorpresa,
--   no una regla.
-- · No pasa por el multiplicador de puntos dobles (solo dobla lo positivo).
--   El marcador del salón suma solo lo ganado, así que no lo mueve.
set local lock_timeout = '8s';

alter table public.puntos_ajustes drop constraint puntos_ajustes_origen_check;
alter table public.puntos_ajustes add constraint puntos_ajustes_origen_check
  check (origen in ('clase', 'entrenamiento', 'tarea', 'examen', 'racha', 'reto_semanal',
                    'canje', 'regalo', 'broma', 'ajuste_manual', 'partida', 'semana_sin_entrenar'));

-- Días distintos (hora de CR) con al menos un ejercicio, en la semana que
-- empieza el lunes p_lunes.
create or replace function interno.dias_entrenados(p_alumno uuid, p_lunes date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct (tp.created_at at time zone 'America/Costa_Rica')::date)::integer
    from public.training_progress tp
   where tp.student_id = p_alumno
     and tp.created_at >= p_lunes::timestamp at time zone 'America/Costa_Rica'
     and tp.created_at < (p_lunes + 7)::timestamp at time zone 'America/Costa_Rica';
$$;
revoke all on function interno.dias_entrenados(uuid, date) from public, anon, authenticated;

-- Cobra la semana que empieza p_lunes (por omisión, la que acaba de
-- terminar). Devuelve a quién y cuánto.
create or replace function interno.cobrar_semana_sin_entrenar(p_lunes date default null)
returns table (alumno uuid, dias integer, perdidos integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lunes date := coalesce(p_lunes,
    date_trunc('week', (now() at time zone 'America/Costa_Rica')::date)::date - 7);
  v_inicio timestamptz;
  v_saldo integer;
  v_n integer;
  a record;
begin
  if v_lunes < date '2026-10-26' or extract(isodow from v_lunes) <> 1 then
    return;
  end if;
  -- La semana tiene que haber terminado.
  if v_lunes + 7 > (now() at time zone 'America/Costa_Rica')::date then
    return;
  end if;
  v_inicio := v_lunes::timestamp at time zone 'America/Costa_Rica';

  for a in
    select p.id
      from public.profiles p
     where p.role = 'alumno'
       and p.created_at < v_inicio
       and exists (select 1 from public.puntos_ajustes pa where pa.student_id = p.id)
  loop
    dias := interno.dias_entrenados(a.id, v_lunes);
    continue when dias >= 4;
    perform pg_advisory_xact_lock(hashtext('puntos:' || a.id::text));
    select coalesce(sum(pa.cantidad), 0)::integer into v_saldo
      from public.puntos_ajustes pa where pa.student_id = a.id;
    continue when v_saldo < 2;
    insert into public.puntos_ajustes (student_id, cantidad, origen, motivo, referencia)
    values (a.id, -(v_saldo / 2), 'semana_sin_entrenar',
            'Semana del ' || to_char(v_lunes, 'DD/MM') || ': entrenaste ' || dias
              || case when dias = 1 then ' día' else ' días' end || ' de 4. Pierdes la mitad.',
            'semana:' || v_lunes::text)
    on conflict (student_id, origen, referencia) where referencia is not null do nothing;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      alumno := a.id; perdidos := v_saldo / 2;
      return next;
    end if;
  end loop;
end;
$$;
revoke all on function interno.cobrar_semana_sin_entrenar(date) from public, anon, authenticated;

-- Para el panel y la tienda: cuántos días lleva esta semana, cuánto
-- perdería, y lo que perdió la semana pasada (si perdió algo).
create or replace function public.semana_de_entrenamiento()
returns table (dias integer, meta integer, desde date, hasta date, en_juego integer,
               vigente boolean, perdidos_antes integer, dias_antes integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_yo uuid := (select auth.uid());
  v_lunes date := date_trunc('week', (now() at time zone 'America/Costa_Rica')::date)::date;
  v_saldo integer;
begin
  if v_yo is null then
    raise exception 'Hace falta iniciar sesión.' using errcode = '42501';
  end if;
  select coalesce(sum(pa.cantidad), 0)::integer into v_saldo
    from public.puntos_ajustes pa where pa.student_id = v_yo;
  dias := interno.dias_entrenados(v_yo, v_lunes);
  meta := 4;
  desde := v_lunes;
  hasta := v_lunes + 6;
  en_juego := v_saldo / 2;
  vigente := v_lunes >= date '2026-10-26'
    and exists (select 1 from public.profiles p where p.id = v_yo and p.role = 'alumno'
                  and p.created_at < v_lunes::timestamp at time zone 'America/Costa_Rica');
  select -pa.cantidad, interno.dias_entrenados(v_yo, v_lunes - 7) into perdidos_antes, dias_antes
    from public.puntos_ajustes pa
   where pa.student_id = v_yo and pa.origen = 'semana_sin_entrenar'
     and pa.referencia = 'semana:' || (v_lunes - 7)::text;
  return next;
end;
$$;
revoke execute on function public.semana_de_entrenamiento() from public, anon;
grant execute on function public.semana_de_entrenamiento() to authenticated;

select cron.schedule('puntos-semana-sin-entrenar', '10 6 * * 1',
  'select count(*) from interno.cobrar_semana_sin_entrenar();');
