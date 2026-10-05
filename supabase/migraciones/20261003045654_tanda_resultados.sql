-- Que el calentamiento con nota y la competencia también sumen puntos de la
-- clase (ver «Los puntos de la clase: dificultad, intentos y quién acierta
-- primero» en docs/decisiones/clase-en-vivo.md).
--
-- Hasta ahora lo que hacía cada alumno vivía solo en la presencia: se perdía
-- al cerrar. Ahora cada ejercicio terminado deja un renglón.
--  * Lo corrige la computadora del alumno (como antes): la base de ejercicios
--    es pública, así que una corrección en la base no impediría nada que no
--    se pueda hacer mirando la solución. Lo que sí pone la base es lo que no
--    se puede inventar: la hora, el plazo (dentro del tiempo de la tanda), el
--    orden (el ejercicio k solo después del k-1), uno por ejercicio (índice
--    único), quién es, de qué profe y de qué clase, el modo y el nivel.
--  * Los puntos: cada ejercicio bien vale lo de una respuesta a la primera
--    con la dificultad del nivel de la tanda; en la competencia (todos tienen
--    los mismos) el 1.º, 2.º y 3.º en resolver cada ejercicio suman como en
--    las preguntas.
set local lock_timeout = '8s';

create table if not exists public.tanda_resultados (
  id bigint generated always as identity primary key,
  semilla text not null check (char_length(semilla) between 4 and 40),
  student_id uuid not null references public.profiles(id) on delete cascade,
  profe_id uuid not null references public.profiles(id) on delete cascade,
  class_session_id uuid references public.class_sessions(id) on delete set null,
  indice integer not null check (indice between 0 and 199),
  bien boolean not null,
  modo text not null default 'nota' check (modo in ('nota', 'reto')),
  elo integer not null check (elo between 400 and 3000),
  created_at timestamptz not null default now(),
  unique (semilla, student_id, indice)
);
create index if not exists tanda_resultados_clase on public.tanda_resultados (class_session_id);
create index if not exists tanda_resultados_alumno on public.tanda_resultados (student_id);
create index if not exists tanda_resultados_profe on public.tanda_resultados (profe_id);
alter table public.tanda_resultados enable row level security;

-- Lo que pone la base al guardar (el alumno solo manda semilla, índice y si le salió).
create or replace function interno.tanda_resultado_de_la_base()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  g record;
  t jsonb;
begin
  if auth.uid() is null then return new; end if;   -- servicio / SQL: sin reglas
  new.student_id := auth.uid();
  select gs.owner_id, gs.tanda_calentamiento into g
    from public.game_state gs
   where jsonb_typeof(gs.tanda_calentamiento) = 'object'
     and gs.tanda_calentamiento->>'semilla' = new.semilla
   limit 1;
  if g.owner_id is null then
    raise exception 'Ese calentamiento ya no está.' using errcode = '22023';
  end if;
  t := g.tanda_calentamiento;
  -- 15 segundos de gracia: el último ejercicio puede terminar justo al cerrarse.
  if now() > (t->>'at')::timestamptz + make_interval(secs => (t->>'segundos')::double precision + 15) then
    raise exception 'Se acabó el tiempo del calentamiento.' using errcode = '22023';
  end if;
  if new.indice >= coalesce((t->>'cantidad')::int, 0) then
    raise exception 'Ese ejercicio no es de este calentamiento.' using errcode = '22023';
  end if;
  if new.indice > 0 and not exists (
      select 1 from public.tanda_resultados r
       where r.semilla = new.semilla and r.student_id = new.student_id and r.indice = new.indice - 1) then
    raise exception 'Los ejercicios van en orden.' using errcode = '22023';
  end if;
  new.profe_id := g.owner_id;
  new.modo := case when t->>'modo' = 'reto' then 'reto' else 'nota' end;
  new.elo := greatest(400, least(3000, coalesce((t->>'elo')::int, 1200)));
  new.created_at := now();
  select cs.id into new.class_session_id
    from public.class_sessions cs
   where cs.created_by = g.owner_id and cs.ended_at is null
   order by cs.started_at desc
   limit 1;
  return new;
end;
$$;
revoke execute on function interno.tanda_resultado_de_la_base() from public, anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'tanda_resultado_de_la_base') then
    create trigger tanda_resultado_de_la_base before insert on public.tanda_resultados
      for each row execute function interno.tanda_resultado_de_la_base();
  end if;
end $$;

