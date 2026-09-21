// Edge Function: chess-results-proxy
//
// Le trae al panel de administración los datos de un jugador desde
// chess-results.com (base de datos pública de torneos, sin API oficial).
// Esto vive en un Edge Function y no en el navegador del admin por dos
// motivos: (1) chess-results.com no manda cabeceras CORS, así que el
// navegador no puede pedirle nada directo; (2) es un scraper de un sitio
// de terceros, así que conviene dejarlo detrás del mismo candado de
// "solo la persona administradora" que ya usa admin-manage-users, en vez
// de exponerlo como un proxy abierto a cualquiera con sesión.
//
// chess-results.com es un sitio ASP.NET WebForms clásico (sin cambios de
// fondo desde hace años): cada página arrastra un __VIEWSTATE/__EVENTVALIDATION
// que hay que levantar de un GET antes de poder mandar el POST del
// formulario, si no el servidor lo rechaza. No tiene API — esto es scraping
// de HTML público, igual que hace Google al indexarlo.
//
// Dos acciones (body.action):
//   "search"          { apellido, nombre?, fideId? }  -> lista de (torneo, fila) que
//                                                         coinciden con ese nombre
//   "torneo-jugador"  { tnr, snr }                     -> ficha de ESE jugador en
//                                                         ESE torneo puntual: resumen
//                                                         (Elo, performance, puesto) +
//                                                         partidas ronda a ronda
//
// *** Historial de ajustes con datos reales ***
// La primera versión se armó sin poder probar contra el sitio real (el
// sandbox donde se escribió tenía bloqueado por política de red todo el
// dominio chess-results.com) y con solo 2 páginas de muestra. Ya en uso
// real aparecieron 2 bugs concretos, corregidos con páginas reales de
// chess-results.com que sí mostraban el problema:
//   1. Las filas de las tablas no siempre usan class="CRg1"/"CRg2"/"CRg1b"
//      — algunos torneos (con bandera de federación) usan "CRng1"/"CRng2"/
//      "CRng1b" (con una "n" de más), a veces con una segunda clase pegada
//      ("CRng2 CRC"). El patrón ROW_CLASS_RE acepta ambas variantes.
//   2. La tabla de rondas no siempre tiene las mismas columnas — algunos
//      torneos agregan "Club/Ciudad", corriendo "Resultado" un lugar a la
//      derecha. En vez de índices fijos, ahora se lee el encabezado real de
//      cada tabla (indexarEncabezado) y se arma un mapa columna -> índice.
//   3. Al principio se pensaba que el aviso de "torneos de más de 2 semanas
//      piden tocar 'Mostrar detalles del torneo'" se resolvía con un
//      postback. En realidad chess-results.com lo controla con el parámetro
//      de URL turdet=YES — mucho más simple, y evita la ida y vuelta extra.
//      El reintento con el postback del botón se deja como respaldo, por si
//      algún torneo lo sigue pidiendo incluso con turdet=YES.
// Las cookies de sesión ASP.NET se capturan del GET y se reenvían en el
// POST de la búsqueda — no volvió a fallar, pero si search alguna vez
// devuelve 0 resultados de forma sospechosa, es el primer lugar a revisar.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = "https://ajedrez-integral.com";
const CR_BASE = "https://s3.chess-results.com";
// User-Agent normal de navegador de escritorio — no se hace pasar por un
// crawler específico (Googlebot etc.), solo evita el User-Agent por
// defecto de Deno, que algunos sitios tratan distinto de un cliente real.
const CR_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

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

// ---------------------------------------------------------------------
// Utilidades HTML (sin librería: chess-results.com es HTML simple y viejo,
// no vale la pena cargar un parser DOM completo en el edge function).
// ---------------------------------------------------------------------

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&frac12;/g, "½")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " "));
}

