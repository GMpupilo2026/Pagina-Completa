// Edge Function: desempates-chess-results
//
// Lee de chess-results.com un torneo individual ENTERO —clasificación final y
// las partidas ronda a ronda de cada jugador— para «Desempates explicados»
// (desempates.html): se elige el orden de desempates de las bases del
// torneo y se recalcula la clasificación desde las partidas, con el
// desglose de cada desempate (quién aportó qué). El cálculo de los
// desempates (FIDE C.07) lo hace el navegador con js/pareo/desempates.js, el
// mismo motor de Pareo Integral; esta función solo entrega los datos crudos.
// Ver «Herramientas de arbitraje» en docs/decisiones/juegos-y-torneos.md.
//
// POR QUÉ UNA FUNCIÓN: chess-results no tiene API ni manda CORS, así que el
// navegador no le puede pedir nada. Y las partidas ronda a ronda solo salen
// en la ficha de cada jugador (art=9&snr=N): un torneo de 60 jugadores son
// 61 páginas.
//
// LA USAN CUATRO HERRAMIENTAS: «Desempates explicados», «Variación de Elo del
// torneo» (variacion-elo.html), «Normas de título» (normas-titulo.html) y
// «Acta e informe arbitral JDE» (acta-jde.html), que necesitan lo mismo de
// chess-results. La
// página dice cuál es en `herramienta` (si no lo dice, «desempates») y se
// pregunta por la licencia de ESA: una no abre la otra. Para la Variación de
// Elo, la ficha trae además el Elo FIDE y el nacional por separado, el año de
// nacimiento (para el K de los menores de 18), el código FIDE, el «FIDE elo
// +/-» que calcula chess-results y el Elo FIDE y nacional de cada rival en
// cada ronda. Para las Normas, la clasificación trae además el título
// (GM, IM, WGM…), la federación y el sexo de cada uno; para el Acta, el
// club («Club/Ciudad», que en los JDE es el centro educativo) y los
// desempates que usó el torneo, tal como los nombra chess-results.
//
// SOLO CON LICENCIA: igual que seleccion-chess-results, se pregunta a la
// base `tengo_herramienta(<la herramienta>)` CON EL TOKEN DE QUIEN LLAMA (clave
// anónima + su Authorization), no con la de servicio, así que pasa por
// antes_de_cada_pedido() y la verificación en dos pasos la exige la base.
// Quien administra tiene todas las herramientas sin licencia.
//
// NO ES UN PROXY ABIERTO: solo pide páginas de chess-results.com (o de sus
// servidores s1…s99), de un número de torneo, y solo art=1 y art=9&snr=N.
//
// CACHÉ: lo leído se guarda en `desempates_cache` (solo la ve el service
// role) y se reusa FRESCO_MS, igual que seleccion-chess-results. La clave
// lleva la versión de lo que se guarda («v4:»): lo guardado antes no traía los
// Elo por separado (v1), el título y la federación (v2) ni el club y los
// desempates (v3), y no se reusa.
//
// SOLO TORNEOS INDIVIDUALES por ahora (ver «Herramientas de arbitraje» en
// docs/decisiones/juegos-y-torneos.md): un torneo por equipos reparte el
// Buchholz de otra forma (por equipo, no por tablero) y no se intenta
// adivinar acá.
//
// LA CATEGORÍA DE CADA RONDA (bye, incomparecencia, jugada) se lee de la
// ficha de cada jugador (art=9&snr=N), que es la única página que trae el
// rival, el color y el resultado ronda por ronda. Dos convenciones de
// chess-results, comprobadas con la página real que ya usa
// seleccion-chess-results (ver su cabecera y
// herramientas/verificar-seleccion-chess-results.js):
//   - Un bye trae el nombre del rival literal «bye» (en cualquier idioma de
//     la página) y SIN número de partida fiable: se guarda sin rival.
//   - Una incomparecencia trae una «K» en la celda de resultado («- 1K»,
//     punto por incomparecencia del rival) junto con un rival de verdad (su
//     «No.Ini.», la columna del rival en esa misma tabla).
// Cualquier otra forma que chess-results use y que esta función no reconozca
// se guarda como «sin resultado», nunca inventando una categoría: un
// desempate mal armado por adivinar una ronda es peor que uno incompleto que
// avisa cuáles le faltan (el navegador compara el puntaje reconstruido
// contra el oficial de la clasificación y avisa si no coinciden).
//
// verify_jwt en true.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HERRAMIENTAS = ["desempates", "variacion-elo", "normas-titulo", "acta-jde"];
const VERSION_CACHE = "v4:";
const FRESCO_MS = 60_000;
const MAX_JUGADORES = 400;
const A_LA_VEZ = 8;
const CR_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// ------------------------------------------------------------- el HTML
// (el mismo lector de tablas anidadas que seleccion-chess-results: la celda
// «Res.» trae otra tabla adentro, y un regex «hasta el próximo </td>» se
// corta justo ahí.)

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

