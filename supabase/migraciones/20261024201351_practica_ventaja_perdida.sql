-- Practicar contra el motor: quien tuvo más de 3 de ventaja y no ganó pierde
-- 350 puntos de la clase, una vez por ejercicio.
--
-- «Cada ejercicio de práctica que se coloque en la clase y que tengan ventaja
-- de más de 3 puntos y la pierdan, bajarles 350 puntos de clase.»
--
--  * La ventaja es la evaluación del motor que ya se guarda en cada jugada
--    (practice_games.eval_cp, en centipeones y desde las blancas; un mate vale
--    ±100000). Más de 3 es más de 300 desde el lado del alumno.
--  * La base lleva la MAYOR ventaja que tuvo el alumno en el intento
--    (ventaja_max_cp): un trigger la toma de cada eval_cp que llega, nadie la
--    escribe desde afuera, y vuelve a empezar al reintentar (eval_cp vuelve a
--    null). Al reintentar, practica_guardar_intento la copia con el intento
--    que termina a practice_intentos.
--  * «La pierdan» es que el intento terminó sin ganar: tablas, perdió por mate,
--    se rindió o se le cayó el reloj. Una ronda que el profe cierra con la
--    partida en juego no cuenta: la ventaja no se perdió.
--  * No se guarda la resta: se calcula (ventajas_perdidas, ventajas_perdidas_del_mes,
--    SECURITY INVOKER, con el mismo filtro de quién ve qué que los puntos de
--    Habilidades). Una vez por ejercicio: si perdió la ventaja en dos intentos
--    de la misma ronda, son 350, no 700.
--  * La página la suma con la regla de js/puntos-clase.js (REGLAS, −350).
--    Como lo demás de REGLAS, no entra en Puntos Ajedrez al cerrar la clase.
-- Ver «Practicar: perder una ventaja de más de 3 resta 350 puntos» en
-- docs/decisiones/clase-en-vivo.md.
set local lock_timeout = '8s';

alter table public.practice_games add column if not exists ventaja_max_cp integer;
alter table public.practice_intentos add column if not exists ventaja_max_cp integer;
comment on column public.practice_games.ventaja_max_cp is
  'La mayor ventaja que tuvo el alumno en el intento en curso, en centipeones desde su lado (de eval_cp). La pone el trigger practica_ventaja_maxima.';
comment on column public.practice_intentos.ventaja_max_cp is
  'La mayor ventaja que tuvo el alumno en ese intento, en centipeones desde su lado.';

create or replace function interno.practica_ventaja_maxima()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v integer := case when new.eval_cp is null then null
                    when new.student_color = 'b' then -new.eval_cp
                    else new.eval_cp end;
begin
  if tg_op = 'INSERT' or new.attempts is distinct from old.attempts then
    new.ventaja_max_cp := v;
  else
    new.ventaja_max_cp := greatest(old.ventaja_max_cp, v);
  end if;
  return new;
end;
$$;
revoke execute on function interno.practica_ventaja_maxima() from public, anon, authenticated;

-- Después de practica_ayuda_proteger y practica_intentos_al_crear (los BEFORE
-- van por orden alfabético): toma la fila ya protegida.
create or replace trigger practica_ventaja_maxima
  before insert or update on public.practice_games
  for each row execute function interno.practica_ventaja_maxima();

create or replace function interno.practica_guardar_intento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.attempts > old.attempts then
    insert into public.practice_intentos (game_id, session_id, student_id, intento, moves, status, ventaja_max_cp)
    values (old.id, old.session_id, old.student_id, old.attempts,
            coalesce(old.moves, '[]'::jsonb), old.status, old.ventaja_max_cp)
    on conflict (game_id, intento) do nothing;
  end if;
  return null;
end;
$$;
revoke execute on function interno.practica_guardar_intento() from public, anon, authenticated;

-- Los ejercicios de una clase en que cada alumno perdió una ventaja de más de 3.
create or replace function public.ventajas_perdidas(p_clase uuid)
returns table (student_id uuid, perdidas integer)
language sql
stable
security invoker
set search_path = public
as $$
  with ps as (
    select s.id from public.practice_sessions s where s.class_session_id = p_clase
  ),
  intentos as (
    select g.session_id, g.student_id, g.status, g.ventaja_max_cp
      from public.practice_games g where g.session_id in (select id from ps)
    union all
    select i.session_id, i.student_id, i.status, i.ventaja_max_cp
      from public.practice_intentos i where i.session_id in (select id from ps)
  )
  select x.student_id, count(distinct x.session_id)::int
    from intentos x
   where x.ventaja_max_cp > 300
     and x.status in ('draw', 'checkmate_loss', 'resigned', 'timeout')
     and x.student_id is distinct from (select cs.created_by from public.class_sessions cs where cs.id = p_clase)
   group by x.student_id;
$$;
revoke execute on function public.ventajas_perdidas(uuid) from public, anon;
grant execute on function public.ventajas_perdidas(uuid) to authenticated;

-- Los del mes, con el mismo filtro que puntos_de_habilidades_del_mes.
create or replace function public.ventajas_perdidas_del_mes(p_profesor uuid default null)
returns table (student_id uuid, perdidas integer)
language sql
stable
security invoker
set search_path = public
as $$
  select r.student_id, sum(r.perdidas)::int
    from public.class_sessions cs
    cross join lateral public.ventajas_perdidas(cs.id) r
   where cs.started_at >= (date_trunc('month', now() at time zone 'America/Costa_Rica') at time zone 'America/Costa_Rica')
     and (p_profesor is null or cs.created_by = p_profesor)
     and (cs.created_by = (select auth.uid())
          or cs.id in (select s.class_session_id from public.practice_games g
                         join public.practice_sessions s on s.id = g.session_id
                        where g.student_id = (select auth.uid()) and s.class_session_id is not null))
     and (r.student_id = (select auth.uid()) or cs.created_by = (select auth.uid()))
   group by r.student_id;
$$;
revoke execute on function public.ventajas_perdidas_del_mes(uuid) from public, anon;
grant execute on function public.ventajas_perdidas_del_mes(uuid) to authenticated;
