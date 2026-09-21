-- ===================================================================
-- Exámenes: el alumno EJECUTA y demuestra, no practica.
--
-- Diferencia de fondo con `tareas`, y es la que decide todo el diseño:
-- una tarea se va llenando con lo que el alumno entrena y el avance se
-- CALCULA de lo que ya hacía. Un examen es un acto puntual con reloj,
-- una sola oportunidad por pregunta y una nota. Así que acá sí se
-- guarda lo que pasó pregunta por pregunta — es el registro del examen,
-- no un contador que pueda contradecir a nada.
--
-- Las tres cosas que esto tiene que garantizar, y que ninguna página
-- puede garantizar por su cuenta:
--
--  1. El alumno NO puede ver la respuesta correcta. Por eso la clave
--     vive en `examen_items.clave`, que él no puede leer: no tiene
--     política de select sobre esa tabla, y lo que ve se lo sirve
--     examen_para_alumno(), que devuelve el enunciado y las opciones
--     ya barajadas y nunca la clave.
--  2. Una sola oportunidad. `examen_respuestas` tiene la clave única
--     por ítem y NINGUNA política de update: una respuesta enviada no
--     se toca, ni desde el navegador ni por error.
--  3. El reloj es del SERVIDOR. `termina_at` lo fija iniciar_examen()
--     con now(), y responder_examen() rechaza lo que llegue después.
--     Un reloj del navegador se adelanta desde la consola.
-- ===================================================================

create table if not exists public.examenes (
  id uuid primary key default gen_random_uuid(),
  profesor_id uuid not null references public.profiles(id) on delete cascade,
  alumno_id   uuid not null references public.profiles(id) on delete cascade,

  titulo text not null,
  instrucciones text not null default '',

  -- Cuánto tiene para hacerlo, en minutos. El tope de abajo lo pone
  -- crear_examen(): nunca menos de un minuto por pregunta.
  minutos integer not null check (minutos > 0 and minutos <= 600),

  -- La ventana en la que se puede rendir. `vence_at` no lo cierra
  -- solo: lo mira la página y lo hace cumplir iniciar_examen().
  vence_at timestamptz not null,

  -- 'asignado'  — todavía no lo abrió
  -- 'en_curso'  — lo está haciendo, con su reloj corriendo
  -- 'entregado' — terminado y calificado
  -- 'congelado' — se salió tres veces; lo reabre el profesor
  estado text not null default 'asignado'
    check (estado in ('asignado','en_curso','entregado','congelado')),

  iniciado_at  timestamptz,
  termina_at   timestamptz,   -- lo fija el servidor al iniciar
  entregado_at timestamptz,

  -- Por qué se cerró: lo entregó, se le acabó el tiempo, o se congeló
  -- por salirse. Va en el informe: no es lo mismo no contestar diez
  -- preguntas que no llegar a verlas.
  motivo_cierre text check (motivo_cierre in ('entregado','tiempo','congelado')),

  -- Antitrampa. El conteo lo lleva el SERVIDOR (registrar_salida_examen),
  -- nunca el navegador: un contador del cliente se pone en cero desde la
  -- consola.
  salidas integer not null default 0,
  segundos_fuera integer not null default 0,

  -- La nota, calculada al cerrar. Se guarda porque es el acta del
  -- examen: recalcularla mañana con un banco que cambió daría otra.
  puntos integer,
  puntos_posibles integer,
  nota numeric(4,2),            -- 0 a 10
  porcentaje numeric(5,2),      -- puntos sobre posibles
  respondidas integer,
  total_items integer,

  informe_enviado_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists examenes_alumno_idx  on public.examenes (alumno_id, vence_at desc);
create index if not exists examenes_profesor_idx on public.examenes (profesor_id, created_at desc);

-- Las preguntas de ESTE examen, copiadas del banco al crearlo.
-- Copiarlas —en vez de guardar solo el id y leer el banco al rendir—
-- hace dos cosas: el examen sigue diciendo qué se preguntó aunque el
-- banco cambie, y el ejecutor NO necesita cargar el banco, así que el
-- alumno no se baja las 301 respuestas junto con su examen.
create table if not exists public.examen_items (
  id uuid primary key default gen_random_uuid(),
  examen_id uuid not null references public.examenes(id) on delete cascade,
  orden integer not null,

  tipo text not null check (tipo in ('opcion','opcion_tablero','jugada','casilla','linea')),
  banco text not null,          -- 'diagnostico' | 'arbitraje' | 'aperturas'
  item_id text not null,        -- su id en el banco, para poder rastrearlo
  area text,                    -- para el informe por áreas
  peso integer not null check (peso between 1 and 5),   -- la dificultad = los puntos

  -- Lo que el alumno VE: enunciado, opciones ya barajadas, fen, color.
  -- Nada de esto delata la respuesta.
  visible jsonb not null,

  -- Lo que el alumno NO ve. Esta columna es la razón de que
  -- examen_items no tenga política de select para él.
  clave jsonb not null,

  created_at timestamptz not null default now(),
  unique (examen_id, orden)
);

create index if not exists examen_items_examen_idx on public.examen_items (examen_id, orden);

-- Una fila por respuesta. La clave única es lo que hace cumplir "una
-- sola oportunidad": no es un `if` de la página, es la tabla.
create table if not exists public.examen_respuestas (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.examen_items(id) on delete cascade,
  examen_id uuid not null references public.examenes(id) on delete cascade,
  respuesta jsonb not null,
  correcta boolean not null,
  puntos integer not null default 0,
  segundos integer,
  created_at timestamptz not null default now(),
  unique (item_id)
);

create index if not exists examen_respuestas_examen_idx on public.examen_respuestas (examen_id);

alter table public.examenes         enable row level security;
alter table public.examen_items     enable row level security;
alter table public.examen_respuestas enable row level security;

-- ---------------- RLS ----------------
-- Mismo aislamiento por profesor que `tareas` y `class_sessions`: un
-- profesor ve los exámenes que ÉL puso, no los de un colega que
-- comparte el mismo alumno.
drop policy if exists examenes_select on public.examenes;
create policy examenes_select on public.examenes for select
  using ((select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id))
         or profesor_id = auth.uid() or alumno_id = auth.uid());

