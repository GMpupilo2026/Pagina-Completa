create or replace function public.consumir_invitacion(p_profesor uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare fila public.profiles%rowtype;
begin
  perform set_config('ajedrez.contando_invitaciones', 'si', true);

  update public.profiles
     set invitaciones_usadas = invitaciones_usadas + 1
   where id = p_profesor
     and (is_admin or (role = 'profesor' and invitaciones_usadas < invitaciones_max))
  returning * into fila;

  if not found then
    select * into fila from public.profiles where id = p_profesor;
    if fila.id is null then
      return jsonb_build_object('ok', false, 'motivo', 'sin_perfil');
    end if;
    if fila.role is distinct from 'profesor' then
      return jsonb_build_object('ok', false, 'motivo', 'no_es_profesor');
    end if;
    return jsonb_build_object('ok', false, 'motivo', 'sin_cupo',
      'max', fila.invitaciones_max, 'usadas', fila.invitaciones_usadas);
  end if;

  return jsonb_build_object('ok', true, 'max', fila.invitaciones_max,
    'usadas', fila.invitaciones_usadas, 'ilimitado', fila.is_admin,
    'restantes', case when fila.is_admin then null
                      else greatest(fila.invitaciones_max - fila.invitaciones_usadas, 0) end);
end;
$$;

revoke execute on function public.consumir_invitacion(uuid) from public, anon, authenticated;