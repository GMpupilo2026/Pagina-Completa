-- La etiqueta lleva el id del examen y no es un 'examen' a secas.
--
-- sw.js la usa como `tag` de la notificación, y esa es la que hace que un
-- aviso REEMPLACE al anterior de la misma etiqueta. En tareas eso no cuesta
-- nada porque el aviso lleva a /tareas.html, donde están todas; acá lleva a
-- /examen.html?id=<uno>, así que un segundo examen taparía el aviso del
-- primero y con él su único enlace. Y no daría ningún error: el examen
-- seguiría asignado, el alumno simplemente no se enteraría de ese.
create or replace function public.avisar_examen_asignado()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  profe   text;
  n       integer;
  s_preg  text;
  s_min   text;
begin
  select coalesce(p.full_name, 'Tu profe') into profe
    from public.profiles p where p.id = new.profesor_id;

  -- Se puede contar porque el trigger es DEFERRABLE INITIALLY DEFERRED:
  -- crear_examen() inserta el examen antes que sus preguntas, así que un
  -- AFTER INSERT de siempre diría "0 preguntas" sin que nada fallara.
  select count(*) into n
    from public.examen_items i where i.examen_id = new.id;

  s_preg := n || case when n = 1 then ' pregunta' else ' preguntas' end;
  s_min  := new.minutos || case when new.minutos = 1 then ' minuto' else ' minutos' end;

  perform public.avisar_push(
    array[new.alumno_id],
    'Nuevo examen',
    profe || ' te puso «' || new.titulo || '»: ' || s_preg || ' en ' || s_min ||
      '. Tienes hasta el ' ||
      to_char(new.vence_at at time zone 'America/Costa_Rica', 'DD/MM HH24:MI') || '.',
    -- Directo a rendirlo, no a una lista: el examen tiene reloj y una sola
    -- oportunidad, así que buscarlo entre otros es un paso de más.
    '/examen.html?id=' || new.id,
    'examen:' || new.id);
  return new;
end;
$$;