// Edge Function: sala-jugadores
//
// Los jugadores de un torneo y la ronda que se está jugando, leídos de
// chess-results.com, para «Busca a tu jugador» y el medallero de
// centroamericano-2026.html. Ver «Busca a tu jugador y el medallero» en
// docs/decisiones/juegos-y-torneos.md.
//
// POR QUÉ UNA FUNCIÓN: chess-results no tiene API ni manda cabeceras CORS, así
// que el navegador no le puede pedir nada. Esto lo pide del lado del servidor.
//
// NO ES UN PROXY ABIERTO: recibe la CLAVE de una sala (salas_torneo, solo si
// es visible), no una dirección. Lee solo los torneos de chess-results que esa
// sala ya tiene entre sus enlaces —los que edita quien administra en
// admin.html#torneos—, y de cada uno solo dos páginas fijas: la clasificación
// (art=1) y la ronda emparejada más reciente (art=2). Nadie puede usarla para
// pedirle otra cosa a otro sitio.
//
// CACHÉ: lo leído se guarda en pizarras_cache (solo la ve el service role),
// por dirección, y se reusa durante FRESCO_MS. Si chess-results falla, se
// devuelve lo último que se leyó, marcado como viejo.
//
// LO QUE SE LEE (comprobado con las páginas reales, pedidas desde la base con
// pg_net):
//   - art=1 (tnr1494141, la lista del Centroamericano): <table class="CRs1">,
//     encabezado «Rk. | No.Ini. | | Nombre | sexo | Gr | FED | Elo | Pts. |
//     Des 1…» y «Clasificación después de la ronda N» en un <h2>. El grupo
//     («Gr»: U08, U08F… U18F) es la categoría.
//   - art=2 (tnr1498221, UTN-CONARE 2026, ronda 1): encabezado «M. | No. | |
//     (título) | White | Elo | Club/Ciudad | Pts. | Resultado | Pts. |
//     (título) | Black | Elo | Club/Ciudad | | No.», y el bye con «bye» en
//     lugar de las negras. Las columnas se leen por posición relativa a
//     «White» y «Black», que en ese encabezado van en <td> y no en <th>.
//
// verify_jwt en true: la llama la página pública con la clave anónima.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FRESCO_MS = 90_000;
const MAX_JUGADORES = 1500;
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

// La federación de una celda con bandera: <div class="tn_CRC"> → «CRC».
function bandera(celda: string): string {
  return (celda.match(/class="tn_([A-Z]{3})"/) || [])[1] || "";
}

// «1,5» → «1½», «0,5» → «½», «3» → «3».
function puntos(t: string): string {
  const m = t.match(/^(\d+)(?:[.,](\d+))?$/);
  if (!m) return t;
  const entero = Number(m[1]);
  if (!m[2] || Number(m[2]) === 0) return String(entero);
  if (m[2] === "5") return entero ? entero + "½" : "½";
  return t;
}

function tablaCRs1(html: string) {
  const inicio = html.search(/<table[^>]*class="CRs1"/i);
  if (inicio < 0) return null;
  const fin = html.indexOf("</table>", inicio);
  const tabla = html.slice(inicio, fin < 0 ? undefined : fin);
  const filas = [...tabla.matchAll(/<tr[^>]*class="([^"]*)"[^>]*>([\s\S]*?)(?=<tr\b|$)/gi)];
  const encabezado = filas.find((f) => /\bCRn?g1b\b/i.test(f[1]));
  const datos = filas.filter((f) => /\bCRn?g[12]\b/i.test(f[1]) && !/\bCRn?g1b\b/i.test(f[1]));
  return { antes: html.slice(0, inicio), encabezado: encabezado ? celdas(encabezado[2]).map(texto) : null, datos: datos.map((f) => celdas(f[2])) };
}

// La ronda que dice el último título antes de la tabla: «Clasificación después
// de la ronda 3» (un <h2>) o «Ronda 4 el 2026/11/04 a las 9:00» (un <h3>). Los
// enlaces a las demás rondas van antes y no cuentan.
function rondaDelTitulo(antes: string, etiqueta: string): number {
  const titulos = [...antes.matchAll(new RegExp("<" + etiqueta + "[^>]*>([\\s\\S]*?)</" + etiqueta + ">", "gi"))];
  const ultimo = titulos.length ? texto(titulos[titulos.length - 1][1]) : "";
  return Number((ultimo.match(/(?:ronda|round|rd\.)\s*(\d+)/i) || [])[1] || 0);
}

export function leerClasificacion(html: string) {
  const t = tablaCRs1(html);
  const ronda = rondaDelTitulo(t ? t.antes : "", "h2");
  const rondas = Number((texto(html).match(/(?:N[uú]mero de rondas|Number of rounds)\s+(\d+)/i) || [])[1] || 0);
  if (!t || !t.encabezado) return { ronda, rondas, jugadores: [] };
  const cab = t.encabezado;
  const col = (...nombres: RegExp[]) => cab.findIndex((c) => nombres.some((n) => n.test(c)));
  const iPuesto = col(/^Rk\.?$/i, /^Pos\.?$/i);
  const iNo = col(/^No\.?\s*Ini\.?$/i, /^SNo\.?$/i, /^No\.?$/i);
  const iNombre = col(/^Nombre$/i, /^Name$/i);
  const iFed = col(/^FED$/i);
  const iElo = col(/^Elo[NI]?$/i, /^Rtg$/i);
  const iGrupo = col(/^Gr\.?$/i, /^Grupo$/i, /^Group$/i);
  let iPuntos = col(/^Pts\.?$/i, /^Ptos\.?$/i, /^Puntos$/i);
  if (iPuntos < 0) iPuntos = col(/^(?:Des|TB)\s*1$/i);
  const jugadores = t.datos.slice(0, MAX_JUGADORES).map((c) => {
    const v = c.map(texto);
    return {
      puesto: Number(iPuesto >= 0 ? v[iPuesto] : 0) || 0,
      no: Number(iNo >= 0 ? v[iNo] : 0) || 0,
      titulo: iNombre > 0 && !cab[iNombre - 1] ? v[iNombre - 1] || "" : "",
      nombre: iNombre >= 0 ? v[iNombre] || "" : "",
      fed: iFed >= 0 ? v[iFed] || bandera(c[iFed] || "") : "",
      elo: Number(iElo >= 0 ? v[iElo] : 0) || 0,
      grupo: iGrupo >= 0 ? v[iGrupo] || "" : "",
      puntos: iPuntos >= 0 ? puntos(v[iPuntos] || "") : "",
    };
  }).filter((j) => j.nombre && j.no);
  return { ronda, rondas, jugadores };
}

