-- El plan de temporada: de hoy a una competencia, por etapas.
--
-- Lo pidió el dueño (10/11/2026), como segunda propuesta del estudio de la
-- escuela cubana de ajedrez: un plan con etapas atadas a la fecha de un
-- torneo, cada una con su énfasis por dirección del entrenamiento (aperturas,
-- finales, ejercicios…). Ver «El plan de temporada» en
-- docs/decisiones/seguimiento-del-alumno.md.
--
-- Cómo se arma:
--
-- 1. UNA FILA POR ALUMNO, como `tareas` y `notas_alumno`. Así la RLS es la de
--    siempre (quién es profesor de quién) y no hace falta una tabla de
--    alumnos por temporada con sus propias políticas. Los alumnos que
--    comparten el mismo plan (un grupo que va al mismo torneo) llevan el
--    mismo `lote`: la página edita el lote entero de una vez.
-- 2. Las etapas van en `etapas` (jsonb): nombre, fechas, énfasis y nota. No
--    son filas aparte porque nada las consulta por separado y siempre se
--    leen y se guardan juntas. La forma la valida la página antes de guardar
--    (js/temporada.js, `problemas()`); acá se exige solo lo que rompería la
--    lectura: que sea un arreglo y que no pase de 12.
-- 3. Lo que va de la temporada (cuánto tiempo puso en cada dirección) NO se
--    guarda: se calcula con `tiempo_por_seccion()` y el reparto por
--    dirección (js/direcciones-entrenamiento.js), igual que el avance de una
--    tarea.
-- 4. No reparte permisos, accesos ni dinero: no lleva auditoría. No va en
--    Realtime. La verificación en dos pasos la exige
--    `antes_de_cada_pedido()` como en todas las tablas.
--
-- Permisos (las mismas reglas que `tareas`):
-- * Leer: el profesor que la escribió, el alumno de la fila, los demás
--   profesores del alumno (el conjunto `interno.alumnos_de`, armado una vez)
--   y quien administra.
-- * Crear: solo con `profesor_id` propio, y para un alumno propio
--   (`soy_profesor_de`) siendo profesor; quien administra, para cualquiera.
-- * Cambiar y borrar: solo quien la escribió. El `with check` vuelve a
--   pedir que el alumno sea suyo: si no, se podría pasar una temporada a un
--   alumno ajeno cambiando `alumno_id`.

create table public.temporadas (
  id uuid primary key default gen_random_uuid(),
  lote uuid not null default gen_random_uuid(),
  profesor_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  alumno_id uuid not null references public.profiles(id) on delete cascade,
  titulo text not null check (char_length(btrim(titulo)) between 1 and 120),
  competencia text check (competencia is null or char_length(competencia) <= 160),
  inicio date not null,
  fecha_competencia date not null,
  etapas jsonb not null default '[]'::jsonb
    check (jsonb_typeof(etapas) = 'array' and jsonb_array_length(etapas) <= 12),
  nota text check (nota is null or char_length(nota) <= 2000),
  created_at timestamptz not null default now(),
  constraint temporadas_fechas check (fecha_competencia >= inicio)
);

create index temporadas_alumno_idx on public.temporadas (alumno_id);
create index temporadas_profesor_idx on public.temporadas (profesor_id);
create index temporadas_lote_idx on public.temporadas (lote);

alter table public.temporadas enable row level security;

create policy temporadas_select on public.temporadas for select to authenticated
using (
  (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id))
  or profesor_id = (select auth.uid())
  or alumno_id = (select auth.uid())
  or alumno_id in (select interno.alumnos_de((select auth.uid())))
);

create policy temporadas_insert on public.temporadas for insert to authenticated
with check (
  profesor_id = (select auth.uid())
  and (
    (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id))
    or ((select mp.role from public.my_profile() mp(role, is_admin, teacher_id)) = 'profesor'
        and public.soy_profesor_de(alumno_id))
  )
);

create policy temporadas_update on public.temporadas for update to authenticated
using (profesor_id = (select auth.uid()))
with check (
  profesor_id = (select auth.uid())
  and (
    (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id))
    or public.soy_profesor_de(alumno_id)
  )
);

create policy temporadas_delete on public.temporadas for delete to authenticated
using (profesor_id = (select auth.uid()));

revoke all on public.temporadas from anon, public;
grant select, insert, update, delete on public.temporadas to authenticated;
grant all on public.temporadas to service_role;
