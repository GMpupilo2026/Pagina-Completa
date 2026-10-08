// Edge Function: seleccion-chess-results
//
// Lee de chess-results.com un torneo ENTERO para la calculadora de la
// selección (seleccion-codicader.html): la clasificación (o la de equipos),
// la lista de jugadores y la ficha de cada uno —Elo nacional, Elo FIDE de
// ese ritmo, año de nacimiento, códigos y sus partidas ronda a ronda—. El
// cálculo lo hace el navegador (js/seleccion-calculo.js). Ver «Herramientas
// de arbitraje» en docs/decisiones/juegos-y-torneos.md.
//
// POR QUÉ UNA FUNCIÓN: chess-results no tiene API ni manda CORS, así que el
// navegador no le puede pedir nada. Y el año de nacimiento solo sale en la
// ficha de cada jugador (art=9&snr=N): ninguna lista lo trae, así que un
// torneo de 53 jugadores son 55 páginas. Pedidas desde acá, la página hace
// UN pedido por torneo.
//
// SOLO CON LICENCIA: la herramienta se vende. Antes de pedir nada se pregunta
// a la base `tengo_herramienta('seleccion-codicader')` CON EL TOKEN DE QUIEN
// LLAMA (clave anónima + su Authorization), no con la de servicio: así pasa
// por `antes_de_cada_pedido()` y la verificación en dos pasos la exige la
// base, igual que a cualquier página. Quien administra tiene todas.
//
// NO ES UN PROXY ABIERTO: solo pide páginas de chess-results.com (o de sus
// servidores s1…s99), de un número de torneo, y solo las vistas que usa.
//
// CACHÉ: lo leído se guarda en `seleccion_cache` (solo la ve el service role)
// y se reusa FRESCO_MS. En vivo, con varios profesores mirando la misma
// selección, chess-results recibe una lectura por minuto y no una por persona.
//
// LAS PÁGINAS QUE SE LEEN (comprobadas con los torneos de la Etapa Nacional
// JDE 2026, categoría D: tnr1423856/57/70/71 y 1426113/15/83/89):
// - art=0: en un torneo individual es la lista inicial («No.», «Nombre»…); en
//   uno por equipos es la clasificación de los equipos («Rk.», «Equipo»). Por
//   el encabezado se sabe cuál es.
// - individual: art=1, la clasificación («Rk.», «Nombre»).
// - equipos: art=16, el ranking inicial de jugadores con su «Equipo». NO art=4:
//   esa trae solo a quien jugó alguna partida (en el femenino blitz, 29 de 30).
// - art=9&snr=N: la ficha. Tabla de pares («Elo nacional», «Elo
//   internacional», «Fecha de nacimiento», «Código FIDE», «Código
//   nacional», «Club/Ciudad») y la de rondas («Rd.», «Nombre», «Res.»). La
//   celda «Res.» trae una tabla ANIDADA: por eso las celdas se leen contando
//   aperturas y cierres, no con un regex «hasta el próximo </td>».
// - El título y la ronda salen de los <h2>: «Clasificación Final después de 5
//   rondas» o «Clasificación después de la ronda 3». Un todos contra todos por
//   equipos dice «Cuadro cruzado por clasificación»: ahí las rondas jugadas
//   salen de las partidas (la ronda más alta que ya tiene resultado).
// Siempre con turdet=YES (si no, un torneo de más de dos semanas pide tocar
// «Mostrar detalles») y zeilen=99999 (todas las filas).
//
// verify_jwt en true.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HERRAMIENTA = "seleccion-codicader";
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

// El contenido de una etiqueta hasta su cierre VERDADERO, contando las del
// mismo nombre que se abran adentro.
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

// Las etiquetas de primer nivel que abren con `re` (con flag g), y su contenido.
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

