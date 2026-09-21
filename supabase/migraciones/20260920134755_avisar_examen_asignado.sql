-- El aviso push del examen, igual que el de las tareas (avisar_tarea_asignada).
--
-- Va como CONSTRAINT TRIGGER DEFERRABLE INITIALLY DEFERRED y no como un
-- AFTER INSERT de siempre por una razón concreta: crear_examen() inserta
-- primero la fila de examenes y DESPUÉS sus preguntas, así que un trigger
-- normal contaría examen_items en el momento en que todavía no hay ninguna
-- y el aviso diría "0 preguntas" sin que nada fallara. Diferido corre al
-- COMMIT, cuando las preguntas ya están.
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
    'examen');
  return new;
end;
$$;

drop trigger if exists avisar_examen_asignado on public.examenes;

create constraint trigger avisar_examen_asignado
  after insert on public.examenes
  deferrable initially deferred
  for each row
  execute function public.avisar_examen_asignado();