-- Quién escribe: el alumno, lo suyo, del calentamiento de uno de sus profes,
-- con el acceso al día. Nadie lo cambia ni lo borra.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'tanda_resultados' and policyname = 'tanda_resultados_inserta_alumno') then
    create policy tanda_resultados_inserta_alumno on public.tanda_resultados for insert to authenticated
      with check (student_id = (select auth.uid()) and public.es_mi_profesor(profe_id));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tanda_resultados' and policyname = 'tanda_resultados_exige_acceso_ins') then
    create policy tanda_resultados_exige_acceso_ins on public.tanda_resultados as restrictive for insert to authenticated
      with check ((select public.acceso_vigente()));
  end if;
  -- Quién lee: el alumno lo suyo, el profe lo de su calentamiento, quien administra y quien supervisa.
  if not exists (select 1 from pg_policies where tablename = 'tanda_resultados' and policyname = 'tanda_resultados_lee') then
    create policy tanda_resultados_lee on public.tanda_resultados for select to authenticated
      using (student_id = (select auth.uid()) or profe_id = (select auth.uid())
             or (select mp.is_admin from public.my_profile() mp)
             or ((select public.soy_supervisor()) and student_id in (select interno.supervisados_por_mi())));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tanda_resultados' and policyname = 'verificacion_en_dos_pasos') then
    create policy verificacion_en_dos_pasos on public.tanda_resultados as restrictive for all to authenticated
      using ((select interno.verificacion_al_dia())) with check ((select interno.verificacion_al_dia()));
  end if;
end $$;
grant select, insert on public.tanda_resultados to authenticated;

-- En la competencia, en qué puesto resolvió cada uno cada ejercicio (todos
-- tienen los mismos). Mira lo de los demás: SECURITY DEFINER, y devuelve solo
-- los renglones que quien llama ya puede leer (las reglas de tanda_resultados_lee).
create or replace function interno.puestos_de_tandas(p_clase uuid)
returns table (id bigint, puesto integer)
language sql
stable
security definer
set search_path = public
as $$
  with yo as (
    select (select auth.uid()) as id,
           coalesce((select mp.is_admin from public.my_profile() mp), false) as admin,
           coalesce((select public.soy_supervisor()), false) as sup
  ),
  r as (
    select x.id, x.student_id, x.profe_id,
           (row_number() over (partition by x.semilla, x.indice order by x.created_at, x.id))::int as puesto
      from public.tanda_resultados x
     where x.class_session_id = p_clase and x.bien and x.modo = 'reto'
  )
  select r.id, r.puesto
    from r, yo
   where yo.id is not null
     and (r.student_id = yo.id or r.profe_id = yo.id or yo.admin
          or (yo.sup and r.student_id in (select interno.supervisados_por_mi())));
$$;
revoke execute on function interno.puestos_de_tandas(uuid) from public, anon;
grant execute on function interno.puestos_de_tandas(uuid) to authenticated;

-- Los puntos de los calentamientos de una clase, por alumno (SECURITY INVOKER: la RLS decide).
create or replace function public.puntos_de_tandas(p_clase uuid)
returns table (student_id uuid, puntos integer, resueltos integer, primeros integer)
language sql
stable
security invoker
set search_path = public
as $$
  with pu as (select * from interno.puestos_de_tandas(p_clase))
  select r.student_id,
         coalesce(sum(interno.puntos_de_una_respuesta(r.elo, 1, pu.puesto)), 0)::int,
         count(*)::int,
         count(*) filter (where pu.puesto = 1)::int
    from public.tanda_resultados r
    left join pu on pu.id = r.id
   where r.class_session_id = p_clase and r.bien
   group by r.student_id;
$$;
revoke execute on function public.puntos_de_tandas(uuid) from public, anon;
grant execute on function public.puntos_de_tandas(uuid) to authenticated;

-- Los del mes, con el mismo filtro que resumen_del_mes y puntos_del_mes.
create or replace function public.puntos_de_tandas_del_mes(p_profesor uuid default null)
returns table (student_id uuid, puntos integer, resueltos integer, primeros integer)
language sql
stable
security invoker
set search_path = public
as $$
  select r.student_id, sum(r.puntos)::int, sum(r.resueltos)::int, sum(r.primeros)::int
    from public.class_sessions cs
    cross join lateral public.puntos_de_tandas(cs.id) r
   where cs.started_at >= (date_trunc('month', now() at time zone 'America/Costa_Rica') at time zone 'America/Costa_Rica')
     and (p_profesor is null or cs.created_by = p_profesor)
     and (cs.created_by = (select auth.uid())
          or cs.id in (select x.class_session_id from public.tanda_resultados x
                        where x.student_id = (select auth.uid()) and x.class_session_id is not null))
     and (r.student_id = (select auth.uid()) or cs.created_by = (select auth.uid()))
   group by r.student_id;
$$;
revoke execute on function public.puntos_de_tandas_del_mes(uuid) from public, anon;
grant execute on function public.puntos_de_tandas_del_mes(uuid) to authenticated;