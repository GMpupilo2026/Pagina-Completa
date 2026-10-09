-- La pizarra y las notas del profe en la presentación de la clase
-- (js/clase-pizarra.js y js/clase-presentacion.js). Ver «La pizarra de la
-- presentación» y «Las notas del profe en cada diapositiva» en
-- docs/decisiones/clase-en-vivo.md.

-- La pizarra: las marcas del profe sobre la diapositiva van en la misma
-- columna, game_state.presentacion.trazos. Quién la cambia ya lo decide
-- protect_game_state_teacher_columns (al alumno se le devuelve la de antes);
-- esto solo le pone tope: la fila de game_state viaja entera por Realtime con
-- cada jugada, y unas marcas sin fin la harían pesada para toda la clase. El
-- navegador corta en 30 000 (js/clase-pizarra.js); acá, el doble de margen.
alter table public.game_state drop constraint if exists game_state_presentacion_tamano;
alter table public.game_state add constraint game_state_presentacion_tamano
  check (presentacion is null or length(presentacion::text) <= 60000);

-- Las notas del profe en cada diapositiva: recordatorios que SOLO ve quien las
-- escribe. Valen para las presentaciones del curso ("curso/clase-NN") y para
-- las suyas ("subida/<id>"), con la misma forma de deck que el CHECK de
-- game_state. No se leen desde ningún otro lado: ni el alumno, ni el proyector,
-- ni quien administra (son apuntes personales, no un dato del alumno).
create table if not exists public.presentacion_notas (
  profesor_id uuid        not null default auth.uid() references public.profiles (id) on delete cascade,
  deck        text        not null check (deck ~ '^[a-z0-9-]{1,60}/[a-z0-9-]{1,40}$'),
  n           integer     not null check (n between 1 and 500),
  texto       text        not null check (char_length(btrim(texto)) between 1 and 2000),
  updated_at  timestamptz not null default now(),
  primary key (profesor_id, deck, n)
);
alter table public.presentacion_notas enable row level security;

create policy presentacion_notas_select on public.presentacion_notas for select to authenticated
  using (profesor_id = (select auth.uid()));
create policy presentacion_notas_insert on public.presentacion_notas for insert to authenticated
  with check (profesor_id = (select auth.uid()));
create policy presentacion_notas_update on public.presentacion_notas for update to authenticated
  using (profesor_id = (select auth.uid())) with check (profesor_id = (select auth.uid()));
create policy presentacion_notas_delete on public.presentacion_notas for delete to authenticated
  using (profesor_id = (select auth.uid()));

revoke all on public.presentacion_notas from anon;
