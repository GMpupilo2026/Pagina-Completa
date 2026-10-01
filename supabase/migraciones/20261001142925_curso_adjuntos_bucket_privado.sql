-- El bucket curso-adjuntos nació público (20261001021252). En un bucket
-- público el archivo se baja con su enlace sin pasar por ninguna política
-- (/storage/v1/object/public/...): las de storage.objects, que lo dejan solo a
-- administración, no cuentan. Y lo que se adjunta a un curso es lo que se
-- vende: con el enlace, cualquiera se saltaba el candado de los cursos.
-- Privado, cada bajada pasa por curso_adjuntos_archivos_select (solo
-- administración, con la verificación en dos pasos de storage.objects), y
-- quien deba verlo después lo abre con un enlace firmado.
update storage.buckets set public = false where id = 'curso-adjuntos';
