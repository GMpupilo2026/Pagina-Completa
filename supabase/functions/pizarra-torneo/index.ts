// Edge Function: pizarra-torneo
//
// Las posiciones oficiales de un torneo, leídas de chess-results.com, para la
// pizarra de la sala de cine (transmision.html). Ver «Las posiciones
// oficiales vienen de chess-results» en docs/decisiones/juegos-y-torneos.md.
//
// POR QUÉ UNA FUNCIÓN: chess-results no tiene API ni manda cabeceras CORS, así
// que el navegador no le puede pedir nada. Esto lo pide del lado del servidor.
//
// NO ES UN PROXY ABIERTO: recibe la CLAVE de una sala, no una dirección. Lee
// solo las pizarras que quien administra cargó en esa sala (salas_torneo,
// solo si es visible), y la base ya exige que sean direcciones de
// chess-results.com (interno.pizarras_de_sala_validas). Nadie puede usarla
// para pedirle otra cosa a otro sitio.
//
// CACHÉ: lo leído se guarda en pizarras_cache (solo la ve el service role) y
// se reusa durante FRESCO_MS. Cien personas mirando la sala no son cien
// pedidos a chess-results. Si chess-results falla, se devuelve lo último que
// se leyó, marcado como viejo.
//
// LA PÁGINA QUE SE LEE: art=1 (la clasificación después de la última ronda),
// con turdet=YES (si no, un torneo de más de dos semanas pide tocar «Mostrar
// detalles») y zeilen=99999 (todas las filas, sin cortar). Comprobado con las
// páginas reales del UTN-CONARE 2026 (tnr1498221 y tnr1498218), pedidas desde
// la base con pg_net: la tabla es <table class="CRs1">, el encabezado en una
// fila «CRng1b» (o «CRg1b») y cada jugador en «CRng1»/«CRng2» (o sin la «n»),
// a veces con otra clase pegada («CRng2 CRC»). Las columnas no son siempre las
// mismas —ese torneo no trae «Pts.»: los puntos son el «Des 1», como dice la
// «Anotación» de abajo—, así que se leen por el nombre del encabezado.
//
// verify_jwt en true: la llama la página pública con la clave anónima.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FRESCO_MS = 90_000;
const MAX_FILAS = 500;
const CR_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Datos públicos y de solo lectura: cualquier origen puede leerlos (la vista
// previa de Cloudflare también, no solo ajedrez-integral.com).
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// ------------------------------------------------------------- el HTML

function texto(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&frac12;/g, "½")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function celdas(filaHtml: string): string[] {
  const out: string[] = [];
  const re = /<t([dh])\b[^>]*>([\s\S]*?)<\/t\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(filaHtml))) out.push(m[2]);
  return out;
}

// «1,5» → «1½», «0,5» → «½», «3» → «3». Lo que no tenga esa forma, tal cual.
function puntos(t: string): string {
  const m = t.match(/^(\d+)(?:[.,](\d+))?$/);
  if (!m) return t;
  const entero = Number(m[1]);
  if (!m[2] || Number(m[2]) === 0) return String(entero);
  if (m[2] === "5") return entero ? entero + "½" : "½";
  return t;
}

interface Fila {
  puesto: string; titulo: string; nombre: string; fed: string; elo: string; club: string; puntos: string; desempates: string[];
}

