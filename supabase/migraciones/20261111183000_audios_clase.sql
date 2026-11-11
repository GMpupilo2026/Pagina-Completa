-- Los audios de las clases: el MP3 de cada clase que ya se dio, para volver a
-- escucharla. Lo pidió el dueño para el grupo de ADAES (alumnos ciegos): las
-- clases se graban en Meet, el audio se saca en la computadora y se sube acá,
-- y cada alumno lo oye desde su panel (audios-clases.html), ordenado por fecha,
-- con un reproductor que el lector de pantalla maneja con el teclado y la
-- transcripción en texto al lado.
--
-- Un audio es de una ACADEMIA y de un día, no de una fila del horario: son
-- clases pasadas que no estaban en el horario (ADAES no tenía ninguno), y la
-- fecha sale del nombre del archivo de la grabación. Por eso no se reusa
-- grabaciones_clase (horario_id, fecha, youtube_id).
--
-- Quién lo oye: la gente de esa academia (interno.academias_de: miembros y su
-- supervisor) y quien administra. Las academias son privadas: nada de esto le
-- llega a otra. Quién lo sube, cambia o quita: quien administra, el supervisor
-- de la academia o un profesor que sea miembro de ella
-- (interno.puedo_poner_audios). La regla es UNA y la usan la tabla y el bucket.
--
-- El archivo va en el bucket PRIVADO audios-clase, en <academia>/<nombre>.mp3:
-- la primera carpeta es la academia, y con eso la política del bucket pregunta
-- lo mismo que la de la tabla. El navegador lo pide con un enlace firmado.
--
-- No reparte permisos, accesos ni dinero: no lleva bitácora. La página de
-- privacidad ya dice que las clases se graban; los audios son de esas clases.
--
-- Ver «Los audios de las clases» en docs/decisiones/accesibilidad.md.

create or replace function interno.puedo_poner_audios(p_academia uuid)
returns boolean
language sql stable security definer
set search_path = public
set row_security = off
as $$
  select coalesce(
    (select coalesce(x.is_admin, false) from public.profiles x where x.id = auth.uid())
    or exists (select 1 from public.academias a where a.id = p_academia and a.supervisor_id = auth.uid())
    or exists (select 1 from public.academia_miembros m join public.profiles p on p.id = m.persona_id
                where m.academia_id = p_academia and m.persona_id = auth.uid() and p.role = 'profesor'),
    false);
$$;
revoke execute on function interno.puedo_poner_audios(uuid) from public, anon;
grant execute on function interno.puedo_poner_audios(uuid) to authenticated, service_role;

create table if not exists public.audios_clase (
  id            uuid        primary key default gen_random_uuid(),
  academia_id   uuid        not null references public.academias (id) on delete cascade,
  fecha         date        not null,
  hora          time,
  titulo        text        not null check (char_length(btrim(titulo)) between 1 and 120),
  archivo       text        not null unique
                            check (archivo ~ '^[0-9a-f-]{36}/[A-Za-z0-9_.-]{1,120}\.mp3$'
                                   and split_part(archivo, '/', 1) = academia_id::text),
  duracion_seg  integer     check (duracion_seg between 1 and 86400),
  bytes         bigint      check (bytes between 1 and 52428800),
  transcripcion text        check (char_length(transcripcion) <= 300000),
  -- La lista no se baja las transcripciones (unos 35 KB por clase): pide esta
  -- columna y trae el texto solo cuando alguien lo abre.
  con_transcripcion boolean generated always as (transcripcion is not null) stored,
  puesto_por    uuid        default auth.uid() references public.profiles (id) on delete set null,
  puesto_en     timestamptz not null default now()
);
-- Dos audios de la misma clase no: misma academia, día y hora (sin hora, una
-- por día).
create unique index if not exists audios_clase_una_por_clase
  on public.audios_clase (academia_id, fecha, hora) nulls not distinct;
create index if not exists audios_clase_academia_fecha on public.audios_clase (academia_id, fecha desc);
alter table public.audios_clase enable row level security;

create policy audios_clase_select on public.audios_clase for select to authenticated
  using (academia_id in (select interno.academias_de((select auth.uid())))
         or (select public.soy_admin()));
create policy audios_clase_insert on public.audios_clase for insert to authenticated
  with check (interno.puedo_poner_audios(academia_id) and puesto_por = (select auth.uid()));
create policy audios_clase_update on public.audios_clase for update to authenticated
  using (interno.puedo_poner_audios(academia_id))
  with check (interno.puedo_poner_audios(academia_id));
create policy audios_clase_delete on public.audios_clase for delete to authenticated
  using (interno.puedo_poner_audios(academia_id));

grant select, insert, update, delete on public.audios_clase to authenticated;
revoke all on public.audios_clase from anon;

-- Las academias donde quien pregunta puede subir audios, para el selector de la
-- página. Contesta solo sobre quien pregunta.
create or replace function public.mis_academias_audios()
returns table (id uuid, nombre text)
language sql stable security definer
set search_path = public
set row_security = off
as $$
  select a.id, a.nombre::text from public.academias a
   where interno.puedo_poner_audios(a.id)
   order by a.nombre;
$$;
revoke execute on function public.mis_academias_audios() from public, anon;
grant execute on function public.mis_academias_audios() to authenticated;

-- El bucket: privado, solo MP3, hasta 50 MB (una clase de hora y media en
-- calidad de voz, 48 kbps mono, son unos 32 MB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audios-clase', 'audios-clase', false, 52428800, array['audio/mpeg'])
on conflict (id) do nothing;

create policy audios_clase_objetos_select on storage.objects for select to authenticated
  using (bucket_id = 'audios-clase'
         and ((storage.foldername(name))[1] in (select interno.academias_de((select auth.uid()))::text)
              or (select public.soy_admin())));
-- El CASE no es adorno: con un AND, Postgres puede convertir a uuid antes de
-- mirar el patrón, y una carpeta que no es uuid daría un error en vez de un no.
create policy audios_clase_objetos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'audios-clase'
              and case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                       then interno.puedo_poner_audios(((storage.foldername(name))[1])::uuid)
                       else false end);
create policy audios_clase_objetos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'audios-clase'
         and case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then interno.puedo_poner_audios(((storage.foldername(name))[1])::uuid)
                  else false end);