drop policy if exists examenes_insert on public.examenes;
create policy examenes_insert on public.examenes for insert
  with check (profesor_id = auth.uid()
    and ((select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id))
         or ((select mp.role from public.my_profile() mp(role, is_admin, teacher_id)) = 'profesor'
             and public.soy_profesor_de(alumno_id))));

-- El alumno NO puede escribir en `examenes`: ni empezar, ni entregar,
-- ni bajarse el contador de salidas. Todo eso pasa por funciones
-- SECURITY DEFINER que validan y usan el reloj del servidor. Solo el
-- profesor edita (reabrir un examen congelado, corregir el título).
drop policy if exists examenes_update on public.examenes;
create policy examenes_update on public.examenes for update
  using ((select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id))
         or profesor_id = auth.uid())
  with check ((select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id))
         or profesor_id = auth.uid());

drop policy if exists examenes_delete on public.examenes;
create policy examenes_delete on public.examenes for delete
  using ((select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id))
         or profesor_id = auth.uid());

-- LA política que sostiene todo esto: el alumno no lee los ítems.
-- Ni siquiera los suyos — porque la fila trae la clave al lado. Lo que
-- él ve se lo sirve examen_para_alumno(), que elige columna por columna.
drop policy if exists examen_items_select on public.examen_items;
create policy examen_items_select on public.examen_items for select
  using (exists (select 1 from public.examenes e
                 where e.id = examen_id
                   and (e.profesor_id = auth.uid()
                        or (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id)))));

drop policy if exists examen_items_insert on public.examen_items;
create policy examen_items_insert on public.examen_items for insert
  with check (exists (select 1 from public.examenes e
                      where e.id = examen_id
                        and (e.profesor_id = auth.uid()
                             or (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id)))));

drop policy if exists examen_items_delete on public.examen_items;
create policy examen_items_delete on public.examen_items for delete
  using (exists (select 1 from public.examenes e
                 where e.id = examen_id
                   and (e.profesor_id = auth.uid()
                        or (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id)))));

-- Las respuestas: el profesor las lee para el informe; el alumno lee
-- las suyas solo para saber cuáles ya contestó (el ejecutor necesita
-- saber por dónde iba si se recarga la página). `correcta` y `puntos`
-- viajan ahí, así que el ejecutor NO las pinta hasta entregar — y aun
-- si las mirara, sabría si acertó DESPUÉS de haber contestado, que es
-- lo mismo que le dirá el informe.
drop policy if exists examen_respuestas_select on public.examen_respuestas;
create policy examen_respuestas_select on public.examen_respuestas for select
  using (exists (select 1 from public.examenes e
                 where e.id = examen_id
                   and (e.profesor_id = auth.uid() or e.alumno_id = auth.uid()
                        or (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id)))));

-- Nadie inserta ni actualiza respuestas a mano: solo responder_examen(),
-- que califica con la clave y mira el reloj del servidor. Sin política
-- de insert ni de update, un alumno no puede escribirse un "correcta:
-- true" ni cambiar lo que ya contestó.