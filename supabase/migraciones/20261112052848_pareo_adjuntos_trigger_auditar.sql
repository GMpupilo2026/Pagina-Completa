-- El trigger de auditoría de pareo_adjuntos se llama `auditar`, como en el
-- resto de las tablas vigiladas: verificar-auditoria.js lo busca por ese
-- nombre en el retrato del esquema. La migración anterior
-- (20261112050229_pareo_cola_adjuntos.sql) lo creó como
-- pareo_adjuntos_auditar, y ya estaba aplicada: no se toca.
--
-- Ver «Pareo Integral: lo que anotan los adjuntos queda en la base» en
-- docs/decisiones/juegos-y-torneos.md.

alter trigger pareo_adjuntos_auditar on public.pareo_adjuntos rename to auditar;
