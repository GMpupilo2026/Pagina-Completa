-- La inscripción al torneo puede traer archivos (la cédula, el carné del
-- colegio, un comprobante). El público sube sin cuenta a un bucket PRIVADO,
-- solo a la carpeta "pendientes/", y no puede leer nada de él: quien los ve es
-- la Edge Function inscripciones-torneo, con la service role, después de
-- preguntarle a la Academia si quien mira coordina. La Edge Function que
-- registra (smart-function) comprueba que cada ruta exista antes de guardarla.
alter table public.inscripciones add column if not exists adjuntos jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inscripcion-adjuntos', 'inscripcion-adjuntos', false, 10485760,
        array['image/jpeg','image/png','image/webp','application/pdf',
              'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy inscripcion_adjuntos_insert on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'inscripcion-adjuntos'
              and (storage.foldername(name))[1] = 'pendientes');