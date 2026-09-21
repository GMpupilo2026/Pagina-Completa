-- Formularios de inscripción a torneos: los arma quien coordina, para los
-- alumnos de un equipo suyo, y se comparten por enlace. Es lo que hoy es
-- inscripcion.html —escrito a mano para un solo torneo— pero generado.
create table if not exists public.formularios (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  titulo text not null,
  descripcion text,
  grupo text,                                   -- para qué equipo es (texto libre, como profiles.grupo)
  campos jsonb not null default '[]'::jsonb,    -- [{id, etiqueta, tipo, requerido, ayuda, opciones[]}]
  abierto boolean not null default true,
  cierra_el timestamptz,
  creado_por uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint formularios_slug_forma check (slug ~ '^[a-z0-9][a-z0-9-]{2,60}$'),
  constraint formularios_titulo_no_vacio check (length(btrim(titulo)) between 1 and 200),
  constraint formularios_campos_es_lista check (jsonb_typeof(campos) = 'array'),
  constraint formularios_campos_cuantos check (jsonb_array_length(campos) <= 60)
);
create index if not exists formularios_creado_por_idx on public.formularios (creado_por);

create table if not exists public.formulario_respuestas (
  id uuid primary key default gen_random_uuid(),
  formulario_id uuid not null references public.formularios(id) on delete cascade,
  respuestas jsonb not null,
  alumno_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint formulario_respuestas_es_objeto check (jsonb_typeof(respuestas) = 'object')
);
create index if not exists formulario_respuestas_formulario_idx
  on public.formulario_respuestas (formulario_id, created_at desc);

comment on table public.formularios is
  'Formularios de inscripción que arma quien coordina. Se comparten por enlace público; el enlace no da acceso a las respuestas.';
comment on table public.formulario_respuestas is
  'Lo que contestó cada persona. Solo lo lee quien creó el formulario y quien administra.';

alter table public.formularios enable row level security;
alter table public.formulario_respuestas enable row level security;

-- ---------------------------------------------------------------- formularios
-- Los arma quien coordina, y cada quien maneja los suyos. Quien administra,
-- todos. El público NO lee esta tabla: lo suyo pasa por formulario_publico().
drop policy if exists formularios_select on public.formularios;
create policy formularios_select on public.formularios
  for select using (
    creado_por = auth.uid()
    or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
  );

drop policy if exists formularios_insert on public.formularios;
create policy formularios_insert on public.formularios
  for insert with check (creado_por = auth.uid() and public.soy_coordinador());

drop policy if exists formularios_update on public.formularios;
create policy formularios_update on public.formularios
  for update using (
    creado_por = auth.uid()
    or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
  ) with check (
    creado_por = auth.uid()
    or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
  );

drop policy if exists formularios_delete on public.formularios;
create policy formularios_delete on public.formularios
  for delete using (
    creado_por = auth.uid()
    or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))
  );

-- ---------------------------------------------------------------- respuestas
-- Se leen y se borran; no hay política de insert a propósito: quien contesta no
-- tiene sesión, y lo escribe responder_formulario(). Es el mismo patrón que
-- registrar_arbitraje_publico().
drop policy if exists formulario_respuestas_select on public.formulario_respuestas;
create policy formulario_respuestas_select on public.formulario_respuestas
  for select using (
    exists (select 1 from public.formularios f
            where f.id = formulario_id
              and (f.creado_por = auth.uid()
                   or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))))
  );

drop policy if exists formulario_respuestas_delete on public.formulario_respuestas;
create policy formulario_respuestas_delete on public.formulario_respuestas
  for delete using (
    exists (select 1 from public.formularios f
            where f.id = formulario_id
              and (f.creado_por = auth.uid()
                   or (select my_profile.is_admin from public.my_profile() my_profile(role, is_admin, teacher_id))))
  );