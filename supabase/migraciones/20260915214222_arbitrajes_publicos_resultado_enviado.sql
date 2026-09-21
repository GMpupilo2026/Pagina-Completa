-- Guarda cuándo se envió por última vez el correo con las respuestas del
-- examen (completo o solo errores) a quien lo hizo. Es independiente de
-- "revisado" (que es la retroalimentación escrita a mano de Oscar): acá solo
-- se registra el envío automático de resultados.
alter table public.arbitrajes_publicos
  add column if not exists resultado_enviado_at timestamptz;