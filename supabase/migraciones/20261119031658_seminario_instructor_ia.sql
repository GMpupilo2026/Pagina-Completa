-- La sala de seminario de arbitraje: el nombre del instructor que ve el árbitro.
-- Lo pidió el dueño (18/11/2026): la sala que abre la cuenta de administración
-- la da «IA Oscar Angulo Cubero» (no «Administrador», que es el nombre de la
-- cuenta). La página le pone el avatar del profe Oscar al ver ese nombre. Las
-- salas de un organizador siguen con el nombre de su perfil.
-- Misma firma y mismos permisos: create or replace los conserva.
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
