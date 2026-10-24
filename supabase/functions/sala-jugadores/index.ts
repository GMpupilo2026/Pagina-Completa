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
// LOS AVISOS EN EL CELULAR (body.accion): «Avisarme en este celular» manda,
// cuando chess-results publica una ronda, la mesa, el color y el rival de
// cada jugador que sigue ese aparato. Ver «Seguir a mis jugadores y los
// avisos en el celular» en docs/decisiones/juegos-y-torneos.md.
//   - "push_llave"  → la llave pública VAPID (la del sitio, de notificar).
//   - "seguir"      { clave, suscripcion, jugadores: [{tnr, no, nombre}], idioma }
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
//                   la bóveda: lee cada sala con suscripciones y manda el aviso
//                   de la ronda emparejada a quien no lo tenga. Cada aviso se
//                   anota antes de salir (sala_avisos_push_enviados), así no
//                   sale dos veces.
// Solo se le manda a los servicios de avisos de los navegadores (Google,
// Mozilla, Apple, Microsoft): un endpoint de otra dirección no se acepta.
//
// verify_jwt en FALSE: «revisar» la llama la base con el secreto, que no es un
// JWT. Lo demás es público y de solo lectura, o pasa por el freno; la página
// la llama igual que antes, con la clave anónima.

import { createClient } from "npm:@supabase/supabase-js@2";
import { type LlavesVapid, mandar as mandarPush } from "./webpush.ts";

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

type Jug = { puesto: number; no: number; titulo: string; nombre: string; fed: string; elo: number; grupo: string; puntos: string };
type Mesa = { mesa: number; blancas: { no: number; titulo: string; nombre: string }; negras: { no: number; titulo: string; nombre: string } | null; resultado: string };

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

async function revisar(admin: Admin) {
  const llaves = await llavesPush(admin);
  if (!llaves) return { ok: false, error: "sin llaves" };
  const { data: subs } = await admin.from("sala_suscripciones_push").select("id, sala, endpoint, p256dh, auth, idioma, jugadores");
  if (!subs || !subs.length) return { ok: true, mandados: 0 };
  let mandados = 0;
  for (const sala of [...new Set(subs.map((x) => x.sala as string))]) {
    const torneos = await datosDeSala(admin, sala);
    if (!torneos) continue;
    for (const t of torneos) {
      const pareo = (t.pareo || { ronda: 0, mesas: [] }) as { ronda: number; mesas: Mesa[] };
      if (!pareo.ronda || !pareo.mesas || !pareo.mesas.length) continue;
      const lista = (t.jugadores || []) as Jug[];
      const porNo = new Map(lista.map((j) => [j.no, j]));
      for (const s of subs.filter((x) => x.sala === sala)) {
        for (const j of (s.jugadores as { tnr: string; no: number; nombre: string }[])) {
          if (mandados >= TOPE_AVISOS) return { ok: true, mandados, tope: true };
          if (String(j.tnr) !== t.tnr) continue;
          // Antes de la ronda 1 el árbitro puede volver a ordenar la lista y
          // cambiar los números iniciales: si el número ya es de otra persona,
          // se la busca por su nombre (y si hay dos con el mismo, no se avisa).
          let no = Number(j.no);
          const actual = porNo.get(no);
          if (!actual || plano(actual.nombre) !== plano(j.nombre)) {
            const mismos = lista.filter((x) => plano(x.nombre) === plano(j.nombre));
            if (mismos.length !== 1) continue;
            no = mismos[0].no;
          }
          const cuerpo = textoRonda(s.idioma as string, pareo.ronda, no, pareo.mesas, porNo);
          if (!cuerpo) continue;
          const { error } = await admin.from("sala_avisos_push_enviados").insert({ suscripcion_id: s.id, tnr: t.tnr, no, ronda: pareo.ronda });
          if (error) continue; // ya salió (23505) o no se pudo anotar: no se manda
          const nombre = (porNo.get(no) || { nombre: j.nombre }).nombre;
          const r = await mandarPush({ endpoint: s.endpoint as string, p256dh: s.p256dh as string, auth: s.auth as string }, {
            titulo: (s.idioma === "en" ? "Round " : "Ronda ") + pareo.ronda + ": " + nombre,
            cuerpo,
            url: "/centroamericano-2026.html#buscador",
            // Una por jugador: la ronda nueva reemplaza a la anterior.
            etiqueta: "sala-" + t.tnr + "-" + no,
          }, llaves, CONTACTO_PUSH);
          if (!r.ok && r.caduca) { await admin.from("sala_suscripciones_push").delete().eq("id", s.id); break; }
          mandados++;
        }
      }
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
  const torneos = enlaces.map((e: { url: string }) => torneoDe(e && e.url)).filter((t: { tnr: string } | null) => t && !vistos.has(t.tnr) && vistos.add(t.tnr)).slice(0, 15);
  return await Promise.all(torneos.map(async (t: { tnr: string; host: string }) => {
    const base = "https://" + t.host + "/tnr" + t.tnr + ".aspx?lan=2&turdet=YES";
    const [clasif, ronda] = await Promise.all([
      leer(admin, base + "&art=1&zeilen=99999", leerClasificacion),
      leer(admin, base + "&art=2", leerRonda),
    ]);
    if (!clasif) return { tnr: t.tnr, url: base + "&art=1", error: "No se pudo leer chess-results ahora mismo." } as Record<string, unknown> & { tnr: string };
    return {
      tnr: t.tnr,
      url: base + "&art=1",
      leido_en: clasif.leido_en,
      viejo: !!(clasif.viejo || (ronda && ronda.viejo)),
      ...(clasif.datos as object),
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
    if (!jugadores.length) return json({ ok: false, error: "Falta a quién seguir." }, 400);
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
        .update({ idioma, jugadores, actualizada: new Date().toISOString() }).eq("id", yaEsta.id);
      return error ? json({ ok: false, error: "No se pudo guardar. Intenta de nuevo." }, 502) : json({ ok: true });
    }
    const { data: freno, error: frenoError } = await admin.rpc("sala_avisos_frenar", { p_ip: ipDe(req) });
    if (frenoError) return json({ ok: false, error: "No se pudo guardar. Intenta de nuevo." }, 502);
    if (freno) return json({ ok: false, error: freno }, 429);
    const { error } = await admin.from("sala_suscripciones_push").upsert(
      { sala: clave, endpoint, p256dh, auth, idioma, jugadores, actualizada: new Date().toISOString() },
      { onConflict: "sala,endpoint" },
    );
    if (error) return json({ ok: false, error: "No se pudo guardar. Intenta de nuevo." }, 502);
    const nombres = jugadores.map((j) => j.nombre).join(", ");
    const prueba = await mandarPush({ endpoint, p256dh, auth }, {
      titulo: idioma === "en" ? "Done: you follow " + nombres : "Listo: sigues a " + nombres,
      cuerpo: idioma === "en" ? "We will let you know here their board and opponent as soon as each round is published."
        : "Te vamos a avisar aquí su mesa y su rival en cuanto se publique cada ronda.",
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
