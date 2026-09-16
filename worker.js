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
    const url = new URL(request.url);
    let corregida = false;

    // ---- www.ajedrez-integral.com manda a ajedrez-integral.com ----
    //
    // No es una preferencia de estilo: para el navegador son DOS ORÍGENES
    // DISTINTOS. Si los dos sirvieran el sitio, quien entrara por www tendría
    // otro localStorage (otro progreso, otro tema, otra clase elegida), otro
    // service worker y otra suscripción de avisos push — o sea, una segunda
    // app con el estado en blanco para la misma persona. Y de paso, todos los
    // canonical, el sitemap y el Open Graph del sitio apuntan al dominio sin
    // www, así que servir las dos direcciones sería contenido duplicado.
    if (url.hostname.startsWith("www.")) {
      url.hostname = url.hostname.slice(4);
      corregida = true;
    }

    // ---- El curso que cambió de nombre ----
    // "Los 100 finales que hay que conocer" pasó a llamarse "El mapa de los
    // finales": las direcciones antiguas (página, contenido, datos y recursos)
    // redirigen a las nuevas.
    if (url.pathname.includes("los-100-finales")) {
      url.pathname = url.pathname.replace("los-100-finales", "el-mapa-de-los-finales");
      corregida = true;
    }

    // Las dos correcciones se resuelven en UNA sola respuesta. Encadenar dos
    // redirecciones (primero el dominio, después la dirección) le cuesta un
    // viaje de más a quien entra y Google lo cuenta como salto extra.
    if (corregida) return Response.redirect(url.toString(), 301);

    return env.ASSETS.fetch(request);
  },
};
