-- profiles.teacher_id pasa a ser solo el PROFESOR PRINCIPAL, y se mantiene solo
-- desde profile_teachers para que los dos no puedan contradecirse: al sumarle el
-- primer profesor a un alumno queda ese, y al quitarle el principal pasa a otro
-- de los que le queden, o a NULL si no le queda ninguno. Así nadie tiene que
-- acordarse de escribir las dos cosas en el orden correcto.
create or replace function public.sincronizar_profesor_principal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('ajedrez.sincronizando_profesores', 'si', true);

  if tg_op = 'INSERT' then
    update public.profiles p
       set teacher_id = new.teacher_id
     where p.id = new.student_id and p.teacher_id is null;
    perform set_config('ajedrez.sincronizando_profesores', '', true);
    return new;
  end if;

  -- DELETE: si se fue el principal, lo reemplaza cualquiera de los que quedan.
  update public.profiles p
     set teacher_id = (select pt.teacher_id from public.profile_teachers pt
                        where pt.student_id = old.student_id
                        order by pt.created_at limit 1)
   where p.id = old.student_id and p.teacher_id = old.teacher_id;
  perform set_config('ajedrez.sincronizando_profesores', '', true);
  return old;
end;
$$;

drop trigger if exists profile_teachers_sincroniza_principal on public.profile_teachers;
create trigger profile_teachers_sincroniza_principal
  after insert or delete on public.profile_teachers
  for each row execute function public.sincronizar_profesor_principal();

-- El guardián de las columnas de identidad tiene que dejar pasar ese ajuste,
-- igual que ya deja pasar el del contador de invitaciones. Sin esto, si algún
-- día la sincronización corre con una sesión de por medio, el trigger la
-- desharía en silencio — el mismo fallo callado que tuvo el contador.
create or replace function public.protect_profiles_identity_columns()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  contando_invitaciones boolean := coalesce(current_setting('ajedrez.contando_invitaciones', true), '') = 'si';
  sincronizando boolean := coalesce(current_setting('ajedrez.sincronizando_profesores', true), '') = 'si';
begin
  if auth.uid() is not null then
    if new.role is distinct from old.role then new.role := old.role; end if;
    if new.email is distinct from old.email then new.email := old.email; end if;
    if new.is_admin is distinct from old.is_admin then new.is_admin := old.is_admin; end if;
    -- Quién es su profesor principal no lo decide el alumno. Lo decide
    -- profile_teachers, a través de sincronizar_profesor_principal().
    if not sincronizando then
      if new.teacher_id is distinct from old.teacher_id then new.teacher_id := old.teacher_id; end if;
    end if;
    -- El cupo tampoco lo decide el profesor, salvo que quien esté escribiendo
    -- sea consumir_invitacion()/devolver_invitacion(), que dejan la marca.
    if not contando_invitaciones then
      if new.invitaciones_max is distinct from old.invitaciones_max then
        new.invitaciones_max := old.invitaciones_max;
      end if;
      if new.invitaciones_usadas is distinct from old.invitaciones_usadas then
        new.invitaciones_usadas := old.invitaciones_usadas;
      end if;
    end if;
  end if;
  return new;
end;
$$;

comment on column public.profiles.teacher_id is
  'Profesor principal: el que lo invitó o el primero que le asignaron. Es el que viene preseleccionado en la clase en vivo. NO decide permisos — eso es profile_teachers. Lo mantiene solo el trigger de profile_teachers.';