// ---------------------------------------------------------------------
// Escaneo consciente de anidamiento. chess-results.com mete una <table>
// (y hasta un <tr>/<td>) DENTRO de cada celda "Resultado" de la tabla de
// rondas (ronda a ronda), así que un regex ingenuo "no-greedy hasta el
// próximo </table>" (o </tr>, o </td>) se corta ahí en vez de llegar al
// cierre real de la etiqueta exterior — se comprobó armando pruebas contra
// el HTML real: sin esto, solo se leía la primera ronda de cada torneo.
// Esto cuenta aperturas/cierres del MISMO nombre de etiqueta para
// encontrar el cierre verdadero, sin importar cuánto se anide.
// ---------------------------------------------------------------------
function balancedContent(html: string, contentStart: number, tagName: string): { content: string; end: number } {
  const openRe = new RegExp("<" + tagName + "(?:\\s[^>]*)?>", "gi");
  const closeRe = new RegExp("</" + tagName + ">", "gi");
  let depth = 1;
  let pos = contentStart;
  while (depth > 0) {
    openRe.lastIndex = pos;
    closeRe.lastIndex = pos;
    const openM = openRe.exec(html);
    const closeM = closeRe.exec(html);
    if (!closeM) return { content: html.slice(contentStart), end: html.length };
    if (openM && openM.index < closeM.index) {
      depth++;
      pos = openM.index + openM[0].length;
    } else {
      depth--;
      if (depth === 0) return { content: html.slice(contentStart, closeM.index), end: closeM.index + closeM[0].length };
      pos = closeM.index + closeM[0].length;
    }
  }
  return { content: "", end: pos };
}

// Todas las etiquetas de NIVEL SUPERIOR (no anidadas entre sí) que matcheen
// `openRe` (debe tener flag 'g'), con su contenido ya balanceado.
function findAllTopLevel(html: string, openRe: RegExp, tagName: string): { openTag: string; content: string }[] {
  const out: { openTag: string; content: string }[] = [];
  let from = 0;
  while (true) {
    openRe.lastIndex = from;
    const m = openRe.exec(html);
    if (!m) break;
    const contentStart = m.index + m[0].length;
    const { content, end } = balancedContent(html, contentStart, tagName);
    out.push({ openTag: m[0], content });
    from = end;
  }
  return out;
}

// Como findAllTopLevel, pero para celdas: mezcla <td> y <th>, y cada una
// puede traer su propia <td> anidada (la columna "Resultado").
function findAllCells(rowHtml: string): string[] {
  const out: string[] = [];
  const openRe = /<t([dh])[^>]*>/gi;
  let from = 0;
  while (true) {
    openRe.lastIndex = from;
    const m = openRe.exec(rowHtml);
    if (!m) break;
    const tagName = "t" + m[1].toLowerCase();
    const contentStart = m.index + m[0].length;
    const { content, end } = balancedContent(rowHtml, contentStart, tagName);
    out.push(content);
    from = end;
  }
  return out;
}

// Todos los <input type="hidden" name="X" value="Y"> de la página, sin
// asumir el orden de los atributos (ASP.NET no siempre los emite igual).
function extractHiddenFields(html: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const inputRe = /<input\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = inputRe.exec(html))) {
    const tag = m[0];
    if (!/type\s*=\s*"hidden"/i.test(tag)) continue;
    const nameM = tag.match(/name\s*=\s*"([^"]*)"/i);
    if (!nameM) continue;
    const valueM = tag.match(/value\s*=\s*"([^"]*)"/i);
    fields[nameM[1]] = valueM ? decodeEntities(valueM[1]) : "";
  }
  return fields;
}

// Busca un <input> (hidden o submit) por su atributo id o value, y devuelve
// su "name" real — para no asumir a mano el nombre completo del control
// ASP.NET (ej. "cb_alleDetails" vs "ctl00$P1$cb_alleDetails").
function findInputNameByValueOrId(html: string, needle: string): string | null {
  const inputRe = /<input\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = inputRe.exec(html))) {
    const tag = m[0];
    if (tag.includes(needle)) {
      const nameM = tag.match(/name\s*=\s*"([^"]*)"/i);
      if (nameM) return nameM[1];
    }
  }
  return null;
}

function extractFormAction(html: string, fallbackUrl: string): string {
  const m = html.match(/<form[^>]*action\s*=\s*"([^"]*)"/i);
  if (!m) return fallbackUrl;
  const action = decodeEntities(m[1]);
  try {
    return new URL(action, fallbackUrl).toString();
  } catch {
    return fallbackUrl;
  }
}

