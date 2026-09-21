-- El mismo tropiezo que tuvo el contador de invitaciones, otra vez: el trigger
-- que impide que alguien se nombre coordinador a sí mismo también deshacía el
-- cambio legítimo de quien administra — y sin ruido, porque el UPDATE "funciona"
-- y solo después el trigger revierte el valor.
--
-- Se arregla igual: una marca local que el trigger respeta SOLO para esa
-- columna. Y además la función vuelve a leer la fila y falla si no quedó, para
-- que nunca más pueda devolver "listo" sin haber hecho nada.
create or replace function public.protect_profiles_identity_columns()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  contando_invitaciones boolean := coalesce(current_setting('ajedrez.contando_invitaciones', true), '') = 'si';
  sincronizando boolean := coalesce(current_setting('ajedrez.sincronizando_profesores', true), '') = 'si';
  nombrando boolean := coalesce(current_setting('ajedrez.nombrando_coordinador', true), '') = 'si';
begin
  if auth.uid() is not null then
    if new.role is distinct from old.role then new.role := old.role; end if;
    if new.email is distinct from old.email then new.email := old.email; end if;
    if new.is_admin is distinct from old.is_admin then new.is_admin := old.is_admin; end if;
    if not nombrando then
      if new.es_coordinador is distinct from old.es_coordinador then
        new.es_coordinador := old.es_coordinador;
      end if;
    end if;
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

create or replace function public.marcar_coordinador(p_profesor uuid, p_valor boolean)
returns void language plpgsql security definer set search_path = 'public' as $$
declare
  yo record;
  objetivo record;
  quedo boolean;
begin
  select role, is_admin into yo from public.profiles where id = auth.uid();
  if yo is null then raise exception 'Sin sesión'; end if;
  if not yo.is_admin then
    raise exception 'Solo la persona administradora puede nombrar coordinadores';
  end if;

  select role into objetivo from public.profiles where id = p_profesor;
  if objetivo is null then raise exception 'No se encontró esa cuenta'; end if;
  if objetivo.role <> 'profesor' then
    raise exception 'Coordinar es un añadido al rol de profesor: primero hay que darle ese rol';
  end if;

  perform set_config('ajedrez.nombrando_coordinador', 'si', true);
  update public.profiles set es_coordinador = coalesce(p_valor, false) where id = p_profesor;
  perform set_config('ajedrez.nombrando_coordinador', '', true);

  -- Se vuelve a leer a propósito: si algún día otro trigger deshace esto, que
  -- se note aquí y no seis meses después, cuando alguien pregunte por qué el
  -- botón "no hace nada".
  select es_coordinador into quedo from public.profiles where id = p_profesor;
  if quedo is distinct from coalesce(p_valor, false) then
    raise exception 'No se pudo guardar la marca de coordinación';
  end if;
end;
$$;

revoke execute on function public.marcar_coordinador(uuid, boolean) from public, anon;
grant execute on function public.marcar_coordinador(uuid, boolean) to authenticated;