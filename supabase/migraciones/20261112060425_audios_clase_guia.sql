-- Audios de las clases: la guía de estudio de cada clase (ADAES, alumnos ciegos).
-- Cada frase con su minuto, el resumen y el índice por temas, las partidas que
-- se dictaron (los alumnos las ven solo cuando el profe las revisa), preguntas
-- de repaso que pagan Puntos Ajedrez una vez y las marcas propias de cada alumno.
-- Ver «La guía de estudio de cada clase» en docs/decisiones/accesibilidad.md.

-- Las frases con su segundo ([[segundo, "texto"], …]), el resumen y los temas
-- ([{"seg": 720, "titulo": "…"}, …]). Las escribe quien puede poner audios con
-- la política de update que ya tiene la tabla.
alter table public.audios_clase
  add column if not exists segmentos jsonb
    check (segmentos is null or (jsonb_typeof(segmentos) = 'array' and pg_column_size(segmentos) <= 2000000)),
  add column if not exists resumen text check (char_length(resumen) <= 3000),
  add column if not exists indice jsonb
    check (indice is null or (jsonb_typeof(indice) = 'array' and jsonb_array_length(indice) <= 40));

-- Las partidas que se dictaron en la clase. Las jugadas llegan ya comprobadas
-- con chess.js desde la posición inicial; igual las ve el profe antes que nadie:
-- Whisper confunde la notación dicha y ninguna partida se publica sin revisar.
create table if not exists public.audios_clase_partidas (
  id        uuid     primary key default gen_random_uuid(),
  audio_id  uuid     not null references public.audios_clase (id) on delete cascade,
  orden     smallint not null check (orden between 1 and 50),
  seg       integer  check (seg between 0 and 86400),
  titulo    text     not null check (char_length(btrim(titulo)) between 1 and 120),
  jugadas   text     not null check (char_length(jugadas) between 1 and 4000),
  revisada  boolean  not null default false,
  unique (audio_id, orden)
);
alter table public.audios_clase_partidas enable row level security;
-- La subconsulta sobre audios_clase pasa por la RLS de esa tabla: solo se ve
-- la partida de una clase que uno puede ver, y sin revisar solo quien sube.
create policy audios_clase_partidas_select on public.audios_clase_partidas for select to authenticated
  using (exists (select 1 from public.audios_clase a
                  where a.id = audio_id and (revisada or interno.puedo_poner_audios(a.academia_id))));
create policy audios_clase_partidas_insert on public.audios_clase_partidas for insert to authenticated
  with check (exists (select 1 from public.audios_clase a where a.id = audio_id and interno.puedo_poner_audios(a.academia_id)));
create policy audios_clase_partidas_update on public.audios_clase_partidas for update to authenticated
  using (exists (select 1 from public.audios_clase a where a.id = audio_id and interno.puedo_poner_audios(a.academia_id)))
  with check (exists (select 1 from public.audios_clase a where a.id = audio_id and interno.puedo_poner_audios(a.academia_id)));
create policy audios_clase_partidas_delete on public.audios_clase_partidas for delete to authenticated
  using (exists (select 1 from public.audios_clase a where a.id = audio_id and interno.puedo_poner_audios(a.academia_id)));
grant select, insert, update, delete on public.audios_clase_partidas to authenticated;
revoke all on public.audios_clase_partidas from anon;

-- Las preguntas de repaso. La respuesta buena (correcta) y la explicación NO se
-- pueden leer desde afuera: el permiso de lectura es por columna. Las devuelve
-- responder_repaso() después de contestar.
create table if not exists public.audios_clase_preguntas (
  audio_id    uuid     not null references public.audios_clase (id) on delete cascade,
  n           smallint not null check (n between 1 and 10),
  pregunta    text     not null check (char_length(btrim(pregunta)) between 1 and 400),
  opciones    text[]   not null check (array_length(opciones, 1) between 2 and 5),
  correcta    smallint not null,
  explicacion text     check (char_length(explicacion) <= 800),
  primary key (audio_id, n),
  check (correcta between 1 and array_length(opciones, 1))
);
alter table public.audios_clase_preguntas enable row level security;
create policy audios_clase_preguntas_select on public.audios_clase_preguntas for select to authenticated
  using (exists (select 1 from public.audios_clase a where a.id = audio_id));
create policy audios_clase_preguntas_insert on public.audios_clase_preguntas for insert to authenticated
  with check (exists (select 1 from public.audios_clase a where a.id = audio_id and interno.puedo_poner_audios(a.academia_id)));
create policy audios_clase_preguntas_delete on public.audios_clase_preguntas for delete to authenticated
  using (exists (select 1 from public.audios_clase a where a.id = audio_id and interno.puedo_poner_audios(a.academia_id)));
revoke all on public.audios_clase_preguntas from anon, authenticated;
grant select (audio_id, n, pregunta, opciones) on public.audios_clase_preguntas to authenticated;
grant insert, delete on public.audios_clase_preguntas to authenticated;

