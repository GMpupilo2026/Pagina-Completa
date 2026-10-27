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
//     («Gr»: U08, U08F… U18F) es la categoría. Con un torneo por categoría
//     no hay «Gr»: la categoría la dice el texto del enlace de la sala
//     («Sub-10 Femenino», codigoCategoria() en torneos-sala.ts).
//   - art=2 (tnr1498221, UTN-CONARE 2026, ronda 1): encabezado «M. | No. | |
//     (título) | White | Elo | Club/Ciudad | Pts. | Resultado | Pts. |
//     (título) | Black | Elo | Club/Ciudad | | No.», y el bye con «bye» en
//     lugar de las negras. Las columnas se leen por posición relativa a
//     «White» y «Black», que en ese encabezado van en <td> y no en <th>.
//
// LOS AVISOS EN EL CELULAR (body.accion): «Avisarme en este celular» manda,
// cuando chess-results publica una ronda, la mesa, el color y el rival de
// cada jugador que sigue ese aparato. Ver «Seguir a mis jugadores y los
// avisos en el celular» en docs/decisiones/juegos-y-torneos.md.
//   - "push_llave"  → la llave pública VAPID (la del sitio, de notificar).
//   - "seguir"      { clave, suscripcion, jugadores: [{tnr, no, nombre}], idioma, delegacion? }
//                   → deja a ese aparato siguiendo EXACTAMENTE esa lista (como
//                   las set_* de la base: para sumar, la página manda todos).
//                   Sin cuenta: un aparato nuevo pasa por el freno de envíos
//                   públicos y recibe un primer aviso que comprueba que llega;
//                   uno que ya estaba (mismo endpoint y mismas llaves) solo
//                   cambia su lista o su idioma, sin freno ni aviso de prueba.
//                   Si chess-results le cambia el número inicial a un seguido
//                   (antes de la ronda 1), «revisar» lo busca por su nombre.
//   - "baja"        { clave, suscripcion } → deja de avisarle a ese aparato.
//   - "revisar"     la llama pg_cron (disparar_sala_avisos) con el secreto de
//                   la bóveda: lee cada sala con suscripciones y manda a quien
//                   no lo tenga tres avisos: el recordatorio de la ronda que
//                   empieza en 30 minutos (la hora sale del .ics de la página),
//                   el pareo de cada seguido y, cuando chess-results lo anota,
//                   su resultado con su puesto; y a quien sigue un país
//                   (delegacion, el código de FIDE), el resumen de la ronda
//                   cuando terminan todas sus partidas; y los avisos de la
//                   organización (sala_anuncios), que también dispara
//                   sala_anuncio_publicar() al publicarse. Cada aviso se anota antes de
//                   salir (sala_avisos_push_enviados, con su tipo), así no sale
//                   dos veces.
// Solo se le manda a los servicios de avisos de los navegadores (Google,
// Mozilla, Apple, Microsoft): un endpoint de otra dirección no se acepta.
//
// verify_jwt en FALSE: «revisar» la llama la base con el secreto, que no es un
// JWT. Lo demás es público y de solo lectura, o pasa por el freno; la página
// la llama igual que antes, con la clave anónima.

import { createClient } from "npm:@supabase/supabase-js@2";
import { type LlavesVapid, mandar as mandarPush } from "./webpush.ts";
import { codigoCategoria, deCategorias, type Jug, type Mesa, puntosDe, resumenDelegacion } from "./torneos-sala.ts";

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

// El cuadro cruzado por número inicial (art=5): de cada jugador, lo de cada
// ronda tal cual lo escribe chess-results: «5w1» (con el 5, blancas, ganó),
// «9b½», «12w+» (ganó por incomparecencia), «-1» (bye de un punto), «-0» (no
// jugó). Encabezado «No. | | (título) | Nombre | FED | 1.Rd | 2.Rd … | Rk. |
// Des 1…», con las rondas en <td> (comprobado con tnr1498221, 6 rondas).
export function leerCruzado(html: string) {
  const t = tablaCRs1(html);
  if (!t || !t.encabezado) return { cruce: {} };
  const cab = t.encabezado;
  const iNo = cab.findIndex((c) => /^No\.?$/i.test(c));
  const rondas = cab.map((c, i) => (/^\d+\.\s*(Rd|Rnd|Ronda)\.?$/i.test(c) ? i : -1)).filter((i) => i >= 0);
  if (iNo < 0 || !rondas.length) return { cruce: {} };
  const cruce: Record<string, string[]> = {};
  for (const c of t.datos.slice(0, MAX_JUGADORES)) {
    const v = c.map(texto);
    const no = Number(v[iNo]);
    if (!no) continue;
    // Una casilla vacía (ronda sin jugar todavía) queda vacía.
    cruce[no] = rondas.map((i) => (v[i] || "").replace(/\s+/g, ""));
  }
  return { cruce };
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

// ------------------------------------------------------------- los avisos

const CONTACTO_PUSH = "mailto:info@ajedrezintegral.com";
const SERVICIO_PUSH = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com|android\.googleapis\.com)\//;
const TOPE_AVISOS = 2000;   // por vuelta de pg_cron

