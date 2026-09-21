-- `inscripciones` guarda cedulas, fechas de nacimiento y telefonos de menores;
-- `chess_leads` guarda nombre y correo. Hoy no los lee nadie porque las dos
-- tienen RLS encendida y ni una sola politica -- pero el grant de tabla que
-- Supabase le da por omision a `anon` y `authenticated` sigue ahi, asi que todo
-- depende de que nadie apague la RLS desde el panel. La clave publica de este
-- proyecto esta escrita dentro de `inscripcion.html`, a la vista de cualquiera.
--
-- Ninguna de las dos se escribe desde el navegador: `inscripciones` la escribe
-- el Worker de Cloudflare (ajedrez-inscripciones) y `chess_leads` la Edge
-- Function `chess-lead-email`, las dos con la service role, que conserva su
-- permiso. Asi que se les quita de raiz: una puerta menos que dependa de que la
-- politica este bien escrita.
--
-- `Coles` NO se toca: es el directorio de centros educativos del MEP (datos
-- publicos) y el selector de colegios de `inscripcion.html` lo lee con `anon`.

revoke all on table public.inscripciones from anon, authenticated;
revoke all on table public.chess_leads   from anon, authenticated;