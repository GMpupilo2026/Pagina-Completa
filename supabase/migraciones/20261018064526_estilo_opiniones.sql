-- La opinión del profe sobre el estilo de un alumno, eje por eje
-- (Informes → «Sus aperturas» → su estilo de juego).
--
-- La prueba de estilo mide lo que el alumno CONTESTA; su profe lo ve jugar.
-- Debajo de cada eje, «¿Coincide con lo que ves?»: el primer polo, «las dos
-- por igual» o el segundo. Es una evidencia más del perfil, con el peso de
-- dos preguntas (js/estilo-perfil.js), no una corrección.
--
-- - Una fila por alumno, profe y eje: la última opinión de cada profe. Si
--   lo cambia de idea, la pisa (se guarda lo que piensa hoy, no la historia).
-- - La escribe solo quien da clase al alumno (interno.alumnos_de) o quien
--   administra, y siempre a su propio nombre. La leen el alumno, sus profes,
--   quien lo supervisa y administración (como la prueba misma).
-- - La hora la pone la base.
-- Ver «La opinión del profe» en docs/decisiones/entrenamiento.md.

create table public.estilo_opiniones (
  alumno_id uuid not null references public.profiles(id) on delete cascade,
  profesor_id uuid not null references public.profiles(id) on delete cascade,
  eje text not null check (eje in ('ataque', 'estructura', 'cambios', 'material')),
  -- 1: el primer polo (atacar, abrir, cambiar, material); -1: el segundo; 0: las dos por igual.
  opinion smallint not null check (opinion in (-1, 0, 1)),
  updated_at timestamptz not null default now(),
  primary key (alumno_id, profesor_id, eje)
);

create index estilo_opiniones_profesor on public.estilo_opiniones (profesor_id);

alter table public.estilo_opiniones enable row level security;

create policy estilo_opiniones_select on public.estilo_opiniones for select to authenticated
  using (alumno_id = (select auth.uid())
         or profesor_id = (select auth.uid())
         or (select mp.is_admin from public.my_profile() mp)
         or alumno_id in (select interno.alumnos_de((select auth.uid())))
         or ((select public.soy_supervisor()) and alumno_id in (select interno.supervisados_por_mi())));
create policy estilo_opiniones_insert on public.estilo_opiniones for insert to authenticated
  with check (profesor_id = (select auth.uid())
              and (alumno_id in (select interno.alumnos_de((select auth.uid())))
                   or coalesce((select mp.is_admin from public.my_profile() mp), false)));
create policy estilo_opiniones_update on public.estilo_opiniones for update to authenticated
  using (profesor_id = (select auth.uid()))
  with check (profesor_id = (select auth.uid())
              and (alumno_id in (select interno.alumnos_de((select auth.uid())))
                   or coalesce((select mp.is_admin from public.my_profile() mp), false)));
create policy estilo_opiniones_delete on public.estilo_opiniones for delete to authenticated
  using (profesor_id = (select auth.uid()));

-- La hora es la de la base, siempre.
create or replace function interno.estilo_opiniones_al_guardar()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  new.updated_at := now();
  return new;
end $$;
revoke execute on function interno.estilo_opiniones_al_guardar() from public, anon, authenticated;
create trigger estilo_opiniones_al_guardar before insert or update on public.estilo_opiniones
  for each row execute function interno.estilo_opiniones_al_guardar();

revoke all on public.estilo_opiniones from anon;
revoke truncate, references, trigger on public.estilo_opiniones from authenticated;
grant select, insert, update, delete on public.estilo_opiniones to authenticated;