let llavesEnMemoria: LlavesVapid | null = null;
async function llavesPush(admin: Admin): Promise<LlavesVapid | null> {
  if (llavesEnMemoria) return llavesEnMemoria;
  const { data } = await admin.rpc("push_llaves_leer");
  const fila = Array.isArray(data) ? data[0] : data;
  if (fila?.publica && fila?.privada) llavesEnMemoria = { publica: fila.publica, privada: fila.privada };
  return llavesEnMemoria;
}

function ipDe(req: Request): string | null {
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ??
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0];
  return ip?.trim() || null;
}

const corto = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

// Sin tildes ni mayúsculas, para comparar nombres: «Muñoz, José» → «munoz jose».
const plano = (s: string) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Lo que dice el aviso de la ronda de un jugador, en su idioma.
function textoRonda(idioma: string, ronda: number, no: number, mesas: Mesa[], porNo: Map<number, Jug>) {
  const en = idioma === "en";
  for (const m of mesas) {
    const blancas = m.blancas.no === no, negras = !!m.negras && m.negras.no === no;
    if (!blancas && !negras) continue;
    if (!m.negras) return en ? "Round " + ronda + ": has a bye (rests)." : "Ronda " + ronda + ": tiene bye (descansa).";
    const rival = blancas ? m.negras : m.blancas;
    const r = porNo.get(rival.no);
    const dato = r && (r.fed || r.elo) ? " (" + [r.fed, r.elo || ""].filter(Boolean).join(", ") + ")" : "";
    const quien = (rival.titulo ? rival.titulo + " " : "") + rival.nombre + dato;
    return en ? "Board " + m.mesa + ", with " + (blancas ? "white" : "black") + " against " + quien + "."
      : "Mesa " + m.mesa + ", con " + (blancas ? "blancas" : "negras") + " contra " + quien + ".";
  }
  return null;
}

const puntosTexto = (p: string, en: boolean) => p + (en ? (p === "1" ? " point" : " points") : (p === "1" ? " punto" : " puntos"));

// «U18F» → «Sub-18 Femenino» / «U18 Girls». La misma regla que la página
// (js/centroamericano-vivo.js); acá hace falta para el texto del aviso.
function categoria(g: string, en: boolean) {
  const m = String(g || "").match(/^U0?(\d+)(F?)$/i);
  if (!m) return g || "";
  return en ? "U" + m[1] + (m[2] ? " Girls" : " Open") : "Sub-" + m[1] + (m[2] ? " Femenino" : " Absoluto");
}

