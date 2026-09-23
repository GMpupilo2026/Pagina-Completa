-- La bitácora de un alumno, de TODOS sus profesores y con el nombre de quien
-- escribió cada nota, para quien lo supervisa. Solo lectura: no se abrió
-- ninguna política de notas_alumno, así que escribir, compartir y borrar
-- siguen siendo de quien la escribió. Quien administra ya las ve todas.
create or replace function public.bitacora_supervisada(p_alumno uuid)
returns table (id uuid, alumno_id uuid, profesor_id uuid, autor text, texto text,
               etiqueta text, compartida boolean, created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not (public.supervisado_por_mi(p_alumno)
          or coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)) then
    raise exception 'Ese alumno no está a tu cargo.' using errcode = '42501';
  end if;
  return query
    select n.id, n.alumno_id, n.profesor_id,
           coalesce(nullif(btrim(pr.full_name), ''), split_part(pr.email, '@', 1)),
           n.texto, n.etiqueta, n.compartida, n.created_at, n.updated_at
      from public.notas_alumno n
      left join public.profiles pr on pr.id = n.profesor_id
     where n.alumno_id = p_alumno
     order by n.created_at desc;
end;
$$;
revoke execute on function public.bitacora_supervisada(uuid) from public, anon;
grant execute on function public.bitacora_supervisada(uuid) to authenticated, service_role;