// Cookies de la respuesta de un GET, listas para reenviar en el próximo
// POST (chess-results.com es ASP.NET clásico: suele depender de una cookie
// de sesión para que el __VIEWSTATE del POST siguiente sea válido).
function cookieHeaderFrom(res: Response): string {
  const raw = typeof (res.headers as any).getSetCookie === "function" ? (res.headers as any).getSetCookie() : [];
  return raw.map((c: string) => c.split(";")[0]).join("; ");
}

async function crGet(url: string, cookie?: string): Promise<{ html: string; res: Response }> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": CR_USER_AGENT,
      "Accept-Language": "es-ES,es;q=0.9",
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
  const html = await res.text();
  return { html, res };
}

async function crPost(url: string, params: Record<string, string>, cookie?: string): Promise<{ html: string; res: Response }> {
  const body = new URLSearchParams(params).toString();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "User-Agent": CR_USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept-Language": "es-ES,es;q=0.9",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body,
  });
  const html = await res.text();
  return { html, res };
}

// ---------------------------------------------------------------------
// Parsers específicos de cada página.
// ---------------------------------------------------------------------

interface FilaBusqueda {
  nombreMostrado: string;
  tnr: string;
  snr: string;
  id: string;
  fideId: string;
  club: string;
  fed: string;
  torneoNombre: string;
  torneoUrl: string;
  fechaFinal: string;
  puesto: string;
  rondas: string;
  participantes: string;
}