// El aviso del resultado: «Ronda 4: X ganó» y, si la clasificación ya está
// al día con esa ronda, su puesto en la categoría. Sin resultado o con bye, nada.
export function textoResultado(idioma: string, ronda: number, no: number, mesas: Mesa[], porNo: Map<number, Jug>, lista: Jug[], rondaClasif: number) {
  const en = idioma === "en";
  for (const m of mesas) {
    const blancas = m.blancas.no === no, negras = !!m.negras && m.negras.no === no;
    if (!blancas && !negras) continue;
    if (!m.negras) return null;
    const p = puntosDe(m.resultado, blancas);
    if (p === null) return null;
    const rival = blancas ? m.negras : m.blancas;
    const r = porNo.get(rival.no);
    const dato = r && (r.fed || r.elo) ? " (" + [r.fed, r.elo || ""].filter(Boolean).join(", ") + ")" : "";
    const quien = (rival.titulo ? rival.titulo + " " : "") + rival.nombre + dato;
    const yo = porNo.get(no);
    const que = en ? (p === 1 ? "won" : p === 0.5 ? "drew" : "lost") : (p === 1 ? "ganó" : p === 0.5 ? "hizo tablas" : "perdió");
    let cuerpo = en ? "Against " + quien + ", with " + (blancas ? "white" : "black") + "."
      : "Contra " + quien + ", con " + (blancas ? "blancas" : "negras") + ".";
    if (yo && rondaClasif >= ronda) {
      const grupo = lista.filter((x) => x.grupo === yo.grupo).sort((a, b) => a.puesto - b.puesto);
      const puesto = grupo.findIndex((x) => x.no === no) + 1;
      if (puesto > 0) {
        cuerpo += en ? " Place " + puesto + " of " + grupo.length + " in " + categoria(yo.grupo, true) + ", " + puntosTexto(yo.puntos, true) + "."
          : " Puesto " + puesto + " de " + grupo.length + " en " + categoria(yo.grupo, false) + ", con " + puntosTexto(yo.puntos, false) + ".";
      }
    }
    return { titulo: (en ? "Round " : "Ronda ") + ronda + ": " + (yo ? yo.nombre : rival.nombre) + " " + que, cuerpo };
  }
  return null;
}

// ---- el recordatorio de cada ronda: las horas salen del calendario (.ics)
// que genera herramientas/centroamericano-imagenes.js a partir de la tabla de
// la página, así no se escriben dos veces. «Ronda N · Round N» en el SUMMARY.
const CALENDARIOS: Record<string, string> = {
  "centroamericano-2026": "https://ajedrez-integral.com/documentos/centroamericano-2026/calendario-centroamericano-2026.ics",
};
const ANTES_MS = 35 * 60_000;   // pg_cron pasa cada 5 minutos: sale entre 35 y 30 antes
const calendarios = new Map<string, { leido: number; rondas: { ronda: number; inicio: number }[] }>();

export function leerCalendario(ics: string) {
  const texto = ics.replace(/\r?\n[ \t]/g, "");
  const rondas: { ronda: number; inicio: number }[] = [];
  for (const ev of texto.split("BEGIN:VEVENT").slice(1)) {
    const resumen = (ev.match(/^SUMMARY:(.*)$/m) || [])[1] || "";
    const inicio = (ev.match(/^DTSTART:(\d{8}T\d{6}Z)$/m) || [])[1];
    const r = resumen.match(/^Ronda (\d+)\b/);
    if (!r || !inicio) continue;
    const iso = inicio.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z");
    rondas.push({ ronda: Number(r[1]), inicio: Date.parse(iso) });
  }
  return rondas;
}

async function rondasDelCalendario(sala: string) {
  const url = CALENDARIOS[sala];
  if (!url) return [];
  const guardado = calendarios.get(sala);
  if (guardado && Date.now() - guardado.leido < 3600_000) return guardado.rondas;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error("calendario " + res.status);
    const rondas = leerCalendario(await res.text());
    calendarios.set(sala, { leido: Date.now(), rondas });
    return rondas;
  } catch (e) {
    console.error("sala-jugadores: calendario", sala, e);
    return guardado ? guardado.rondas : [];
  }
}

type Suscrito = { id: string; sala: string; endpoint: string; p256dh: string; auth: string; idioma: string; jugadores: { tnr: string; no: number; nombre: string }[]; delegacion: string | null; creada: string };

