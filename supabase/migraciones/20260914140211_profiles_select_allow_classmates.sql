-- Un alumno necesita poder ver el nombre/correo básico de otro alumno
-- asignado al MISMO profesor (por ejemplo, su rival en una partida de
-- Crazyhouse o de 4 jugadores armada por el profesor) — la política anterior
-- solo dejaba ver la propia fila, la del profesor asignado, o (para un
-- profesor) las de sus propios alumnos, y eso bloqueaba ver al rival.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (
  auth.uid() = id
  or (select is_admin from public.my_profile())
  or (
    (select role from public.my_profile()) = 'profesor'
    and profiles.teacher_id = auth.uid()
  )
  or profiles.id = (select teacher_id from public.my_profile())
  or (
    profiles.teacher_id is not null
    and profiles.teacher_id = (select teacher_id from public.my_profile())
  )
);