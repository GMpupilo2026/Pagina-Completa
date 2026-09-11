// Worker que protege de verdad el contenido de los cursos.
//
// El sitio sigue siendo estático (Cloudflare Workers Assets), pero este script
// se ejecuta antes de servir los archivos y bloquea, en el servidor, lo que
// antes solo se ocultaba con CSS/JS en el navegador:
//   1. Las páginas de curso completas — temario incluido —
//      (cursos/<curso>.html): sin cookie válida, se sirve en su lugar
//      cursos/bloqueado.html (misma URL, sin redirección), que comprueba la
//      sesión de Academia (Supabase) y, si existe, la canjea por la cookie
//      automáticamente — sin pedir nada al alumno.
//   2. Los fragmentos de contenido completo de cada lección
//      (cursos/protegido/<curso>.html).
//   3. Las presentaciones y PDF de ejercicios (cursos/recursos/**).
//
// El acceso a los cursos ya no usa una contraseña compartida aparte: ahora
// basta con tener una sesión válida de Academia (la misma cuenta de Clases).
// /api/curso-auth-session recibe el access_token de esa sesión, lo verifica
// contra la API de Supabase (GET /auth/v1/user) y, si es válido, entrega la
// misma cookie firmada que antes daba la contraseña — el resto del
// mecanismo (cookie HMAC, cursos/protegido/**, cursos/recursos/**) no
// cambió. La variable de entorno COURSE_PASSWORD ya no se compara con nada
// que escriba un visitante: sigue existiendo solo como llave interna para
// firmar la cookie (así no hace falta dar de alta un secreto nuevo en
// Cloudflare para este cambio).
//
// IMPORTANTE: por defecto, Cloudflare sirve un archivo estático que ya
// existe (como cursos/<curso>.html) directamente desde su CDN de assets,
// SIN pasar por este Worker — este fetch() nunca se ejecuta para esas rutas
// salvo que wrangler.jsonc declare "run_worker_first" para ellas. Ver ahí
// el arreglo (bug real detectado: el bloqueo no se aplicaba en producción
// porque faltaba esa opción).

const COOKIE_NAME = "curso_ok";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 60; // 60 días
const SIGN_PAYLOAD = "course-unlocked-v1";

// Mismos valores públicos que usa el cliente (js/supabase-client.js) — la
// "anon key" está pensada para ser pública, el acceso real lo decide RLS del
// lado de Supabase. Se repiten aquí porque el Worker no comparte entorno con
// el navegador.
const SUPABASE_URL = "https://bgtijpimpcokxatxxbki.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJndGlqcGltcGNva3hhdHh4YmtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5ODczMjksImV4cCI6MjEwNDU2MzMyOX0.h-AcAEQNaYMVo5UVtdWqUCTYgiSLFKDgXsn3lnbAhmQ";

// El archivo _headers de la raíz del sitio (CSP, HSTS, X-Frame-Options, etc.) solo lo
// aplica Cloudflare a las respuestas que pasan por env.ASSETS.fetch() — es decir, a los
// archivos estáticos. Cualquier Response que este Worker arme a mano (como las de
// /api/curso-auth, el endpoint más sensible del sitio, o el 403 de contenido protegido)
// las esquiva por completo y salía sin ninguna de esas cabeceras. Se repiten aquí,
// calcadas de _headers, para que TODA respuesta del sitio las lleve sin excepción.
const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://bgtijpimpcokxatxxbki.supabase.co wss://bgtijpimpcokxatxxbki.supabase.co https://prcfbzvshnusisczlpxl.supabase.co wss://prcfbzvshnusisczlpxl.supabase.co https://ajedrez-inscripciones.gmpupilo.workers.dev https://api.hacienda.go.cr https://lichess.org; frame-src https://challenges.cloudflare.com https://lichess.org https://www.youtube-nocookie.com https://player.twitch.tv; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Cross-Origin-Opener-Policy": "same-origin",
};

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const bufA = enc.encode(String(a ?? ""));
  const bufB = enc.encode(String(b ?? ""));
  const len = Math.max(bufA.length, bufB.length, 1);
  let mismatch = bufA.length === bufB.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    mismatch |= (bufA[i] || 0) ^ (bufB[i] || 0);
  }
  return mismatch === 0;
}

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}

async function hasValidCookie(request, env) {
  if (!env.COURSE_PASSWORD) return false;
  const cookie = getCookie(request, COOKIE_NAME);
  if (!cookie) return false;
  const expected = await hmacHex(env.COURSE_PASSWORD, SIGN_PAYLOAD);
  return timingSafeEqual(cookie, expected);
}

