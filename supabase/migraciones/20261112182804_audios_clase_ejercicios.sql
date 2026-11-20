-- Audios de las clases (ADAES, alumnos ciegos): los ejercicios con las
-- posiciones que el profe dictó en cada clase, para contestarlos escribiendo
-- la jugada. Ver «Los ejercicios de las posiciones de la clase» en
-- docs/decisiones/accesibilidad.md.

-- Cada ejercicio: la posición (FEN), el enunciado y la jugada buena, ya
-- comprobada con chess.js y Stockfish (herramientas/audios-ejercicios-revisar.js).
-- Como la posición sale de lo que se dictó y Whisper confunde la notación,
-- llegan sin publicar (revisado = false): el profe los mira y los publica, y la
-- RLS se los esconde a los alumnos hasta entonces. La jugada buena y la
-- explicación NO se pueden leer desde afuera (permiso por columna): las da
-- responder_ejercicio() después de contestar, y al profe
-- ejercicios_para_revisar().
create table if not exists public.audios_clase_ejercicios (
  id          uuid     primary key default gen_random_uuid(),
  audio_id    uuid     not null references public.audios_clase (id) on delete cascade,
  n           smallint not null check (n between 1 and 30),
  seg         integer  check (seg between 0 and 86400),
  enunciado   text     not null check (char_length(btrim(enunciado)) between 1 and 300),
  fen         text     not null check (char_length(fen) between 15 and 100),
  buena       text     not null check (char_length(buena) between 2 and 10),
  explicacion text     check (char_length(explicacion) <= 800),
  revisado    boolean  not null default false,
  unique (audio_id, n)
);
alter table public.audios_clase_ejercicios enable row level security;
create policy audios_clase_ejercicios_select on public.audios_clase_ejercicios for select to authenticated
  using (exists (select 1 from public.audios_clase a
                  where a.id = audio_id and (revisado or interno.puedo_poner_audios(a.academia_id))));
create policy audios_clase_ejercicios_insert on public.audios_clase_ejercicios for insert to authenticated
  with check (exists (select 1 from public.audios_clase a where a.id = audio_id and interno.puedo_poner_audios(a.academia_id)));
create policy audios_clase_ejercicios_update on public.audios_clase_ejercicios for update to authenticated
  using (exists (select 1 from public.audios_clase a where a.id = audio_id and interno.puedo_poner_audios(a.academia_id)))
  with check (exists (select 1 from public.audios_clase a where a.id = audio_id and interno.puedo_poner_audios(a.academia_id)));
create policy audios_clase_ejercicios_delete on public.audios_clase_ejercicios for delete to authenticated
  using (exists (select 1 from public.audios_clase a where a.id = audio_id and interno.puedo_poner_audios(a.academia_id)));
revoke all on public.audios_clase_ejercicios from anon, authenticated;
grant select (id, audio_id, n, seg, enunciado, fen, revisado) on public.audios_clase_ejercicios to authenticated;
grant insert, delete on public.audios_clase_ejercicios to authenticated;
grant update (revisado) on public.audios_clase_ejercicios to authenticated;

-- El primer intento de cada persona en cada ejercicio. Solo lo escribe
-- responder_ejercicio(); cada uno lee los suyos.
create table if not exists public.audios_clase_ejercicio_intentos (
  persona_id   uuid        not null references public.profiles (id) on delete cascade,
  ejercicio_id uuid        not null references public.audios_clase_ejercicios (id) on delete cascade,
  jugada       text        not null check (char_length(jugada) between 1 and 12),
  acerto       boolean     not null,
  en           timestamptz not null default now(),
  primary key (persona_id, ejercicio_id)
);
alter table public.audios_clase_ejercicio_intentos enable row level security;
create policy audios_clase_ejercicio_intentos_select on public.audios_clase_ejercicio_intentos for select to authenticated
  using (persona_id = (select auth.uid()));
revoke all on public.audios_clase_ejercicio_intentos from anon, authenticated;
grant select on public.audios_clase_ejercicio_intentos to authenticated;

-- Contestar un ejercicio con una jugada (en SAN, como la deja chess.js en la
-- página). Se comparan sin «+», «#», «!» ni «?». Paga 2 Puntos Ajedrez a un
-- alumno que acierta EN SU PRIMER intento (si pagara cualquier acierto,
-- bastaría fallar para ver la buena y cobrarla); la referencia
-- ejercicio:<id> impide cobrar dos veces. Solo un ejercicio publicado, de una
-- clase de una academia propia.
create or replace function public.responder_ejercicio(p_id uuid, p_jugada text)
returns table (acerto boolean, buena text, explicacion text, puntos integer, primera boolean)
language plpgsql security definer
set search_path = public
set row_security = off
as $$
declare
  v_yo uuid := auth.uid();
  v_e public.audios_clase_ejercicios;
  v_academia uuid;
  v_fecha date;
  v_acerto boolean;
  v_n integer;
  v_puntos integer := 0;
begin
  select * into v_e from public.audios_clase_ejercicios e where e.id = p_id;
  select a.academia_id, a.fecha into v_academia, v_fecha from public.audios_clase a where a.id = v_e.audio_id;
  if not coalesce(v_yo is not null and v_academia is not null and v_e.revisado
                  and v_academia in (select interno.academias_de(v_yo)), false) then
    raise exception 'No puedes contestar este ejercicio.' using errcode = '42501';
  end if;
  if p_jugada is null or char_length(btrim(p_jugada)) not between 1 and 12 then
    raise exception 'Esa jugada no se entiende.' using errcode = '22023';
  end if;
  v_acerto := regexp_replace(btrim(p_jugada), '[+#!?]', '', 'g') = regexp_replace(v_e.buena, '[+#!?]', '', 'g');
  insert into public.audios_clase_ejercicio_intentos (persona_id, ejercicio_id, jugada, acerto)
  values (v_yo, p_id, btrim(p_jugada), v_acerto)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n > 0 and v_acerto
     and exists (select 1 from public.profiles p where p.id = v_yo and p.role = 'alumno') then
    v_puntos := interno.otorgar_puntos(v_yo, 2, 'entrenamiento',
      'Ejercicio de la clase del ' || to_char(v_fecha, 'DD/MM/YYYY'), 'ejercicio:' || p_id, null);
  end if;
  return query select v_acerto, v_e.buena, v_e.explicacion, v_puntos, v_n > 0;
end;
$$;
revoke execute on function public.responder_ejercicio(uuid, text) from public, anon;
grant execute on function public.responder_ejercicio(uuid, text) to authenticated;

-- Para que el profe revise un ejercicio antes de publicarlo: la jugada buena y
-- la explicación, solo a quien puede poner audios en esa academia.
create or replace function public.ejercicios_para_revisar(p_audio uuid)
returns table (id uuid, buena text, explicacion text)
language sql stable security definer
set search_path = public
set row_security = off
as $$
  select e.id, e.buena, e.explicacion
    from public.audios_clase_ejercicios e
    join public.audios_clase a on a.id = e.audio_id
   where e.audio_id = p_audio and interno.puedo_poner_audios(a.academia_id)
   order by e.n;
$$;
revoke execute on function public.ejercicios_para_revisar(uuid) from public, anon;
grant execute on function public.ejercicios_para_revisar(uuid) to authenticated;
