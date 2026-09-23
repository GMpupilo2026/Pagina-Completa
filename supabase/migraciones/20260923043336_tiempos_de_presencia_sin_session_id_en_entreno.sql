-- platform_activity_log no tiene session_id, y PL/pgSQL resuelve new.session_id
-- aunque la primera mitad del AND sea falsa: cada insert fallaba con 42703 y el
-- tiempo de entrenamiento dejaba de registrarse sin ningun aviso. Se lee por
-- to_jsonb(new), que en esa tabla da null en vez de tronar.
create or replace function public.proteger_tiempos_de_presencia()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if TG_OP = 'INSERT' then
    if TG_TABLE_NAME = 'class_presence_log'
       and exists (select 1 from public.class_sessions cs
                    where cs.id = (to_jsonb(new)->>'session_id')::uuid
                      and cs.modalidad = 'presencial'
                      and cs.created_by = auth.uid())
    then
      return new;                      -- el tramo que declaró quien dio la clase
    end if;
    new.joined_at := now();
    new.left_at := null;
    return new;
  end if;
  new := old;
  new.left_at := now();
  return new;
end;
$function$;