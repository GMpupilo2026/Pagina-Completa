// Edge Function: pareo-dgt
//
// El pareo de una ronda de un torneo de chess-results.com, para «Pareo para
// DGT» (pareo-dgt.html): la página arma con él el PGN que se importa en DGT
// LiveChess y las rondas de la transmisión de Lichess. Ver «Pareo para DGT» en
// docs/decisiones/juegos-y-torneos.md.
//
// POR QUÉ UNA FUNCIÓN: chess-results no tiene API ni manda cabeceras CORS, así
// que el navegador no le puede pedir nada. Esto lo pide del lado del servidor.
//
// SOLO CON LICENCIA, como las demás herramientas de arbitraje (ver
// «Herramientas de arbitraje» en docs/decisiones/juegos-y-torneos.md): se
// pregunta a la base `tengo_herramienta('pareo-dgt')` CON EL TOKEN DE QUIEN
// LLAMA (clave anónima + su Authorization), no con la de servicio, así que
// pasa por antes_de_cada_pedido() y la verificación en dos pasos la exige la
// base. Quien administra la tiene sin licencia. La función recibe un número
// de torneo cualquiera (no la clave de una sala, como sala-jugadores): sin
// candado sería un raspador de chess-results gratis para cualquiera. Y de
// cada torneo pide solo dos páginas fijas: la lista inicial (art=0) y el
// pareo de una ronda (art=2), siempre en s3.chess-results.com.
//
// CACHÉ: lo leído se guarda en pizarras_cache (solo la ve el service role),
// por dirección: el pareo FRESCO_PAREO_MS y la lista FRESCO_LISTA_MS. La
// página vuelve a preguntar cada 30 s mientras vigila, varios torneos a la
// vez: sin caché, cada pestaña abierta serían dos pedidos a chess-results por
// torneo cada 30 s. Si chess-results falla, se devuelve lo último que se
// leyó, marcado como viejo.
//
// LO QUE SE LEE (comprobado con las páginas reales de tnr1498221, UTN-CONARE
// 2026 femenino, pedidas desde la sesión de Claude Code el 29/10/2026):
//   - art=2 (sin rd: la última ronda emparejada; con rd: esa): un <h2> con el
//     nombre del torneo, otro «Emparejamientos/Resultados» y un <h3> «3. Ronda
//     el 2026/09/27 a las 11:00am». La tabla <table class="CRs1"> con el
//     encabezado «M. | No. | | (título) | White | Elo | Club/Ciudad | Pts. |
//     Resultado | Pts. | (título) | Black | Elo | Club/Ciudad | | No.» («White»
//     y «Black» van en <td>, no en <th>). La fila de quien no juega trae una
//     celda de menos y «sin emparejar» (o «bye») en lugar de las negras; esa
//     fila además trae un <td & colsp & …> mal escrito, que el lector aguanta.
//   - art=0: «No. | | (título) | Nombre | FIDE-ID | FED | EloN | Club/Ciudad»,
//     el FIDE-ID dentro de un enlace a ratings.fide.com.
//
//   - La ficha del torneo (control de tiempo, lugar, federación, número de
//     rondas) sale de la MISMA página art=2, de las filas de dos celdas
//     «<td class="CR">Lugar</td><td class="CR">…</td>» (comprobado el 29/10/2026
//     con torneos en curso: Costa Rica, Malasia y Vietnam). Cada fila es
//     opcional, y de un torneo que terminó hace más de dos semanas
//     chess-results no la muestra sin el botón «Mostrar detalles del torneo»:
//     ahí la ficha sale vacía y la página se queda con la que ya tenía. Sirve
//     para la tarjeta «Datos para LiveChess».
//
// LICHESS (body.accion = "lichess"): crear el torneo de la transmisión
// (POST /broadcast/new) y cada ronda (POST /broadcast/{id}/new). Esas dos
// direcciones de Lichess no están bajo /api/ y no contestan la consulta previa
// de CORS (el OPTIONS da 403): desde el navegador fallan con «Failed to fetch»
// (lo vio el dueño el 29/10, con los cuatro torneos del Festival). Por eso las
// hace esta función: recibe el token de Lichess de quien organiza, lo usa
// para ESE pedido y no lo guarda ni lo anota en ningún lado. Solo esas dos
// rutas, solo a lichess.org y solo con licencia. Lo demás de Lichess (la
// cuenta, empujar el pareo: /api/…) sigue yendo directo del navegador.
//   { accion: "lichess", token: "lip_…", ruta: "/broadcast/new" | "/broadcast/<8>/new",
//     form: [[campo, valor], …] } → { status, datos } (lo que contestó Lichess)
//
// Body: { tnr: "1498221" | "https://…chess-results.com/tnr1498221.aspx…", rd?: 1..99 }
// Respuesta: { tnr, url, torneo, ficha: { control, lugar, pais, rondas }, ronda, fecha, hora, mesas: [{ mesa,
//   blancas: { no, titulo, nombre, elo, club, fide, fed }, negras: … | null,
//   sinRival: "" | "bye" | "sin emparejar" | …, resultado }], leido_en, viejo? }

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const HERRAMIENTA = "pareo-dgt";
const SITE_URL = "https://ajedrez-integral.com";
const CR_BASE = "https://s3.chess-results.com";
const FRESCO_PAREO_MS = 20_000;
const FRESCO_LISTA_MS = 120_000;
const MAX_MESAS = 500;
const CR_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const corsHeaders = {
  "Access-Control-Allow-Origin": SITE_URL,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

// «Federación» es la que organiza: casi siempre un país («Costa Rica ( CRC )»),
// pero un torneo continental trae su confederación («Confederation of Chess for
// Americas ( CCA )», comprobado el 29/10/2026 con el torneo de Costa Rica
// tnr1529729). Eso no es el país de LiveChess: se deja vacío.
const NO_ES_PAIS = /confedera|continental|\b(zone|zona|union|unión|association|asociaci[óo]n|federation of|federaci[óo]n de)\b/i;

// La ficha del torneo: filas de dos celdas, cada una con su nombre. Solo las
// que LiveChess pide en su pestaña «Tournament»; la primera de cada una.
export function leerFicha(html: string) {
  const ficha = { control: "", lugar: "", pais: "", rondas: 0 };
  for (const m of html.matchAll(/<tr[^>]*>\s*<td[^>]*>([\s\S]{1,200}?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi)) {
    const nombre = texto(m[1]);
    const valor = texto(m[2]);
    if (!valor || valor === "-") continue;
    if (!ficha.control && /^(Control de tiempo|Time control)\b/i.test(nombre)) ficha.control = valor.slice(0, 120);
    else if (!ficha.lugar && /^(Lugar|Location)$/i.test(nombre)) ficha.lugar = valor.slice(0, 160);
    else if (!ficha.pais && /^(Federaci[óo]n|Federation)$/i.test(nombre) && !NO_ES_PAIS.test(valor)) ficha.pais = valor.replace(/\s*\(\s*[A-Z]{3}\s*\)\s*$/, "").slice(0, 80);
    else if (!ficha.rondas && /^(N[úu]mero de rondas|Number of rounds)$/i.test(nombre)) ficha.rondas = Number(valor) || 0;
  }
  return ficha;
}

// Lo que dice chess-results en lugar de las negras cuando nadie juega.
const SIN_RIVAL = /^(bye|sin emparejar|not paired|spielfrei|libre|exento|descansa|no emparejado)$/i;

// El pareo de una ronda (art=2). Las blancas se leen por su posición en el
// encabezado; las negras, desde el final de la fila («No.» es la última), así
// una columna de más o de menos antes de «Resultado» no las corre.
export function leerPareo(html: string) {
  const t = tablaCRs1(html);
  const ficha = leerFicha(html);
  const titulosH2 = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => texto(m[1])).filter(Boolean);
  const torneo = titulosH2.find((s) => !/^(Emparejamientos|Pairings|Paarungen)/i.test(s)) || "";
  const h3 = [...(t ? t.antes : html).matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi)].map((m) => texto(m[1]));
  const titulo = h3.length ? h3[h3.length - 1] : "";
  const ronda = Number((titulo.match(/(\d+)\.\s*(?:Ronda|Round|Runde)\b/i) || titulo.match(/(?:Ronda|Round|Runde)\s*(\d+)/i) || [])[1] || 0);
  const f = titulo.match(/(\d{4})\/(\d{2})\/(\d{2})/);
  const fecha = f ? f[1] + "." + f[2] + "." + f[3] : "";
  const hora = (titulo.match(/(\d{1,2}:\d{2}\s*(?:am|pm)?)/i) || [])[1] || "";
  if (!t || !t.encabezado) return { torneo, ficha, ronda, fecha, hora, mesas: [] };
  const cab = t.encabezado;
  const iB = cab.findIndex((c) => /^(White|Blancas|Weiß)$/i.test(c));
  const iN = cab.findIndex((c) => /^(Black|Negras|Schwarz)$/i.test(c));
  const iMesa = cab.findIndex((c) => /^(M\.|Mesa|Bo\.|Br\.)$/i.test(c));
  const iNo = cab.findIndex((c) => /^No\.?$/i.test(c));
  const iRes = cab.findIndex((c) => /^(Resultado|Result|Ergebnis)$/i.test(c));
  if (iB < 0 || iN < 0 || iRes < 0) return { torneo, ficha, ronda, fecha, hora, mesas: [] };
  const iEloB = cab.findIndex((c, i) => i > iB && i < iRes && /^(Elo|Rtg|EloN|EloI)$/i.test(c));
  const iClubB = cab.findIndex((c, i) => i > iB && i < iRes && /^(Club\/Ciudad|Club\/City|Verein\/Ort)$/i.test(c));
  const iEloN = cab.findIndex((c, i) => i > iN && /^(Elo|Rtg|EloN|EloI)$/i.test(c));
  const iClubN = cab.findIndex((c, i) => i > iN && /^(Club\/Ciudad|Club\/City|Verein\/Ort)$/i.test(c));
  const desdeFin = (i: number) => i - cab.length;   // negativo: se cuenta desde el final de la fila
  const mesas = t.datos.slice(0, MAX_MESAS).map((c) => {
    const v = c.map(texto);
    const de = (i: number) => (i < 0 ? "" : v[i] || "");
    const finN = (i: number) => (i < 0 ? "" : v[v.length + desdeFin(i)] || "");
    const nombreN = finN(iN);
    const sin = v.find((x) => SIN_RIVAL.test(x)) || "";
    const juega = !sin && v.length === cab.length && !!nombreN;
    return {
      mesa: Number(de(iMesa >= 0 ? iMesa : 0)) || 0,
      blancas: {
        no: Number(de(iNo >= 0 && iNo < iB ? iNo : 1)) || 0,
        titulo: de(iB - 1),
        nombre: de(iB),
        elo: Number(de(iEloB)) || 0,
        club: de(iClubB),
        fide: "",
        fed: bandera(c[iB - 2] || ""),
      },
      negras: juega
        ? {
          no: Number(v[v.length - 1]) || 0,
          titulo: finN(iN - 1),
          nombre: nombreN,
          elo: Number(finN(iEloN)) || 0,
          club: finN(iClubN),
          fide: "",
          fed: bandera(c[c.length - 2] || ""),
        }
        : null,
      sinRival: juega ? "" : (sin || "sin rival"),
      resultado: juega ? de(iRes).replace(/\s+/g, " ") : "",
    };
  }).filter((m) => m.blancas.nombre);
  return { torneo, ficha, ronda, fecha, hora, mesas };
}

