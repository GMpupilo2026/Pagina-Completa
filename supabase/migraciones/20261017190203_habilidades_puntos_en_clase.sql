-- Que los ejercicios de Habilidades que el profe manda a practicar en la clase
-- («Que lo practiquen solos») den puntos de la clase: según su dificultad, y
-- más a la primera que con varios intentos (ver «Habilidades: los puntos» en
-- docs/decisiones/clase-en-vivo.md).
--
--  * entreno_pedidos: lo que el profe mandó a practicar, con la LISTA de sus
--    ejercicios y la dificultad de cada uno (id → puntos Elo). La escribe el
--    profe de una clase abierta suya; la base pone quién y qué clase.
--  * habilidad_resultados: un renglón por ejercicio terminado por un alumno.
--    Lo corrige la computadora del alumno (como el calentamiento: el banco es
--    público, así que corregir en la base no impediría nada), y la base pone
--    lo que no se puede inventar: quién es, de qué profe y clase (las del
--    pedido, que tiene que seguir abierta), que el ejercicio sea DE ese pedido,
--    su dificultad (la del pedido, no la que diga el alumno), la hora, y uno
--    por ejercicio en cada clase (índice único: mandar el mismo nivel otra vez
--    no paga dos veces).
--  * Los puntos: interno.puntos_de_una_respuesta, la regla de las preguntas,
--    con las estrellas como intentos: tres (sin error ni pista) es a la
--    primera, todo; dos, el segundo intento, 60 %; una, 30 %; ninguna (pidió
--    la solución), nada. Sin puesto: cada uno va a su ritmo.
--  * Al cerrar la clase, otorgar_puntos_de_clase los suma a lo de preguntas y
--    calentamiento, en el mismo renglón de Puntos Ajedrez.
set local lock_timeout = '8s';

create table if not exists public.entreno_pedidos (
  id uuid primary key default gen_random_uuid(),
  profe_id uuid not null references public.profiles(id) on delete cascade,
  class_session_id uuid not null references public.class_sessions(id) on delete cascade,
  slug text not null check (slug = 'tipos'),
  titulo text check (titulo is null or char_length(titulo) <= 120),
  ejercicios jsonb not null check (jsonb_typeof(ejercicios) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists entreno_pedidos_clase on public.entreno_pedidos (class_session_id);
create index if not exists entreno_pedidos_profe on public.entreno_pedidos (profe_id);
alter table public.entreno_pedidos enable row level security;

-- Lo que pone la base: quién lo pide y su clase abierta; los ejercicios, de 1 a
-- 60, con su dificultad entre 400 y 3000 (lo de afuera, al borde).
create or replace function interno.entreno_pedido_de_la_base()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lista jsonb := '{}'::jsonb;
  k text;
  v jsonb;
begin
  if auth.uid() is null then return new; end if;   -- servicio / SQL: sin reglas
  new.profe_id := auth.uid();
  select cs.id into new.class_session_id
    from public.class_sessions cs
   where cs.created_by = auth.uid() and cs.ended_at is null
   order by cs.started_at desc
   limit 1;
  if new.class_session_id is null then
    raise exception 'No tienes una clase abierta.' using errcode = '22023';
  end if;
  for k, v in select * from jsonb_each(new.ejercicios) loop
    if char_length(k) between 1 and 120 and jsonb_typeof(v) = 'number' then
      v_lista := v_lista || jsonb_build_object(k, greatest(400, least(3000, round(v::text::numeric)::int)));
    end if;
  end loop;
  if v_lista = '{}'::jsonb or (select count(*) from jsonb_object_keys(v_lista)) > 60 then
    raise exception 'Un pedido lleva de 1 a 60 ejercicios.' using errcode = '22023';
  end if;
  new.ejercicios := v_lista;
  new.created_at := now();
  return new;
end;
$$;
revoke execute on function interno.entreno_pedido_de_la_base() from public, anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'entreno_pedido_de_la_base') then
    create trigger entreno_pedido_de_la_base before insert on public.entreno_pedidos
      for each row execute function interno.entreno_pedido_de_la_base();
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'entreno_pedidos' and policyname = 'entreno_pedidos_inserta_profe') then
    create policy entreno_pedidos_inserta_profe on public.entreno_pedidos for insert to authenticated
      with check (profe_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'entreno_pedidos' and policyname = 'entreno_pedidos_lee') then
    create policy entreno_pedidos_lee on public.entreno_pedidos for select to authenticated
      using (profe_id = (select auth.uid()) or (select mp.is_admin from public.my_profile() mp));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'entreno_pedidos' and policyname = 'verificacion_en_dos_pasos') then
    create policy verificacion_en_dos_pasos on public.entreno_pedidos as restrictive for all to authenticated
      using ((select interno.verificacion_al_dia())) with check ((select interno.verificacion_al_dia()));
  end if;
