// Worker del sitio: sirve los archivos estáticos, y cuida el contenido de los
// cursos.
//
// ---- Por qué ahora sí hay candado, y por qué no es el de antes ----
//
// El contenido completo de los cursos (cursos/protegido/) y su material
// (cursos/recursos/: cuadernillos, presentaciones, 75 MB) es lo que se vende.
// Hasta acá lo servía cualquiera que conociera la dirección: el "temario
// público / contenido con sesión" lo decidía solo js/curso-acceso.js en el
// navegador, que decide qué se PINTA, no qué se puede bajar.
//
// Ya hubo un candado y se abandonó: una cookie firmada con una variable de
// entorno de Cloudflare (COURSE_PASSWORD). Cuando la variable se perdió, dejó
// afuera a TODOS, profesor incluido. Este no depende de nada guardado en
// Cloudflare: le pregunta a Supabase, con la clave pública que ya está en el
// HTML, si el token de la persona vale y si su acceso está vigente
// (public.acceso_vigente(), la misma pregunta que ya cierra la base). El token
// lo deja en una cookie js/supabase-client.js (window.SesionCursos), que es
// quien tiene la sesión.
//
// Tres reglas, y el porqué de cada una:
//   · Si Supabase NO CONTESTA (caído, lento, un 5xx), se deja pasar. Es la
//     regla de js/acceso-vigente.js: una red caída no puede dejar sin su
//     material a todos los que sí pagaron. Solo pasa un token que dice ser
//     de este proyecto y no venció: una cookie cualquiera no se cuela.
//   · Sin cookie, o con un token que Supabase rechaza: 401. Si era una página
//     (abrir un PDF, un enlace), se explica y se ofrece iniciar sesión.
//   · Con sesión pero sin acceso vigente: 403, y se dice por qué.
//
// El worker solo corre en esas dos carpetas: lo dice run_worker_first en
// wrangler.jsonc. Sin esa línea Cloudflare sirve el archivo directo, sin pasar
// por acá, y el candado no existe aunque el código esté perfecto.
//
// Las cabeceras de seguridad del sitio (CSP, HSTS, X-Frame-Options…) siguen
// viniendo del archivo _headers, que Cloudflare aplica a lo que sirve
// env.ASSETS.fetch(). Las respuestas que arma el worker mismo (la página de
// «inicia sesión») no pasan por ahí y llevan las suyas en negar().

// Los mismos dos valores que js/supabase-client.js (verificar-worker.js
// comprueba que no se separen). La clave es la pública (anon): ya viaja en
// el HTML de todas las páginas; no es un secreto.
const SUPABASE_URL = "https://bgtijpimpcokxatxxbki.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJndGlqcGltcGNva3hhdHh4YmtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5ODczMjksImV4cCI6MjEwNDU2MzMyOX0.h-AcAEQNaYMVo5UVtdWqUCTYgiSLFKDgXsn3lnbAhmQ";
const COOKIE = "ai_sesion_cursos";
const PROTEGIDO = /^\/cursos\/(protegido|recursos)\//;

// Lo que ya se preguntó, para no ir a Supabase por cada archivo de una
// lección. Vive lo que vive la instancia del worker, y cada respuesta vale
// 5 minutos como mucho (o hasta que venza el token, si es antes).
const yaVisto = new Map();
const VALE_MS = 5 * 60 * 1000;

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

    if (!PROTEGIDO.test(url.pathname)) return env.ASSETS.fetch(request);

    // ---- El contenido de los cursos ----
    const veredicto = await preguntar(leerCookie(request, COOKIE));
    if (veredicto !== "pasa") return negar(request, url, veredicto);

    const res = await env.ASSETS.fetch(request);
    const copia = new Response(res.body, res);
    // Que el navegador no lo sirva de su caché sin volver a preguntar: quien
    // cierra sesión o se queda sin acceso no puede seguir abriéndolo.
    copia.headers.set("Cache-Control", "private, no-cache");
    copia.headers.append("Vary", "Cookie");
    return copia;
  },
};

function leerCookie(request, nombre) {
  const todas = request.headers.get("Cookie") || "";
  for (const parte of todas.split(";")) {
    const i = parte.indexOf("=");
    if (i > 0 && parte.slice(0, i).trim() === nombre) return parte.slice(i + 1).trim();
  }
  return "";
}

// Lo que dice el token de sí mismo. NO prueba nada (cualquiera escribe un
// JSON): solo sirve para descartar sin ir a Supabase lo que ni siquiera
// parece un token de este proyecto, o ya venció.
function carga(token) {
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  try {
    const b64 = partes[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)));
  } catch {
    return null;
  }
}

