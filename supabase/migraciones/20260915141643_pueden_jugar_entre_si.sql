-- ¿Estas dos personas pueden jugar entre sí? Mantiene la separación por
-- profesor que rige el resto del sitio: un alumno solo se cruza con gente de su
-- propia clase. SECURITY DEFINER para leer profiles sin volver a pasar por su
-- RLS, igual que my_profile().
create or replace function public.pueden_jugar_entre_si(a uuid, b uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select a is distinct from b and exists (
    select 1
    from public.profiles pa, public.profiles pb
    where pa.id = a and pb.id = b
      and (
        pa.is_admin or pb.is_admin                      -- administración juega con cualquiera
        or (pa.teacher_id is not null and pa.teacher_id = pb.teacher_id)  -- dos alumnos del mismo profesor
        or pa.teacher_id = pb.id                        -- alumno con su profesor
        or pb.teacher_id = pa.id                        -- profesor con su alumno
      )
  );
$$;

comment on function public.pueden_jugar_entre_si is
  'Si dos personas pueden retarse en Juegos: alumnos del mismo profesor, un alumno con su profesor, o cualquiera con administración. Mantiene la separación por profesor.';

grant execute on function public.pueden_jugar_entre_si(uuid, uuid) to authenticated;