end $$;
grant select, insert on public.entreno_pedidos to authenticated;

create table if not exists public.habilidad_resultados (
  id bigint generated always as identity primary key,
  pedido_id uuid not null references public.entreno_pedidos(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  profe_id uuid not null references public.profiles(id) on delete cascade,
  class_session_id uuid references public.class_sessions(id) on delete set null,
  ejercicio text not null check (char_length(ejercicio) between 1 and 120),
  estrellas smallint not null check (estrellas between 0 and 3),
  dificultad integer not null check (dificultad between 400 and 3000),
  created_at timestamptz not null default now(),
  unique (class_session_id, student_id, ejercicio)
);
create index if not exists habilidad_resultados_pedido on public.habilidad_resultados (pedido_id);
create index if not exists habilidad_resultados_alumno on public.habilidad_resultados (student_id);
create index if not exists habilidad_resultados_profe on public.habilidad_resultados (profe_id);
alter table public.habilidad_resultados enable row level security;

-- Lo que pone la base al guardar (el alumno solo manda el pedido, el ejercicio y sus estrellas).
create or replace function interno.habilidad_resultado_de_la_base()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
begin
  if auth.uid() is null then return new; end if;   -- servicio / SQL: sin reglas
  new.student_id := auth.uid();
  select ep.profe_id, ep.class_session_id, ep.ejercicios, cs.ended_at into p
    from public.entreno_pedidos ep
    join public.class_sessions cs on cs.id = ep.class_session_id
   where ep.id = new.pedido_id;
  if p.profe_id is null then
    raise exception 'Ese pedido ya no está.' using errcode = '22023';
  end if;
  if p.ended_at is not null then
    raise exception 'La clase ya se cerró.' using errcode = '22023';
  end if;
  if not (p.ejercicios ? new.ejercicio) then
    raise exception 'Ese ejercicio no es de lo que mandó tu profe.' using errcode = '22023';
  end if;
  new.profe_id := p.profe_id;
  new.class_session_id := p.class_session_id;
  new.dificultad := (p.ejercicios->>new.ejercicio)::int;
  new.created_at := now();
  return new;
end;
$$;
revoke execute on function interno.habilidad_resultado_de_la_base() from public, anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'habilidad_resultado_de_la_base') then
    create trigger habilidad_resultado_de_la_base before insert on public.habilidad_resultados
      for each row execute function interno.habilidad_resultado_de_la_base();
  end if;
end $$;

