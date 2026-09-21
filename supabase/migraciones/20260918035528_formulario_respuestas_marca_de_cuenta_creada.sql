-- Marca de "de esta respuesta ya se dio de alta la cuenta".
--
-- Va en la propia fila de la respuesta porque es lo que pasó con ELLA, y es lo
-- que evita mandar dos invitaciones al mismo correo sin darse cuenta: la
-- pantalla pinta el botón o la marca según esto, no según un `if` que se pierde
-- al recargar.
--
-- OJO: no confundir con alumno_id, que ya existía y es OTRA cosa — quién
-- contestó el formulario (auth.uid() al responder, casi siempre nulo porque el
-- formulario es público). cuenta_id es a quién se le creó la cuenta después.
--
-- formulario_respuestas NO tiene política de update a propósito: una respuesta
-- enviada no se toca desde el navegador. Así que estas tres columnas solo las
-- escribe la Edge Function `inscribir-alumno` con la service role, igual que
-- el contador de invitaciones.
alter table public.formulario_respuestas
  add column if not exists cuenta_id uuid references public.profiles(id) on delete set null,
  add column if not exists cuenta_creada_at timestamptz,
  add column if not exists cuenta_creada_por uuid references public.profiles(id) on delete set null;

comment on column public.formulario_respuestas.cuenta_id is
  'Alumno que se dio de alta a partir de esta respuesta. Distinto de alumno_id, que es quién la contestó.';
