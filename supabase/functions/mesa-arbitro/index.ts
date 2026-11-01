// Edge Function: mesa-arbitro
//
// «Mesa del árbitro» (mesa-arbitro.html, con licencia `mesa-arbitro`): lee de
// chess-results.com las mesas de la ronda abierta de un torneo suizo
// individual y, si el árbitro lo pide, le manda los resultados que anotó. Se
// usa la MISMA puerta que chess-results da a los árbitros adjuntos, la de
// «Enter Results Online» (https://chess-results.com/Results.aspx): el código
// de la base de datos del torneo (`tnr`) y el SID (la clave) que quien
// organiza ve en Swiss-Manager, «Internet / Customize lists on chess-results.com».
// Ver «Mesa del árbitro: resultados y bitácora» en
// docs/decisiones/juegos-y-torneos.md.
//
// LA CLAVE (SID) NO SE GUARDA NI SE ESCRIBE EN NINGÚN LADO: llega en el
// pedido, se usa para entrar y se olvida. No va a la base, ni a la caché, ni
// al registro (nunca se imprime con console), ni a la respuesta.
//
// POR QUÉ UNA FUNCIÓN: chess-results no tiene API ni manda CORS, así que el
// navegador no le puede pedir nada. Y es un formulario ASP.NET WebForms: cada
// envío lleva el __VIEWSTATE y el __EVENTVALIDATION de la página anterior, y
// la sesión (una cookie) tiene que ser la misma. Por eso entrar, leer y
// guardar pasan juntos en UN pedido de esta función.
//
// LA PANTALLA (comprobada con un torneo de prueba, tnr 1532448):
//   - Solo trabaja con la ronda que Swiss-Manager tiene abierta: «Ronda» es
//     un campo de solo lectura. No se puede elegir otra desde ahí.
//   - Cada mesa es una fila: número, blancas, negras y un desplegable
//     `GridErg$ctlNN$combo_erg` con 0 (sin resultado), 1 (1-0), 2 (tablas),
//     3 (0-1), 4 (1f-0f), 5 (0f-1f), 6 (0f-0f) y D (borrar).
//   - El desplegable se llama por la POSICIÓN de la fila, no por la mesa:
//     por eso al guardar se vuelve a leer la pantalla y se mandan los valores
//     de TODAS las filas (las que no cambian, con el valor que ya tenían).
//
// LO QUE SE COMPRUEBA ANTES DE GUARDAR (si no, no se manda nada):
//   - que la ronda abierta sea la que la página mostró al árbitro;
//   - que cada mesa a cambiar tenga los mismos jugadores de blancas y negras
//     que la página mostró (si la lista se corrió, no se escribe en otra mesa);
//   - que el valor sea uno de los ocho (0 a 6, y D);
// Y DESPUÉS DE GUARDAR se entra de nuevo (otra sesión) y se LEE: la respuesta
// dice qué quedó de verdad en chess-results, mesa por mesa, y avisa si algo
// que no se pidió cambió. Nunca dice «guardado» por haber mandado el envío.
//
// NO ES UN PROXY ABIERTO: solo habla con chess-results.com (o sus servidores
// s1…s99), solo con Results.aspx, y solo con licencia: se pregunta a la base
// `tengo_herramienta('mesa-arbitro')` CON EL TOKEN DE QUIEN LLAMA (clave
// anónima + su Authorization), no con la de servicio, así que pasa por
// antes_de_cada_pedido() y la verificación en dos pasos la exige la base.
//
// Dos acciones (body.action):
//   "leer"    { tnr, sid }                         -> { tnr, torneo, ronda, mesas }
//   "guardar" { tnr, sid, ronda, cambios:[{ mesa, blancas, negras, valor }] }
//                                                  -> { ok, ronda, resultados, diferencias }
//
// verify_jwt en true.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const HERRAMIENTA = "mesa-arbitro";
const MAX_CAMBIOS = 400;
const VALORES = ["0", "1", "2", "3", "4", "5", "6", "D"];
const CR_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const URL_INGRESO = "https://chess-results.com/Results.aspx";

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
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function atributo(etiqueta: string, nombre: string): string | null {
  const m = etiqueta.match(new RegExp("\\s" + nombre + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')", "i"));
  return m ? texto(m[1] ?? m[2] ?? "") : null;
}

// El valor TAL CUAL de un atributo (sin pasar por texto(): el __VIEWSTATE no
// debe perder espacios ni deshacerse de nada más que las entidades).
function atributoCrudo(etiqueta: string, nombre: string): string | null {
  const m = etiqueta.match(new RegExp("\\s" + nombre + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')", "i"));
  if (!m) return null;
  return (m[1] ?? m[2] ?? "").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function valorDeCampo(html: string, nombre: string): string | null {
  for (const m of html.matchAll(/<input\b[^>]*>/gi)) {
    if (atributo(m[0], "name") === nombre) return atributoCrudo(m[0], "value") ?? "";
  }
  return null;
}

// La opción elegida de un <select> (la de `selected`, o la primera).
function opcionElegida(select: string): string {
  const opciones = [...select.matchAll(/<option\b[^>]*>/gi)].map((m) => m[0]);
  const elegida = opciones.find((o) => /\sselected\b/i.test(o)) ?? opciones[0];
  return elegida ? (atributoCrudo(elegida, "value") ?? "") : "";
}

// Todo lo que el navegador mandaría al guardar, como pares [nombre, valor]:
// los ocultos (el estado de la página), los de texto, las casillas marcadas
// y lo elegido en cada desplegable. Los campos «disabled» no se mandan, y los
// botones tampoco: se agrega solo el que se aprieta.
export function camposDelFormulario(html: string): [string, string][] {
  const campos: [string, string][] = [];
  const pagina = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");
  const re = /<input\b[^>]*>|<select\b[\s\S]*?<\/select>/gi;
  for (const m of pagina.matchAll(re)) {
    const e = m[0];
    const nombre = atributo(e, "name");
    if (!nombre || /\sdisabled\b/i.test(e.split(">")[0])) continue;
    if (/^<select/i.test(e)) { campos.push([nombre, opcionElegida(e)]); continue; }
    const tipo = (atributo(e, "type") || "text").toLowerCase();
    if (tipo === "submit" || tipo === "button" || tipo === "image" || tipo === "reset") continue;
    if (tipo === "checkbox" || tipo === "radio") { if (/\schecked\b/i.test(e)) campos.push([nombre, atributoCrudo(e, "value") ?? "on"]); continue; }
    campos.push([nombre, atributoCrudo(e, "value") ?? ""]);
  }
  return campos;
}

export function nombreDeBoton(html: string, nombre: string): string {
  for (const m of html.matchAll(/<input\b[^>]*>/gi)) {
    if (atributo(m[0], "name") === nombre) return atributoCrudo(m[0], "value") ?? "";
  }
  return "";
}

// La pantalla de ingreso ya con sesión: torneo, ronda y cada mesa con su
// jugador de blancas, el de negras, lo que tiene hoy y el campo (por posición)
// donde se cambia. Sin la grilla es que no se entró (o la ronda no tiene mesas).
export function leerPantalla(html: string): {
  entro: boolean;
  tnr: string;
  torneo: string;
  ronda: number;
  mesas: { mesa: number; blancas: string; negras: string; valor: string; campo: string }[];
} {
  const tnr = valorDeCampo(html, "ctl00$P1$txt_tnr") ?? "";
  const ronda = Number(valorDeCampo(html, "ctl00$P1$txt_rd")) || 0;
  const entro = /GridErg|P1_txt_rd/.test(html) && !!tnr;
  let torneo = "";
  const combo = html.match(/<select\b[^>]*name="ctl00\$P1\$combo_Tournament"[^>]*>([\s\S]*?)<\/select>/i);
  if (combo) {
    const el = [...combo[1].matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/gi)].find((o) => /\sselected\b/i.test(o[0]));
    if (el) torneo = texto(el[1]);
  }
  const mesas: { mesa: number; blancas: string; negras: string; valor: string; campo: string }[] = [];
  const fila = /<tr\b[^>]*>\s*<td\b[^>]*>\s*(\d+)\s*<\/td>\s*<td\b[^>]*>([\s\S]*?)<\/td>\s*<td\b[^>]*>([\s\S]*?)<\/td>\s*<td\b[^>]*>\s*(<select\b[^>]*name="([^"]*GridErg[^"]*combo_erg)"[^>]*>[\s\S]*?<\/select>)/gi;
  for (const m of html.matchAll(fila)) {
    mesas.push({ mesa: Number(m[1]), blancas: texto(m[2]), negras: texto(m[3]), valor: opcionElegida(m[4]), campo: m[5] });
  }
  return { entro, tnr, torneo, ronda, mesas };
}

// Los nombres se comparan sin tildes, sin mayúsculas y sin espacios de más:
// lo que la página mostró y lo que la pantalla trae ahora tienen que ser la
// misma persona, no necesariamente la misma cadena de bytes.
export function mismoNombre(a: string, b: string): boolean {
  const n = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  return n(a) === n(b) && n(a) !== "";
}

// Qué mandar al guardar: todos los campos de la pantalla, con los valores de
// las mesas pedidas cambiados. Si algo no cuadra, dice por qué en vez de mandar.
export function armarGuardado(
  html: string,
  pantalla: ReturnType<typeof leerPantalla>,
  rondaPedida: number,
  cambios: { mesa: number; blancas: string; negras: string; valor: string }[],
): { error: string } | { pares: [string, string][] } {
  if (!pantalla.entro) return { error: "No se pudo entrar: revisa el código del torneo y la clave." };
  if (pantalla.ronda !== rondaPedida) return { error: "La ronda abierta en chess-results es la " + pantalla.ronda + ", no la " + rondaPedida + ". No se guardó nada." };
  if (!cambios.length) return { error: "No hay nada que guardar." };
  const nuevo = new Map<string, string>();
  const vistas = new Set<number>();
  for (const c of cambios) {
    if (vistas.has(c.mesa)) return { error: "La mesa " + c.mesa + " viene dos veces. No se guardó nada." };
    vistas.add(c.mesa);
    if (!VALORES.includes(c.valor)) return { error: "Resultado no válido en la mesa " + c.mesa + ". No se guardó nada." };
    const m = pantalla.mesas.find((x) => x.mesa === c.mesa);
    if (!m) return { error: "La mesa " + c.mesa + " no está en la ronda " + pantalla.ronda + ". No se guardó nada." };
    if (!mismoNombre(m.blancas, c.blancas) || !mismoNombre(m.negras, c.negras)) {
      return { error: "En la mesa " + c.mesa + " ahora juegan otros (" + m.blancas + " – " + m.negras + "). Vuelve a leer la ronda. No se guardó nada." };
    }
    nuevo.set(m.campo, c.valor);
  }
  const pares = camposDelFormulario(html).map(([n, v]): [string, string] => [n, nuevo.has(n) ? nuevo.get(n)! : v]);
  const boton = nombreDeBoton(html, "ctl00$P1$cb_save");
  if (!boton) return { error: "chess-results cambió su pantalla (no encuentro el botón de guardar). No se guardó nada." };
  pares.push(["ctl00$P1$cb_save", boton]);
  return { pares };
}

// ------------------------------------------------------------- la red

function servidorValido(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /^(s\d{1,2}\.)?chess-results\.com$/i.test(u.hostname) && /\/Results\.aspx$/i.test(u.pathname);
  } catch { return false; }
}

class Sesion {
  cookies = new Map<string, string>();
  async pedir(url: string, init: { method: "GET" | "POST"; cuerpo?: string }): Promise<{ html: string; url: string }> {
    let actual = url;
    let metodo = init.method;
    let cuerpo = init.cuerpo;
    for (let salto = 0; salto < 4; salto++) {
      if (!servidorValido(actual)) throw new Error("chess-results mandó a otra dirección.");
      const cabeceras: Record<string, string> = { "User-Agent": CR_USER_AGENT, "Accept-Language": "en" };
      if (this.cookies.size) cabeceras["Cookie"] = [...this.cookies].map(([k, v]) => k + "=" + v).join("; ");
      if (metodo === "POST") cabeceras["Content-Type"] = "application/x-www-form-urlencoded";
      const res = await fetch(actual, { method: metodo, headers: cabeceras, body: metodo === "POST" ? cuerpo : undefined, redirect: "manual" });
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const [par] = c.split(";");
        const i = par.indexOf("=");
        if (i > 0) this.cookies.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
      }
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        actual = new URL(res.headers.get("location")!, actual).toString();
        metodo = "GET";
        cuerpo = undefined;
        continue;
      }
      if (!res.ok) throw new Error("chess-results contestó " + res.status + ".");
      return { html: await res.text(), url: actual };
    }
    throw new Error("chess-results redirigió demasiadas veces.");
  }
}

const codificar = (pares: [string, string][]) => pares.map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");

// Entra con el código y la clave y devuelve la pantalla de ingreso (HTML) ya
// leída. Una sesión nueva en cada llamada: nada se comparte entre pedidos.
async function entrar(tnr: string, sid: string): Promise<{ sesion: Sesion; html: string; url: string; pantalla: ReturnType<typeof leerPantalla> }> {
  const sesion = new Sesion();
  const inicio = await sesion.pedir(URL_INGRESO, { method: "GET" });
  const pares = camposDelFormulario(inicio.html).filter(([n]) => n.startsWith("__")).map(([n, v]): [string, string] => [n, v]);
  pares.push(["ctl00$P1$txt_tnr_login", tnr], ["ctl00$P1$txt_SID", sid], ["ctl00$P1$cb_login", nombreDeBoton(inicio.html, "ctl00$P1$cb_login") || "Login"]);
  const dentro = await sesion.pedir(inicio.url, { method: "POST", cuerpo: codificar(pares) });
  const pantalla = leerPantalla(dentro.html);
  return { sesion, html: dentro.html, url: dentro.url, pantalla };
}

// ------------------------------------------------------------- la función

function resumir(p: ReturnType<typeof leerPantalla>) {
  return { tnr: p.tnr, torneo: p.torneo, ronda: p.ronda, mesas: p.mesas.map(({ mesa, blancas, negras, valor }) => ({ mesa, blancas, negras, valor })) };
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
  const { data: puede, error: errPermiso } = await comoQuienLlama.rpc("tengo_herramienta", { p_herramienta: HERRAMIENTA });
  if (errPermiso) return json({ error: "No se pudo comprobar tu licencia: " + errPermiso.message }, 403);
  if (puede !== true) return json({ error: "Tu cuenta no tiene una licencia vigente de esta herramienta." }, 403);

  let cuerpo: { action?: unknown; tnr?: unknown; sid?: unknown; ronda?: unknown; cambios?: unknown } = {};
  try { cuerpo = await req.json(); } catch { cuerpo = {}; }
  const tnr = String(cuerpo.tnr ?? "").trim();
  const sid = String(cuerpo.sid ?? "").trim();
  if (!/^\d{1,7}$/.test(tnr)) return json({ error: "El código de la base de datos del torneo son hasta 7 números." }, 400);
  if (!/^[A-Za-z0-9]{8,32}$/.test(sid)) return json({ error: "La clave (SID) son hasta 32 letras y números." }, 400);

  try {
    if (cuerpo.action === "leer") {
      const { pantalla } = await entrar(tnr, sid);
      if (!pantalla.entro) return json({ error: "chess-results no aceptó el código o la clave. Revísalos en Swiss-Manager." }, 401);
      if (pantalla.tnr !== tnr) return json({ error: "La clave abrió otro torneo (" + pantalla.tnr + "). No se hizo nada." }, 409);
      return json({ ...resumir(pantalla), leido_en: new Date().toISOString() });
    }

    if (cuerpo.action === "guardar") {
      const ronda = Number(cuerpo.ronda);
      const lista = Array.isArray(cuerpo.cambios) ? cuerpo.cambios : [];
      if (!Number.isInteger(ronda) || ronda < 1) return json({ error: "Falta la ronda." }, 400);
      if (lista.length === 0 || lista.length > MAX_CAMBIOS) return json({ error: "Los cambios son de 1 a " + MAX_CAMBIOS + " mesas." }, 400);
      const cambios = lista.map((c: Record<string, unknown>) => ({
        mesa: Number(c?.mesa), blancas: String(c?.blancas ?? ""), negras: String(c?.negras ?? ""), valor: String(c?.valor ?? ""),
      }));
      const { sesion, html, url, pantalla } = await entrar(tnr, sid);
      if (pantalla.entro && pantalla.tnr !== tnr) return json({ error: "La clave abrió otro torneo (" + pantalla.tnr + "). No se guardó nada." }, 409);
      const armado = armarGuardado(html, pantalla, ronda, cambios);
      if ("error" in armado) return json({ error: armado.error }, pantalla.entro ? 409 : 401);
      await sesion.pedir(url, { method: "POST", cuerpo: codificar(armado.pares) });

      // Lo que quedó de verdad: otra sesión, otra lectura.
      const despues = (await entrar(tnr, sid)).pantalla;
      if (!despues.entro) return json({ error: "Se mandó el envío pero no se pudo volver a leer chess-results. Revisa la ronda en chess-results." }, 502);
      const pedidas = new Map(cambios.map((c) => [c.mesa, c.valor]));
      const antes = new Map(pantalla.mesas.map((m) => [m.mesa, m.valor]));
      const resultados = cambios.map((c) => {
        const ahora = despues.mesas.find((m) => m.mesa === c.mesa);
        // «D» (borrar) deja la mesa en «0» (sin resultado).
        const esperado = c.valor === "D" ? "0" : c.valor;
        return { mesa: c.mesa, pedido: c.valor, quedo: ahora ? ahora.valor : null, ok: !!ahora && ahora.valor === esperado };
      });
      // Lo que NO se pidió tiene que seguir igual.
      const diferencias = despues.mesas
        .filter((m) => !pedidas.has(m.mesa) && antes.get(m.mesa) !== m.valor)
        .map((m) => ({ mesa: m.mesa, antes: antes.get(m.mesa) ?? null, ahora: m.valor }));
      return json({ ok: resultados.every((r) => r.ok) && diferencias.length === 0, ronda: despues.ronda, resultados, diferencias, leido_en: new Date().toISOString() });
    }

    return json({ error: "Acción desconocida." }, 400);
  } catch (e) {
    // Nunca se imprime el pedido: lleva la clave.
    console.error("mesa-arbitro:", tnr, e instanceof Error ? e.message : String(e));
    return json({ error: "No se pudo hablar con chess-results: " + (e instanceof Error ? e.message : String(e)) }, 502);
  }
});