-- La primera respuesta de cada persona a cada pregunta. Solo la escribe
-- responder_repaso(); cada uno lee las suyas (para saber cuáles ya contestó).
create table if not exists public.audios_clase_repasos (
  persona_id uuid        not null references public.profiles (id) on delete cascade,
  audio_id   uuid        not null references public.audios_clase (id) on delete cascade,
  n          smallint    not null,
  opcion     smallint    not null,
  acerto     boolean     not null,
  en         timestamptz not null default now(),
  primary key (persona_id, audio_id, n)
);
alter table public.audios_clase_repasos enable row level security;
create policy audios_clase_repasos_select on public.audios_clase_repasos for select to authenticated
  using (persona_id = (select auth.uid()));
revoke all on public.audios_clase_repasos from anon, authenticated;
grant select on public.audios_clase_repasos to authenticated;

-- Contestar una pregunta: dice si acertó, cuál era la buena y por qué. Paga
-- 2 Puntos Ajedrez a un alumno que acierta EN SU PRIMERA respuesta: si pagara
-- cualquier acierto, bastaría fallar a propósito para ver la buena y cobrarla.
-- La referencia repaso:<audio>:<n> además impide cobrar dos veces.
create or replace function public.responder_repaso(p_audio uuid, p_n integer, p_opcion integer)
returns table (acerto boolean, correcta integer, explicacion text, puntos integer, primera boolean)
language plpgsql security definer
set search_path = public
set row_security = off
as $$
declare
  v_yo uuid := auth.uid();
  v_academia uuid;
  v_fecha date;
  v_q public.audios_clase_preguntas;
  v_nueva boolean := false;
  v_puntos integer := 0;
begin
  select a.academia_id, a.fecha into v_academia, v_fecha from public.audios_clase a where a.id = p_audio;
  if not coalesce(v_yo is not null and v_academia is not null
                  and (v_academia in (select interno.academias_de(v_yo)) or public.soy_admin()), false) then
    raise exception 'No puedes contestar esta pregunta.' using errcode = '42501';
  end if;
  select * into v_q from public.audios_clase_preguntas q where q.audio_id = p_audio and q.n = p_n;
  if not found then
    raise exception 'Esa pregunta no existe.' using errcode = 'P0002';
  end if;
  if p_opcion is null or p_opcion < 1 or p_opcion > array_length(v_q.opciones, 1) then
    raise exception 'Esa opción no existe.' using errcode = '22023';
  end if;
  insert into public.audios_clase_repasos (persona_id, audio_id, n, opcion, acerto)
  values (v_yo, p_audio, p_n, p_opcion, p_opcion = v_q.correcta)
  on conflict do nothing;
  get diagnostics v_puntos = row_count;
  v_nueva := v_puntos > 0;
  v_puntos := 0;
  if v_nueva and p_opcion = v_q.correcta
     and exists (select 1 from public.profiles p where p.id = v_yo and p.role = 'alumno') then
    v_puntos := interno.otorgar_puntos(v_yo, 2, 'entrenamiento',
      'Repaso de la clase del ' || to_char(v_fecha, 'DD/MM/YYYY'),
      'repaso:' || p_audio || ':' || p_n, null);
  end if;
  return query select p_opcion = v_q.correcta, v_q.correcta::integer, v_q.explicacion, v_puntos, v_nueva;
end;
$$;
revoke execute on function public.responder_repaso(uuid, integer, integer) from public, anon;
grant execute on function public.responder_repaso(uuid, integer, integer) to authenticated;

-- Las marcas propias: «volver a este minuto», con una nota corta. Cada quien ve
-- y toca solo las suyas, y solo en una clase que puede ver.
create table if not exists public.audios_clase_marcas (
  id         uuid        primary key default gen_random_uuid(),
  persona_id uuid        not null default auth.uid() references public.profiles (id) on delete cascade,
  audio_id   uuid        not null references public.audios_clase (id) on delete cascade,
  seg        integer     not null check (seg between 0 and 86400),
  nota       text        check (char_length(nota) <= 300),
  creada_en  timestamptz not null default now()
);
create index if not exists audios_clase_marcas_persona on public.audios_clase_marcas (persona_id, audio_id, seg);
alter table public.audios_clase_marcas enable row level security;
create policy audios_clase_marcas_select on public.audios_clase_marcas for select to authenticated
  using (persona_id = (select auth.uid()));
create policy audios_clase_marcas_insert on public.audios_clase_marcas for insert to authenticated
  with check (persona_id = (select auth.uid())
              and exists (select 1 from public.audios_clase a where a.id = audio_id));
create policy audios_clase_marcas_update on public.audios_clase_marcas for update to authenticated
  using (persona_id = (select auth.uid()))
  with check (persona_id = (select auth.uid()));
create policy audios_clase_marcas_delete on public.audios_clase_marcas for delete to authenticated
  using (persona_id = (select auth.uid()));
grant select, insert, update, delete on public.audios_clase_marcas to authenticated;
revoke all on public.audios_clase_marcas from anon;
