-- Días sin clase: los feriados y los días que un profe no da clase.
--
-- La idea salió de Chessgora («eventos y días sin clase» en su calendario).
-- Hasta ahora, un feriado solo existía como aviso («Mañana no hay clase»):
-- el calendario, «Tu próxima clase» y el .ics seguían mostrando la clase de
-- ese día como si fuera a pasar. Ver «Días sin clase y feriados» en
-- docs/decisiones/paneles.md.
--
-- * Una fila es UN día: o del profe que la pone (profesor_id = él), o un
--   feriado para todos (profesor_id NULL), que solo pone quien administra.
--   Un mismo día no se repite para el mismo profe (ni dos feriados el mismo
--   día): lo garantiza el índice único, no un `if`.
--
-- * La ven quien la puso, sus alumnos (interno.profesores_de) y, los
--   feriados, todo el mundo con cuenta. Un día sin clase no dice nada de
--   nadie (es una fecha y un motivo), así que no rompe que las academias sean
--   privadas: el alumno de otra academia no ve los días de un profe que no es
--   el suyo.
--
-- * Las clases que vienen (mis_clases_proximas, mi_proxima_clase) saltan
--   esos días. A propósito NO se toca ocurrencias_horario: la usan también
--   las horas de los talleres, las de los asesores y las grabaciones, y un
--   día marcado sin clase no puede cambiar en silencio lo que se le paga a
--   alguien ni borrar una grabación que ya se subió.
--
-- * Escribe la propia persona con políticas simples: no reparte permisos,
--   accesos ni dinero (no va en la bitácora de auditoría). No se edita: se
--   borra y se vuelve a poner.

create table public.dias_sin_clase (
  id uuid primary key default gen_random_uuid(),
  profesor_id uuid references public.profiles(id) on delete cascade,
  fecha date not null,
  motivo text not null check (char_length(btrim(motivo)) between 1 and 120),
  creado_por uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

comment on table public.dias_sin_clase is
  'Días sin clase: de un profe (profesor_id) o feriado para todos (profesor_id NULL, solo administración). Ver «Días sin clase y feriados» en docs/decisiones/paneles.md.';

create unique index dias_sin_clase_un_dia
  on public.dias_sin_clase (coalesce(profesor_id, '00000000-0000-0000-0000-000000000000'::uuid), fecha);
create index dias_sin_clase_fecha on public.dias_sin_clase (fecha);

alter table public.dias_sin_clase enable row level security;

create policy dias_sin_clase_select on public.dias_sin_clase
  for select to authenticated
  using (
    profesor_id is null
    or profesor_id = (select auth.uid())
    or profesor_id in (select interno.profesores_de((select auth.uid())))
    or coalesce((select public.soy_admin()), false)
  );

-- El profe pone los suyos; quien administra, además, los feriados de todos.
create policy dias_sin_clase_insert on public.dias_sin_clase
  for insert to authenticated
  with check (
    (profesor_id = (select auth.uid())
       and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'profesor'))
    or (profesor_id is null and coalesce((select public.soy_admin()), false))
  );

create policy dias_sin_clase_delete on public.dias_sin_clase
  for delete to authenticated
  using (
    profesor_id = (select auth.uid())
    or (profesor_id is null and coalesce((select public.soy_admin()), false))
  );

revoke all on public.dias_sin_clase from anon;
grant select, insert, delete on public.dias_sin_clase to authenticated;

-- Las clases que me tocan, sin los días sin clase de mi profe ni los feriados.
create or replace function public.mis_clases_proximas(p_dias integer default 28)
 returns table(horario_id uuid, inicio timestamp with time zone, fin timestamp with time zone, titulo text, modalidad text, profesor text)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select h.id, o.inicio, o.fin, nullif(btrim(h.titulo), ''), o.modalidad,
         nullif(btrim(pr.full_name), '')
    from public.horario_clases h
    cross join lateral public.ocurrencias_horario(
      h.profesor_id,
      (now() at time zone 'America/Costa_Rica')::date,
      (now() at time zone 'America/Costa_Rica')::date + least(greatest(coalesce(p_dias, 28), 1), 90)) o
    join public.profiles pr on pr.id = h.profesor_id
   where h.id in (select interno.horarios_del_alumno((select auth.uid())))
     and o.horario_id = h.id
     and o.fin > now()
     and not exists (select 1 from public.dias_sin_clase s
                      where s.fecha = o.fecha
                        and (s.profesor_id is null or s.profesor_id = h.profesor_id))
   order by o.inicio
   limit 200;
$function$;

create or replace function public.mi_proxima_clase()
 returns table(inicio timestamp with time zone, fin timestamp with time zone, titulo text, modalidad text, profesor text)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select o.inicio, o.fin, nullif(btrim(h.titulo), ''), o.modalidad,
         nullif(btrim(pr.full_name), '')
    from public.horario_clases h
    cross join lateral public.ocurrencias_horario(
      h.profesor_id,
      (now() at time zone 'America/Costa_Rica')::date,
      (now() at time zone 'America/Costa_Rica')::date + 14) o
    join public.profiles pr on pr.id = h.profesor_id
   where h.id in (select interno.horarios_del_alumno((select auth.uid())))
     and o.horario_id = h.id
     and o.fin > now()
     and not exists (select 1 from public.dias_sin_clase s
                      where s.fecha = o.fecha
                        and (s.profesor_id is null or s.profesor_id = h.profesor_id))
   order by o.inicio
   limit 1;
$function$;
