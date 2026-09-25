-- La encuesta de satisfacción: el alumnado califica a su profesor.
--
-- Quien administra quiere saber si sus profesores lo están haciendo bien y si
-- el alumnado está contento o se va. Una vez al mes, cada alumno contesta, por
-- cada uno de SUS profesores, seis preguntas de 1 a 5 (explica, aprende,
-- claridad —o si le resulta confuso—, creatividad, resuelve, le gustan las
-- clases), si piensa seguir, y un comentario opcional.
--
-- Por qué una tabla propia y no un formulario del armador (`formularios`):
-- aquellos son públicos, se contestan sin cuenta, y el profesor se escribiría
-- a mano. Acá la respuesta tiene que quedar pegada al profesor DE VERDAD, y
-- solo puede calificar a un profesor quien es su alumno: eso lo dice la base
-- (`es_mi_profesor()`), no la pantalla.
--
-- QUIÉN LEE: el alumno lo suyo; quien administra, todo; quien supervisa, lo de
-- los profesores que supervisa. El profesor calificado NO ve las respuestas: la
-- encuesta se lo dice al alumno, y sin eso no contesta con sinceridad.
--
-- Una respuesta por alumno, profesor y mes: lo garantiza el índice único. En
-- el mismo mes se puede corregir (la función la reemplaza).
--
-- Ver «La encuesta de satisfacción» en docs/decisiones/cuentas-y-formularios.md.

create table public.encuestas_profesor (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references public.profiles(id) on delete cascade,
  profesor_id uuid not null references public.profiles(id) on delete cascade,
  -- El mes en hora de Costa Rica, como "AAAA-MM-01".
  periodo date not null,
  explica smallint not null check (explica between 1 and 5),
  aprende smallint not null check (aprende between 1 and 5),
  claridad smallint not null check (claridad between 1 and 5),
  creatividad smallint not null check (creatividad between 1 and 5),
  resuelve smallint not null check (resuelve between 1 and 5),
  contento smallint not null check (contento between 1 and 5),
  seguir text not null check (seguir in ('si', 'no_se', 'no')),
  comentario text not null default '' check (char_length(comentario) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint encuestas_profesor_periodo_es_mes check (periodo = date_trunc('month', periodo)::date),
  constraint encuestas_profesor_no_a_si_mismo check (alumno_id <> profesor_id)
);
comment on table public.encuestas_profesor is
  'Encuesta de satisfacción: cada alumno califica a cada uno de sus profesores, una vez por mes (índice único). Solo la escribe responder_encuesta_profesor(). La leen el alumno (lo suyo), quien administra (todo) y quien supervisa (sus profesores). El profesor calificado no la ve.';

create unique index encuestas_profesor_una_por_mes
  on public.encuestas_profesor (alumno_id, profesor_id, periodo);
create index encuestas_profesor_periodo on public.encuestas_profesor (periodo, profesor_id);
create index encuestas_profesor_profesor on public.encuestas_profesor (profesor_id);

alter table public.encuestas_profesor enable row level security;
revoke all on public.encuestas_profesor from public, anon, authenticated;
grant select on public.encuestas_profesor to authenticated;

-- Sin política de escritura: escribe la función de abajo, que valida.
-- El conjunto de supervisados se arma UNA vez, no fila por fila.
create policy encuestas_profesor_ver on public.encuestas_profesor
  for select to authenticated
  using (
    alumno_id = (select auth.uid())
    or (select public.soy_admin())
    or ((select public.soy_supervisor())
        and profesor_id in (select interno.supervisados_por_mi()))
  );

-- ---- el alumno: a quién puede calificar y si ya lo hizo este mes ----
create or replace function public.encuesta_mis_profesores()
 returns table(id uuid, nombre text, respondida boolean)
 language sql
 stable
 security invoker
 set search_path to 'public'
as $function$
  with mes as (select date_trunc('month', (now() at time zone 'America/Costa_Rica'))::date as m)
  select p.id,
         coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1), 'Tu profesor'),
         exists (select 1 from public.encuestas_profesor e
                  where e.alumno_id = auth.uid() and e.profesor_id = p.id
                    and e.periodo = (select m from mes))
    from public.profiles p
   where p.id in (select interno.profesores_de(auth.uid()))
     and p.id <> auth.uid()
   order by 2;
$function$;
revoke execute on function public.encuesta_mis_profesores() from public, anon;
grant execute on function public.encuesta_mis_profesores() to authenticated;

-- ---- el alumno contesta (o corrige lo de este mes) ----
create or replace function public.responder_encuesta_profesor(
  p_profesor uuid,
  p_explica integer, p_aprende integer, p_claridad integer,
  p_creatividad integer, p_resuelve integer, p_contento integer,
  p_seguir text, p_comentario text default '')
 returns table(id uuid, periodo date)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_yo uuid := auth.uid();
  v_mes date := date_trunc('month', (now() at time zone 'America/Costa_Rica'))::date;
  v_nota integer;
