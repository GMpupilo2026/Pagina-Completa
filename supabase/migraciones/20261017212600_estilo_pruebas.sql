-- La prueba de estilo: qué tipo de juego prefiere cada alumno, para
-- recomendarle aperturas que le queden (entreno/estilo.html).
--
-- Una fila por prueba rendida, para ver cómo cambia el estilo y para seguir
-- la recomendación en el tiempo. Se guarda lo que contestó y no lo que se
-- calcula: el perfil sale de las respuestas con la regla de su versión
-- (js/estilo-perfil.js), y cambia cuando se calibra el banco. La excepción
-- es la recomendación, que es un acta: lo que se le dijo ese día, que es lo
-- que se sigue después (como la nota de un examen).
--
-- - La escribe el alumno, y solo para sí: es SU prueba. La ven él, quien le
--   da clase, quien lo supervisa y administración (como el análisis de sus
--   partidas). No se cambia: una prueba vieja es historia. El alumno puede
--   borrar las suyas.
-- - La hora la pone la base: el seguimiento compara sus partidas antes y
--   después de esa fecha, y una fecha puesta desde el navegador se podría
--   correr.
-- - `partidas`: los momentos de sus partidas de Lichess y Chess.com que
--   midió su navegador ({eje, primero}), sin las partidas.
-- Ver «La prueba de estilo» en docs/decisiones/entrenamiento.md.

create table public.estilo_pruebas (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references public.profiles(id) on delete cascade,
  version smallint not null check (version between 1 and 100),
  respuestas jsonb not null check (jsonb_typeof(respuestas) = 'array' and jsonb_array_length(respuestas) between 1 and 60
                                   and pg_column_size(respuestas) <= 65536),
  contexto jsonb not null default '{}'::jsonb check (jsonb_typeof(contexto) = 'object' and pg_column_size(contexto) <= 4096),
  partidas jsonb check (partidas is null or (jsonb_typeof(partidas) = 'array' and jsonb_array_length(partidas) <= 300
                                             and pg_column_size(partidas) <= 65536)),
  recomendacion jsonb check (recomendacion is null or (jsonb_typeof(recomendacion) = 'object' and pg_column_size(recomendacion) <= 32768)),
  created_at timestamptz not null default now()
);

create index estilo_pruebas_alumno on public.estilo_pruebas (alumno_id, created_at desc);

alter table public.estilo_pruebas enable row level security;

create policy estilo_pruebas_select on public.estilo_pruebas for select to authenticated
  using (alumno_id = (select auth.uid())
         or (select mp.is_admin from public.my_profile() mp)
         or alumno_id in (select interno.alumnos_de((select auth.uid())))
         or ((select public.soy_supervisor()) and alumno_id in (select interno.supervisados_por_mi())));
create policy estilo_pruebas_insert on public.estilo_pruebas for insert to authenticated
  with check (alumno_id = (select auth.uid()));
create policy estilo_pruebas_delete on public.estilo_pruebas for delete to authenticated
  using (alumno_id = (select auth.uid()));

-- La hora es la de la base, siempre.
create or replace function interno.estilo_pruebas_al_guardar()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  new.created_at := now();
  return new;
end $$;
revoke execute on function interno.estilo_pruebas_al_guardar() from public, anon, authenticated;
create trigger estilo_pruebas_al_guardar before insert on public.estilo_pruebas
  for each row execute function interno.estilo_pruebas_al_guardar();

revoke all on public.estilo_pruebas from anon;
revoke truncate, references, trigger, update on public.estilo_pruebas from authenticated;
grant select, insert, delete on public.estilo_pruebas to authenticated;
