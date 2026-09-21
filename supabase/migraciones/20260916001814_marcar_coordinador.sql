-- Marcar o desmarcar a un profesor como coordinador. Va por función y no por
-- un update directo porque es_coordinador está protegida por el trigger de
-- identidad: nadie puede dársela a sí mismo editando su fila. Mismo patrón que
-- set_student_elo().
create or replace function public.marcar_coordinador(p_profesor uuid, p_valor boolean)
returns void language plpgsql security definer set search_path = 'public' as $$
declare
  yo record;
  objetivo record;
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

  update public.profiles set es_coordinador = coalesce(p_valor, false) where id = p_profesor;
end;
$$;

revoke execute on function public.marcar_coordinador(uuid, boolean) from public, anon;
grant execute on function public.marcar_coordinador(uuid, boolean) to authenticated;