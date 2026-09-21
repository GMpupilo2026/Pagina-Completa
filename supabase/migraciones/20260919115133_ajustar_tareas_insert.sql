
-- Ajuste: profesor_id siempre tiene que ser quien inserta, admin incluido.
-- Como estaba, is_admin sola bastaba para el with_check entero, así que en
-- teoría alguien con is_admin podía insertar una tarea a nombre de OTRO
-- profesor (profesor_id ajeno). Ningún otro insert del sitio deja eso
-- suelto (class_sessions_insert exige created_by = auth.uid() siempre).
drop policy tareas_insert on public.tareas;
create policy tareas_insert on public.tareas for insert
  with check (
    profesor_id = auth.uid()
    and (
      (select is_admin from public.my_profile())
      or (
        (select role from public.my_profile()) = 'profesor'
        and soy_profesor_de(alumno_id)
      )
    )
  );
