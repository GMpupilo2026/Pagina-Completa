-- ===== Tiempo activo en ejercicios/entrenamiento =====
--
-- Mismo mecanismo que class_presence_log (heartbeat cada 20s que "toca"
-- left_at, sin depender de que el navegador avise al cerrarse — ver
-- sesion.html) para poder sumar minutos con la misma fórmula que ya usa
-- informes.html (minutesFromPresenceRows: si no hay left_at reciente se
-- acota, y las ventanas que se solapan no se cuentan dos veces). Mismos
-- nombres de columna (joined_at/left_at) a propósito, para reutilizar esa
-- función tal cual en vez de duplicarla.
--
-- Diferencia clave con una clase en vivo: acá SÍ hace falta detectar
-- inactividad (js/tiempo-plataforma.js dejar de tocar la fila a los 60s sin
-- ningún clic/tecla/toque y abre una fila nueva cuando la actividad
-- vuelve) — estar en una clase con el profesor cuenta como "presente"
-- aunque no se toque nada; tener la pestaña de ejercicios abierta sin
-- hacer nada, no.
create table public.platform_activity_log (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id),
  activity text not null,
  pagina text,
  joined_at timestamptz not null default now(),
  left_at timestamptz
);

alter table public.platform_activity_log enable row level security;

create policy platform_activity_log_insert_own on public.platform_activity_log
  for insert with check (auth.uid() = student_id);

create policy platform_activity_log_update_own on public.platform_activity_log
  for update using (auth.uid() = student_id) with check (auth.uid() = student_id);

create policy platform_activity_log_select on public.platform_activity_log
  for select using (
    auth.uid() = student_id
    or (select is_admin from my_profile())
    or exists (select 1 from public.profiles st where st.id = platform_activity_log.student_id and st.teacher_id = auth.uid())
  );

create index platform_activity_log_student_idx on public.platform_activity_log(student_id);
