-- Certificados de curso (1 de 2): cuántas lecciones tiene cada curso y la tabla
-- de certificados. Ver el archivo del repo para el porqué completo.
create table if not exists interno.curso_lecciones (
  slug text primary key check (slug ~ '^[a-z0-9-]{3,60}$'),
  titulo text not null,
  total integer not null check (total > 0)
);
insert into interno.curso_lecciones (slug, titulo, total) values
  ('fundamentos-del-ajedrez',   'Fundamentos del Ajedrez',               12),
  ('aperturas-y-defensas',      'Aperturas y Defensas',                  16),
  ('calculo-y-visualizacion',   'Cálculo y Visualización',               10),
  ('finales-practicos',         'Finales Prácticos',                     14),
  ('partidas-modelo',           'Partidas modelo del ajedrez moderno',   33),
  ('estrategia-y-tactica',      'Estrategia y Táctica',                  20),
  ('el-mapa-de-los-finales',    'El mapa de los finales',                27),
  ('estrategia-en-el-final',    'Estrategia en el final',                16),
  ('desequilibrios-de-material','Desequilibrios de material',            20),
  ('preparacion-para-torneos',  'Preparación para Torneos',              18),
  ('formacion-ajedrez',         'Formación Ajedrez',                      8),
  ('arbitro-nacional',          'Árbitro Nacional',                      17)
on conflict (slug) do update set titulo = excluded.titulo, total = excluded.total;

create table if not exists public.certificados (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo ~ '^[0-9a-f]{10}$'),
  student_id uuid not null references public.profiles(id) on delete cascade,
  curso text not null,
  curso_titulo text not null,
  lecciones integer not null,
  alumno_nombre text not null,
  academia_id uuid references public.academias(id) on delete set null,
  academia_nombre text,
  academia_logo_path text,
  profesor_id uuid references public.profiles(id) on delete set null,
  profesor_nombre text not null,
  emitido_at timestamptz not null default now(),
  anulado_at timestamptz,
  anulado_por uuid references public.profiles(id) on delete set null
);
comment on table public.certificados is
  'Certificados de curso (un acta: no se reescribe). Los dan emitir_certificado() y anular_certificado(); sin políticas de escritura a propósito. Se comprueban sin cuenta con certificado_publico(codigo).';
create unique index if not exists certificados_uno_vigente
  on public.certificados (student_id, curso) where anulado_at is null;
create index if not exists certificados_profesor_idx on public.certificados (profesor_id);
create index if not exists certificados_academia_idx on public.certificados (academia_id);
create index if not exists certificados_anulado_por_idx on public.certificados (anulado_por);
alter table public.certificados enable row level security;
create policy certificados_lee on public.certificados for select to authenticated
  using (
    student_id = (select auth.uid())
    or student_id in (select interno.alumnos_de((select auth.uid())))
    or (select public.soy_admin())
  );
create trigger auditar after insert or update or delete on public.certificados
  for each row execute function interno.auditar();