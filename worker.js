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
// ---- Lo que se vende suelto: permiso por producto ----
//
// La tienda vende cada material por separado, y con el candado de arriba lo
// bajaba cualquier cuenta con el acceso vigente —no quien lo compró— y los
// libros de la raíz no tenían ninguno. Ahora (ver «La tienda con permiso por
// producto» en docs/decisiones/cobros-acceso-y-tienda.md):
//   · cursos/recursos/<producto>/  lo baja quien tiene el acceso vigente, como
//     siempre, O quien compró ese material;
//   · material/<producto>/         los libros y las guías sueltas: solo quien
//     los compró (y administración).
// El producto es el nombre de la carpeta, el mismo id de js/tienda-catalogo.js
// (verificar-tienda.js lo comprueba). La compra la registra administración en
// tienda.html; la pregunta es public.puede_bajar(producto, basta_el_acceso).
//
// El worker solo corre en esas carpetas: lo dice run_worker_first en
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
const PROTEGIDO = /^\/(cursos\/(protegido|recursos)|material)\//;

// Los cursos escondidos a alumnos y profesores (ver «Los cursos escondidos» en
// docs/decisiones/cursos-y-material.md). Es la misma lista de
// js/cursos-ocultos.js, que decide qué se pinta; verificar-worker.js comprueba
// que no se separen. Para estos, el acceso a la Academia no basta: su
// contenido y su material los baja administración o quien compró ese material.
const OCULTOS = new Set([
  "fundamentos-del-ajedrez",
  "aperturas-y-defensas",
  "calculo-y-visualizacion",
  "finales-practicos",
  "estrategia-y-tactica",
  "preparacion-para-torneos",
]);

// El curso escondido al que pertenece la dirección, o "".
function cursoOculto(pathname) {
  const m = pathname.match(/^\/cursos\/(?:protegido\/(?:data\/)?|recursos\/)([a-z0-9-]+)/);
  return m && OCULTOS.has(m[1]) ? m[1] : "";
}

