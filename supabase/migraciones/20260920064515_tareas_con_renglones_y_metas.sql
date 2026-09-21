-- Tareas con varios renglones, cada uno con su META, y el avance
-- CALCULADO a partir de lo que el alumno ya hace en la plataforma.
--
-- Hasta acá una tarea era UN material ("el curso tal") y el alumno decía a
-- mano cuándo la había hecho. Ahora una tarea es un encabezado (a quién, con
-- qué fecha) y N renglones: "10 ejercicios de ataque doble", "20 de 4x4",
-- "10 minutos de coordenadas".
--
-- Lo que se GUARDA es lo que pasó —las filas de training_progress y de
-- platform_activity_log que el alumno ya venía dejando al entrenar—; cuánto
-- lleva de cada renglón se CALCULA. Misma decisión que cobros.estado, que no
-- guarda "pagado": un contador aparte habría que mantenerlo al día con un
-- trigger por cada ejercicio resuelto y podría contradecir a las filas que lo
-- respaldan.
--
-- De regalo, eso es lo que hace que la tarea "se rellene sola": el alumno
-- entra por el enlace del renglón, la página de entreno salta los ejercicios
-- que ya resolvió (firstUnsolvedIndex) y cada uno que resuelve cuenta para la
-- tarea Y queda marcado para no repetirse.

create table if not exists public.tarea_items (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references public.tareas(id) on delete cascade,
  orden integer not null default 0,

  -- La FOTO del material, igual que en tareas: si mañana se renombra un curso
  -- o se reordena el catálogo, el renglón sigue diciendo con qué se mandó.
  -- material_href ya trae el enlace directo al recorte
  -- (entreno/temas.html?tema=ataque-doble), que es lo que evita que el alumno
  -- tenga que buscarlo por la plataforma.
  material_tipo  text not null check (material_tipo in ('curso','herramienta')),
  material_slug  text not null,
  material_label text not null,
  material_href  text not null,

  -- El recorte DENTRO de la herramienta: el tema de Ejercicios por tema, la
  -- categoría de Mates. NULL es "toda la herramienta".
  filtro_clave text,
  filtro_label text,
  leccion integer,

  -- Qué se cuenta. Es un arreglo y no un texto porque una sola herramienta
  -- puede apuntar con dos actividades distintas: un tema del grupo de táctica
  -- se registra como 'tactica' y el resto como 'temas' (ver temasDeTactica()
  -- en entreno/temas.html). Deducirlo del slug dejaría esos diez ejercicios
  -- contando contra cero sin que nada fallara.
  actividades text[],

  meta_tipo text not null check (meta_tipo in ('cantidad','minutos','completar')),
  meta_cantidad integer check (meta_cantidad is null or (meta_cantidad > 0 and meta_cantidad <= 1000)),

  -- Lo ÚNICO que el alumno escribe, y solo en los renglones que no se pueden
  -- medir solos (un curso, una lección, una ficha de estudio).
  completada_at timestamptz,

  created_at timestamptz not null default now(),

  constraint tarea_items_meta_coherente check (
    (meta_tipo = 'completar' and meta_cantidad is null)
    or (meta_tipo in ('cantidad','minutos') and meta_cantidad is not null)
  ),
  -- Un renglón que se mide necesita saber QUÉ mirar.
  constraint tarea_items_medible_tiene_actividad check (
    meta_tipo = 'completar' or (actividades is not null and array_length(actividades,1) > 0)
  )
);

create index if not exists tarea_items_tarea_idx on public.tarea_items (tarea_id, orden);

alter table public.tarea_items enable row level security;

-- Mismo reparto que `tareas`: la ve quien ve la tarea padre, y la escribe el
-- profesor que la mandó. El alumno entra por el update, pero el trigger de
-- abajo lo deja tocar solo completada_at.
drop policy if exists tarea_items_select on public.tarea_items;
create policy tarea_items_select on public.tarea_items for select
  using (exists (select 1 from public.tareas t where t.id = tarea_id));

drop policy if exists tarea_items_insert on public.tarea_items;
create policy tarea_items_insert on public.tarea_items for insert
  with check (exists (
    select 1 from public.tareas t
    where t.id = tarea_id
      and (t.profesor_id = auth.uid()
           or (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id)))
  ));

drop policy if exists tarea_items_update on public.tarea_items;
create policy tarea_items_update on public.tarea_items for update
  using (exists (
    select 1 from public.tareas t
    where t.id = tarea_id
      and (t.profesor_id = auth.uid() or t.alumno_id = auth.uid()
           or (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id)))
  ))
  with check (exists (
    select 1 from public.tareas t
    where t.id = tarea_id
      and (t.profesor_id = auth.uid() or t.alumno_id = auth.uid()
           or (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id)))
  ));

drop policy if exists tarea_items_delete on public.tarea_items;
create policy tarea_items_delete on public.tarea_items for delete
  using (exists (
    select 1 from public.tareas t
    where t.id = tarea_id
      and (t.profesor_id = auth.uid()
           or (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id)))
  ));

-- El alumno solo marca, no reescribe. Mismo patrón que
-- proteger_tareas_alumno() y protect_answer_grading(): si quien edita es el
-- alumno se revierte todo a su valor de antes y solo se deja mover
-- completada_at. Sin esto, podría bajarse la meta de 25 mates a 1 desde la
-- consola del navegador y la tarea saldría cumplida sin que nada fallara.
create or replace function public.proteger_tarea_items_alumno()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  es_alumno boolean;
  marca timestamptz := new.completada_at;   -- lo único que puede mover
begin
  select (t.alumno_id = auth.uid() and t.profesor_id is distinct from auth.uid())
    into es_alumno
    from public.tareas t where t.id = old.tarea_id;

  if coalesce(es_alumno, false) then
    -- new := old y después SOLO completada_at, igual que
    -- proteger_tiempos_de_presencia(): así una columna que se agregue mañana
    -- queda protegida sola, sin tener que acordarse de nombrarla acá.
    new := old;
    -- Y solo en los renglones que no se miden solos: donde el avance lo
    -- cuenta la plataforma, marcarlo a mano no significa nada.
    if old.meta_tipo = 'completar' then
      -- La hora la pone el servidor, nunca la que mande el navegador.
      new.completada_at := case when marca is null then null
                                else coalesce(old.completada_at, now()) end;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_tarea_items_alumno on public.tarea_items;
create trigger proteger_tarea_items_alumno
  before update on public.tarea_items
  for each row execute function public.proteger_tarea_items_alumno();