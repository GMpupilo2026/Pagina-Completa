-- Quién puede retar a quién. Misma idea de siempre —la propia clase— pero
-- ahora "la propia clase" es compartir CUALQUIERA de los profesores, no el
-- único que había. No pregunta por auth.uid() sino por dos personas
-- cualesquiera, así que no sirve es_companero(): va contra profile_teachers.
create or replace function public.pueden_jugar_entre_si(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = 'public' as $function$
  select a is distinct from b and (
    -- administración juega con cualquiera
    exists (select 1 from public.profiles p where p.id in (a, b) and p.is_admin)
    -- dos alumnos que comparten al menos un profesor
    or exists (select 1 from public.profile_teachers pa
               join public.profile_teachers pb on pb.teacher_id = pa.teacher_id
               where pa.student_id = a and pb.student_id = b)
    -- un alumno con uno de sus profesores, en cualquier orden
    or exists (select 1 from public.profile_teachers pt
               where (pt.student_id = a and pt.teacher_id = b)
                  or (pt.student_id = b and pt.teacher_id = a))
  );
$function$;

comment on function public.pueden_jugar_entre_si(uuid, uuid) is
  'Dos personas son de la misma clase: comparten profesor, o una es profesora de la otra, o alguna administra.';