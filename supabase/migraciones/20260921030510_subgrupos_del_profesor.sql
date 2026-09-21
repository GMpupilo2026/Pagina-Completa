-- Subgrupos: la lista de alumnos que cada profesor arma para SÍ MISMO.
--
-- No confundir con las otras dos formas de agrupar que ya existen:
--   profiles.grupo  — texto libre, UNO por alumno, lo pone quien administra.
--   equipos         — muchos a muchos y CON EFECTO EN PERMISOS: estar en un
--                     equipo con un entrenador le da a ese entrenador acceso
--                     al alumno. Por eso solo los escribe admin-manage-users.
--
-- Un subgrupo es la tercera cosa, y lo que lo define es lo que NO hace:
-- NO DA NI UN PERMISO. Ninguna función de "quién es profesor de quién"
-- (profesores_de, alumnos_de y las cinco que cuelgan de ellas) lo mira, así
-- que meter a alguien en un subgrupo no le abre nada a nadie. Es una etiqueta
-- para filtrar — "mi grupo de la tarde", "los que van al torneo"— y por eso un
-- profesor puede armarlos solo, sin pedirle nada a quien administra.
--
-- Como no da permisos, solo puede CONTENER a quien ya es suyo: la política de
-- insert exige soy_profesor_de(). Sin eso, un subgrupo sería una forma de
-- guardarse ids de alumnos ajenos, y aunque la RLS de profiles no dejara
-- leerlos, no hay ninguna razón para permitirlo.

create table if not exists public.subgrupos (
  id          uuid primary key default gen_random_uuid(),
  profesor_id uuid not null references public.profiles(id) on delete cascade,
  nombre      text not null,
  created_at  timestamptz not null default now(),
  constraint subgrupos_nombre_util check (length(btrim(nombre)) between 1 and 60)
);

-- Dos subgrupos con el mismo nombre serían imposibles de distinguir en el
-- selector del filtro, que es justamente para lo que existen. Es por profesor:
-- que una colega tenga su propio "Grupo de la tarde" no estorba.
create unique index if not exists subgrupos_uno_por_nombre
  on public.subgrupos (profesor_id, lower(btrim(nombre)));

create table if not exists public.subgrupo_alumnos (
  subgrupo_id uuid not null references public.subgrupos(id) on delete cascade,
  alumno_id   uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (subgrupo_id, alumno_id)
);

create index if not exists subgrupo_alumnos_por_alumno on public.subgrupo_alumnos (alumno_id);

alter table public.subgrupos       enable row level security;
alter table public.subgrupo_alumnos enable row level security;

-- Un subgrupo es del profesor que lo armó. Quien administra los ve todos —la
-- regla permanente— pero NO los edita: la forma en que una colega ordena a sus
-- alumnos es suya, igual que sus planes de clase.
create policy subgrupos_select on public.subgrupos for select
  using (profesor_id = auth.uid()
         or (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id)));

create policy subgrupos_insert on public.subgrupos for insert
  with check (profesor_id = auth.uid()
              and (select mp.is_admin or mp.role = 'profesor'
                   from public.my_profile() mp(role, is_admin, teacher_id)));

create policy subgrupos_update on public.subgrupos for update
  using (profesor_id = auth.uid()) with check (profesor_id = auth.uid());

create policy subgrupos_delete on public.subgrupos for delete
  using (profesor_id = auth.uid());

-- Los renglones cuelgan del subgrupo y no repiten su dueño: el mismo principio
-- que plan_items, para que ampliar o cerrar el acceso a un subgrupo no obligue
-- a acordarse de una segunda política.
create policy subgrupo_alumnos_select on public.subgrupo_alumnos for select
  using (exists (select 1 from public.subgrupos s where s.id = subgrupo_id));

create policy subgrupo_alumnos_insert on public.subgrupo_alumnos for insert
  with check (exists (select 1 from public.subgrupos s
                      where s.id = subgrupo_id and s.profesor_id = auth.uid())
              and (public.soy_profesor_de(alumno_id)
                   or (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id))));

create policy subgrupo_alumnos_delete on public.subgrupo_alumnos for delete
  using (exists (select 1 from public.subgrupos s
                 where s.id = subgrupo_id and s.profesor_id = auth.uid()));

revoke all on public.subgrupos       from anon;
revoke all on public.subgrupo_alumnos from anon;