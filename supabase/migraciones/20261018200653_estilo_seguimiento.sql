-- ¿Ya jugó la apertura que se le recomendó? (la prueba de estilo)
--
-- Al profe le avisa la campana cuando un alumno ya jugó 5 partidas con una
-- de las aperturas que le recomendó su última prueba de estilo, para que mire
-- cómo le fue. Las partidas están en Lichess y Chess.com y las baja el
-- navegador (EstiloTarjeta.seguir / EstiloPartidas.seguimiento): la base no
-- puede contarlas sola, así que se guarda acá la ÚLTIMA cuenta que hizo un
-- navegador, como el análisis de sus partidas (analisis_partidas_alumno).
--
-- - Una fila por alumno, de su última prueba (`prueba_id`). Con una prueba
--   nueva, la cuenta y el aviso empiezan de cero.
-- - `partidas`: cuántas jugó con cada apertura recomendada DESPUÉS de la
--   prueba ({"blancas": n, "e4": n, "d4": n}).
-- - `listo_at` lo pone la base: la primera vez que alguna llega a 5.
-- - `revisado_at`: cuando su profe ya lo miró (abrió «¿Cómo le fue?» en
--   Informes). Lo pone la base, y solo si quien guarda NO es el alumno: el
--   aviso es del profe.
-- - La escriben el alumno (su navegador cuenta al abrir la prueba) y quien
--   le da clase o administra. La leen los mismos que la prueba.
-- Ver «Los avisos de la prueba de estilo» en docs/decisiones/entrenamiento.md.

-- Las cuentas: un objeto con blancas, e4 y d4, cada una un entero de 0 a 10000.
create or replace function interno.estilo_seguimiento_partidas_ok(p jsonb)
returns boolean language sql immutable set search_path to 'public' as $$
  select jsonb_typeof(p) = 'object'
     and coalesce((select bool_and(k in ('blancas', 'e4', 'd4') and jsonb_typeof(v) = 'number'
                                   and (v::text)::numeric = trunc((v::text)::numeric)
                                   and (v::text)::numeric between 0 and 10000)
                   from jsonb_each(p) as x(k, v)), true)
$$;
-- La usa la restricción de la tabla, que corre como quien guarda.
revoke execute on function interno.estilo_seguimiento_partidas_ok(jsonb) from public, anon;
grant execute on function interno.estilo_seguimiento_partidas_ok(jsonb) to authenticated;

create table public.estilo_seguimiento (
  alumno_id uuid primary key references public.profiles(id) on delete cascade,
  prueba_id uuid not null references public.estilo_pruebas(id) on delete cascade,
  partidas jsonb not null default '{}'::jsonb check (interno.estilo_seguimiento_partidas_ok(partidas)),
  listo_at timestamptz,
  revisado_at timestamptz,
  revisado_por uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index estilo_seguimiento_prueba on public.estilo_seguimiento (prueba_id);
create index estilo_seguimiento_revisado_por on public.estilo_seguimiento (revisado_por);

alter table public.estilo_seguimiento enable row level security;

create policy estilo_seguimiento_select on public.estilo_seguimiento for select to authenticated
  using (alumno_id = (select auth.uid())
         or (select mp.is_admin from public.my_profile() mp)
         or alumno_id in (select interno.alumnos_de((select auth.uid())))
         or ((select public.soy_supervisor()) and alumno_id in (select interno.supervisados_por_mi())));
create policy estilo_seguimiento_insert on public.estilo_seguimiento for insert to authenticated
  with check (alumno_id = (select auth.uid())
              or coalesce((select mp.is_admin from public.my_profile() mp), false)
              or alumno_id in (select interno.alumnos_de((select auth.uid()))));
create policy estilo_seguimiento_update on public.estilo_seguimiento for update to authenticated
  using (alumno_id = (select auth.uid())
         or coalesce((select mp.is_admin from public.my_profile() mp), false)
         or alumno_id in (select interno.alumnos_de((select auth.uid()))))
  with check (alumno_id = (select auth.uid())
              or coalesce((select mp.is_admin from public.my_profile() mp), false)
              or alumno_id in (select interno.alumnos_de((select auth.uid()))));

-- Lo que decide la base: que la prueba sea del alumno, cuándo llegó a 5 y
-- quién lo revisó. Una prueba nueva empieza de cero.
create or replace function interno.estilo_seguimiento_al_guardar()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  llega boolean;
  nueva boolean := tg_op = 'INSERT' or new.prueba_id is distinct from old.prueba_id;
begin
  if not exists (select 1 from public.estilo_pruebas p where p.id = new.prueba_id and p.alumno_id = new.alumno_id) then
    raise exception 'Esa prueba de estilo no es de este alumno.' using errcode = '23514';
  end if;
  new.updated_at := now();
  llega := coalesce((select bool_or((v::text)::numeric >= 5) from jsonb_each(new.partidas) as x(k, v)), false);
  if nueva then
    new.listo_at := case when llega then now() end;
  else
    new.listo_at := coalesce(old.listo_at, case when llega then now() end);
  end if;
  -- Revisarlo es cosa de su profe (o de administración), nunca del alumno.
  if (select auth.uid()) is not distinct from new.alumno_id or new.revisado_at is null then
    new.revisado_at := case when nueva then null else old.revisado_at end;
    new.revisado_por := case when nueva then null else old.revisado_por end;
  elsif nueva or old.revisado_at is null or new.revisado_at is distinct from old.revisado_at then
    new.revisado_at := now();
    new.revisado_por := (select auth.uid());
  end if;
  return new;
end $$;
revoke execute on function interno.estilo_seguimiento_al_guardar() from public, anon, authenticated;
create trigger estilo_seguimiento_al_guardar before insert or update on public.estilo_seguimiento
  for each row execute function interno.estilo_seguimiento_al_guardar();

revoke all on public.estilo_seguimiento from anon;
revoke truncate, references, trigger, delete on public.estilo_seguimiento from authenticated;
grant select, insert, update on public.estilo_seguimiento to authenticated;