export function leerClasificacion(html: string) {
  const torneoM = html.match(/<h2>([\s\S]*?)<\/h2>/i);
  const torneo = torneoM ? texto(torneoM[1]) : "";
  const inicio = html.search(/<table[^>]*class="CRs1"/i);
  if (inicio < 0) return { torneo, ronda: "", desempates: [] as string[], filas: [] as Fila[] };
  const antes = html.slice(0, inicio);
  const h2s = [...antes.matchAll(/<h2>([\s\S]*?)<\/h2>/gi)];
  const ronda = h2s.length > 1 ? texto(h2s[h2s.length - 1][1]) : "";
  const fin = html.indexOf("</table>", inicio);
  const tabla = html.slice(inicio, fin < 0 ? undefined : fin);

  const filas = [...tabla.matchAll(/<tr[^>]*class="([^"]*)"[^>]*>([\s\S]*?)(?=<tr\b|$)/gi)];
  const encabezado = filas.find((f) => /\bCRn?g1b\b/i.test(f[1]));
  const jugadores = filas.filter((f) => /\bCRn?g[12]\b/i.test(f[1]) && !/\bCRn?g1b\b/i.test(f[1]));
  if (!encabezado) return { torneo, ronda, desempates: [], filas: [] };

  const cab = celdas(encabezado[2]).map(texto);
  const col = (...nombres: RegExp[]) => cab.findIndex((c) => nombres.some((n) => n.test(c)));
  const iPuesto = col(/^Rk\.?$/i, /^Pos\.?$/i);
  const iNombre = col(/^Nombre$/i, /^Name$/i);
  const iFed = col(/^FED$/i);
  const iElo = col(/^Elo[NI]?$/i, /^Rtg$/i);
  const iClub = col(/^Club\/Ciudad$/i, /^Club\/City$/i);
  let iPuntos = col(/^Pts\.?$/i, /^Ptos\.?$/i, /^Puntos$/i);

  // «Desempate 1: points (game-points)» — el nombre de cada «Des N».
  const nota: Record<string, string> = {};
  for (const m of html.matchAll(/(?:Desempate|Tie Break)\s*(\d+):\s*([^<]+)/gi)) nota[m[1]] = texto(m[2]);
  const des = cab.map((c, i) => ({ i, n: (c.match(/^(?:Des|TB)\s*(\d+)$/i) || [])[1] })).filter((d) => d.n);
  if (iPuntos < 0) {
    const dePuntos = des.find((d) => /^points\b|^puntos\b/i.test(nota[d.n!] || ""));
    if (dePuntos) iPuntos = dePuntos.i;
  }
  const otros = des.filter((d) => d.i !== iPuntos);

  const out: Fila[] = jugadores.slice(0, MAX_FILAS).map((f) => {
    const c = celdas(f[2]).map(texto);
    return {
      puesto: iPuesto >= 0 ? c[iPuesto] || "" : "",
      titulo: iNombre > 0 && !cab[iNombre - 1] ? c[iNombre - 1] || "" : "",
      nombre: iNombre >= 0 ? c[iNombre] || "" : "",
      fed: iFed >= 0 ? c[iFed] || "" : "",
      elo: iElo >= 0 ? c[iElo] || "" : "",
      club: iClub >= 0 ? c[iClub] || "" : "",
      puntos: iPuntos >= 0 ? puntos(c[iPuntos] || "") : "",
      desempates: otros.map((d) => c[d.i] || ""),
    };
  }).filter((f) => f.nombre);

  return { torneo, ronda, desempates: otros.map((d) => (nota[d.n!] || "Desempate " + d.n).replace(/\s*\(.*$/, "")), filas: out };
}

// La dirección que se lee y la que se le muestra a la gente, a partir de lo
// que cargó administración (que la base ya validó que es de chess-results).
function direcciones(url: string) {
  const u = new URL(url);
  if (!/^(s\d{1,2}\.)?chess-results\.com$/.test(u.hostname)) throw new Error("no es chess-results");
  const tnr = (u.pathname.match(/^\/tnr(\d{1,9})\.aspx$/) || [])[1];
  if (!tnr) throw new Error("sin número de torneo");
  const base = "https://" + u.hostname + "/tnr" + tnr + ".aspx?lan=2&art=1&turdet=YES";
  return { leer: base + "&zeilen=99999", ver: base };
}

// ------------------------------------------------------------- la función

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Solo POST." }, 405);

  let clave = "";
  try { clave = String((await req.json()).clave || ""); } catch { /* sin cuerpo */ }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(clave) || clave.length > 40) return json({ error: "Falta la clave de la sala." }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: sala, error } = await admin.from("salas_torneo").select("pizarras").eq("clave", clave).eq("visible", true).maybeSingle();
  if (error) return json({ error: "No se pudo leer la sala." }, 500);
  if (!sala) return json({ error: "Esa sala no existe o no está publicada." }, 404);

  const pizarras = Array.isArray(sala.pizarras) ? sala.pizarras : [];
  const salida = await Promise.all(pizarras.map(async (p: { titulo: string; url: string }) => {
    let dir;
    try { dir = direcciones(p.url); } catch { return { titulo: p.titulo, error: "La dirección de esta pizarra no es de chess-results." }; }
    const { data: guardado } = await admin.from("pizarras_cache").select("datos, leido_en").eq("url", dir.leer).maybeSingle();
    if (guardado && Date.now() - new Date(guardado.leido_en).getTime() < FRESCO_MS) {
      return { titulo: p.titulo, url: dir.ver, leido_en: guardado.leido_en, ...guardado.datos };
    }
    try {
      const res = await fetch(dir.leer, { headers: { "User-Agent": CR_USER_AGENT }, signal: AbortSignal.timeout(12_000) });
      if (!res.ok) throw new Error("chess-results respondió " + res.status);
      const datos = leerClasificacion(await res.text());
      const leido_en = new Date().toISOString();
      await admin.from("pizarras_cache").upsert({ url: dir.leer, datos, leido_en });
      return { titulo: p.titulo, url: dir.ver, leido_en, ...datos };
    } catch (e) {
      console.error("pizarra-torneo:", dir.leer, e);
      if (guardado) return { titulo: p.titulo, url: dir.ver, leido_en: guardado.leido_en, viejo: true, ...guardado.datos };
      return { titulo: p.titulo, url: dir.ver, error: "No se pudo leer chess-results ahora mismo." };
    }
  }));

  return json({ pizarras: salida });
});
