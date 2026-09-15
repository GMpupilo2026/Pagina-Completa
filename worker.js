// Worker del sitio: sirve los archivos estáticos y nada más.
//
// Los cursos volvieron a ser públicos a nivel de servidor. Hubo un intento de
// bloquear cursos/protegido/** y cursos/recursos/** con una cookie firmada
// que se canjeaba por la sesión de Academia (vía /api/curso-auth-session),
// pero en la práctica dejaba fuera también a cuentas válidas — el bloqueo
// dependía de una variable de entorno (COURSE_PASSWORD) fácil de perder en
// Cloudflare, y cuando falta, deniega a todos por igual, profesor incluido.
//
// Se simplificó a propósito: el "temario público / contenido en Academia"
// que se quería ahora es solo un control informativo del lado del cliente
// (js/curso-acceso.js decide qué mostrar según haya o no sesión de Academia
// en el navegador), no un bloqueo real de servidor. Cualquiera que conozca la
// URL exacta de un archivo de cursos/protegido/** o cursos/recursos/** puede
// seguir pidiéndolo directo — como cualquier otro archivo estático del sitio.
//
// Las cabeceras de seguridad del sitio (CSP, HSTS, X-Frame-Options…) siguen
// viniendo del archivo _headers, que Cloudflare aplica a lo que sirve
// env.ASSETS.fetch() — es decir, a todas las respuestas de aquí abajo.
export default {
  async fetch(request, env) {
    // El curso "Los 100 finales que hay que conocer" pasó a llamarse "El mapa de los finales":
    // las direcciones antiguas (página, contenido, datos y recursos) redirigen a las nuevas.
    {
      const url = new URL(request.url);
      if (url.pathname.includes("los-100-finales")) {
        url.pathname = url.pathname.replace("los-100-finales", "el-mapa-de-los-finales");
        return Response.redirect(url.toString(), 301);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
