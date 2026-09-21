-- Carpetas para ordenar "Archivos": texto libre, igual que profiles.grupo, no
-- una tabla aparte — es solo una etiqueta de cada profesor para su propio
-- espacio, sin ningún efecto en permisos (la RLS ya aísla por profesor_id).
alter table public.archivos_pgn add column carpeta text;

-- Hacía falta para poder MOVER un archivo de carpeta: antes solo había
-- select/insert/delete, así que un update quedaba denegado por la RLS.
create policy archivos_pgn_update on public.archivos_pgn
  for update
  using (
    (select my_profile.is_admin from my_profile() my_profile(role, is_admin, teacher_id))
    or profesor_id = auth.uid()
  )
  with check (
    (select my_profile.is_admin from my_profile() my_profile(role, is_admin, teacher_id))
    or profesor_id = auth.uid()
  );
