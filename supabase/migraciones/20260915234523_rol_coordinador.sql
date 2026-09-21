-- El rol "coordinador": TODO lo que puede un profesor, y además armar
-- formularios de inscripción a torneos y mandarles el informe a los encargados.
--
-- Va como una marca encima de "profesor", no como un tercer valor de role, a
-- propósito: "todos los permisos de profesor" queda garantizado por
-- construcción. Hay 23 comprobaciones de role = 'profesor' en el navegador y 13
-- en la base; con un tercer valor, olvidar una sola le quitaría en silencio un
-- permiso al coordinador, y eso no da error: simplemente no le aparece el
-- botón. Es el mismo camino que ya sigue is_admin.
alter table public.profiles
  add column if not exists es_coordinador boolean not null default false;

comment on column public.profiles.es_coordinador is
  'Profesor que además coordina: arma formularios de inscripción y manda informes a los encargados. Marca encima de role = profesor, nunca sola.';

-- Sin esto, un alumno podría marcarse coordinador editando su propia fila.
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
    if new.es_coordinador is distinct from old.es_coordinador then new.es_coordinador := old.es_coordinador; end if;
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

-- Nunca coordinador sin ser profesor: la marca no significa nada sola.
alter table public.profiles drop constraint if exists profiles_coordinador_es_profesor;
alter table public.profiles add constraint profiles_coordinador_es_profesor
  check (not es_coordinador or role = 'profesor');

create or replace function public.soy_coordinador()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.es_coordinador or p.is_admin
                   from public.profiles p where p.id = auth.uid()), false);
$$;

comment on function public.soy_coordinador() is
  'Quien llama coordina (o administra): puede armar formularios y mandar informes a los encargados.';

revoke execute on function public.soy_coordinador() from public, anon;
grant execute on function public.soy_coordinador() to authenticated;