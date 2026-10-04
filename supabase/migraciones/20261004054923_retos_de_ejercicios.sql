-- Retos de ejercicios entre compañeros.
--
-- Un alumno reta a un compañero (mismo profesor y misma academia:
-- es_companero) a los MISMOS 5 ejercicios. Cada uno los resuelve cuando
-- puede, en una semana, y al final se comparan: gana quien resolvió más, y si
-- empatan, quien tardó menos.
--
-- - Los ejercicios se guardan por su id del banco de Ejercicios por tema
--   (entreno/data/temas.json, problemas de Lichess ya verificados): ninguna
--   posición se inventa y la solución no viaja por la base.
-- - Las respuestas no se cambian ni se repiten (clave primaria): una vez
--   contestado un ejercicio, quedó.
-- - Lo que hizo el rival no se ve hasta terminar los propios cinco (o hasta
--   que el reto vence): si no, el segundo jugaría sabiendo cuánto tiene que
--   sacar.
create table public.retos_ejercicios (
  id uuid primary key default gen_random_uuid(),
  retador_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  rival_id uuid not null references public.profiles(id) on delete cascade,
  nivel text not null check (nivel in ('facil', 'medio', 'dificil')),
  ejercicios text[] not null check (cardinality(ejercicios) = 5
    and array_to_string(ejercicios, ',') ~ '^[A-Za-z0-9_-]{1,40}(,[A-Za-z0-9_-]{1,40}){4}$'),
  created_at timestamptz not null default now(),
  vence_at timestamptz not null default now() + interval '7 days',
  check (rival_id <> retador_id)
);
create index retos_ejercicios_retador on public.retos_ejercicios (retador_id, created_at desc);
create index retos_ejercicios_rival on public.retos_ejercicios (rival_id, created_at desc);

create table public.retos_ejercicios_respuestas (
  reto_id uuid not null references public.retos_ejercicios(id) on delete cascade,
  alumno_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  idx smallint not null check (idx between 0 and 4),
  acierto boolean not null,
  ms integer not null check (ms between 0 and 3600000),
  created_at timestamptz not null default now(),
  primary key (reto_id, alumno_id, idx)
);
create index retos_ejercicios_respuestas_alumno on public.retos_ejercicios_respuestas (alumno_id);

-- Los retos que me tocan (como retador o como rival). Para las políticas:
-- el conjunto se arma UNA vez.
create or replace function interno.mis_retos_ejercicios()
returns setof uuid language sql stable security definer
set search_path to 'public' set row_security to 'off' as $$
  select r.id from public.retos_ejercicios r
   where (select auth.uid()) in (r.retador_id, r.rival_id);
$$;
-- Los que ya puedo ver enteros: terminé mis cinco, o el reto venció.
create or replace function interno.retos_ejercicios_abiertos_para_mi()
returns setof uuid language sql stable security definer
set search_path to 'public' set row_security to 'off' as $$
  select r.id from public.retos_ejercicios r
   where (select auth.uid()) in (r.retador_id, r.rival_id)
     and (r.vence_at <= now()
          or (select count(*) from public.retos_ejercicios_respuestas x
               where x.reto_id = r.id and x.alumno_id = (select auth.uid())) >= 5);
$$;
-- Cuántas contestó cada uno en mis retos (solo el número, nunca el resultado).
create or replace function interno.retos_ejercicios_cuantas()
returns table (reto_id uuid, alumno_id uuid, n integer)
language sql stable security definer set search_path to 'public' set row_security to 'off' as $$
  select x.reto_id, x.alumno_id, count(*)::int
    from public.retos_ejercicios_respuestas x
   where x.reto_id in (select interno.mis_retos_ejercicios())
   group by x.reto_id, x.alumno_id;
$$;
revoke execute on function interno.mis_retos_ejercicios() from public, anon;
revoke execute on function interno.retos_ejercicios_abiertos_para_mi() from public, anon;
revoke execute on function interno.retos_ejercicios_cuantas() from public, anon;
grant execute on function interno.mis_retos_ejercicios() to authenticated;
grant execute on function interno.retos_ejercicios_abiertos_para_mi() to authenticated;
grant execute on function interno.retos_ejercicios_cuantas() to authenticated;

alter table public.retos_ejercicios enable row level security;
alter table public.retos_ejercicios_respuestas enable row level security;

create policy retos_ejercicios_select on public.retos_ejercicios for select to authenticated
  using (id in (select interno.mis_retos_ejercicios()));
