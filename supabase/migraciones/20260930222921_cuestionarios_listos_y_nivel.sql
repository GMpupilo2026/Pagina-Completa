-- Los cuestionarios listos de la Academia y el nivel de cada cuestionario.
-- Ver «Los cuestionarios listos» en docs/decisiones/clase-en-vivo.md.
--
-- - `nivel`: inicial, intermedio o avanzado (o ninguno, en los del profe).
-- - `listo`: uno de la Academia, sin dueño. Lo ven quienes dan clase y quien
--   administra; los alumnos NO (trae las respuestas). Nadie lo cambia ni lo
--   borra desde afuera: se siembra con herramientas/cuestionarios-listos.js.
--   Para cambiarle algo, el profe lo copia a los suyos.

alter table public.cuestionarios add column if not exists nivel text;
alter table public.cuestionarios drop constraint if exists cuestionarios_nivel_valido;
alter table public.cuestionarios add constraint cuestionarios_nivel_valido
  check (nivel is null or nivel in ('inicial', 'intermedio', 'avanzado'));

alter table public.cuestionarios add column if not exists listo boolean not null default false;
alter table public.cuestionarios alter column profesor_id drop not null;
-- Uno listo no tiene dueño; uno con dueño no es listo. Un CHECK que da NULL
-- cuenta como aprobado: va envuelto en coalesce.
alter table public.cuestionarios drop constraint if exists cuestionarios_listo_sin_duenio;
alter table public.cuestionarios add constraint cuestionarios_listo_sin_duenio
  check (coalesce(listo = (profesor_id is null), false));

-- Sembrar dos veces no duplica: el título de uno listo es único.
create unique index if not exists cuestionarios_listo_titulo_unico on public.cuestionarios (titulo) where listo;

-- Los propios, y los listos a quien da clase o administra.
drop policy if exists cuestionarios_select on public.cuestionarios;
create policy cuestionarios_select on public.cuestionarios for select
  using (
    profesor_id = (select auth.uid())
    or (listo and coalesce((select mp.role = 'profesor' or mp.is_admin
                              from public.my_profile() mp(role, is_admin, teacher_id)), false))
  );
-- Insertar, cambiar y borrar siguen siendo solo de lo propio (profesor_id =
-- auth.uid()), así que uno listo no se toca desde la página.
