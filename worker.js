// Worker que protege de verdad el contenido completo de los cursos.
//
// El sitio sigue siendo estático (Cloudflare Workers Assets), pero este script
// se ejecuta antes de servir los archivos y bloquea, en el servidor, dos
// cosas que antes solo se ocultaban con CSS/JS en el navegador:
//   1. Los fragmentos de contenido completo de cada lección
//      (cursos/protegido/<curso>.html).
//   2. Las presentaciones y PDF de ejercicios (cursos/recursos/**).
//
// Sin la cookie firmada que solo se entrega tras enviar la contraseña
// correcta a /api/curso-auth, esas rutas responden 403 y el archivo real
// nunca sale del servidor (a diferencia del esquema anterior, donde el
// HTML completo ya viajaba al navegador y solo se ocultaba visualmente).
//
// Requiere una variable de entorno secreta COURSE_PASSWORD configurada en
// el Worker (Cloudflare dashboard → orange-water-b162 → Settings →
// Variables and Secrets, o `wrangler secret put COURSE_PASSWORD`). Sin ese
// secreto configurado, /api/curso-auth rechaza cualquier contraseña.

const COOKIE_NAME = "curso_ok";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 60; // 60 días
const SIGN_PAYLOAD = "course-unlocked-v1";

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

function isProtectedPath(pathname) {
  return pathname.startsWith("/cursos/protegido/") || pathname.startsWith("/cursos/recursos/");
}

async function handleAuth(request, env) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  let password = "";
  try {
    const body = await request.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch (e) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  if (!env.COURSE_PASSWORD || !timingSafeEqual(password, env.COURSE_PASSWORD)) {
    return Response.json({ ok: false, error: "wrong_password" }, { status: 401 });
  }

  const token = await hmacHex(env.COURSE_PASSWORD, SIGN_PAYLOAD);
  const cookie = [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    `Max-Age=${COOKIE_MAX_AGE}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": cookie },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/curso-auth") {
      return handleAuth(request, env);
    }

    if (isProtectedPath(url.pathname)) {
      if (!(await hasValidCookie(request, env))) {
        return new Response("Contenido bloqueado por contraseña.", {
          status: 403,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    }

    return env.ASSETS.fetch(request);
  },
};