create policy retos_ejercicios_insert on public.retos_ejercicios for insert to authenticated
  with check (retador_id = (select auth.uid())
              and public.es_companero(rival_id)
              and exists (select 1 from public.profiles p where p.id = rival_id and p.role = 'alumno'));
create policy retos_ejercicios_exige_acceso_ins on public.retos_ejercicios as restrictive for insert to authenticated
  with check ((select public.acceso_vigente()));

create policy retos_ejercicios_respuestas_select on public.retos_ejercicios_respuestas for select to authenticated
  using (alumno_id = (select auth.uid())
         or reto_id in (select interno.retos_ejercicios_abiertos_para_mi()));
create policy retos_ejercicios_respuestas_insert on public.retos_ejercicios_respuestas for insert to authenticated
  with check (alumno_id = (select auth.uid())
              and reto_id in (select r.id from public.retos_ejercicios r
                               where r.id in (select interno.mis_retos_ejercicios())
                                 and r.vence_at > now()));
create policy retos_ejercicios_respuestas_exige_acceso_ins on public.retos_ejercicios_respuestas as restrictive for insert to authenticated
  with check ((select public.acceso_vigente()));

-- Hasta 10 retos mandados por día: es un juego entre compañeros, no un
-- buzón para llenarle a otro. Y las fechas las pone la base.
create or replace function interno.retos_ejercicios_tope()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if (select count(*) from public.retos_ejercicios r
       where r.retador_id = new.retador_id and r.created_at > now() - interval '1 day') >= 10 then
    raise exception 'Ya mandaste 10 retos hoy. Mañana puedes mandar más.' using errcode = 'check_violation';
  end if;
  new.created_at := now();
  new.vence_at := now() + interval '7 days';
  return new;
end $$;
revoke execute on function interno.retos_ejercicios_tope() from public, anon, authenticated;
create trigger retos_ejercicios_tope before insert on public.retos_ejercicios
  for each row execute function interno.retos_ejercicios_tope();

-- La lista de mis retos (los 100 últimos), con lo justo del rival: cuántos
-- contestó siempre (para saber si hay que esperarlo), y sus aciertos y su
-- tiempo solo cuando ya los puedo ver. SECURITY INVOKER: lo que se ve lo
-- decide la RLS de arriba.
create or replace function public.mis_retos_de_ejercicios()
returns table (id uuid, retador_id uuid, rival_id uuid, retador text, rival text, nivel text,
               ejercicios text[], created_at timestamptz, vence_at timestamptz,
               mias integer, mis_aciertos integer, mi_ms integer,
               del_otro integer, sus_aciertos integer, su_ms integer)
language sql stable security invoker set search_path to 'public' as $$
  with yo as (select (select auth.uid()) as id),
  r as (select * from public.retos_ejercicios order by created_at desc limit 100),
  cuantas as materialized (select c.reto_id, c.alumno_id, c.n from interno.retos_ejercicios_cuantas() c)
  select r.id, r.retador_id, r.rival_id,
         (select p.full_name from public.profiles p where p.id = r.retador_id),
         (select p.full_name from public.profiles p where p.id = r.rival_id),
         r.nivel, r.ejercicios, r.created_at, r.vence_at,
         coalesce((select c.n from cuantas c, yo where c.reto_id = r.id and c.alumno_id = yo.id), 0),
         (select count(*) filter (where x.acierto)::int from public.retos_ejercicios_respuestas x, yo where x.reto_id = r.id and x.alumno_id = yo.id),
         (select coalesce(sum(x.ms), 0)::int from public.retos_ejercicios_respuestas x, yo where x.reto_id = r.id and x.alumno_id = yo.id),
         coalesce((select c.n from cuantas c, yo where c.reto_id = r.id and c.alumno_id <> yo.id), 0),
         (select count(*) filter (where x.acierto)::int from public.retos_ejercicios_respuestas x, yo where x.reto_id = r.id and x.alumno_id <> yo.id having count(*) > 0),
         (select sum(x.ms)::int from public.retos_ejercicios_respuestas x, yo where x.reto_id = r.id and x.alumno_id <> yo.id)
    from r
   order by r.created_at desc;
$$;
revoke execute on function public.mis_retos_de_ejercicios() from public, anon;
grant execute on function public.mis_retos_de_ejercicios() to authenticated;

revoke all on public.retos_ejercicios from anon;
revoke all on public.retos_ejercicios_respuestas from anon;
grant select, insert on public.retos_ejercicios to authenticated;
grant select, insert on public.retos_ejercicios_respuestas to authenticated;