begin
  if v_yo is null then
    raise exception 'Inicia sesión para contestar la encuesta.' using errcode = '42501';
  end if;
  -- coalesce: con un profesor nulo es_mi_profesor() da false, pero que nunca
  -- un NULL deje pasar.
  if not coalesce(p_profesor is not null and p_profesor <> v_yo and public.es_mi_profesor(p_profesor), false) then
    raise exception 'Solo puedes calificar a tus propios profesores.' using errcode = '42501';
  end if;
  foreach v_nota in array array[p_explica, p_aprende, p_claridad, p_creatividad, p_resuelve, p_contento] loop
    if v_nota is null or v_nota not between 1 and 5 then
      raise exception 'Contesta las seis preguntas, cada una del 1 al 5.' using errcode = '22023';
    end if;
  end loop;
  if p_seguir is null or p_seguir not in ('si', 'no_se', 'no') then
    raise exception 'Cuéntanos si piensas seguir en las clases.' using errcode = '22023';
  end if;

  insert into public.encuestas_profesor as e
    (alumno_id, profesor_id, periodo, explica, aprende, claridad, creatividad,
     resuelve, contento, seguir, comentario)
  values (v_yo, p_profesor, v_mes, p_explica, p_aprende, p_claridad, p_creatividad,
          p_resuelve, p_contento, p_seguir, left(btrim(coalesce(p_comentario, '')), 1000))
  on conflict (alumno_id, profesor_id, periodo) do update
     set explica = excluded.explica, aprende = excluded.aprende,
         claridad = excluded.claridad, creatividad = excluded.creatividad,
         resuelve = excluded.resuelve, contento = excluded.contento,
         seguir = excluded.seguir, comentario = excluded.comentario,
         updated_at = now();

  -- Se vuelve a LEER la fila: lo que se devuelve es lo que quedó guardado.
  return query
    select e.id, e.periodo from public.encuestas_profesor e
     where e.alumno_id = v_yo and e.profesor_id = p_profesor and e.periodo = v_mes;
  if not found then
    raise exception 'La respuesta no quedó guardada.';
  end if;
end;
$function$;
revoke execute on function public.responder_encuesta_profesor(uuid, integer, integer, integer, integer, integer, integer, text, text) from public, anon;
grant execute on function public.responder_encuesta_profesor(uuid, integer, integer, integer, integer, integer, integer, text, text) to authenticated;

-- ---- quien administra o supervisa: el resumen por profesor ----
-- SECURITY INVOKER: cuenta solo lo que la RLS le deja ver a quien pregunta.
-- Las cuentas se hacen acá, no en el navegador (PostgREST corta a mil filas).
create or replace function public.resumen_satisfaccion(p_desde date, p_hasta date)
 returns table(
   profesor_id uuid, nombre text, respuestas integer,
   explica numeric, aprende numeric, claridad numeric, creatividad numeric,
   resuelve numeric, contento numeric, promedio numeric,
   seguir_si integer, seguir_no_se integer, seguir_no integer, comentarios integer)
 language sql
 stable
 security invoker
 set search_path to 'public'
as $function$
  select e.profesor_id,
         coalesce(nullif(btrim(max(p.full_name)), ''), split_part(max(p.email), '@', 1), 'Profesor'),
         count(*)::integer,
         round(avg(e.explica), 1), round(avg(e.aprende), 1), round(avg(e.claridad), 1),
         round(avg(e.creatividad), 1), round(avg(e.resuelve), 1), round(avg(e.contento), 1),
         round(avg((e.explica + e.aprende + e.claridad + e.creatividad + e.resuelve + e.contento) / 6.0), 1),
         (count(*) filter (where e.seguir = 'si'))::integer,
         (count(*) filter (where e.seguir = 'no_se'))::integer,
         (count(*) filter (where e.seguir = 'no'))::integer,
         (count(*) filter (where e.comentario <> ''))::integer
    from public.encuestas_profesor e
    left join public.profiles p on p.id = e.profesor_id
   where e.periodo >= date_trunc('month', p_desde)::date
     and e.periodo <= date_trunc('month', p_hasta)::date
   group by e.profesor_id
   order by 13 desc, 10 asc, 2;
$function$;
revoke execute on function public.resumen_satisfaccion(date, date) from public, anon;
grant execute on function public.resumen_satisfaccion(date, date) to authenticated;

-- ---- las respuestas una por una, con el nombre de quien contestó ----
-- También INVOKER: la RLS decide qué filas salen. p_profesor nulo = todos;
-- p_solo_se_van = solo quienes dijeron que no piensan seguir.
create or replace function public.respuestas_satisfaccion(
  p_desde date, p_hasta date, p_profesor uuid default null, p_solo_se_van boolean default false)
 returns table(
   id uuid, periodo date, profesor_id uuid, profesor text, alumno_id uuid, alumno text,
   explica smallint, aprende smallint, claridad smallint, creatividad smallint,
   resuelve smallint, contento smallint, seguir text, comentario text, updated_at timestamptz)
 language sql
 stable
 security invoker
 set search_path to 'public'
as $function$
  select e.id, e.periodo, e.profesor_id,
         coalesce(nullif(btrim(pr.full_name), ''), split_part(pr.email, '@', 1), 'Profesor'),
         e.alumno_id,
         coalesce(nullif(btrim(al.full_name), ''), split_part(al.email, '@', 1), 'Alumno'),
         e.explica, e.aprende, e.claridad, e.creatividad, e.resuelve, e.contento,
         e.seguir, e.comentario, e.updated_at
    from public.encuestas_profesor e
    left join public.profiles pr on pr.id = e.profesor_id
    left join public.profiles al on al.id = e.alumno_id
   where e.periodo >= date_trunc('month', p_desde)::date
     and e.periodo <= date_trunc('month', p_hasta)::date
     and (p_profesor is null or e.profesor_id = p_profesor)
     and (not coalesce(p_solo_se_van, false) or e.seguir = 'no')
   order by e.periodo desc, e.updated_at desc;
$function$;
revoke execute on function public.respuestas_satisfaccion(date, date, uuid, boolean) from public, anon;
grant execute on function public.respuestas_satisfaccion(date, date, uuid, boolean) to authenticated;
