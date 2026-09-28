-- Lo que marcó el asesor de rendimiento de Supabase (ver «Lo que marcó el
-- asesor de rendimiento» en docs/decisiones/sitio-e-infraestructura.md).

-- Claves foráneas sin índice: al borrar un perfil, Postgres revisa cada tabla
-- que lo nombra, y sin índice la recorre entera.
create index if not exists encuestas_curso_creado_por_fk on public.encuestas_curso (creado_por);
create index if not exists encuestas_curso_profesor_id_fk on public.encuestas_curso (profesor_id);
create index if not exists insignias_otorgada_por_fk on public.insignias (otorgada_por);
create index if not exists insignias_tipo_fk on public.insignias (tipo);
create index if not exists salas_torneo_updated_by_fk on public.salas_torneo (updated_by);
create index if not exists trofeos_ajustes_creado_por_fk on public.trofeos_ajustes (creado_por);

-- «Ejercicios Lichess» no tenía clave primaria. PuzzleId es el id de Lichess:
-- comprobado antes de aplicar, 343 161 filas, ninguna nula, todas distintas.
alter table public."Ejercicios Lichess" alter column "PuzzleId" set not null;
alter table public."Ejercicios Lichess" add constraint ejercicios_lichess_pkey primary key ("PuzzleId");