function balanceado(html: string, desde: number, etiqueta: string): { contenido: string; fin: number } {
  const abre = new RegExp("<" + etiqueta + "(?:\\s[^>]*)?>", "gi");
  const cierra = new RegExp("</" + etiqueta + ">", "gi");
  let nivel = 1;
  let pos = desde;
  while (nivel > 0) {
    abre.lastIndex = pos;
    cierra.lastIndex = pos;
    const a = abre.exec(html);
    const c = cierra.exec(html);
    if (!c) return { contenido: html.slice(desde), fin: html.length };
    if (a && a.index < c.index) { nivel++; pos = a.index + a[0].length; }
    else {
      nivel--;
      if (nivel === 0) return { contenido: html.slice(desde, c.index), fin: c.index + c[0].length };
      pos = c.index + c[0].length;
    }
  }
  return { contenido: "", fin: pos };
}

function dePrimerNivel(html: string, re: RegExp, etiqueta: string): { apertura: string; contenido: string }[] {
  const fuera: { apertura: string; contenido: string }[] = [];
  let desde = 0;
  for (;;) {
    re.lastIndex = desde;
    const m = re.exec(html);
    if (!m) break;
    const { contenido, fin } = balanceado(html, m.index + m[0].length, etiqueta);
    fuera.push({ apertura: m[0], contenido });
    desde = fin;
  }
  return fuera;
}

// Las celdas CRUDAS de una fila (sin pasar por texto()): la columna «Res.»
// de la ficha necesita su HTML para leer el color (el div «FarbeXT» que
// trae adentro), que texto() borraría.
function celdasCrudasDe(fila: string): string[] {
  const fuera: string[] = [];
  const re = /<t([dh])\b[^>]*>/gi;
  let desde = 0;
  for (;;) {
    re.lastIndex = desde;
    const m = re.exec(fila);
    if (!m) break;
    const { contenido, fin } = balanceado(fila, m.index + m[0].length, "t" + m[1].toLowerCase());
    fuera.push(contenido);
    desde = fin;
  }
  return fuera;
}

// Cada tabla CRs1 de la página como filas de CELDAS CRUDAS; la primera fila
// con encabezado («CRg1b»/«CRng1b») se marca y se da ya en texto.
function tablasCrudas(html: string): { encabezado: string[] | null; filas: string[][] }[] {
  return dePrimerNivel(html, /<table[^>]*class="CRs1"[^>]*>/gi, "table").map((t) => {
    let encabezado: string[] | null = null;
    const filas: string[][] = [];
    for (const f of dePrimerNivel(t.contenido, /<tr\b[^>]*>/gi, "tr")) {
      const c = celdasCrudasDe(f.contenido);
      if (/\bCRn?g1b\b/i.test(f.apertura) && !encabezado) encabezado = c.map(texto);
      else if (c.length) filas.push(c);
    }
    return { encabezado, filas };
  });
}

function columna(enc: string[], ...nombres: RegExp[]): number {
  return enc.findIndex((c) => nombres.some((n) => n.test(c)));
}

