
-- Nada de lo que mande el cliente en joined_at/left_at vale: la página nunca
-- necesitó otra cosa que "ahora" (abrirFila/startPresenceLog no mandan
-- joined_at; tocarFila/touchPresenceLog siempre mandan la hora del momento),
-- así que forzar el reloj del servidor no le cambia nada a un uso legítimo y
-- le cierra la puerta a inflar minutos_clase/minutos_ejercicios desde la
-- consola del navegador (las políticas de insert/update solo exigían
-- student_id = auth.uid(), sin acotar ni el rango ni el salto entre latidos).
--
-- De paso, en un UPDATE se revierte TODO menos left_at (con NEW := OLD): en
-- class_presence_log eso cierra también que un alumno reasigne su fila a otra
-- sesión (session_id) — el insert sí valida es_mi_profesor(cs.created_by),
-- pero el update no revalidaba nada más que la dueñez de la fila.
create or replace function public.proteger_tiempos_de_presencia()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if TG_OP = 'INSERT' then
    new.joined_at := now();
    new.left_at := null;
    return new;
  end if;
  new := old;
  new.left_at := now();
  return new;
end;
$function$;

create trigger platform_activity_log_protege_tiempos
before insert or update on public.platform_activity_log
for each row execute function public.proteger_tiempos_de_presencia();

create trigger class_presence_log_protege_tiempos
before insert or update on public.class_presence_log
for each row execute function public.proteger_tiempos_de_presencia();
