create or replace function public.seminario_salas_para_mi()
 returns table (sala_id uuid, titulo text, instructor text, abierta_en timestamptz, mi_estado text)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select s.id, s.titulo,
         case when coalesce(ins.is_admin, false) then 'IA Oscar Angulo Cubero'
              else coalesce(nullif(btrim(ins.full_name), ''), 'Instructor') end,
         s.abierta_en, p.estado
    from public.seminario_salas s
    join public.profiles ins on ins.id = s.instructor_id
    left join public.seminario_participantes p on p.sala_id = s.id and p.arbitro_id = (select auth.uid())
   where s.cerrada_en is null
     and interno.seminario_puede_pedir(s.id, (select auth.uid()))
   order by s.abierta_en desc;
$function$;