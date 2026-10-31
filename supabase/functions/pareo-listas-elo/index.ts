// Edge Function: pareo-listas-elo (verify_jwt en false)
//
// «Agregar desde una lista de Elo» de Pareo Integral (pareo.html): quien
// organiza escribe un nombre (o un código FIDE), elige la lista —FIDE
// Estándar, Rápido o Blitz, o el Elo Nacional de Costa Rica— y agrega al
// jugador con un clic, con el Elo de esa lista, su título, su federación y su
// código FIDE. Las dos páginas que tienen esos datos no dejan que el
// navegador las lea (ratings.fide.com y ajedrezcostarica.com no mandan CORS),
// así que las lee esta función y devuelve las filas.
//
// Las tres listas de FIDE salen de la MISMA búsqueda (el buscador de FIDE trae
// Std., Rpd. y Blz. en cada fila): el navegador elige cuál de los tres usa.
//
// Se manda SOLO lo que se escribió en el buscador y no se guarda nada: ni
// cuenta, ni tabla de lo buscado, ni bitácora. Lo único que queda es la
// marca del freno (`pareo_listas_frenar`), con la IP, que se borra sola a
// los dos días como la de todos los envíos públicos.
//
// NUNCA SE INVENTA UN NÚMERO: un Elo de 0, «Not rated» o una celda vacía es
// null, y si la página cambió su HTML vuelve una lista vacía, no una
// adivinada (ver leer-listas.ts y herramientas/verificar-pareo-listas-elo.js).
//
// Ver «Pareo Integral: agregar jugadores desde las listas de Elo» en
// docs/decisiones/juegos-y-torneos.md.

import { createClient } from "npm:@supabase/supabase-js@2";
import { leerBusquedaFide, leerListaNacionalCompleta, type FilaLista } from "./leer-listas.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = "https://ajedrez-integral.com";
const FIDE = "https://ratings.fide.com/incl_search_l.php";
const NACIONAL = "https://ajedrezcostarica.com/es/national-rating";
const MAX_FILAS = 60;   // lo que se muestra; si hay más, que escriba más del nombre

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": SITE_URL,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ipDe(req: Request): string | null {
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ??
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0];
  return ip?.trim() || null;
}

async function traer(url: string, cabeceras: Record<string, string>): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "AjedrezIntegral/1.0 (+https://ajedrez-integral.com)", ...cabeceras },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: "Cuerpo JSON inválido" }, 400); }

  const lista = body.lista === "nacional" ? "nacional" : body.lista === "fide" ? "fide" : null;
  if (!lista) return json({ ok: false, error: "Elige una lista." }, 400);
  // Letras (con tildes), números, espacios, coma, punto, apóstrofo y guion:
  // lo que puede llevar un nombre o un código FIDE. Nada más viaja.
  const q = String(body.q ?? "").replace(/\s+/g, " ").trim();
  if (q.length < 3 || q.length > 60 || !/^[\p{L}\d ,.'-]+$/u.test(q)) {
    return json({ ok: false, error: "Escribe al menos 3 letras del nombre o el código FIDE." }, 400);
  }

  const { data: freno, error: frenoError } = await admin.rpc("pareo_listas_frenar", { p_ip: ipDe(req) });
  if (frenoError) return json({ ok: false, error: "No se pudo buscar en la lista. Intenta de nuevo." }, 502);
  if (freno) return json({ ok: false, error: freno }, 429);

  let filas: FilaLista[];
  let total: number | null;
  let periodo: string | null;
  if (lista === "fide") {
    const html = await traer(`${FIDE}?search=${encodeURIComponent(q)}&simple=1`, {
      "Accept": "text/html", "X-Requested-With": "XMLHttpRequest", "Referer": "https://ratings.fide.com/",
    });
    if (html === null) return json({ ok: false, error: "FIDE no contestó. Intenta de nuevo en un rato." }, 502);
    ({ filas, total, periodo } = leerBusquedaFide(html));
  } else {
    const html = await traer(`${NACIONAL}?name=${encodeURIComponent(q)}`, { "Accept": "text/html" });
    if (html === null) return json({ ok: false, error: "ajedrezcostarica.com no contestó. Intenta de nuevo en un rato." }, 502);
    ({ filas, total, periodo } = leerListaNacionalCompleta(html));
  }

  return json({
    ok: true,
    lista,
    filas: filas.slice(0, MAX_FILAS),
    total: total ?? filas.length,
    hayMas: (total ?? filas.length) > Math.min(filas.length, MAX_FILAS),
    periodo,
  });
});
