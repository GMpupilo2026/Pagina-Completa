// Worker del sitio (Cloudflare Workers Assets).
//
// Desde septiembre de 2026 los cursos son ABIERTOS: cualquier visitante ve el
// temario, el contenido completo de las lecciones (cursos/protegido/<curso>.html,
// la carpeta conserva el nombre por historia), las presentaciones y los PDF
// (cursos/recursos/**) sin iniciar sesión ni clave. Este Worker ya no bloquea
// ninguna ruta de cursos: sólo agrega las cabeceras de seguridad a las
// respuestas que arma a mano.
//
// Se conserva /api/curso-auth-session (canjea una sesión de Academia por la
// cookie firmada `curso_ok`) por compatibilidad con navegadores que aún tengan
// la cookie o con enlaces viejos; ya no condiciona nada. COURSE_PASSWORD sigue
// existiendo sólo como llave interna para firmar esa cookie.
//
// wrangler.jsonc mantiene "run_worker_first" para /cursos/* y /api/*: así las
// respuestas de esas rutas siguen pasando por aquí (cabeceras) y, si algún día
// vuelve a hacer falta restringir algo, el punto de entrada ya existe.

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


async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
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

    // Cursos abiertos: cursos/protegido/** y cursos/recursos/** se sirven a todos.
    return env.ASSETS.fetch(request);
  },
};
