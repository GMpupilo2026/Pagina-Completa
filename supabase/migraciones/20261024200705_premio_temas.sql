-- Terminar un tema de Entrenamiento paga el doble de lo que valen sus
-- ejercicios, con un tope de 500. Lo pidió el dueño del sitio («cuando se
-- termine un tema, el doble por premio por completarlo»; el tope y que la
-- base compruebe los ejercicios, también suyos). Ver «Terminar un tema: el
-- doble, hasta 500» en docs/decisiones/puntos-y-premios.md.
--
-- - Qué es un tema y qué ejercicios tiene: interno.premio_temas y
--   interno.premio_tema_items. Los llena herramientas/premio-temas.py (en
--   migraciones aparte, porque son unos 150 KB) desde las mismas fuentes que
--   metas.json. Solo cuenta un ejercicio que está en la lista: anotarse ids
--   inventados desde la consola no completa nada.
-- - Cuándo: un trigger after insert en training_progress, aparte del que paga
--   cada ejercicio (interno.otorgar_puntos_de_entrenamiento, que no se toca).
--   Mira solo los temas que contienen el ejercicio recién anotado y cuenta los
--   ejercicios DISTINTOS del tema que el alumno ya resolvió (con cualquier
--   tema abierto: en Ejercicios por tema un mismo ejercicio está en varios).
-- - Cuánto: el doble de lo que valen sus ejercicios hoy
--   (interno.entrenamiento_premio), hasta 500. No lo doblan los «puntos
--   dobles» (no está en la lista de otorgar_puntos): el tope es el tope.
-- - Una sola vez por alumno y tema: la referencia 'tema:<grupo>:<tema>' y el
--   índice único de puntos_ajustes.

alter table public.puntos_ajustes drop constraint puntos_ajustes_origen_check;
alter table public.puntos_ajustes add constraint puntos_ajustes_origen_check
  check (origen in ('clase', 'entrenamiento', 'tarea', 'examen', 'racha', 'reto_semanal',
                    'canje', 'regalo', 'broma', 'ajuste_manual', 'partida', 'semana_sin_entrenar', 'tema'));

create table interno.premio_temas (
  grupo text not null,
  tema text not null,
  nombre text not null,
  total integer not null check (total > 0),
  primary key (grupo, tema)
);
comment on table interno.premio_temas is
  'Los temas de Entrenamiento que pagan un premio al terminarlos. Los llena herramientas/premio-temas.py.';
create table interno.premio_tema_items (
  grupo text not null,
  tema text not null,
  item text not null,
  primary key (grupo, tema, item),
  foreign key (grupo, tema) references interno.premio_temas (grupo, tema) on delete cascade
);
create index premio_tema_items_item on interno.premio_tema_items (grupo, item);
alter table interno.premio_temas enable row level security;
alter table interno.premio_tema_items enable row level security;
revoke all on interno.premio_temas, interno.premio_tema_items from public, anon, authenticated;

-- De qué grupo es una actividad y qué id de ejercicio anota.
create or replace function interno.premio_grupo(p_activity text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_activity in ('temas', 'tactica') then 'temas'
    when p_activity in ('mates', '4x4', 'tipos', 'aprender', 'practicar', 'aperturas') then p_activity
  end;
$$;

create or replace function interno.premio_item(p_activity text, p_detail jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case interno.premio_grupo(p_activity)
    when 'aprender' then p_detail->>'lesson_id'
    when 'practicar' then p_detail->>'set_id'
    when 'aperturas' then p_detail->>'linea_id'
    when 'temas' then p_detail->>'puzzle_id'
    when 'mates' then p_detail->>'puzzle_id'
    when '4x4' then p_detail->>'puzzle_id'
    when 'tipos' then p_detail->>'puzzle_id'
  end;
$$;

create or replace function interno.premiar_tema_terminado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grupo text := interno.premio_grupo(new.activity);
  v_item text;
  r record;
  v_hechos integer;
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
    -- Los ejercicios distintos del tema que ya resolvió, con lo que vale cada uno.
    select count(*), coalesce(sum(s.valor), 0) into v_hechos, v_valor
      from (
        select distinct on (interno.premio_item(tp.activity, tp.detail))
               interno.premio_item(tp.activity, tp.detail) as item,
               interno.entrenamiento_premio(tp.activity, tp.detail) as valor
          from public.training_progress tp
         where tp.student_id = new.student_id
           and interno.premio_grupo(tp.activity) = v_grupo
           and interno.entrenamiento_logrado(tp.detail)
      ) s
      join interno.premio_tema_items i on i.grupo = v_grupo and i.tema = r.tema and i.item = s.item;
    if v_hechos >= r.total then
      perform interno.otorgar_puntos(new.student_id, least(500, greatest(1, 2 * v_valor)), 'tema',
        left('Terminaste el tema: ' || r.nombre, 200), 'tema:' || v_grupo || ':' || r.tema);
    end if;
  end loop;
  return new;
end;
$$;
revoke execute on function interno.premiar_tema_terminado() from public, anon, authenticated;

create trigger premiar_tema_terminado
  after insert on public.training_progress
  for each row execute function interno.premiar_tema_terminado();

-- Para que la página diga «¡Terminaste el tema!» al momento: los premios por
-- tema de los últimos minutos de quien pregunta (sus propias filas; la RLS de
-- puntos_ajustes ya se las deja ver).
create or replace function public.mis_temas_terminados(p_desde timestamptz)
returns table (nombre text, cantidad integer, created_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select substr(pa.motivo, length('Terminaste el tema: ') + 1), pa.cantidad, pa.created_at
    from public.puntos_ajustes pa
   where pa.student_id = (select auth.uid())
     and pa.origen = 'tema'
     and pa.created_at >= greatest(p_desde, now() - interval '1 day')
   order by pa.created_at;
$$;
revoke execute on function public.mis_temas_terminados(timestamptz) from public, anon;
grant execute on function public.mis_temas_terminados(timestamptz) to authenticated;
