-- La marca de la academia en los correos a la casa. Devuelve una fila solo si
-- el alumno es de UNA academia: con dos, el correo es uno solo con la suma y
-- sale como Ajedrez Integral, la misma regla que el remitente y que el
-- encabezado de la plataforma (mi_marca_academia). Solo la service role, como
-- correos_de_supervision: la llaman las Edge Functions que mandan el correo.
create or replace function public.marca_de_alumno(p_alumno uuid)
returns table(nombre text, color text, logo_path text)
language sql stable security definer set search_path to 'public' set row_security to off as $$
  select a.nombre, a.color, a.logo_path
    from public.academia_miembros m
    join public.academias a on a.id = m.academia_id
   where m.persona_id = p_alumno
     and (select count(*) from public.academia_miembros x where x.persona_id = p_alumno) = 1;
$$;

revoke execute on function public.marca_de_alumno(uuid) from public, anon, authenticated;
grant execute on function public.marca_de_alumno(uuid) to service_role;
