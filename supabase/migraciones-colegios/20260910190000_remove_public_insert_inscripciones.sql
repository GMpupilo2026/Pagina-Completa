-- El comentario de la edge function "registrar-inscripcion" (smart-function) dice que
-- esta política se había quitado para que solo esa función (con service role, tras
-- verificar Turnstile del lado del servidor) pudiera insertar. Seguía existiendo: con
-- la anon key pública, cualquiera podía insertar directo por la API REST de Supabase,
-- saltándose Turnstile y todas las validaciones del servidor (edad, formato de correo,
-- etc.). La función sigue funcionando igual porque usa la service role key, que no
-- pasa por RLS.
drop policy if exists "Insertar inscripciones públicas" on public.inscripciones;