// Qué hay que preguntar para esa dirección. Los cursos (protegido/) se abren
// con el acceso a la Academia; lo que se vende suelto, con su compra.
function queSePregunta(pathname) {
  const oculto = cursoOculto(pathname);
  if (oculto) return { producto: oculto, bastaAcceso: false };
  let m = pathname.match(/^\/cursos\/recursos\/([a-z0-9-]+)\//);
  if (m) return { producto: m[1], bastaAcceso: true };
  m = pathname.match(/^\/material\/([a-z0-9-]+)\//);
  if (m) return { producto: m[1], bastaAcceso: false };
  if (/^\/material\//.test(pathname)) return { producto: "", bastaAcceso: false };
  return null;   // cursos/protegido/: acceso_vigente(), como siempre
}

// Lo que ya se preguntó, para no ir a Supabase por cada archivo de una
// lección. Vive lo que vive la instancia del worker, y cada respuesta vale
// 5 minutos como mucho (o hasta que venza el token, si es antes). Se guarda
// por token Y por producto: guardado solo por token, haber comprado UN
// material abría todos los demás durante esos 5 minutos.
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

    // ---- La tarjeta de un torneo de Pareo Integral (/t/<id>) ----
    const torneo = url.pathname.match(TORNEO);
    if (torneo) return tarjetaTorneo(torneo[1].toLowerCase());
    // ---- La de un organizador (/o/<id>) y el calendario para suscribirse ----
    const organizador = url.pathname.match(ORGANIZADOR);
    if (organizador) return tarjetaOrganizador(organizador[1].toLowerCase());
    if (url.pathname === CALENDARIO) return calendarioTorneos(url.searchParams.get("o"));
    // ---- La clasificación para incrustar en otra página (/incrustar/<id>) ----
    const incrustar = url.pathname.match(INCRUSTAR);
    if (incrustar) return incrustarTorneo(incrustar[1].toLowerCase(), url.searchParams.get("tema") === "oscuro");

    if (!PROTEGIDO.test(url.pathname)) return env.ASSETS.fetch(request);

    // ---- El contenido de los cursos ----
    const veredicto = await preguntar(leerCookie(request, COOKIE), Date.now(), queSePregunta(url.pathname));
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
async function preguntar(token, ahora = Date.now(), que = null) {
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

  // material/ sin carpeta de producto no es nada que se venda: no se sirve.
  if (que && !que.producto) return "sin_acceso";
  const clave = que ? token + "|" + que.producto : token;
  const visto = yaVisto.get(clave);
  if (visto && visto > ahora) return "pasa";

  let res;
  try {
    res = await fetch(SUPABASE_URL + "/rest/v1/rpc/" + (que ? "puede_bajar" : "acceso_vigente"), {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: que ? JSON.stringify({ p_producto: que.producto, p_basta_acceso: que.bastaAcceso }) : "{}",
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
  yaVisto.set(clave, Math.min(ahora + VALE_MS, c.exp * 1000));
  return "pasa";
}

// El curso al que pertenece el archivo, para mandar a su portada: el login
// solo acepta volver a una página .html, y un PDF no lo es.
function portadaDelCurso(pathname) {
  if (/^\/material\//.test(pathname)) return "clases.html";
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
  const suelto = /^\/material\//.test(url.pathname);
  const esPagina = request.headers.get("Sec-Fetch-Mode") === "navigate" ||
    /text\/html/.test(request.headers.get("Accept") || "");
  if (!esPagina) {
    return new Response(veredicto === "sin_acceso" ? (cursoOculto(url.pathname) ? "Curso no disponible" : suelto ? "Este material se compra aparte" : "Acceso a la Academia no vigente") : "Hace falta iniciar sesión",
      { status: estado, headers: { ...cabeceras, "Content-Type": "text/plain; charset=utf-8" } });
  }
  const portada = portadaDelCurso(url.pathname);
  const cuerpo = veredicto === "sin_acceso" && cursoOculto(url.pathname)
    ? `<h1>Este curso no está disponible</h1>
<p>Por ahora este curso no está abierto en la Academia. En tu panel están los cursos que puedes estudiar.</p>
<p><a class="boton" href="/cursos/academia/index.html">Ver mis cursos</a></p>`
    : veredicto === "sin_acceso" && suelto
    ? `<h1>Este material se compra aparte</h1>
<p>Lo pueden abrir las cuentas que lo compraron. Si ya lo compraste, escríbenos por WhatsApp al +506 8309-2291 y lo dejamos asociado a tu cuenta.</p>
<p><a class="boton" href="https://wa.me/50683092291">Escribir por WhatsApp</a></p>`
    : veredicto === "sin_acceso"
    ? `<h1>Tu acceso a la Academia no está activo</h1>
<p>Este material es de los cursos de la Academia: lo abre quien tiene el acceso activo o quien compró este material. En tu panel te decimos hasta cuándo estuvo activo y cómo renovarlo.</p>
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

// ---- La tarjeta de un torneo de Pareo Integral ----
//
// Quien comparte un torneo publicado por WhatsApp (o en las redes) manda
// /t/<id>. WhatsApp y las redes no leen lo que va después del «#», así que el
// enlace de siempre (torneos-pareo.html#t=…) mostraba la vista previa de la
// portada. Acá se arma una página mínima con el nombre del torneo, sus fechas,
// el lugar y cómo va (lo que lee la vista previa), y se manda a la página de
// verdad. La tabla es de lectura pública: se pregunta con la clave pública,
// como el navegador. Si Supabase no contesta, igual se manda al torneo, con la
// tarjeta de la portada. Ver «La tarjeta al compartir un torneo» en
// docs/decisiones/juegos-y-torneos.md.
const TORNEO = /^\/t\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;
const SITIO = "https://ajedrez-integral.com";
const IMAGEN_TORNEO = SITIO + "/img/og-torneos-pareo.jpg";
const ELO_TEXTO = { fide: "Válido para Elo FIDE", nacional: "Válido para Elo Nacional", no: "No varía el Elo" };

const escaparHtml = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// «22 de octubre de 2026»: un día de calendario, leído al mediodía de Costa Rica.
function diaTexto(dia, conAnio) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia || "")) return "";
  return new Date(dia + "T12:00:00-06:00").toLocaleDateString("es-CR", Object.assign({ timeZone: "America/Costa_Rica", day: "numeric", month: "long" }, conAnio ? { year: "numeric" } : {}));
}

// La línea de la vista previa: las fechas, el lugar, cómo va y si da Elo.
function resumenTorneo(x) {
  const fin = x.fin && x.fin > x.fecha ? x.fin : "";
  // «Del 22 al 24 de octubre de 2026»; si cambia de mes, los dos meses.
  const mismoMes = fin && fin.slice(0, 7) === x.fecha.slice(0, 7);
  const desde = mismoMes ? String(Number(x.fecha.slice(8))) : diaTexto(x.fecha, fin && fin.slice(0, 4) !== x.fecha.slice(0, 4));
  const fechas = !x.fecha ? "" : fin ? "Del " + desde + " al " + diaTexto(fin, true) : diaTexto(x.fecha, true);
  const como = !x.jugadores ? "Próximamente" : !x.rondas ? x.jugadores + " inscritos"
    : "Ronda " + x.rondas + (x.rondas_total ? " de " + x.rondas_total : "") + " · " + x.jugadores + " participantes";
  return [fechas, x.lugar, como, ELO_TEXTO[x.elo], x.ritmo].filter(Boolean).join(" · ");
}

async function tarjetaTorneo(id) {
  const destino = "/torneos-pareo.html#t=" + id;
  let x = null;
  try {
    const res = await fetch(SUPABASE_URL + "/rest/v1/pareo_publicados?select=nombre,evento,lugar,fecha,rondas,rondas_total,jugadores,fin:datos-%3E%3EfechaFin,ritmo:datos-%3E%3Eritmo,elo:datos-%3E%3EvalidoElo&id=eq." + id, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, Accept: "application/json" },
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) x = (await res.json())[0] || null;
  } catch (e) {
    console.error("torneo: Supabase no contestó", String(e));
  }
  const titulo = x ? x.nombre + (x.evento && x.evento !== x.nombre ? " — " + x.evento : "") : "Torneos en Pareo Integral";
  const resumen = x ? resumenTorneo(x) : "Las rondas, los resultados y la clasificación de los torneos publicados con Pareo Integral.";
  return paginaTarjeta({ titulo, resumen, destino, propia: SITIO + "/t/" + id, alt: "Pareo Integral: torneos de ajedrez en vivo. ajedrez-integral.com" });
}

// La página mínima que leen las vistas previas: el título, la línea, la
// imagen de Pareo Integral, y de inmediato a la página de verdad. Sin
// <script>: su CSP no lo dejaría.
function paginaTarjeta({ titulo, resumen, destino, propia, alt }) {
  const t = escaparHtml(titulo), r = escaparHtml(resumen), d = escaparHtml(destino);
  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${t} | Pareo Integral</title>
<meta name="description" content="${r}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Ajedrez Integral · Pareo Integral">
<meta property="og:locale" content="es_CR">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${r}">
<meta property="og:url" content="${escaparHtml(propia)}">
<meta property="og:image" content="${IMAGEN_TORNEO}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${escaparHtml(alt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="noindex">
<link rel="canonical" href="${SITIO}${d}">
<meta http-equiv="refresh" content="0;url=${d}">
</head><body>
<p><a href="${d}">Ver ${t}</a></p>
</body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Corto: lo que cambia es «Ronda 3 de 7».
      "Cache-Control": "public, max-age=300",
      "Content-Security-Policy": "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    },
  });
}

// ---- La tarjeta de un organizador (/o/<id>) ----
//
// Lo mismo que la de un torneo, para la página de quien organiza
// (torneos-pareo.html#o=<id>): su nombre, si tiene el sello y cuántos torneos
// publicó. Ver «La tarjeta del organizador y el calendario para suscribirse»
// en docs/decisiones/juegos-y-torneos.md.
const ORGANIZADOR = /^\/o\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;
const LECTURA = { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, Accept: "application/json" };

async function tarjetaOrganizador(id) {
  const destino = "/torneos-pareo.html#o=" + id;
  let o = null, cuantos = null;
  try {
    const [res, cuenta] = await Promise.all([
      fetch(SUPABASE_URL + "/rest/v1/pareo_organizadores?select=nombre,verificado&id=eq." + id, { headers: LECTURA, signal: AbortSignal.timeout(3000) }),
      // Solo la cuenta: «0-0/12» en Content-Range.
      fetch(SUPABASE_URL + "/rest/v1/pareo_publicados?select=id&organizador_id=eq." + id, { headers: Object.assign({ Prefer: "count=exact", Range: "0-0" }, LECTURA), signal: AbortSignal.timeout(3000) }),
    ]);
    if (res.ok) o = (await res.json())[0] || null;
    const total = /\/(\d+)$/.exec(cuenta.headers.get("content-range") || "");
    if (total) cuantos = Number(total[1]);
  } catch (e) {
    console.error("organizador: Supabase no contestó", String(e));
  }
  const titulo = o ? o.nombre : "Torneos en Pareo Integral";
  const resumen = o
    ? [o.verificado ? "Organizador verificado" : "", cuantos == null ? "" : cuantos === 1 ? "1 torneo publicado" : cuantos + " torneos publicados", "Sus próximos torneos y los resultados en Pareo Integral"].filter(Boolean).join(" · ")
    : "Las rondas, los resultados y la clasificación de los torneos publicados con Pareo Integral.";
  return paginaTarjeta({ titulo, resumen, destino, propia: SITIO + "/o/" + id, alt: "Pareo Integral: torneos de ajedrez en vivo. ajedrez-integral.com" });
}

// ---- El calendario para suscribirse (/calendario/torneos.ics) ----
//
// Los próximos torneos de Torneos en Pareo Integral y los de
// ajedrezcostarica.com, como un calendario al que la app del celular se
// suscribe y vuelve a leer sola. Con ?o=<id>, solo los de ese organizador.
// Son días enteros, igual que «Agregar a mi calendario» de cada torneo, con
// los mismos UID: quien ya lo había agregado no lo ve dos veces. El texto lo
// arma igual que js/calendario-ics.js (armarDias); verificar-worker.js
// compara las dos salidas línea por línea, porque el worker no puede
// importar ese archivo.
const CALENDARIO = "/calendario/torneos.ics";
const ZONA_CR = "America/Costa_Rica";
const diaCR = (x) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_CR }).format(x instanceof Date ? x : new Date(x));
const ELO_LARGO_CAL = { fide: "Válido para Elo FIDE", ambos: "Válido para Elo FIDE y Nacional", nacional: "Válido solo para Elo Nacional", no: "No varía el Elo" };

function icsEscapar(t) {
  return String(t == null ? "" : t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function icsDoblar(linea) {
  const bytes = (x) => new TextEncoder().encode(x).length;
  if (bytes(linea) <= 75) return linea;
  const trozos = [];
  let actual = "", limite = 75;
  for (const ch of linea) {
    if (bytes(actual + ch) > limite) { trozos.push(actual); actual = ""; limite = 74; }
    actual += ch;
  }
  trozos.push(actual);
  return trozos.join("\r\n ");
}
function diaSiguienteCal(dia) {
  const [y, m, d] = dia.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + 1));
  const dos = (n) => String(n).padStart(2, "0");
  return x.getUTCFullYear() + "-" + dos(x.getUTCMonth() + 1) + "-" + dos(x.getUTCDate());
}
const DIA_CAL = /^\d{4}-\d{2}-\d{2}$/;
function armarCalendario(nombre, eventos, ahora) {
  const stamp = (ahora || new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const l = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ajedrez Integral//Mi calendario//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:" + icsEscapar(nombre), "X-WR-TIMEZONE:" + ZONA_CR,
    "BEGIN:VTIMEZONE", "TZID:" + ZONA_CR, "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:-0600", "TZOFFSETTO:-0600", "TZNAME:CST", "END:STANDARD", "END:VTIMEZONE",
    // Que la app lo vuelva a leer dos veces al día.
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H", "X-PUBLISHED-TTL:PT12H"];
  for (const e of eventos) {
    if (!e || !DIA_CAL.test(e.desde || "")) continue;
    const hasta = DIA_CAL.test(e.hasta || "") && e.hasta >= e.desde ? e.hasta : e.desde;
    l.push("BEGIN:VEVENT", "UID:" + e.uid, "DTSTAMP:" + stamp,
      "DTSTART;VALUE=DATE:" + e.desde.replace(/-/g, ""),
      "DTEND;VALUE=DATE:" + diaSiguienteCal(hasta).replace(/-/g, ""),
      "SUMMARY:" + icsEscapar(e.resumen));
    if (e.lugar) l.push("LOCATION:" + icsEscapar(e.lugar));
    if (e.descripcion) l.push("DESCRIPTION:" + icsEscapar(e.descripcion));
    if (e.url) l.push("URL:" + e.url);
    if (e.aviso) l.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEscapar(e.resumen), "TRIGGER:" + e.aviso, "END:VALARM");
    l.push("END:VEVENT");
  }
  l.push("END:VCALENDAR");
  return l.map(icsDoblar).join("\r\n") + "\r\n";
}

// Los eventos, de las dos tablas públicas. Un torneo de Pareo Integral entra
// si su último día es hoy o después; los de afuera, igual.
async function eventosCalendario(org, ahora) {
  const hoy = diaCR(ahora);
  const hace = diaCR(new Date(ahora.getTime() - 31 * 86400000));
  const propios = fetch(SUPABASE_URL + "/rest/v1/pareo_publicados?select=id,nombre,evento,lugar,fecha,fin:datos-%3E%3EfechaFin,ciudad:datos-%3E%3Eciudad,elo:datos-%3E%3EvalidoElo,ritmo:datos-%3E%3Eritmo,hora:datos-%3Eanuncio-%3E%3Ehora"
    + "&fecha=gte." + hace + (org ? "&organizador_id=eq." + org : "") + "&order=fecha.asc&limit=500", { headers: LECTURA, signal: AbortSignal.timeout(5000) });
  // Los de afuera que ya están publicados en Pareo Integral (repetido_de) no
  // van dos veces: public.torneos_externos_lista los marca.
  const afuera = org ? null : fetch(SUPABASE_URL + "/rest/v1/rpc/torneos_externos_lista", {
    method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, LECTURA), body: "{}", signal: AbortSignal.timeout(5000) });
  const [a, b] = await Promise.all([propios, afuera]);
  if (!a.ok || (b && !b.ok)) throw new Error("Supabase contestó " + a.status + (b ? "/" + b.status : ""));
  const eventos = [];
  for (const x of await a.json()) {
    const hasta = DIA_CAL.test(x.fin || "") && x.fin >= x.fecha ? x.fin : x.fecha;
    if (!DIA_CAL.test(x.fecha || "") || hasta < hoy) continue;
    const enlace = SITIO + "/t/" + x.id;
    eventos.push({ uid: "torneo-" + x.id + "@ajedrez-integral.com", desde: x.fecha, hasta: x.fin, resumen: x.nombre, lugar: x.ciudad || x.lugar || "",
      descripcion: [x.evento && x.evento !== x.nombre ? x.evento + "." : "", x.hora ? "Empieza a las " + x.hora + "." : "", x.ritmo ? "Ritmo: " + x.ritmo + "." : "",
        ELO_LARGO_CAL[x.elo] ? ELO_LARGO_CAL[x.elo] + "." : "", "Rondas y resultados: " + enlace].filter(Boolean).join(" "),
      url: enlace, aviso: "-PT15H" });
  }
  if (b) for (const x of await b.json()) {
    if (x.repetido_de) continue;
    const desde = x.inicio ? diaCR(x.inicio) : "", hasta = x.fin ? diaCR(x.fin) : desde;
    if (!desde || hasta < hoy) continue;
    // Solo direcciones de las dos fuentes, nunca otra que llegue en la fila.
    const fuente = /^https:\/\/ajedrezcostarica\.com\/es\/tournaments\/\d+$/.test(x.url || "") ? "ajedrezcostarica"
      : /^https:\/\/chess-results\.com\/tnr\d+\.aspx\?lan=2$/.test(x.url || "") ? "chess-results" : "";
    if (!fuente) continue;
    eventos.push({ uid: fuente + "-" + x.id_externo + "@ajedrez-integral.com", desde, hasta, resumen: x.titulo,
      lugar: [x.lugar, x.provincia].filter(Boolean).join(", "),
      descripcion: [x.organizador ? "Organiza: " + x.organizador + "." : "", ELO_LARGO_CAL[x.elo] ? ELO_LARGO_CAL[x.elo] + "." : "", "Inscripción y detalles: " + x.url].filter(Boolean).join(" "),
      url: x.url, aviso: "-PT15H" });
  }
  return eventos.sort((p, q) => p.desde.localeCompare(q.desde));
}

async function calendarioTorneos(org) {
  const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (org != null && !ID.test(org)) return new Response("Ese organizador no existe.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const ahora = new Date();
  let eventos, nombre = "Torneos de ajedrez en Costa Rica";
  try {
    eventos = await eventosCalendario(org ? org.toLowerCase() : null, ahora);
    if (org) {
      const r = await fetch(SUPABASE_URL + "/rest/v1/pareo_organizadores?select=nombre&id=eq." + org.toLowerCase(), { headers: LECTURA, signal: AbortSignal.timeout(3000) });
      const o = r.ok ? (await r.json())[0] : null;
      if (!o) return new Response("Ese organizador no existe.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      nombre = "Torneos de " + o.nombre;
    }
  } catch (e) {
    // La app se queda con lo que ya tenía y vuelve a intentar más tarde.
    console.error("calendario: Supabase no contestó", String(e));
    return new Response("No se pudo leer la lista de torneos. Intenta más tarde.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "3600" } });
  }
  return new Response(armarCalendario(nombre, eventos, ahora), {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="torneos.ics"',
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      "Access-Control-Allow-Origin": "*",
    },
  });
}


// ---- La clasificación para incrustar en otra página (/incrustar/<id>) ----
//
// Un club pega un <iframe> con esta dirección en su página y muestra la
// clasificación de su torneo, que se pone al día sola. Es la ÚNICA página del
// sitio que otra puede meter en un iframe: todas las demás llevan
// frame-ancestors 'self' (_headers), y por eso la arma el worker con sus
// propias cabeceras en vez de ser un archivo más. Trae el torneo ya leído
// (JSON que no se ejecuta, con «<» escapado) y js/pareo-incrustar.js lo pinta
// con los mismos módulos de Pareo Integral. Se vuelve a pedir cada minuto
// (meta refresh). Ver «La clasificación para incrustar en otra página» en
// docs/decisiones/juegos-y-torneos.md.
const INCRUSTAR = /^\/incrustar\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;
const SCRIPTS_INCRUSTAR = ["hora-cr.js", "ritmo-control.js", "pareo/torneo.js", "pareo/desempates.js", "pareo/equipos.js", "pareo/grupos.js", "pareo/premios.js", "pareo/evento.js", "pareo-incrustar.js"];
// Los colores con su contraste medido (WCAG AA): texto 14,6:1 y notas 6,1:1
// sobre blanco; en oscuro, 13,3:1 y 8,9:1 sobre #102a43.
const ESTILO_INCRUSTAR = `
:root{--fondo:#ffffff;--texto:#102a43;--nota:#486581;--linea:#d9e2ec}
.oscuro{--fondo:#102a43;--texto:#f0f4f8;--nota:#bcccdc;--linea:#334e68}
*{box-sizing:border-box}html,body{margin:0;background:var(--fondo);color:var(--texto);font-family:system-ui,-apple-system,"Segoe UI",Arial,sans-serif;font-size:15px;line-height:1.4}
main{padding:12px}h1{font-size:1.15rem;margin:0}.sub,.nota,.pie,.inst{color:var(--nota);font-size:.85rem}.sub{margin:2px 0 10px}
table{width:100%;border-collapse:collapse}caption{text-align:left;font-weight:700;margin-bottom:4px}
th,td{padding:5px 6px;border-bottom:1px solid var(--linea);text-align:left;vertical-align:top}.num{text-align:right;white-space:nowrap}.fuerte{font-weight:700}
.inst{display:block}a{color:var(--texto);text-decoration:underline;text-underline-offset:2px}a:focus-visible{outline:3px solid #f0b429;outline-offset:2px;border-radius:2px}
.oculto{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}`;

async function incrustarTorneo(id, oscuro) {
  let x = null, fallo = false;
  try {
    const res = await fetch(SUPABASE_URL + "/rest/v1/pareo_publicados?select=id,nombre,evento,lugar,fecha,datos&id=eq." + id, { headers: LECTURA, signal: AbortSignal.timeout(4000) });
    if (res.ok) x = (await res.json())[0] || null; else fallo = true;
  } catch (e) {
    fallo = true;
    console.error("incrustar: Supabase no contestó", String(e));
  }
  const datos = x ? JSON.stringify(x).replace(/</g, "\\u003c") : "";
  const mensaje = x ? "Cargando…" : fallo ? "No se pudo leer el torneo. Se vuelve a intentar en un minuto." : "Este torneo no está publicado en Pareo Integral.";
  const html = `<!DOCTYPE html>
<html lang="es"${oscuro ? ' class="oscuro"' : ""}><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escaparHtml(x ? x.nombre : "Pareo Integral")} | Pareo Integral</title>
<meta name="robots" content="noindex">
${x || fallo ? '<meta http-equiv="refresh" content="60">' : ""}
<style>${ESTILO_INCRUSTAR}</style>
</head><body>
<main id="pi-inc" aria-live="polite"><p class="nota">${escaparHtml(mensaje)}</p></main>
${x ? `<script type="application/json" id="pi-inc-datos">${datos}</script>
${SCRIPTS_INCRUSTAR.map((f) => `<script src="/js/${f}"></script>`).join("\n")}` : ""}
</body></html>`;
  return new Response(html, {
    status: x ? 200 : fallo ? 503 : 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=30",
      // frame-ancestors *: cualquier página la puede mostrar en un iframe. Y
      // nada de X-Frame-Options (si lo trajera, el navegador no la mostraría).
      "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors *",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    },
  });
}
