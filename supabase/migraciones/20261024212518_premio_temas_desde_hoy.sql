-- El premio por terminar un tema es «a partir de hoy» (lo decidió el dueño
-- del sitio el 24/10/2026): un tema que el alumno ya tenía completo ANTES de
-- que existiera el premio no paga nunca, ni con el próximo ejercicio de ese
-- tema. Uno que estaba a medias y se termina después, sí.
--
-- «Antes» es la hora en que se aplicó 20261024200705_premio_temas
-- (2026-10-24 20:07:05 UTC, 2:07 p. m. en Costa Rica). Para cada ejercicio
-- del tema se mira la PRIMERA vez que el alumno lo resolvió: si con lo
-- resuelto antes de esa hora ya estaba el tema entero, no se paga.
--
-- Solo cambia interno.premiar_tema_terminado(); el trigger sigue igual. Ver
-- «Terminar un tema: el doble, hasta 500» en docs/decisiones/puntos-y-premios.md.

create or replace function interno.premiar_tema_terminado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_desde constant timestamptz := '2026-10-24 20:07:05+00';
  v_grupo text := interno.premio_grupo(new.activity);
  v_item text;
  r record;
  v_hechos integer;
  v_antes integer;
  v_valor integer;
begin
  if v_grupo is null or not interno.entrenamiento_logrado(new.detail) then
    return new;
  end if;
  v_item := interno.premio_item(new.activity, new.detail);
  if v_item is null then
    return new;
  end if;
  for r in
    select t.tema, t.nombre, t.total
      from interno.premio_tema_items i
      join interno.premio_temas t on t.grupo = i.grupo and t.tema = i.tema
     where i.grupo = v_grupo and i.item = v_item
  loop
    continue when exists (
      select 1 from public.puntos_ajustes pa
       where pa.student_id = new.student_id and pa.origen = 'tema'
         and pa.referencia = 'tema:' || v_grupo || ':' || r.tema);
    -- Los ejercicios distintos del tema que ya resolvió, cuándo fue la
    -- primera vez y lo que vale cada uno.
    select count(*), count(*) filter (where s.primera < v_desde), coalesce(sum(s.valor), 0)
      into v_hechos, v_antes, v_valor
      from (
        select distinct on (interno.premio_item(tp.activity, tp.detail))
               interno.premio_item(tp.activity, tp.detail) as item,
               tp.created_at as primera,
               interno.entrenamiento_premio(tp.activity, tp.detail) as valor
          from public.training_progress tp
         where tp.student_id = new.student_id
           and interno.premio_grupo(tp.activity) = v_grupo
           and interno.entrenamiento_logrado(tp.detail)
         order by interno.premio_item(tp.activity, tp.detail), tp.created_at
      ) s
      join interno.premio_tema_items i on i.grupo = v_grupo and i.tema = r.tema and i.item = s.item;
    if v_hechos >= r.total and v_antes < r.total then
      perform interno.otorgar_puntos(new.student_id, least(500, greatest(1, 2 * v_valor)), 'tema',
        left('Terminaste el tema: ' || r.nombre, 200), 'tema:' || v_grupo || ':' || r.tema);
    end if;
  end loop;
  return new;
end;
$$;
revoke execute on function interno.premiar_tema_terminado() from public, anon, authenticated;
