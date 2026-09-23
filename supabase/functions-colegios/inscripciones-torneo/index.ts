/* Las inscripciones al torneo en línea (inscripcion.html), para inscripciones.html.
 *
 * Vive en el proyecto "Base de Colegios", que es donde está la tabla — pero
 * quien la consulta tiene su cuenta en el OTRO proyecto, el de la Academia.
 * Esa es toda la razón de que esto exista y de cómo está escrito.
 *
 * LA TABLA NO SE ABRE. `public.inscripciones` tiene RLS y ni una sola política,
 * o sea que desde el navegador no la lee nadie, y así se queda: son cédulas,
 * fechas de nacimiento y teléfonos de menores de edad, y la clave pública de
 * ese proyecto está escrita dentro de inscripcion.html, a la vista de
 * cualquiera. Abrirle la lectura a `anon` sería publicarlas. Acá se leen con la
 * service role, que no sale de esta función.
 *
 * EL PERMISO NO SE COMPRUEBA A MANO, y no se puede comprobar acá aunque se
 * quisiera: el JWT de quien llama lo firmó el proyecto de la Academia, así que
 * este proyecto no lo puede validar (por eso `verify_jwt` va en false). Lo que
 * se hace es reenviárselo a la Academia y preguntarle a ELLA:
 * `public.soy_coordinador()` es SECURITY DEFINER y solo `authenticated` la
 * puede ejecutar, así que devuelve `true` únicamente con una sesión de verdad
 * de alguien que administra o coordina. Un token inventado, vencido o la propia
 * clave anónima dan error, nunca `true`. Es el mismo criterio que cobros.html:
 * esto no es una función de profesor.
 *
 * LOS ARCHIVOS ADJUNTOS viven en el bucket PRIVADO "inscripcion-adjuntos", que
 * nadie puede leer desde el navegador. Para enseñarlos, esta función —ya
 * comprobado el permiso— firma cada ruta por una hora y las devuelve en
 * `firmas`. La página las baja y las pinta como blob:.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/* El proyecto de la Academia. La clave anónima es pública por diseño (está en
 * js/supabase-client.js): acá no da ningún acceso por sí sola, solo sirve para
 * que PostgREST acepte el pedido; lo que decide es el JWT de la persona. */
const ACADEMIA_URL = "https://bgtijpimpcokxatxxbki.supabase.co";
const ACADEMIA_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJndGlqcGltcGNva3hhdHh4YmtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5ODczMjksImV4cCI6MjEwNDU2MzMyOX0.h-AcAEQNaYMVo5UVtdWqUCTYgiSLFKDgXsn3lnbAhmQ";

const BUCKET_ADJUNTOS = "inscripcion-adjuntos";
const FIRMA_SEGUNDOS = 3600;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/* ¿Quien llama administra o coordina en la Academia? Lo contesta la Academia,
 * no esta función. */
async function puedeVer(jwt: string): Promise<boolean> {
  try {
    const res = await fetch(`${ACADEMIA_URL}/rest/v1/rpc/soy_coordinador`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ACADEMIA_ANON,
        Authorization: `Bearer ${jwt}`,
      },
      body: "{}",
    });
    if (!res.ok) return false;
    // Tiene que ser exactamente true. Cualquier otra cosa —null, un objeto de
    // error, un texto— es que no.
    return (await res.json()) === true;
  } catch (_e) {
    return false;
  }
}

/* Firma las rutas de los adjuntos en UN pedido. Si falla, la lista sale igual:
 * las inscripciones importan más que sus archivos, y la página dice «No se
 * pudo abrir» en cada uno en vez de quedarse sin nada. */
async function firmar(url: string, key: string, rutas: string[]): Promise<Record<string, string>> {
  const firmas: Record<string, string> = {};
  if (!rutas.length) return firmas;
  try {
    const res = await fetch(`${url}/storage/v1/object/sign/${BUCKET_ADJUNTOS}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: FIRMA_SEGUNDOS, paths: rutas }),
    });
    if (!res.ok) return firmas;
    const lista = await res.json();
    for (const f of Array.isArray(lista) ? lista : []) {
      if (f && f.path && f.signedURL && !f.error) firmas[f.path] = `${url}/storage/v1${f.signedURL}`;
    }
  } catch (_e) { /* sin firmas: la página lo dice por archivo */ }
  return firmas;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const auth = req.headers.get("Authorization") || "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!jwt) return json({ error: "Falta la sesión." }, 401);
  if (!(await puedeVer(jwt))) {
    return json({ error: "Esta lista es solo para quien administra o coordina." }, 403);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "Falta la configuración del proyecto." }, 500);

  /* Se piden de mil en mil: PostgREST corta la respuesta a partir de cierta
   * cantidad de filas y no da ningún error, así que un solo pedido devolvería
   * una lista incompleta sin que nadie se entere. */
  const PASO = 1000;
  const filas: Record<string, unknown>[] = [];
  for (let desde = 0; ; desde += PASO) {
    const res = await fetch(
      `${url}/rest/v1/inscripciones?select=*&order=creado_en.desc`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Range: `${desde}-${desde + PASO - 1}`,
          "Range-Unit": "items",
        },
      },
    );
    if (!res.ok) {
      return json({ error: "No se pudo leer las inscripciones: " + (await res.text()) }, 502);
    }
    const pagina = await res.json();
    filas.push(...pagina);
    if (!Array.isArray(pagina) || pagina.length < PASO) break;
  }

  const rutas = filas.flatMap((f) =>
    Array.isArray(f.adjuntos) ? (f.adjuntos as unknown[]).filter((r): r is string => typeof r === "string") : []);
  const firmas = await firmar(url, key, rutas);

  return json({ inscripciones: filas, firmas });
});