// La lista inicial (art=0): el FIDE-ID y la federación de cada número inicial.
export function leerLista(html: string) {
  const t = tablaCRs1(html);
  if (!t || !t.encabezado) return { jugadores: {} };
  const cab = t.encabezado;
  const iNo = cab.findIndex((c) => /^No\.?$/i.test(c));
  const iFide = cab.findIndex((c) => /^(FIDE-ID|ID FIDE|FideID)$/i.test(c));
  const iFed = cab.findIndex((c) => /^(FED|Fed\.?)$/i.test(c));
  const jugadores: Record<string, { fide: string; fed: string }> = {};
  if (iNo < 0) return { jugadores };
  for (const c of t.datos.slice(0, 5000)) {
    const v = c.map(texto);
    const no = Number(v[iNo]);
    if (!no) continue;
    const fide = iFide >= 0 && /^\d{3,10}$/.test(v[iFide] || "") && v[iFide] !== "0" ? v[iFide] : "";
    jugadores[no] = { fide, fed: iFed >= 0 ? (v[iFed] || "").replace(/[^A-Z]/g, "").slice(0, 3) : "" };
  }
  return { jugadores };
}

// El número de torneo: «1498221», «tnr1498221» o cualquier dirección de
// chess-results que lo lleve. Otra cosa, null.
export function tnrDe(entrada: unknown): string | null {
  const s = String(entrada ?? "").trim();
  if (/^\d{3,9}$/.test(s)) return s;
  const m = s.match(/^(?:https?:\/\/)?(?:s\d{1,2}\.|www\.)?chess-results\.com\/tnr(\d{3,9})\.aspx(?:[?#].*)?$/i);
  return m ? m[1] : null;
}

// ------------------------------------------------------------- la función

type Admin = ReturnType<typeof createClient>;

async function leer(admin: Admin, url: string, frescoMs: number, leerHtml: (h: string) => unknown) {
  const { data: guardado } = await admin.from("pizarras_cache").select("datos, leido_en").eq("url", url).maybeSingle();
  if (guardado && Date.now() - new Date(guardado.leido_en as string).getTime() < frescoMs) {
    return { leido_en: guardado.leido_en as string, datos: guardado.datos };
  }
  try {
    const res = await fetch(url, { headers: { "User-Agent": CR_USER_AGENT }, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) throw new Error("chess-results respondió " + res.status);
    const datos = leerHtml(await res.text());
    const leido_en = new Date().toISOString();
    await admin.from("pizarras_cache").upsert({ url, datos, leido_en });
    return { leido_en, datos };
  } catch (e) {
    console.error("pareo-dgt:", url, e);
    if (guardado) return { leido_en: guardado.leido_en as string, datos: guardado.datos, viejo: true };
    return null;
  }
}

// Crear el torneo o la ronda en Lichess con el token de quien organiza. Ver
// «LICHESS» arriba. El token no se guarda ni se escribe en ningún registro:
// los errores se anotan sin él.
const RUTA_LICHESS = /^\/broadcast\/(new|[A-Za-z0-9]{8}\/new)$/;
async function aLichess(body: Record<string, unknown>) {
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const ruta = typeof body.ruta === "string" ? body.ruta : "";
  const form = Array.isArray(body.form) ? body.form : [];
  if (!/^lip_[A-Za-z0-9_-]{8,80}$/.test(token)) return json({ error: "Falta el token de Lichess." }, 400);
  if (!RUTA_LICHESS.test(ruta)) return json({ error: "Esa dirección de Lichess no se puede usar desde acá." }, 400);
  if (form.length > 40 || !form.every((c) => Array.isArray(c) && c.length === 2 && typeof c[0] === "string" && typeof c[1] === "string" && c[0].length <= 60 && c[1].length <= 20000)) {
    return json({ error: "Los datos para Lichess no tienen la forma esperada." }, 400);
  }
  try {
    const res = await fetch("https://lichess.org" + ruta, {
      method: "POST",
      headers: { "Authorization": "Bearer " + token, "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
      body: new URLSearchParams(form as [string, string][]),
      signal: AbortSignal.timeout(15_000),
    });
    const datos = await res.json().catch(() => ({}));
    return json({ status: res.status, datos });
  } catch (e) {
    console.error("pareo-dgt: Lichess", ruta, e instanceof Error ? e.message : String(e));
    return json({ error: "No se pudo llegar a Lichess. Se vuelve a intentar en la próxima revisión." }, 502);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const autorizacion = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(autorizacion)) return json({ error: "Inicia sesión para usar la herramienta." }, 401);
  const comoQuienLlama = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: autorizacion } },
  });
  const { data: puede, error: errPermiso } = await comoQuienLlama.rpc("tengo_herramienta", { p_herramienta: HERRAMIENTA });
  if (errPermiso) return json({ error: "No se pudo comprobar tu licencia: " + errPermiso.message }, 403);
  if (puede !== true) return json({ error: "Tu cuenta no tiene una licencia vigente de «Pareo para DGT»." }, 403);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Cuerpo JSON inválido" }, 400);
  }
  if (body.accion === "lichess") return await aLichess(body);
  const tnr = tnrDe(body.tnr);
  if (!tnr) return json({ error: "Eso no es un torneo de chess-results: pega su dirección (…chess-results.com/tnr123456.aspx) o su número." }, 400);
  const rd = body.rd === undefined || body.rd === null || body.rd === "" ? null : Number(body.rd);
  if (rd !== null && !(Number.isInteger(rd) && rd >= 1 && rd <= 99)) return json({ error: "La ronda va de 1 a 99." }, 400);

  const base = `${CR_BASE}/tnr${tnr}.aspx?lan=2&turdet=YES`;
  const urlPareo = base + "&art=2" + (rd ? "&rd=" + rd : "");
  const [pareo, lista] = await Promise.all([
    leer(admin, urlPareo, FRESCO_PAREO_MS, leerPareo),
    leer(admin, base + "&art=0&zeilen=99999", FRESCO_LISTA_MS, leerLista),
  ]);
  if (!pareo) return json({ error: "No se pudo leer chess-results ahora mismo. Se vuelve a intentar sola." }, 502);

  const p = pareo.datos as ReturnType<typeof leerPareo>;
  const jugadores = ((lista?.datos as { jugadores?: Record<string, { fide: string; fed: string }> } | undefined)?.jugadores) || {};
  const completar = <T extends { no: number; fide: string; fed: string } | null>(j: T): T => {
    if (!j) return j;
    const l = jugadores[j.no];
    return l ? { ...j, fide: l.fide || j.fide, fed: j.fed || l.fed } : j;
  };
  return json({
    tnr,
    url: `https://chess-results.com/tnr${tnr}.aspx?lan=2&art=2` + (rd ? "&rd=" + rd : ""),
    torneo: p.torneo,
    ficha: p.ficha || { control: "", lugar: "", pais: "", rondas: 0 },   // una lectura guardada antes no la trae
    ronda: p.ronda,
    fecha: p.fecha,
    hora: p.hora,
    mesas: (p.mesas || []).map((m) => ({ ...m, blancas: completar(m.blancas), negras: completar(m.negras) })),
    leido_en: pareo.leido_en,
    ...(pareo.viejo ? { viejo: true } : {}),
  });
});