-- Quién escribe: el alumno, lo suyo, de lo que mandó uno de sus profes, con el
-- acceso al día. Nadie lo cambia ni lo borra.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'habilidad_resultados' and policyname = 'habilidad_resultados_inserta_alumno') then
    create policy habilidad_resultados_inserta_alumno on public.habilidad_resultados for insert to authenticated
      with check (student_id = (select auth.uid()) and public.es_mi_profesor(profe_id));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'habilidad_resultados' and policyname = 'habilidad_resultados_exige_acceso_ins') then
    create policy habilidad_resultados_exige_acceso_ins on public.habilidad_resultados as restrictive for insert to authenticated
      with check ((select public.acceso_vigente()));
  end if;
  -- Quién lee: el alumno lo suyo, el profe lo de sus pedidos, quien administra y quien supervisa.
  if not exists (select 1 from pg_policies where tablename = 'habilidad_resultados' and policyname = 'habilidad_resultados_lee') then
    create policy habilidad_resultados_lee on public.habilidad_resultados for select to authenticated
      using (student_id = (select auth.uid()) or profe_id = (select auth.uid())
             or (select mp.is_admin from public.my_profile() mp)
             or ((select public.soy_supervisor()) and student_id in (select interno.supervisados_por_mi())));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'habilidad_resultados' and policyname = 'verificacion_en_dos_pasos') then
    create policy verificacion_en_dos_pasos on public.habilidad_resultados as restrictive for all to authenticated
      using ((select interno.verificacion_al_dia())) with check ((select interno.verificacion_al_dia()));
  end if;
end $$;
grant select, insert on public.habilidad_resultados to authenticated;

-- Los puntos de Habilidades de una clase, por alumno (SECURITY INVOKER: la RLS decide).
create or replace function public.puntos_de_habilidades(p_clase uuid)
returns table (student_id uuid, puntos integer, resueltos integer, a_la_primera integer)
language sql
stable
security invoker
set search_path = public
as $$
  select r.student_id,
         coalesce(sum(interno.puntos_de_una_respuesta(r.dificultad, 4 - r.estrellas, null)), 0)::int,
         count(*)::int,
         count(*) filter (where r.estrellas = 3)::int
    from public.habilidad_resultados r
   where r.class_session_id = p_clase and r.estrellas >= 1
   group by r.student_id;
$$;
revoke execute on function public.puntos_de_habilidades(uuid) from public, anon;
grant execute on function public.puntos_de_habilidades(uuid) to authenticated;

-- Los del mes, con el mismo filtro que puntos_de_tandas_del_mes.
create or replace function public.puntos_de_habilidades_del_mes(p_profesor uuid default null)
returns table (student_id uuid, puntos integer, resueltos integer, a_la_primera integer)
language sql
stable
security invoker
set search_path = public
as $$
  select r.student_id, sum(r.puntos)::int, sum(r.resueltos)::int, sum(r.a_la_primera)::int
    from public.class_sessions cs
    cross join lateral public.puntos_de_habilidades(cs.id) r
   where cs.started_at >= (date_trunc('month', now() at time zone 'America/Costa_Rica') at time zone 'America/Costa_Rica')
     and (p_profesor is null or cs.created_by = p_profesor)
     and (cs.created_by = (select auth.uid())
          or cs.id in (select x.class_session_id from public.habilidad_resultados x
                        where x.student_id = (select auth.uid()) and x.class_session_id is not null))
     and (r.student_id = (select auth.uid()) or cs.created_by = (select auth.uid()))
   group by r.student_id;
$$;
revoke execute on function public.puntos_de_habilidades_del_mes(uuid) from public, anon;
grant execute on function public.puntos_de_habilidades_del_mes(uuid) to authenticated;

-- Al cerrar la clase: preguntas + calentamiento + Habilidades, en un renglón por alumno.
create or replace function interno.otorgar_puntos_de_clase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_total integer;
begin
  if new.ended_at is null or old.ended_at is not null then
    return new;
  end if;
  for r in
    select x.student_id, sum(x.puntos)::int as puntos
      from (
        select pq.student_id, pq.puntos_preguntas as puntos from public.puntos_de_la_clase(new.id) pq
        union all
        select pt.student_id, pt.puntos from public.puntos_de_tandas(new.id) pt
        union all
        select ph.student_id, ph.puntos from public.puntos_de_habilidades(new.id) ph
      ) x
     group by x.student_id
  loop
    v_total := r.puntos;
    if v_total > 0 then
      perform interno.otorgar_puntos(r.student_id, v_total, 'clase', 'Puntos de la clase', 'clase:' || new.id::text);
    end if;
  end loop;
  return new;
end;
$$;
revoke execute on function interno.otorgar_puntos_de_clase() from public, anon, authenticated;
