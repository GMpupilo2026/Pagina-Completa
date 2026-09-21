-- Un profesor no puede tener dos clases abiertas a la vez, y lo impide la BASE
-- y no un `if` en la página.
--
-- Hace falta desde que la clase se abre sola al empezar a dar clase: los dos
-- disparadores (entra un alumno / el profesor transmite una posición) pueden
-- caer en el mismo instante, y dos pestañas abiertas del mismo profesor, peor.
-- Con dos filas abiertas la asistencia se reparte entre las dos y cada informe
-- cuenta la mitad — sin que nada falle.
--
-- Es el mismo patrón que el UNIQUE de examen_respuestas (una sola oportunidad)
-- y el de avisos_cobro (un aviso una sola vez): lo que no puede pasar dos veces
-- lo garantiza un índice, no una comprobación previa que dos pestañas se saltan.
create unique index if not exists class_sessions_una_abierta_por_profesor
    on public.class_sessions (created_by)
    where ended_at is null;