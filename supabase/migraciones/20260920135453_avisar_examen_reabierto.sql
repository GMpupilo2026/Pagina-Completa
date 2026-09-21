-- Aviso push al REABRIR un examen.
--
-- Es el momento en que más falta hace: el alumno se quedó congelado a mitad
-- del examen y no tiene forma de saber que ya puede volver a entrar — sin
-- aviso tendría que ir probando la página cada tanto. Al asignarlo ya avisa
-- avisar_examen_asignado; esto es la otra mitad.
--
-- Va como AFTER UPDATE normal y no diferido, al revés que el de asignar: acá
-- las preguntas ya existen desde hace rato, no se están insertando en la
-- misma transacción.
create or replace function public.avisar_examen_reabierto()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  profe   text;
  faltan  integer;
  cuerpo  text;
begin
  select coalesce(p.full_name, 'Tu profe') into profe
    from public.profiles p where p.id = new.profesor_id;

  -- Cuántas le quedan por contestar. NO sale de examenes.total_items: al
  -- reabrir, esa columna se pone en null junto con la nota (es del cierre
  -- anterior), así que leerla daría siempre null y el aviso no diría nada.
  select count(*) - (select count(*) from public.examen_respuestas r
                       where r.examen_id = new.id)
    into faltan
    from public.examen_items i where i.examen_id = new.id;

  cuerpo := profe || ' volvió a abrirte «' || new.titulo || '»';
  if faltan > 0 then
    cuerpo := cuerpo || ': te ' ||
      case when faltan = 1 then 'falta 1 pregunta' else 'faltan ' || faltan || ' preguntas' end ||
      ' y tienes ' || new.minutos ||
      case when new.minutos = 1 then ' minuto' else ' minutos' end ||
      '. Sigues desde donde quedaste.';
  else
    cuerpo := cuerpo || '. Ya puedes entrar otra vez.';
  end if;

  perform public.avisar_push(
    array[new.alumno_id],
    'Examen abierto otra vez',
    cuerpo,
    '/examen.html?id=' || new.id,
    -- La MISMA etiqueta que el aviso de cuando se lo asignaron, a propósito:
    -- sw.js la usa como tag, así que este reemplaza al anterior en la bandeja.
    -- Son el mismo examen y el aviso viejo ya no dice la verdad.
    'examen:' || new.id);
  return new;
end;
$$;

drop trigger if exists avisar_examen_reabierto on public.examenes;

create trigger avisar_examen_reabierto
  after update on public.examenes
  for each row
  when (old.estado is distinct from 'asignado' and new.estado = 'asignado')
  execute function public.avisar_examen_reabierto();