// "pasa" | "sin_sesion" | "sin_acceso"
async function preguntar(token, ahora = Date.now()) {
  if (!token) return "sin_sesion";
  const c = carga(token);
  if (!c || c.role !== "authenticated" || typeof c.exp !== "number" || c.exp * 1000 <= ahora) {
    return "sin_sesion";
  }
  // Solo cuenta si Supabase no contesta: ahí es lo único que separa una sesión
  // de verdad de un JSON inventado. Cuando contesta, decide Supabase y nada
  // más — si el formato de "iss" cambiara algún día, este chequeo no puede
  // dejar afuera a todo el mundo, que es lo que hizo el candado anterior.
  const esDeEsteProyecto = c.iss === SUPABASE_URL + "/auth/v1";

  const visto = yaVisto.get(token);
  if (visto && visto > ahora) return "pasa";

  let res;
  try {
    res = await fetch(SUPABASE_URL + "/rest/v1/rpc/acceso_vigente", {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(4000),
    });
  } catch (e) {
    console.error("cursos: Supabase no contestó", String(e));
    return esDeEsteProyecto ? "pasa" : "sin_sesion";
  }
  if (res.status >= 500) {
    console.error("cursos: Supabase respondió " + res.status);
    return esDeEsteProyecto ? "pasa" : "sin_sesion";
  }
  // PostgREST contesta 401 a un token vencido, mal firmado o de otro proyecto.
  if (!res.ok) return "sin_sesion";
  let vigente;
  try { vigente = await res.json(); } catch { vigente = null; }
  if (vigente === false) return "sin_acceso";
  // Un 200 que no es ni true ni false no debería pasar nunca; si pasa, es
  // Supabase contestando algo raro, y vale la misma regla que si no contesta.
  if (vigente !== true) return esDeEsteProyecto ? "pasa" : "sin_sesion";

  if (yaVisto.size > 2000) yaVisto.clear();
  yaVisto.set(token, Math.min(ahora + VALE_MS, c.exp * 1000));
  return "pasa";
}

// El curso al que pertenece el archivo, para mandar a su portada: el login
// solo acepta volver a una página .html, y un PDF no lo es.
function portadaDelCurso(pathname) {
  const m = pathname.match(/^\/cursos\/(?:protegido\/(?:data\/)?|recursos\/)([a-z0-9-]+)/);
  return m ? "cursos/" + m[1] + ".html" : "cursos.html";
}

function negar(request, url, veredicto) {
  const estado = veredicto === "sin_acceso" ? 403 : 401;
  // Esta respuesta la arma el worker, no sale de los archivos: _headers no le
  // pone nada, así que las cabeceras de seguridad van acá. Sin scripts: la
  // página no necesita ninguno.
  const cabeceras = {
    "Cache-Control": "no-store",
    Vary: "Cookie",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  };
  const esPagina = request.headers.get("Sec-Fetch-Mode") === "navigate" ||
    /text\/html/.test(request.headers.get("Accept") || "");
  if (!esPagina) {
    return new Response(veredicto === "sin_acceso" ? "Acceso a la Academia no vigente" : "Hace falta iniciar sesión",
      { status: estado, headers: { ...cabeceras, "Content-Type": "text/plain; charset=utf-8" } });
  }
  const portada = portadaDelCurso(url.pathname);
  const cuerpo = veredicto === "sin_acceso"
    ? `<h1>Tu acceso a la Academia no está activo</h1>
<p>Este material es de los cursos de la Academia. En tu panel te decimos hasta cuándo estuvo activo y cómo renovarlo.</p>
<p><a class="boton" href="/clases.html">Ir a mi panel</a></p>`
    : `<h1>Este material es de la Academia</h1>
<p>Lo pueden abrir los alumnos con su cuenta. Inicia sesión y te llevamos al curso.</p>
<p><a class="boton" href="/login.html?next=${encodeURIComponent(portada)}">Iniciar sesión</a></p>
<p><a href="/${portada}">Ver el temario del curso</a></p>`;
  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Material de la Academia — Ajedrez Integral</title>
<style>
/* Paleta del tema Clásico; contrastes medidos (WCAG AA): texto 14,6:1 claro y
   10,4:1 oscuro, botón 14,6:1 y 7,9:1, anillo de foco 5,1:1 y 6,2:1. */
body{margin:0;font-family:system-ui,sans-serif;background:#f0f4f8;color:#102a43;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}
main{max-width:32rem;background:#fff;border-radius:16px;padding:28px;box-shadow:0 2px 12px rgba(16,42,67,.12)}
h1{font-size:1.4rem;margin:0 0 12px}p{line-height:1.5}a{color:#102a43;font-weight:600}
a.boton{display:inline-block;background:#102a43;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none}
a:focus-visible{outline:3px solid #a85a0d;outline-offset:2px}
@media (prefers-color-scheme:dark){body{background:#102a43;color:#f0f4f8}main{background:#243b53;box-shadow:none}a{color:#f0f4f8}a.boton{background:#f0b429;color:#102a43}a:focus-visible{outline-color:#f0b429}}
</style></head>
<body><main>${cuerpo}</main></body></html>`;
  return new Response(html, { status: estado, headers: { ...cabeceras, "Content-Type": "text/html; charset=utf-8" } });
}