export function leerTitulos(html: string) {
  const h2 = [...html.matchAll(/<h2>([\s\S]*?)<\/h2>/gi)].map((m) => texto(m[1]));
  const titulo = h2[0] || "";
  const ronda = h2.find((t) => /clasificaci[oó]n|ranking|cuadro cruzado/i.test(t)) || "";
  const n = ronda.match(/despu[eé]s de (?:la ronda )?(\d+)/i);
  return { titulo, ronda, rondasJugadas: n ? Number(n[1]) : 0, final: /final/i.test(ronda) };
}

function entero(t: string | undefined): number {
  const n = Number(String(t || "").replace(/[.\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function puntosDeTexto(s: string): number | null {
  const t = String(s || "").trim().replace(",", ".");
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  const m = t.match(/^(\d*)½$/);
  if (m) return (m[1] ? Number(m[1]) : 0) + 0.5;
  return null;
}

// art=1 de un individual: puesto, número inicial (No.Ini.), nombre, Elo y el
// puntaje FINAL (puede venir en la columna «Pts.» o, si el torneo no la
// trae, en el «Des N» cuya anotación dice «points»: mismo truco que
// pizarra-torneo).
export interface FilaClasificacion { puesto: number; snr: number; nombre: string; elo: number; puntos: number | null; titulo: string; fed: string; sexo: string; club: string }
const TITULOS = /^(GM|IM|WGM|WIM|FM|WFM|CM|WCM)$/;
export function leerClasificacionCompleta(html: string): FilaClasificacion[] {
  const t = tablasCrudas(html).find((x) => x.encabezado && columna(x.encabezado, /^Rk\.?$/i) >= 0);
  if (!t || !t.encabezado) return [];
  const enc = t.encabezado;
  const iRk = columna(enc, /^Rk\.?$/i);
  const iSnr = columna(enc, /^No\.?\s*Ini\.?$/i);
  const iNombre = columna(enc, /^Nombre$/i, /^Name$/i);
  const iElo = columna(enc, /^FIDE$/i, /^Rtg$/i, /^Elo[NI]?$/i);
  let iPuntos = columna(enc, /^Pts\.?$/i, /^Ptos\.?$/i, /^Puntos$/i);
  if (iPuntos < 0) {
    const nota: Record<string, string> = {};
    for (const m of html.matchAll(/(?:Desempate|Tie[ -]?Break)\s*(\d+):\s*([^<]+)/gi)) nota[m[1]] = texto(m[2]);
    const des = enc.map((c, i) => ({ i, n: (c.match(/^(?:Des|TB)\s*(\d+)$/i) || [])[1] })).filter((d) => d.n);
    const dePuntos = des.find((d) => /^points\b|^puntos\b/i.test(nota[d.n!] || ""));
    if (dePuntos) iPuntos = dePuntos.i;
  }
  if (iNombre < 0 || iSnr < 0) return [];
  const filas = t.filas.map((f) => f.map(texto)).filter((f) => f[iNombre]);
  // El título va en una columna SIN encabezado (antes del nombre): es la que
  // trae títulos de FIDE en alguna fila. La federación, «FED»; el sexo, «sexo».
  const iTitulo = enc.findIndex((c, i) => i < iNombre && c === "" && filas.some((f) => TITULOS.test(f[i] || "")));
  const iFed = columna(enc, /^FED$/i, /^Fed\.?$/i);
  const iSexo = columna(enc, /^sexo$/i, /^sex$/i);
  const iClub = columna(enc, /^Club\/Ciudad$/i, /^Club\/City$/i, /^Club$/i);
  return filas
    .map((f) => ({
      puesto: Number(f[iRk]) || 0,
      snr: Number(f[iSnr]) || 0,
      nombre: f[iNombre],
      elo: iElo >= 0 ? entero(f[iElo]) : 0,
      puntos: iPuntos >= 0 ? puntosDeTexto(f[iPuntos] || "") : null,
      titulo: iTitulo >= 0 && TITULOS.test(f[iTitulo] || "") ? f[iTitulo] : "",
      fed: iFed >= 0 ? (f[iFed] || "").toUpperCase() : "",
      sexo: iSexo >= 0 ? (f[iSexo] || "").toLowerCase() : "",
      club: iClub >= 0 ? f[iClub] || "" : "",
    }));
}

// Los desempates que usó el torneo, en orden, como los nombra chess-results
// en la «Anotación» de la clasificación («Desempate 2: Direct Encounter (DE)»),
// sin el primero si es el puntaje («points (game-points)»). Los traduce a
// los códigos de FIDE quien los usa (js/acta-jde.js): acá van tal cual.
export function leerDesempates(html: string): string[] {
  const fuera: { n: number; nombre: string }[] = [];
  for (const m of html.matchAll(/(?:Desempate|Tie[ -]?Break)\s*(\d+):\s*([^<]+)/gi)) {
    const nombre = texto(m[2]);
    if (/^(points|puntos)\b/i.test(nombre)) continue;
    if (!fuera.some((x) => x.n === Number(m[1]))) fuera.push({ n: Number(m[1]), nombre });
  }
  return fuera.sort((a, b) => a.n - b.n).map((x) => x.nombre);
}

// El color de una ronda, del div «FarbewT»/«FarbesT» que trae la celda
// «Res.» (w = weiss/blancas, s = schwarz/negras: chess-results guarda esas
// letras en alemán aunque la página esté en español). Sin ese div (no
// debería pasar en una ronda jugada), sin color.
function colorDeCelda(celdaHtml: string): "w" | "b" | null {
  const m = celdaHtml.match(/Farbe(\w)T/i);
  if (!m) return null;
  const c = m[1].toLowerCase();
  return c === "w" ? "w" : c === "s" ? "b" : null;
}

// «1», «½», «0» lisos: jugada. Con «K»: incomparecencia (gana quien tiene el
// punto). El rival «bye» (en cualquier idioma): bye, sin rival de verdad.
function interpretarResultado(rivalNombre: string, resTexto: string): { bye: boolean; incomparecencia: "gana" | "pierde" | null; puntos: number | null } {
  const bye = /^bye$/i.test(rivalNombre.trim());
  const incomp = /K/i.test(resTexto);
  const limpio = resTexto.replace(/[-+Kk\s]/g, "");
  let puntos: number | null = null;
  if (limpio === "½") puntos = 0.5;
  else if (limpio === "1") puntos = 1;
  else if (limpio === "0") puntos = 0;
  if (bye) return { bye: true, incomparecencia: null, puntos };
  if (incomp) return { bye: false, incomparecencia: puntos === 1 ? "gana" : puntos === 0 ? "pierde" : null, puntos };
  return { bye: false, incomparecencia: null, puntos };
}

// «-18,8», «+7», «0» → número (coma decimal); sin el dato, null.
function decimal(t: string | undefined): number | null {
  const s = String(t || "").trim().replace(/\s/g, "").replace(",", ".").replace(/^\+/, "");
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

// art=9&snr=N: nombre, los Elo, el año de nacimiento, el código FIDE, el
// «FIDE elo +/-» de chess-results y las partidas ronda a ronda (con el Elo
// FIDE y nacional de cada rival).
export interface Partida { ronda: number; rivalSnr: number; rivalNombre: string; bye: boolean; incomparecencia: "gana" | "pierde" | null; color: "w" | "b" | null; puntos: number | null; rivalFide: number; rivalNacional: number }
export interface Ficha { nombre: string; elo: number; eloFide: number; eloNacional: number; nacimiento: number; fideId: number; cambioFide: number | null; partidas: Partida[] }
export function leerFichaCompleta(html: string): Ficha {
  const ts = tablasCrudas(html);
  const datos: Record<string, string> = {};
  for (const t of ts) for (const f of [...(t.encabezado ? [t.encabezado] : []), ...t.filas.map((f) => f.map(texto))]) if (f.length === 2 && f[0]) datos[f[0]] = f[1];
  const rondas = ts.find((t) => t.encabezado && t.encabezado[0] === "Rd.");
  const partidas: Partida[] = [];
  if (rondas && rondas.encabezado) {
    const iRd = 0;
    const iSnr = columna(rondas.encabezado, /^No\.?\s*Ini\.?$/i);
    const iNombre = columna(rondas.encabezado, /^Nombre$/i, /^Name$/i);
    const iRes = columna(rondas.encabezado, /^Res\.?$/i);
    const iFide = columna(rondas.encabezado, /^FIDE$/i, /^Rtg$/i, /^EloI$/i);
    const iNac = columna(rondas.encabezado, /^EloN$/i, /^RtgN$/i, /^Elo\s*nac/i);
    for (const f of rondas.filas) {
      const rdTxt = texto(f[iRd] || "");
      if (!/^\d+$/.test(rdTxt) || iNombre < 0 || iRes < 0) continue;
      const rivalNombre = texto(f[iNombre] || "");
      const resCelda = f[iRes] || "";
      const resTexto = texto(resCelda);
      const r = interpretarResultado(rivalNombre, resTexto);
      partidas.push({
        ronda: Number(rdTxt),
        rivalSnr: iSnr >= 0 ? Number(texto(f[iSnr] || "")) || 0 : 0,
        rivalNombre,
        bye: r.bye,
        incomparecencia: r.incomparecencia,
        color: colorDeCelda(resCelda),
        puntos: r.puntos,
        rivalFide: iFide >= 0 ? entero(texto(f[iFide] || "")) : 0,
        rivalNacional: iNac >= 0 ? entero(texto(f[iNac] || "")) : 0,
      });
    }
  }
  const eloFide = entero(datos["Elo internacional"]);
  const eloNacional = entero(datos["Elo nacional"]);
  const nace = String(datos["Fecha de nacimiento"] || datos["Año de nacimiento"] || "").match(/\b(19|20)\d{2}\b/);
  return {
    nombre: datos["Nombre"] || "", elo: eloFide || eloNacional, eloFide, eloNacional,
    nacimiento: nace ? Number(nace[0]) : 0,
    fideId: entero(datos["Código FIDE"] || datos["FIDE-ID"]),
    cambioFide: decimal(datos["FIDE elo +/-"]),
    partidas,
  };
}

// La dirección que pegó el árbitro → el servidor y el número de torneo.
export function direccion(url: string) {
  const u = new URL(String(url).trim());
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("no es una dirección web");
  if (!/^(s\d{1,2}\.)?chess-results\.com$/i.test(u.hostname)) throw new Error("no es chess-results");
  const tnr = (u.pathname.match(/^\/tnr(\d{1,9})\.aspx$/i) || [])[1];
  if (!tnr) throw new Error("sin número de torneo");
  const servidor = u.hostname.toLowerCase();
  return { tnr, servidor, ver: `https://${servidor}/tnr${tnr}.aspx?lan=2` };
}

// ------------------------------------------------------------- la función

async function pedir(url: string): Promise<string> {
  let ultimo: unknown = null;
  for (let i = 0; i < 2; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": CR_USER_AGENT }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error("chess-results respondió " + res.status);
      return await res.text();
    } catch (e) { ultimo = e; }
  }
  throw ultimo;
}

async function leerTorneo(servidor: string, tnr: string) {
  const base = `https://${servidor}/tnr${tnr}.aspx?lan=2&turdet=YES&zeilen=99999`;
  const htmlClasif = await pedir(base + "&art=1");
  const titulos = leerTitulos(htmlClasif);
  const clasificacion = leerClasificacionCompleta(htmlClasif);
  if (!clasificacion.length) {
    throw new Error("No se pudo leer la clasificación individual de este torneo en chess-results (¿es por equipos? todavía no se soporta).");
  }
  if (clasificacion.length > MAX_JUGADORES) {
    throw new Error(`El torneo tiene ${clasificacion.length} jugadores: el máximo es ${MAX_JUGADORES}.`);
  }

  const lista = clasificacion;
  const fichaPorSnr = new Map<number, Ficha>();
  const faltantes: number[] = [];
  let siguiente = 0;
  await Promise.all(Array.from({ length: Math.min(A_LA_VEZ, lista.length) }, async () => {
    while (siguiente < lista.length) {
      const fila = lista[siguiente++];
      try {
        const html = await pedir(`https://${servidor}/tnr${tnr}.aspx?lan=2&turdet=YES&art=9&snr=${fila.snr}`);
        fichaPorSnr.set(fila.snr, leerFichaCompleta(html));
      } catch (e) {
        console.error("desempates-chess-results:", tnr, fila.snr, e);
        faltantes.push(fila.snr);
      }
    }
  }));

  const jugadores = lista.filter((f) => fichaPorSnr.has(f.snr)).map((f) => {
    const x = fichaPorSnr.get(f.snr)!;
    return { ...f, eloFide: x.eloFide, eloNacional: x.eloNacional, nacimiento: x.nacimiento, fideId: x.fideId, cambioFide: x.cambioFide, partidas: x.partidas };
  });
  const rondasJugadas = titulos.rondasJugadas || Math.max(0, ...jugadores.flatMap((j) => j!.partidas!.filter((p) => p.puntos != null).map((p) => p.ronda)));
  return {
    id: tnr,
    url: `https://${servidor}/tnr${tnr}.aspx?lan=2`,
    titulo: titulos.titulo,
    desempates: leerDesempates(htmlClasif),
    rondasJugadas,
    final: titulos.final,
    jugadores,
    faltantes: faltantes.sort((a, b) => a - b),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Solo POST." }, 405);

  const autorizacion = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(autorizacion)) return json({ error: "Inicia sesión para usar la herramienta." }, 401);

  const comoQuienLlama = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: autorizacion } },
  });
  let cuerpo: { url?: unknown; herramienta?: unknown } = {};
  try { cuerpo = await req.json(); } catch { cuerpo = {}; }
  const herramienta = cuerpo.herramienta == null ? "desempates" : String(cuerpo.herramienta);
  if (!HERRAMIENTAS.includes(herramienta)) return json({ error: "Herramienta desconocida." }, 400);
  const { data: puede, error: errPermiso } = await comoQuienLlama.rpc("tengo_herramienta", { p_herramienta: herramienta });
  if (errPermiso) return json({ error: "No se pudo comprobar tu licencia: " + errPermiso.message }, 403);
  if (puede !== true) return json({ error: "Tu cuenta no tiene una licencia vigente de esta herramienta." }, 403);

  let dir;
  try {
    dir = direccion(String(cuerpo.url || ""));
  } catch {
    return json({ error: "Pega la dirección de un torneo de chess-results (por ejemplo https://s3.chess-results.com/tnr1423856.aspx)." }, 400);
  }

  const servicio = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const clave = VERSION_CACHE + dir.servidor + "/" + dir.tnr;
  const { data: guardado } = await servicio.from("desempates_cache").select("datos, leido_en").eq("clave", clave).maybeSingle();
  if (guardado && Date.now() - new Date(guardado.leido_en).getTime() < FRESCO_MS) {
    return json({ ...guardado.datos, leido_en: guardado.leido_en });
  }
  try {
    const datos = await leerTorneo(dir.servidor, dir.tnr);
    const leido_en = new Date().toISOString();
    await servicio.from("desempates_cache").upsert({ clave, datos, leido_en });
    return json({ ...datos, leido_en });
  } catch (e) {
    console.error("desempates-chess-results:", clave, e);
    if (guardado) return json({ ...guardado.datos, leido_en: guardado.leido_en, viejo: true });
    return json({ error: "No se pudo leer el torneo en chess-results: " + (e instanceof Error ? e.message : String(e)) }, 502);
  }
});
