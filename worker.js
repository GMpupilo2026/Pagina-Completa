// Worker del sitio: sirve los archivos estáticos y nada más.
//
// Los cursos son públicos. Antes este script guardaba bajo llave el contenido
// completo de las lecciones (cursos/protegido/**) y sus presentaciones y PDF
// (cursos/recursos/**): pedía una cookie firmada que se obtenía con la sesión
// de Academia en /api/curso-auth-session y, sin ella, respondía 403. Todo eso
// se quitó a propósito: cualquier visitante ve las lecciones enteras y puede
// descargar los recursos sin contraseña, sin sesión y sin ninguna otra
// restricción. Ya no queda ningún endpoint de autenticación de cursos, y la
// variable de entorno COURSE_PASSWORD dejó de usarse (puede borrarse de
// Cloudflare).
//
// Las cabeceras de seguridad del sitio (CSP, HSTS, X-Frame-Options…) siguen
// viniendo del archivo _headers, que Cloudflare aplica a lo que sirve
// env.ASSETS.fetch() — es decir, a todas las respuestas de aquí abajo.
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