async function revisar(admin: Admin) {
  const llaves = await llavesPush(admin);
  if (!llaves) return { ok: false, error: "sin llaves" };
  const { data } = await admin.from("sala_suscripciones_push").select("id, sala, endpoint, p256dh, auth, idioma, jugadores, delegacion, creada");
  const subs = (data || []) as Suscrito[];
  if (!subs.length) return { ok: true, mandados: 0 };
  let mandados = 0;
  const caducas = new Set<string>();
  // Anota el aviso ANTES de mandarlo (la clave primaria impide el segundo) y lo manda.
  async function avisar(s: Suscrito, tipo: string, tnr: string, no: number, ronda: number, aviso: { titulo: string; cuerpo: string; etiqueta: string }) {
    if (caducas.has(s.id)) return;
    const { error } = await admin.from("sala_avisos_push_enviados").insert({ suscripcion_id: s.id, tipo, tnr, no, ronda });
    if (error) return; // ya salió (23505) o no se pudo anotar: no se manda
    const r = await mandarPush({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
      { titulo: aviso.titulo, cuerpo: aviso.cuerpo, url: "/centroamericano-2026.html#buscador", etiqueta: aviso.etiqueta }, llaves!, CONTACTO_PUSH);
    if (!r.ok && r.caduca) { caducas.add(s.id); await admin.from("sala_suscripciones_push").delete().eq("id", s.id); return; }
    mandados++;
  }

  for (const sala of [...new Set(subs.map((x) => x.sala))]) {
    const deSala = subs.filter((x) => x.sala === sala);

    // 0) Los avisos de la organización (sala_anuncios, los publica quien
    // administra): antes de leer chess-results, para que salgan ya. Una vez a
    // cada aparato que ya estaba suscrito cuando se publicó, en su idioma.
    const { data: anuncios } = await admin.from("sala_anuncios").select("id, texto, texto_en, creado")
      .eq("sala", sala).is("quitado", null).gt("hasta", new Date().toISOString()).order("creado");
    for (const a of (anuncios || []) as { id: number; texto: string; texto_en: string | null; creado: string }[]) {
      for (const s of deSala) {
        if (mandados >= TOPE_AVISOS) return { ok: true, mandados, tope: true };
        if (new Date(s.creada).getTime() > new Date(a.creado).getTime()) continue;
        const en = s.idioma === "en";
        await avisar(s, "anuncio", "0", 0, Number(a.id), {
          titulo: en ? "Notice from the organizers" : "Aviso de la organización",
          cuerpo: en && a.texto_en ? a.texto_en : a.texto,
          etiqueta: "sala-anuncio-" + a.id,
        });
      }
    }

    const torneos = await datosDeSala(admin, sala);
    if (!torneos) continue;

    // Cada seguido, en su torneo: su número de hoy (antes de la ronda 1 el
    // árbitro puede volver a ordenar la lista y cambiar los números: si el
    // número ya es de otra persona, se la busca por su nombre, y si hay dos con
    // el mismo, no se avisa).
    // Si su torneo ya no está en la sala (el Centroamericano se partió en un
    // torneo por categoría), se lo busca por su nombre en todos.
    const enTorneo = (j: { tnr: string; no: number; nombre: string }) => {
      const t = torneos.find((x) => x.tnr === String(j.tnr));
      if (!t) {
        const en = torneos.flatMap((x) => ((x.jugadores || []) as Jug[]).filter((y) => plano(y.nombre) === plano(j.nombre)).map((y) => ({ t: x, lista: (x.jugadores || []) as Jug[], no: y.no })));
        return en.length === 1 ? en[0] : null;
      }
      const lista = (t.jugadores || []) as Jug[];
      const actual = lista.find((x) => x.no === Number(j.no));
      if (actual && plano(actual.nombre) === plano(j.nombre)) return { t, lista, no: actual.no };
      const mismos = lista.filter((x) => plano(x.nombre) === plano(j.nombre));
      return mismos.length === 1 ? { t, lista, no: mismos[0].no } : null;
    };

    // 1) El recordatorio: la ronda que empieza en los próximos 35 minutos.
    const ahora = Date.now();
    const proxima = (await rondasDelCalendario(sala)).find((e) => e.inicio > ahora && e.inicio - ahora <= ANTES_MS);
    if (proxima) {
      for (const s of deSala) {
        if (mandados >= TOPE_AVISOS) return { ok: true, mandados, tope: true };
        const en = s.idioma === "en";
        const lineas: string[] = [];
        for (const j of s.jugadores) {
          const e = enTorneo(j);
          const pareo = e && (e.t.pareo as { ronda: number; mesas: Mesa[] } | null);
          if (!e || !pareo || pareo.ronda !== proxima.ronda) continue;
          const m = pareo.mesas.find((x) => x.blancas.no === e.no || (x.negras && x.negras.no === e.no));
          if (!m) continue;
          const apellido = j.nombre.split(",")[0];
          lineas.push(!m.negras ? apellido + ": bye"
            : apellido + ": " + (en ? "board " : "mesa ") + m.mesa + ", " + (m.blancas.no === e.no ? (en ? "white" : "blancas") : (en ? "black" : "negras")));
        }
        if (s.delegacion) {
          // Cuántos de su país juegan esa ronda, si el pareo ya salió.
          const n = deCategorias(torneos).reduce((acc, t) => {
            const pareo = t.pareo as { ronda: number; mesas: Mesa[] } | null;
            if (!pareo || pareo.ronda !== proxima.ronda) return acc;
            const fed = new Set(((t.jugadores || []) as Jug[]).filter((x) => x.fed === s.delegacion).map((x) => x.no));
            return acc + pareo.mesas.reduce((k, m) => k + (fed.has(m.blancas.no) ? 1 : 0) + (m.negras && fed.has(m.negras.no) ? 1 : 0), 0);
          }, 0);
          if (n) lineas.unshift(s.delegacion + ": " + n + (en ? (n === 1 ? " player" : " players") : (n === 1 ? " jugador" : " jugadores")));
        }
        const hora = new Date(proxima.inicio).toLocaleTimeString(en ? "en-US" : "es-CR", { hour: "numeric", minute: "2-digit", timeZone: "America/Costa_Rica" });
        const cuerpo = lineas.length
          ? lineas.slice(0, 4).join(" · ") + (lineas.length > 4 ? (en ? " and " : " y ") + (lineas.length - 4) + (en ? " more." : " más.") : "")
          : (en ? "The pairings are not published yet: we'll let you know here as soon as they are." : "El pareo todavía no está publicado: te avisamos aquí en cuanto salga.");
        await avisar(s, "recordatorio", "0", 0, proxima.ronda, {
          titulo: en ? "Round " + proxima.ronda + " starts at " + hora : "La ronda " + proxima.ronda + " empieza a las " + hora,
          cuerpo, etiqueta: "sala-recordatorio",
        });
      }
    }

    // 2) El pareo y 3) el resultado de cada seguido.
    for (const s of deSala) {
      for (const j of s.jugadores) {
        if (mandados >= TOPE_AVISOS) return { ok: true, mandados, tope: true };
        const e = enTorneo(j);
        if (!e) continue;
        const pareo = (e.t.pareo || { ronda: 0, mesas: [] }) as { ronda: number; mesas: Mesa[] };
        if (!pareo.ronda || !pareo.mesas || !pareo.mesas.length) continue;
        const porNo = new Map(e.lista.map((x) => [x.no, x]));
        const nombre = (porNo.get(e.no) || { nombre: j.nombre }).nombre;
        const resultado = textoResultado(s.idioma, pareo.ronda, e.no, pareo.mesas, porNo, e.lista, Number(e.t.ronda) || 0);
        if (resultado) {
          // Ya jugó: el pareo de esa ronda ya no sirve, va solo el resultado.
          await avisar(s, "resultado", e.t.tnr, e.no, pareo.ronda, { ...resultado, etiqueta: "sala-" + e.t.tnr + "-" + e.no });
          continue;
        }
        const cuerpo = textoRonda(s.idioma, pareo.ronda, e.no, pareo.mesas, porNo);
        if (!cuerpo) continue;
        await avisar(s, "pareo", e.t.tnr, e.no, pareo.ronda, {
          titulo: (s.idioma === "en" ? "Round " : "Ronda ") + pareo.ronda + ": " + nombre,
          cuerpo,
          // Una por jugador: la ronda nueva (o su resultado) reemplaza a la anterior.
          etiqueta: "sala-" + e.t.tnr + "-" + e.no,
        });
      }
    }

    // 4) El resumen de un país, cuando ya terminaron TODAS sus partidas de la
    // ronda, en todos los torneos de la sala juntos: uno por ronda (tnr «0»).
    for (const s of deSala.filter((x) => x.delegacion)) {
      if (mandados >= TOPE_AVISOS) return { ok: true, mandados, tope: true };
      const r = resumenDelegacion(s.idioma, s.delegacion!, deCategorias(torneos) as Parameters<typeof resumenDelegacion>[2]);
      if (r) await avisar(s, "delegacion", "0", 0, r.ronda, { titulo: r.titulo, cuerpo: r.cuerpo, etiqueta: "sala-delegacion" });
    }
  }
  return { ok: true, mandados };
}

// ------------------------------------------------------------- la función

// Los torneos de chess-results de una sala visible, leídos (o de la caché).
async function datosDeSala(admin: Admin, clave: string) {
  const { data: sala, error } = await admin.from("salas_torneo").select("enlaces").eq("clave", clave).eq("visible", true).maybeSingle();
  if (error || !sala) return null;
  const enlaces = Array.isArray(sala.enlaces) ? sala.enlaces : [];
  const vistos = new Set<string>();
  // Con el texto del enlace: si dice una categoría («Sub-10 Femenino»), es la
  // de todos los jugadores de ese torneo (un torneo por categoría).
  const torneos = enlaces.map((e: { url: string; texto?: string }) => {
    const t = torneoDe(e && e.url);
    return t ? { ...t, texto: corto(e.texto, 80), categoria: codigoCategoria(e.texto || "") } : null;
  }).filter((t: { tnr: string } | null) => t && !vistos.has(t.tnr) && vistos.add(t.tnr)).slice(0, 15);
  return await Promise.all(torneos.map(async (t: { tnr: string; host: string; texto: string; categoria: string }) => {
    const base = "https://" + t.host + "/tnr" + t.tnr + ".aspx?lan=2&turdet=YES";
    const [clasif, ronda, cruzado] = await Promise.all([
      leer(admin, base + "&art=1&zeilen=99999", leerClasificacion),
      leer(admin, base + "&art=2", leerRonda),
      leer(admin, base + "&art=5&zeilen=99999", leerCruzado),
    ]);
    if (!clasif) return { tnr: t.tnr, url: base + "&art=1", error: "No se pudo leer chess-results ahora mismo." } as Record<string, unknown> & { tnr: string };
    // Las rondas de cada jugador (del cuadro cruzado) van con él, en «r».
    const cruce = ((cruzado?.datos as { cruce?: Record<string, string[]> } | undefined)?.cruce) || {};
    const datos = clasif.datos as { jugadores?: Jug[] };
    // La columna «Gr» manda; sin ella, la categoría del enlace.
    const jugadores = (datos.jugadores || []).map((j) => ({ ...j, grupo: j.grupo || t.categoria, ...(cruce[j.no] ? { r: cruce[j.no] } : {}) }));
    return {
      tnr: t.tnr,
      texto: t.texto,
      categoria: t.categoria,
      url: base + "&art=1",
      leido_en: clasif.leido_en,
      viejo: !!(clasif.viejo || (ronda && ronda.viejo) || (cruzado && cruzado.viejo)),
      ...(clasif.datos as object),
      jugadores,
      pareo: ronda ? ronda.datos : null,
    } as Record<string, unknown> & { tnr: string };
  }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Solo POST." }, 405);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* sin cuerpo */ }
  const accion = String(body.accion || "datos");
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  if (accion === "revisar") {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: esperado } = await admin.rpc("secreto_sala_avisos");
    if (!esperado || !jwt || jwt !== esperado) return json({ error: "Esto lo dispara solo la base." }, 401);
    return json(await revisar(admin));
  }
  if (accion === "push_llave") {
    const llaves = await llavesPush(admin);
    return llaves ? json({ ok: true, llave: llaves.publica }) : json({ ok: false, error: "Los avisos en el celular no están listos todavía." }, 503);
  }

  const clave = String(body.clave || "");
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(clave) || clave.length > 40) return json({ error: "Falta la clave de la sala." }, 400);

  if (accion === "seguir" || accion === "baja") {
    const sus = (body.suscripcion ?? {}) as Record<string, unknown>;
    const claves = (sus.keys ?? {}) as Record<string, unknown>;
    const endpoint = corto(sus.endpoint, 1000), p256dh = corto(claves.p256dh, 200), auth = corto(claves.auth, 100);
    if (!SERVICIO_PUSH.test(endpoint)) return json({ ok: false, error: "Este navegador no dio una dirección de avisos válida." }, 400);
    if (accion === "baja") {
      await admin.from("sala_suscripciones_push").delete().eq("sala", clave).eq("endpoint", endpoint);
      return json({ ok: true });
    }
    if (!/^[A-Za-z0-9_-]{20,200}$/.test(p256dh) || !/^[A-Za-z0-9_-]{8,100}$/.test(auth)) {
      return json({ ok: false, error: "Este navegador no dio una dirección de avisos válida." }, 400);
    }
    const lista = Array.isArray(body.jugadores) ? body.jugadores as Record<string, unknown>[] : [];
    const jugadores = lista.map((j) => ({ tnr: corto(j.tnr, 9), no: Number(j.no), nombre: corto(j.nombre, 100) }))
      .filter((j) => /^[0-9]{1,9}$/.test(j.tnr) && Number.isInteger(j.no) && j.no > 0 && j.nombre.length >= 2);
    const delegacion = /^[A-Z]{3}$/.test(String(body.delegacion || "")) ? String(body.delegacion) : null;
    if (!jugadores.length && !delegacion) return json({ ok: false, error: "Falta a quién seguir." }, 400);
    if (jugadores.length > 20) return json({ ok: false, error: "En este aparato puedes seguir hasta 20 jugadores: deja de seguir a alguno." }, 409);
    // Solo jugadores de los torneos de esta sala.
    const { data: sala } = await admin.from("salas_torneo").select("enlaces").eq("clave", clave).eq("visible", true).maybeSingle();
    const tnrs = new Set((Array.isArray(sala?.enlaces) ? sala!.enlaces : []).map((e: { url: string }) => torneoDe(e && e.url)?.tnr).filter(Boolean));
    if (!jugadores.every((j) => tnrs.has(j.tnr))) return json({ ok: false, error: "Ese jugador no es de este torneo." }, 400);
    const idioma = body.idioma === "en" ? "en" : "es";
    const llaves = await llavesPush(admin);
    if (!llaves) return json({ ok: false, error: "Los avisos en el celular no están listos todavía." }, 503);
    // Un aparato que ya estaba solo cambia su lista o su idioma (la página la
    // vuelve a mandar con cada estrella): ni pasa por el freno ni recibe otro
    // aviso de prueba. Las llaves tienen que ser las mismas que dio al darse de alta.
    const { data: yaEsta } = await admin.from("sala_suscripciones_push").select("id").eq("sala", clave).eq("endpoint", endpoint)
      .eq("p256dh", p256dh).eq("auth", auth).maybeSingle();
    if (yaEsta) {
      const { error } = await admin.from("sala_suscripciones_push")
        .update({ idioma, jugadores, delegacion, actualizada: new Date().toISOString() }).eq("id", yaEsta.id);
      return error ? json({ ok: false, error: "No se pudo guardar. Intenta de nuevo." }, 502) : json({ ok: true });
    }
    const { data: freno, error: frenoError } = await admin.rpc("sala_avisos_frenar", { p_ip: ipDe(req) });
    if (frenoError) return json({ ok: false, error: "No se pudo guardar. Intenta de nuevo." }, 502);
    if (freno) return json({ ok: false, error: freno }, 429);
    const { error } = await admin.from("sala_suscripciones_push").upsert(
      { sala: clave, endpoint, p256dh, auth, idioma, jugadores, delegacion, actualizada: new Date().toISOString() },
      { onConflict: "sala,endpoint" },
    );
    if (error) return json({ ok: false, error: "No se pudo guardar. Intenta de nuevo." }, 502);
    const nombres = jugadores.map((j) => j.nombre).concat(delegacion ? [delegacion] : []).join(", ");
    const prueba = await mandarPush({ endpoint, p256dh, auth }, {
      titulo: idioma === "en" ? "Done: you follow " + nombres : "Listo: sigues a " + nombres,
      cuerpo: idioma === "en" ? "We will let you know here 30 minutes before each round, their board and opponent as soon as the pairings are out, and their result."
        : "Te vamos a avisar aquí 30 minutos antes de cada ronda, su mesa y su rival en cuanto salga el pareo, y su resultado.",
      url: "/centroamericano-2026.html#buscador",
      etiqueta: "sala-seguir",
    }, llaves, CONTACTO_PUSH);
    if (!prueba.ok && prueba.caduca) {
      await admin.from("sala_suscripciones_push").delete().eq("sala", clave).eq("endpoint", endpoint);
      return json({ ok: false, error: "Este navegador no aceptó el aviso de prueba. Revisa el permiso de notificaciones e intenta de nuevo." }, 400);
    }
    return json({ ok: true });
  }

  const torneos = await datosDeSala(admin, clave);
  if (!torneos) return json({ error: "Esa sala no existe o no está publicada." }, 404);
  return json({ torneos });
});
