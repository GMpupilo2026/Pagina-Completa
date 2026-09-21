-- mi_grupo(): el grupo/equipo de quien llama, para las políticas de "mismo equipo".
-- SECURITY DEFINER como my_profile()/soy_coordinador(), para no volver a pasar
-- por la RLS de profiles.
create or replace function public.mi_grupo()
returns text
language sql
stable security definer
set search_path to 'public'
as $function$
  select grupo from public.profiles where id = auth.uid();
$function$;

revoke execute on function public.mi_grupo() from anon;
grant execute on function public.mi_grupo() to authenticated;

-- Un coordinador ya veía sus propios formularios (creado_por = auth.uid()).
-- Ahora también ve los de un coordinador de su mismo equipo (formularios.grupo).
-- NULL = NULL nunca es verdadero, así que dos formularios sin grupo no se cruzan.
alter policy formularios_select on public.formularios
  using (
    creado_por = auth.uid()
    or (select my_profile.is_admin from my_profile() my_profile(role, is_admin, teacher_id))
    or (soy_coordinador() and grupo = mi_grupo())
  );

alter policy formulario_respuestas_select on public.formulario_respuestas
  using (
    exists (
      select 1 from formularios f
      where f.id = formulario_respuestas.formulario_id
        and (
          f.creado_por = auth.uid()
          or (select my_profile.is_admin from my_profile() my_profile(role, is_admin, teacher_id))
          or (soy_coordinador() and f.grupo = mi_grupo())
        )
    )
  );