// cursos/protegido/** (contenido completo) y cursos/recursos/** (pptx/pdf):
// sin cookie válida, responden 403 directamente.
function isProtectedPath(pathname) {
  return pathname.startsWith("/cursos/protegido/") || pathname.startsWith("/cursos/recursos/");
}

// Página de curso completa: cursos/<algo>.html, salvo la propia pantalla de
// bloqueo. Sin cookie válida, no se le da 403: se le sirve cursos/bloqueado.html
// en su lugar (misma URL) para que pueda ver el formulario de contraseña.
const COURSE_PAGE_RE = /^\/cursos\/(?!bloqueado\.html$)[^/]+\.html$/;
function isCoursePage(pathname) {
  return COURSE_PAGE_RE.test(pathname);
}

function unlockCookieHeader() {
  return [
    // NOTA: el token se calcula donde se usa (necesita await), esta función
    // solo arma las demás partes de la cabecera Set-Cookie.
    "Path=/",
    `Max-Age=${COOKIE_MAX_AGE}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

// Verifica un access_token de Supabase contra la propia API de Supabase
// (GET /auth/v1/user) — así el Worker no necesita conocer el secreto de
// firma de los JWT de Supabase, solo confirma con Supabase mismo que el
// token es válido y a quién pertenece. Cualquier cuenta de Academia con
// sesión iniciada cuenta: no hace falta un rol específico para leer cursos.
async function verifySupabaseSession(accessToken) {
  if (!accessToken || typeof accessToken !== "string") return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
    });
    if (!res.ok) return false;
    const user = await res.json();
    return !!(user && user.id);
  } catch (e) {
    return false;
  }
}

async function handleSessionAuth(request, env) {
  if (request.method !== "POST") {
    return withSecurityHeaders(new Response("Method Not Allowed", { status: 405 }));
  }
  let accessToken = "";
  try {
    const body = await request.json();
    accessToken = typeof body?.access_token === "string" ? body.access_token : "";
  } catch (e) {
    return withSecurityHeaders(Response.json({ ok: false, error: "bad_request" }, { status: 400 }));
  }

  if (!env.COURSE_PASSWORD || !(await verifySupabaseSession(accessToken))) {
    return withSecurityHeaders(Response.json({ ok: false, error: "no_session" }, { status: 401 }));
  }

  const token = await hmacHex(env.COURSE_PASSWORD, SIGN_PAYLOAD);
  const cookie = `${COOKIE_NAME}=${token}; ${unlockCookieHeader()}`;

  const response = withSecurityHeaders(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  response.headers.set("Content-Type", "application/json");
  response.headers.set("Set-Cookie", cookie);
  return response;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/curso-auth-session") {
      return handleSessionAuth(request, env);
    }

    if (isProtectedPath(url.pathname)) {
      if (!(await hasValidCookie(request, env))) {
        const response = withSecurityHeaders(new Response("Necesitas iniciar sesión en Academia para ver este contenido.", { status: 403 }));
        response.headers.set("Content-Type", "text/plain; charset=utf-8");
        return response;
      }
      return env.ASSETS.fetch(request);
    }

    if (isCoursePage(url.pathname) && !(await hasValidCookie(request, env))) {
      // No hay cookie válida: en vez de la página real del curso, se sirve
      // cursos/bloqueado.html manteniendo la URL original en la barra de
      // direcciones (sin redirección) para que su JS sepa qué curso mostrar
      // y, tras comprobar la sesión de Academia, recargar esta misma URL.
      //
      // Responde 200, no 403: esto es una navegación normal de página completa
      // (el usuario hizo clic en "Ver temario" o entró por URL), y algunos
      // navegadores reemplazan el cuerpo de una respuesta 4xx a una navegación
      // con su propia pantalla genérica de "acceso denegado" en vez de mostrar
      // el HTML real que mandamos — dejando al usuario sin ver ni el mensaje ni
      // la comprobación de sesión, y con la sensación de haber salido del
      // sitio. Con 200 el navegador siempre renderiza cursos/bloqueado.html tal
      // cual, con su propio header de navegación intacto.
      const lockedUrl = new URL("/cursos/bloqueado.html", url);
      const lockedRequest = new Request(lockedUrl, request);
      const lockedResponse = await env.ASSETS.fetch(lockedRequest);
      return withSecurityHeaders(new Response(lockedResponse.body, { headers: lockedResponse.headers }));
    }

    return env.ASSETS.fetch(request);
  },
};
