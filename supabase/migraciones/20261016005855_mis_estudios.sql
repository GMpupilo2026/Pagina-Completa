-- «Mis estudios»: los estudios de cada alumno, al estilo de los de Lichess.
--
-- Un estudio es un cuaderno de análisis: varios capítulos, y cada capítulo es
-- una partida o una posición con su árbol de jugadas (variantes,
-- comentarios, !? y flechas), guardado en PGN. Ahí el alumno arma y estudia
-- sus aperturas, busca mejoras con el motor y analiza sus partidas.
--
-- - Los capítulos van en la misma fila (jsonb): el estudio se abre y se guarda
--   de una vez, y un capítulo no existe fuera de su estudio. La base no sabe
--   ajedrez: exige la forma (cuántos, de qué tamaño); la legalidad la
--   comprueba la página con chess.js al leer el PGN.
-- - Lo escribe, lo cambia y lo borra solo su dueño. Lo ven sus profesores,
--   quien lo supervisa y administración SOLO si lo marca como compartido,
--   como el cuaderno.
-- Ver «Mis estudios» en docs/decisiones/entrenamiento.md.
create table public.estudios (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  titulo text not null check (char_length(btrim(titulo)) between 1 and 100),
  descripcion text check (descripcion is null or char_length(descripcion) <= 1000),
  -- [{ "titulo": "…", "orientacion": "w"|"b", "pgn": "…" }, …]
  capitulos jsonb not null default '[]'::jsonb
    check (jsonb_typeof(capitulos) = 'array' and jsonb_array_length(capitulos) <= 64
           and octet_length(capitulos::text) <= 600000),
  n_capitulos int generated always as (jsonb_array_length(capitulos)) stored,
  compartido boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index estudios_alumno_fecha on public.estudios (alumno_id, updated_at desc);

alter table public.estudios enable row level security;

create policy estudios_select_propio on public.estudios for select to authenticated
  using (alumno_id = (select auth.uid()));
create policy estudios_select_profesor on public.estudios for select to authenticated
  using (compartido and (
    (select mp.is_admin from public.my_profile() mp(role, is_admin, teacher_id))
    or alumno_id in (select interno.alumnos_de((select auth.uid())))));
create policy estudios_select_supervisor on public.estudios for select to authenticated
  using (compartido and (select public.soy_supervisor())
         and alumno_id in (select interno.supervisados_por_mi()));
create policy estudios_insert_propio on public.estudios for insert to authenticated
  with check (alumno_id = (select auth.uid()));
create policy estudios_update_propio on public.estudios for update to authenticated
  using (alumno_id = (select auth.uid())) with check (alumno_id = (select auth.uid()));
create policy estudios_delete_propio on public.estudios for delete to authenticated
  using (alumno_id = (select auth.uid()));
-- Como el resto de lo que escribe un alumno: con el acceso vencido, no escribe.
create policy estudios_exige_acceso_ins on public.estudios as restrictive for insert to authenticated
  with check ((select public.acceso_vigente()));
create policy estudios_exige_acceso_upd on public.estudios as restrictive for update to authenticated
  using ((select public.acceso_vigente())) with check ((select public.acceso_vigente()));

-- Cada capítulo con su forma: un objeto con título, orientación y PGN.
create or replace function interno.estudio_al_guardar()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  c jsonb;
begin
  new.titulo := btrim(new.titulo);
  if tg_op = 'INSERT' then
    new.created_at := now();
    if (select count(*) from public.estudios e where e.alumno_id = new.alumno_id) >= 100 then
      raise exception 'Ya tienes 100 estudios. Borra alguno para crear otro.' using errcode = 'check_violation';
    end if;
  else
    new.alumno_id := old.alumno_id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  for c in select * from jsonb_array_elements(new.capitulos) loop
    if jsonb_typeof(c) <> 'object'
       or jsonb_typeof(c->'titulo') is distinct from 'string' or char_length(c->>'titulo') not between 1 and 100
       or (c->>'orientacion') is distinct from 'w' and (c->>'orientacion') is distinct from 'b'
       or jsonb_typeof(c->'pgn') is distinct from 'string' or char_length(c->>'pgn') > 100000 then
      raise exception 'Un capítulo del estudio no tiene la forma que se espera (título, orientación y PGN).' using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end $$;
revoke execute on function interno.estudio_al_guardar() from public, anon, authenticated;
create trigger estudio_al_guardar before insert or update on public.estudios
  for each row execute function interno.estudio_al_guardar();

revoke all on public.estudios from anon;
grant select, insert, update, delete on public.estudios to authenticated;
