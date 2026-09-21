-- El Elo lo puede cambiar cualquiera de sus profesores, no solo el que tenía
-- puesto en la columna.
create or replace function public.set_student_elo(p_student uuid, p_elo integer, p_tipo text)
returns void language plpgsql security definer set search_path = 'public' as $function$
declare
  me record;
begin
  select role, is_admin into me from public.profiles where id = auth.uid();
  if me is null then
    raise exception 'Sin sesión';
  end if;
  if not (me.is_admin or (me.role = 'profesor' and public.soy_profesor_de(p_student))) then
    raise exception 'Solo un profesor del alumno o un administrador pueden cambiar su Elo';
  end if;
  if p_elo is not null and (p_elo < 100 or p_elo > 3500) then
    raise exception 'Elo fuera de rango (100 a 3500)';
  end if;
  if p_tipo is not null and p_tipo not in ('fide','nacional','online','estimado') then
    raise exception 'Tipo de Elo no válido';
  end if;
  update public.profiles
     set elo = p_elo, elo_tipo = p_tipo, elo_actualizado = now()
   where id = p_student;
end;
$function$;