function celdasDe(fila: string): string[] {
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

// Cada tabla CRs1 de la página como filas de texto; la primera fila con
// encabezado («CRg1b»/«CRng1b») se marca.
function tablas(html: string): { encabezado: string[] | null; filas: string[][] }[] {
  return dePrimerNivel(html, /<table[^>]*class="CRs1"[^>]*>/gi, "table").map((t) => {
    let encabezado: string[] | null = null;
    const filas: string[][] = [];
    for (const f of dePrimerNivel(t.contenido, /<tr\b[^>]*>/gi, "tr")) {
      const c = celdasDe(f.contenido).map(texto);
      if (/\bCRn?g1b\b/i.test(f.apertura) && !encabezado) encabezado = c;
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
  const ronda = h2.find((t) => /clasificaci[oó]n|ranking/i.test(t)) || "";
  const n = ronda.match(/despu[eé]s de (?:la ronda )?(\d+)/i);
  return { titulo, ronda, rondasJugadas: n ? Number(n[1]) : 0, final: /final/i.test(ronda) };
}

// art=0: ¿lista inicial (individual) o clasificación de equipos?
export function leerPortada(html: string) {
  const t = tablas(html).find((x) => x.encabezado);
  if (!t || !t.encabezado) return { equipos: false, clasificacion: [], cantidad: 0 };
  const enc = t.encabezado;
  const iEquipo = columna(enc, /^Equipo$/i, /^Team$/i);
  const iRk = columna(enc, /^Rk\.?$/i);
  if (iEquipo >= 0 && iRk >= 0) {
    return {
      equipos: true,
      clasificacion: t.filas.filter((f) => f[iEquipo]).map((f) => ({ puesto: Number(f[iRk]) || 0, nombre: f[iEquipo] })),
      cantidad: 0,
    };
  }
  const iNombre = columna(enc, /^Nombre$/i, /^Name$/i);
  return { equipos: false, clasificacion: [], cantidad: t.filas.filter((f) => iNombre >= 0 && f[iNombre]).length };
}

// art=1 de un individual: puesto y nombre.
export function leerClasificacion(html: string) {
  const t = tablas(html).find((x) => x.encabezado && columna(x.encabezado, /^Rk\.?$/i) >= 0);
  if (!t || !t.encabezado) return [];
  const iRk = columna(t.encabezado, /^Rk\.?$/i);
  const iNombre = columna(t.encabezado, /^Nombre$/i, /^Name$/i);
  if (iNombre < 0) return [];
  return t.filas.filter((f) => f[iNombre]).map((f) => ({ puesto: Number(f[iRk]) || 0, nombre: f[iNombre] }));
}

// art=16 de un torneo por equipos: los jugadores con su equipo, en el orden de
// su número inicial.
export function leerJugadoresDeEquipos(html: string) {
  const t = tablas(html).find((x) => x.encabezado && columna(x.encabezado, /^Equipo$/i, /^Team$/i) >= 0);
  if (!t || !t.encabezado) return [];
  const iNombre = columna(t.encabezado, /^Nombre$/i, /^Name$/i);
  const iEquipo = columna(t.encabezado, /^Equipo$/i, /^Team$/i);
  return t.filas.filter((f) => f[iNombre]).map((f) => ({ nombre: f[iNombre], equipo: f[iEquipo] || "" }));
}

function entero(t: string | undefined): number {
  const n = Number(String(t || "").replace(/[.\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

// art=9&snr=N: la ficha y las partidas.
export function leerFicha(html: string) {
  const ts = tablas(html);
  const datos: Record<string, string> = {};
  for (const t of ts) {
    for (const f of [...(t.encabezado ? [t.encabezado] : []), ...t.filas]) if (f.length === 2 && f[0]) datos[f[0]] = f[1];
  }
  const rondas = ts.find((t) => t.encabezado && t.encabezado[0] === "Rd.");
  const partidas: { ronda: number; rival: string; res: string }[] = [];
  if (rondas && rondas.encabezado) {
    const iRd = 0;
    const iNombre = columna(rondas.encabezado, /^Nombre$/i, /^Name$/i);
    const iRes = columna(rondas.encabezado, /^Res\.?$/i);
    for (const f of rondas.filas) {
      if (!/^\d+$/.test(f[iRd] || "") || iNombre < 0 || iRes < 0) continue;
      partidas.push({ ronda: Number(f[iRd]), rival: f[iNombre] || "", res: f[iRes] || "" });
    }
  }
  const nac = (datos["Fecha de nacimiento"] || "").match(/(19|20)\d\d/);
  return {
    nombre: datos["Nombre"] || "",
    fideId: String(entero(datos["Código FIDE"]) || ""),
    codigoNacional: String(entero(datos["Código nacional"]) || ""),
    eloNacional: entero(datos["Elo nacional"]),
    eloFide: entero(datos["Elo internacional"]),
    nacimiento: nac ? Number(nac[0]) : null,
    club: datos["Club/Ciudad"] || "",
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
  const portadaHtml = await pedir(base + "&art=0");
  const portada = leerPortada(portadaHtml);
  let titulos = leerTitulos(portadaHtml);
  let clasificacion = portada.clasificacion;
  let deEquipos: { nombre: string; equipo: string }[] = [];
  let cantidad = portada.cantidad;
  if (portada.equipos) {
    deEquipos = leerJugadoresDeEquipos(await pedir(base + "&art=16"));
    cantidad = deEquipos.length;
  } else {
    const html = await pedir(base + "&art=1");
    clasificacion = leerClasificacion(html);
    titulos = leerTitulos(html);
  }
  if (!cantidad) throw new Error("El torneo no tiene jugadores en chess-results.");
  if (cantidad > MAX_JUGADORES) throw new Error(`El torneo tiene ${cantidad} jugadores: el máximo es ${MAX_JUGADORES}.`);

  const equipoDe = new Map(deEquipos.map((j) => [j.nombre, j.equipo]));
  const jugadores: unknown[] = new Array(cantidad);
  const faltantes: number[] = [];
  let siguiente = 1;
  await Promise.all(Array.from({ length: Math.min(A_LA_VEZ, cantidad) }, async () => {
    while (siguiente <= cantidad) {
      const snr = siguiente++;
      try {
        const ficha = leerFicha(await pedir(`https://${servidor}/tnr${tnr}.aspx?lan=2&turdet=YES&art=9&snr=${snr}`));
        if (!ficha.nombre) throw new Error("ficha vacía");
        jugadores[snr - 1] = { snr, ...ficha, equipo: equipoDe.get(ficha.nombre) || "" };
      } catch (e) {
        console.error("seleccion-chess-results:", tnr, snr, e);
        faltantes.push(snr);
      }
    }
  }));
  const leidos = jugadores.filter(Boolean) as { partidas: { ronda: number; res: string }[] }[];
  if (!titulos.rondasJugadas) {
    titulos.rondasJugadas = Math.max(0, ...leidos.flatMap((j) => j.partidas.filter((p) => p.res.trim()).map((p) => p.ronda)));
  }
  return {
    id: tnr,
    url: `https://${servidor}/tnr${tnr}.aspx?lan=2`,
    ...titulos,
    equipos: portada.equipos,
    clasificacion,
    jugadores: leidos,
    faltantes: faltantes.sort((a, b) => a - b),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Solo POST." }, 405);

  const autorizacion = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(autorizacion)) return json({ error: "Inicia sesión para usar la herramienta." }, 401);

  // El permiso, con el token de quien llama (ver la cabecera).
  const comoQuienLlama = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: autorizacion } },
  });
  const { data: puede, error: errPermiso } = await comoQuienLlama.rpc("tengo_herramienta", { p_herramienta: HERRAMIENTA });
  if (errPermiso) return json({ error: "No se pudo comprobar tu licencia: " + errPermiso.message }, 403);
  if (puede !== true) return json({ error: "Tu cuenta no tiene una licencia vigente de esta herramienta." }, 403);

  let dir;
  try {
    const cuerpo = await req.json();
    dir = direccion(String(cuerpo.url || ""));
  } catch {
    return json({ error: "Pega la dirección de un torneo de chess-results (por ejemplo https://s3.chess-results.com/tnr1423856.aspx)." }, 400);
  }

  const servicio = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const clave = dir.servidor + "/" + dir.tnr;
  const { data: guardado } = await servicio.from("seleccion_cache").select("datos, leido_en").eq("clave", clave).maybeSingle();
  if (guardado && Date.now() - new Date(guardado.leido_en).getTime() < FRESCO_MS) {
    return json({ ...guardado.datos, leido_en: guardado.leido_en });
  }
  try {
    const datos = await leerTorneo(dir.servidor, dir.tnr);
    const leido_en = new Date().toISOString();
    await servicio.from("seleccion_cache").upsert({ clave, datos, leido_en });
    return json({ ...datos, leido_en });
  } catch (e) {
    console.error("seleccion-chess-results:", clave, e);
    if (guardado) return json({ ...guardado.datos, leido_en: guardado.leido_en, viejo: true });
    return json({ error: "No se pudo leer el torneo en chess-results: " + (e instanceof Error ? e.message : String(e)) }, 502);
  }
});