export function leerRonda(html: string) {
  const t = tablaCRs1(html);
  const ronda = rondaDelTitulo(t ? t.antes : "", "h3");
  if (!t || !t.encabezado) return { ronda, mesas: [] };
  const cab = t.encabezado;
  const iB = cab.findIndex((c) => /^(White|Blancas)$/i.test(c));
  const iN = cab.findIndex((c) => /^(Black|Negras)$/i.test(c));
  const iMesa = cab.findIndex((c) => /^(M\.|Mesa|Bo\.)$/i.test(c));
  const iRes = cab.findIndex((c) => /^(Resultado|Result)$/i.test(c));
  if (iB < 0 || iN < 0 || iRes < 0) return { ronda, mesas: [] };
  const mesas = t.datos.map((c) => {
    const v = c.map(texto);
    const bye = /^bye$/i.test(v[iN] || "") || /^bye$/i.test(v[iN - 1] || "");
    // Una fila con bye tiene una celda de menos (el resultado ocupa dos): las
    // negras se buscan por el texto «bye», no por la posición.
    return {
      mesa: Number(v[iMesa >= 0 ? iMesa : 0]) || 0,
      blancas: { no: Number(v[1]) || 0, titulo: v[iB - 1] || "", nombre: v[iB] || "" },
      negras: bye ? null : { no: Number(v[v.length - 1]) || 0, titulo: v[iN - 1] || "", nombre: v[iN] || "" },
      resultado: bye ? "bye" : (v[iRes] || "").replace(/\s+/g, " "),
    };
  }).filter((m) => m.blancas.nombre);
  return { ronda, mesas };
}

// El torneo (su número) a partir de un enlace de la sala, si es de chess-results.
function torneoDe(url: string) {
  try {
    const u = new URL(url);
    if (!/^(s\d{1,2}\.)?chess-results\.com$/.test(u.hostname)) return null;
    const tnr = (u.pathname.match(/^\/tnr(\d{1,9})\.aspx$/) || [])[1];
    return tnr ? { tnr, host: u.hostname } : null;
  } catch { return null; }
}

// ------------------------------------------------------------- la función

type Admin = ReturnType<typeof createClient>;

async function leer(admin: Admin, url: string, leerHtml: (h: string) => unknown) {
  const { data: guardado } = await admin.from("pizarras_cache").select("datos, leido_en").eq("url", url).maybeSingle();
  if (guardado && Date.now() - new Date(guardado.leido_en as string).getTime() < FRESCO_MS) {
    return { leido_en: guardado.leido_en, datos: guardado.datos };
  }
  try {
    const res = await fetch(url, { headers: { "User-Agent": CR_USER_AGENT }, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) throw new Error("chess-results respondió " + res.status);
    const datos = leerHtml(await res.text());
    const leido_en = new Date().toISOString();
    await admin.from("pizarras_cache").upsert({ url, datos, leido_en });
    return { leido_en, datos };
  } catch (e) {
    console.error("sala-jugadores:", url, e);
    if (guardado) return { leido_en: guardado.leido_en, datos: guardado.datos, viejo: true };
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Solo POST." }, 405);

  let clave = "";
  try { clave = String((await req.json()).clave || ""); } catch { /* sin cuerpo */ }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(clave) || clave.length > 40) return json({ error: "Falta la clave de la sala." }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: sala, error } = await admin.from("salas_torneo").select("enlaces").eq("clave", clave).eq("visible", true).maybeSingle();
  if (error) return json({ error: "No se pudo leer la sala." }, 500);
  if (!sala) return json({ error: "Esa sala no existe o no está publicada." }, 404);

  const enlaces = Array.isArray(sala.enlaces) ? sala.enlaces : [];
  const vistos = new Set<string>();
  const torneos = enlaces.map((e: { url: string }) => torneoDe(e && e.url)).filter((t: { tnr: string } | null) => t && !vistos.has(t.tnr) && vistos.add(t.tnr)).slice(0, 15);

  const salida = await Promise.all(torneos.map(async (t: { tnr: string; host: string }) => {
    const base = "https://" + t.host + "/tnr" + t.tnr + ".aspx?lan=2&turdet=YES";
    const [clasif, ronda] = await Promise.all([
      leer(admin, base + "&art=1&zeilen=99999", leerClasificacion),
      leer(admin, base + "&art=2", leerRonda),
    ]);
    if (!clasif) return { tnr: t.tnr, url: base + "&art=1", error: "No se pudo leer chess-results ahora mismo." };
    return {
      tnr: t.tnr,
      url: base + "&art=1",
      leido_en: clasif.leido_en,
      viejo: !!(clasif.viejo || (ronda && ronda.viejo)),
      ...(clasif.datos as object),
      pareo: ronda ? ronda.datos : null,
    };
  }));

  return json({ torneos: salida });
});