// Las filas de las tablas CRs1/CRs2 de chess-results.com a veces vienen con
// class "CRg1"/"CRg2"/"CRg1b", y otras (se comprobó con una página real que
// mostraba banderas de federación) con "CRng1"/"CRng2"/"CRng1b" — una "n" de
// más — a veces con una SEGUNDA clase pegada ("CRng2 CRC"). Este patrón
// acepta ambas variantes en cualquier posición del atributo class.
const ROW_CLASS_RE = () => /<tr[^>]*\bclass="[^"]*\bCRn?g(1b|1|2)\b[^"]*"[^>]*>/gi;
function esFilaEncabezado(openTag: string): boolean {
  return /CRn?g1b\b/i.test(openTag);
}

// Tabla de resultados de SpielerSuche.aspx: <table class="CRs2">, fila de
// encabezado (se descarta), filas de datos alternadas, 10 celdas por fila
// en este orden: Nombre(+link a la ficha del torneo), ID, FIDE-ID,
// Club/Ciudad, FED, Torneo(+link al torneo), Fecha final, Rk. (puesto),
// Rd. (rondas), n (participantes).
function parseSearchResults(html: string): FilaBusqueda[] {
  const tables = findAllTopLevel(html, /<table[^>]*class="CRs2"[^>]*>/gi, "table");
  if (!tables.length) return [];
  const rows = findAllTopLevel(tables[0].content, ROW_CLASS_RE(), "tr");
  const out: FilaBusqueda[] = [];
  for (const row of rows) {
    if (esFilaEncabezado(row.openTag)) continue;
    const cells = findAllCells(row.content);
    if (cells.length < 10) continue;

    const nombreLinkM = cells[0].match(/href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    const torneoLinkM = cells[5].match(/href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    const tnrSnrM = nombreLinkM ? nombreLinkM[1].match(/tnr(\d+)\.aspx.*?snr=(\d+)/i) : null;

    out.push({
      nombreMostrado: nombreLinkM ? stripTags(nombreLinkM[2]) : stripTags(cells[0]),
      tnr: tnrSnrM ? tnrSnrM[1] : "",
      snr: tnrSnrM ? tnrSnrM[2] : "",
      id: stripTags(cells[1]),
      fideId: stripTags(cells[2]),
      club: stripTags(cells[3]),
      fed: stripTags(cells[4]),
      torneoNombre: torneoLinkM ? stripTags(torneoLinkM[2]) : stripTags(cells[5]),
      torneoUrl: torneoLinkM ? new URL(decodeEntities(torneoLinkM[1]), CR_BASE).toString() : "",
      fechaFinal: stripTags(cells[6]),
      puesto: stripTags(cells[7]),
      rondas: stripTags(cells[8]),
      participantes: stripTags(cells[9]),
    });
  }
  return out;
}

interface RondaJugador {
  ronda: string;
  mesa: string;
  numeroInicialRival: string;
  tituloRival: string;
  nombreRival: string;
  eloRival: string;
  fedRival: string;
  clubRival: string;
  puntosRival: string;
  color: "blancas" | "negras" | "desconocido";
  resultado: string;
}

interface FichaTorneoJugador {
  resumen: Record<string, string>;
  rondas: RondaJugador[];
  detalleCompleto: boolean; // false si la tabla de rondas vino vacía (aviso de "torneo antiguo")
  calculoElo: string; // texto crudo del campo "Cálculo de elo" del torneo: "-", "Elo nacional", "Elo nacional, Elo internacional"...
  tieneEloNacional: boolean;
  tieneEloInternacional: boolean;
}

// El campo "Cálculo de elo" (y otros como Organizador/Federación/Fecha) vive
// en una tabla del torneo que NO tiene una clase que la identifique (a
// diferencia de las CRs1) — se busca directo por el texto de la etiqueta.
function extraerCampoTorneo(html: string, etiqueta: string): string {
  const escapada = etiqueta.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp('<td[^>]*class="CR"[^>]*>\\s*' + escapada + '\\s*</td>\\s*<td[^>]*class="CR"[^>]*>([\\s\\S]*?)</td>', "i");
  const m = html.match(re);
  return m ? stripTags(m[1]) : "";
}

// "nacional" es substring literal de "internacional" ("i-nter-NACIONAL"), así
// que se compara "elo nacional" y "elo internacional" completos (con el
// "elo " adelante) — si no, un torneo con SOLO elo internacional se
// clasificaría por error también como que tiene elo nacional.
function clasificarCalculoElo(calculoElo: string): { tieneEloNacional: boolean; tieneEloInternacional: boolean } {
  const s = calculoElo.toLowerCase();
  return {
    tieneEloNacional: s.includes("elo nacional"),
    tieneEloInternacional: s.includes("elo internacional"),
  };
}

// Algunos torneos agregan una columna "Club/Ciudad" a la tabla de rondas que
// otros no tienen — con posiciones fijas por índice esa columna corría todo
// lo de la derecha un lugar (el "Resultado" real quedaba leyéndose como
// "Puntos"). Esto lee el ENCABEZADO real de la tabla y arma un mapa
// nombre de columna -> índice, así no importa el orden ni qué columnas
// están presentes.
type ColIndex = Partial<Record<
  "ronda" | "mesa" | "numeroInicialRival" | "tituloRival" | "nombreRival" | "eloRival" | "fedRival" | "clubRival" | "puntosRival" | "resultado",
  number
>>;
function indexarEncabezado(headerCells: string[]): ColIndex {
  const idx: ColIndex = {};
  headerCells.forEach((c, i) => {
    const label = stripTags(c).trim().toLowerCase();
    if (label === "rd.") idx.ronda = i;
    else if (label === "m.") idx.mesa = i;
    else if (label === "no.ini.") idx.numeroInicialRival = i;
    else if (label === "nombre") idx.nombreRival = i;
    else if (label === "elo") idx.eloRival = i;
    else if (label === "fed") idx.fedRival = i;
    else if (label === "club/ciudad" || label === "club") idx.clubRival = i;
    else if (label === "pts.") idx.puntosRival = i;
    else if (label === "res.") idx.resultado = i;
    // La columna del título (FM, IM, etc.) no trae texto en el encabezado —
    // es la que queda sin etiquetar entre "No.Ini." y "Nombre".
    else if (label === "" && idx.numeroInicialRival !== undefined && idx.nombreRival === undefined) idx.tituloRival = i;
  });
  return idx;
}
function celda(cells: string[], idx: ColIndex, campo: keyof ColIndex): string {
  const i = idx[campo];
  return i === undefined || cells[i] === undefined ? "" : cells[i];
}

function parseTorneoJugador(html: string): FichaTorneoJugador {
  // Primera tabla CRs1 = resumen (pares clave/valor); segunda CRs1 = rondas.
  // Ambas usan findAllTopLevel/findAllCells (no un regex "hasta el próximo
  // </table>"), porque la tabla de rondas trae una <table> anidada dentro
  // de cada celda "Resultado" — un regex ingenuo se corta ahí y solo
  // encuentra la primera ronda (se comprobó con el HTML real).
  const tables = findAllTopLevel(html, /<table[^>]*[Cc]lass="CRs1"[^>]*>/gi, "table");

  const resumen: Record<string, string> = {};
  if (tables[0]) {
    const rows = findAllTopLevel(tables[0].content, /<tr[^>]*>/gi, "tr");
    for (const row of rows) {
      const cells = findAllCells(row.content).map(stripTags);
      if (cells.length === 2) resumen[cells[0]] = cells[1];
    }
  }

  const rondas: RondaJugador[] = [];
  if (tables[1]) {
    const rows = findAllTopLevel(tables[1].content, ROW_CLASS_RE(), "tr");
    let idx: ColIndex | null = null;
    for (const row of rows) {
      const cells = findAllCells(row.content);
      if (esFilaEncabezado(row.openTag)) { idx = indexarEncabezado(cells); continue; }
      if (!idx || idx.resultado === undefined) continue; // sin encabezado no se puede mapear con seguridad

      // Color: la celda de resultado trae un <div class="FarbewT"> (blancas)
      // o <div class="FarbesT"> (negras) — "weiss"/"schwarz" en alemán,
      // origen del sitio (Austria). Ver aviso de supuestos al inicio del
      // archivo: esta lectura w=blancas/s=negras no se pudo confirmar en
      // vivo, pero es coherente con el resto del sitio (todo en alemán por
      // debajo del idioma elegido).
      const resCelda = celda(cells, idx, "resultado");
      let color: RondaJugador["color"] = "desconocido";
      if (/FarbewT/i.test(resCelda)) color = "blancas";
      else if (/FarbesT/i.test(resCelda)) color = "negras";

      rondas.push({
        ronda: stripTags(celda(cells, idx, "ronda")),
        mesa: stripTags(celda(cells, idx, "mesa")),
        numeroInicialRival: stripTags(celda(cells, idx, "numeroInicialRival")),
        tituloRival: stripTags(celda(cells, idx, "tituloRival")),
        nombreRival: stripTags(celda(cells, idx, "nombreRival")),
        eloRival: stripTags(celda(cells, idx, "eloRival")),
        fedRival: stripTags(celda(cells, idx, "fedRival")),
        clubRival: stripTags(celda(cells, idx, "clubRival")),
        puntosRival: stripTags(celda(cells, idx, "puntosRival")),
        color,
        resultado: stripTags(resCelda).trim() || "?",
      });
    }
  }

  const calculoElo = extraerCampoTorneo(html, "Cálculo de elo");
  return { resumen, rondas, detalleCompleto: rondas.length > 0, calculoElo, ...clasificarCalculoElo(calculoElo) };
}

// ---------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------

async function accionSearch(apellido: string, nombre: string, fideId: string) {
  const searchUrl = `${CR_BASE}/SpielerSuche.aspx?lan=2&SNode=S0`;
  const { html: getHtml, res: getRes } = await crGet(searchUrl);
  const cookie = cookieHeaderFrom(getRes);
  const hidden = extractHiddenFields(getHtml);

  const params: Record<string, string> = {
    ...hidden,
    __EVENTTARGET: "",
    __EVENTARGUMENT: "",
    "ctl00$P1$txt_nachname": apellido,
    "ctl00$P1$txt_vorname": nombre || "",
    "ctl00$P1$txt_verein": "",
    "ctl00$P1$txt_ident": "",
    "ctl00$P1$txt_fideID": fideId || "",
    "ctl00$P1$txt_FED": "",
    "ctl00$P1$txt_von_tag": "",
    "ctl00$P1$txt_bis_tag": "",
    "ctl00$P1$txt_GJahr": "",
    "ctl00$P1$txt_min_elo": "",
    "ctl00$P1$txt_Fed_tur": "",
    "ctl00$P1$combo_Sort": "0",
    "ctl00$P1$combo_anzahl_zeilen": "3", // 1000 líneas
    "ctl00$P1$cb_suchen": "Buscar", // el botón que se "toca" — ASP.NET lo necesita como par name=value
  };

  const postUrl = extractFormAction(getHtml, searchUrl);
  const { html: resultHtml } = await crPost(postUrl, params, cookie);
  const filas = parseSearchResults(resultHtml);
  return { ok: true, filas };
}

async function accionTorneoJugador(tnr: string, snr: string) {
  // turdet=YES es el parámetro real que hace que chess-results.com muestre
  // el detalle ronda a ronda de entrada (se confirmó con una página real:
  // sin él, un torneo de más de dos semanas solo muestra el resumen y una
  // nota pidiendo tocar "Mostrar detalles del torneo" — el reintento con
  // ese botón, más abajo, queda como respaldo por si algún torneo lo sigue
  // pidiendo incluso con turdet=YES).
  const url = `${CR_BASE}/tnr${tnr}.aspx?lan=2&art=9&snr=${snr}&turdet=YES`;
  const { html, res } = await crGet(url);
  const cookie = cookieHeaderFrom(res);
  let ficha = parseTorneoJugador(html);

  // Torneo "antiguo": la tabla de rondas viene vacía y hay un botón
  // "Mostrar detalles del torneo" — se reintenta con el postback de ese
  // botón. Ver aviso de supuestos al inicio del archivo.
  if (!ficha.detalleCompleto) {
    const btnName = findInputNameByValueOrId(html, "Mostrar detalles del torneo");
    if (btnName) {
      const hidden = extractHiddenFields(html);
      const btnValueM = html.match(new RegExp(`name="${btnName}"[^>]*value="([^"]*)"`, "i"));
      const params: Record<string, string> = {
        ...hidden,
        __EVENTTARGET: "",
        __EVENTARGUMENT: "",
        [btnName]: btnValueM ? decodeEntities(btnValueM[1]) : "Mostrar detalles del torneo",
      };
      const postUrl = extractFormAction(html, url);
      const { html: retryHtml } = await crPost(postUrl, params, cookie);
      ficha = parseTorneoJugador(retryHtml);
    }
  }

  return { ok: true, ...ficha };
}

// ---------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Método no permitido" }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return json({ error: "Falta token de autorización" }, 401);
  }

  const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: userData, error: userError } = await callerClient.auth.getUser(jwt);
  if (userError || !userData?.user) {
    return json({ error: "Token inválido" }, 401);
  }

  const { data: callerProfile, error: callerProfileError } = await callerClient
    .from("profiles")
    .select("is_admin")
    .eq("id", userData.user.id)
    .single();

  if (callerProfileError || !callerProfile?.is_admin) {
    return json({ error: "Solo la persona administradora puede hacer esto" }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Cuerpo JSON inválido" }, 400);
  }

  try {
    if (body.action === "search") {
      const apellido = typeof body.apellido === "string" ? body.apellido.trim() : "";
      if (!apellido) return json({ error: "El apellido es requerido para buscar." }, 400);
      const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
      const fideId = typeof body.fideId === "string" ? body.fideId.trim() : "";
      return json(await accionSearch(apellido, nombre, fideId));
    }

    if (body.action === "torneo-jugador") {
      const tnr = typeof body.tnr === "string" ? body.tnr.trim() : "";
      const snr = typeof body.snr === "string" ? body.snr.trim() : "";
      if (!tnr || !snr) return json({ error: "Faltan tnr/snr del torneo." }, 400);
      return json(await accionTorneoJugador(tnr, snr));
    }

    return json({ error: "Acción desconocida" }, 400);
  } catch (err) {
    console.error("chess-results-proxy error:", err);
    return json({ error: "No se pudo consultar chess-results.com: " + (err instanceof Error ? err.message : String(err)) }, 502);
  }
});
