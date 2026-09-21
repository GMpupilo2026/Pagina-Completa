-- A quién se le manda el informe de cada alumno y cada cuánto.
--
-- "Encargado" es la persona responsable del alumno (madre, padre, quien sea).
-- No tiene cuenta en el sitio ni la necesita: solo un correo. La frecuencia es
-- las dos cosas a la vez — cada cuánto se manda Y qué periodo cubre: un informe
-- semanal cuenta la semana.
create table if not exists public.encargados (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  nombre text,
  email text not null,
  frecuencia text not null default 'semanal',
  activo boolean not null default true,
  creado_por uuid references public.profiles(id) on delete set null,
  ultimo_envio_at timestamptz,
  created_at timestamptz not null default now(),
  constraint encargados_frecuencia_valida check (frecuencia in ('diario', 'semanal', 'mensual', 'anual')),
  constraint encargados_email_forma check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and length(email) <= 200),
  constraint encargados_nombre_largo check (nombre is null or length(nombre) <= 120),
  -- El mismo correo dos veces para el mismo alumno sería mandarle dos copias.
  constraint encargados_sin_repetir unique (student_id, email)
);
create index if not exists encargados_student_idx on public.encargados (student_id);
create index if not exists encargados_pendientes_idx on public.encargados (activo, ultimo_envio_at);

comment on table public.encargados is
  'A qué correo se le manda el informe de cada alumno y cada cuánto. No son cuentas del sitio: solo un correo.';

alter table public.encargados enable row level security;

-- Los maneja cualquiera de los profesores del alumno, y quien administra.
drop policy if exists encargados_select on public.encargados;
create policy encargados_select on public.encargados
  for select using (
    (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or public.soy_profesor_de(student_id)
  );

drop policy if exists encargados_insert on public.encargados;
create policy encargados_insert on public.encargados
  for insert with check (
    creado_por = auth.uid()
    and ((select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
         or public.soy_profesor_de(student_id))
  );

drop policy if exists encargados_update on public.encargados;
create policy encargados_update on public.encargados
  for update using (
    (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or public.soy_profesor_de(student_id)
  ) with check (
    (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or public.soy_profesor_de(student_id)
  );

drop policy if exists encargados_delete on public.encargados;
create policy encargados_delete on public.encargados
  for delete using (
    (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
    or public.soy_profesor_de(student_id)
  );

-- El público no tiene nada que hacer acá.
revoke all on public.encargados from anon;