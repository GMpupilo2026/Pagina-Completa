// Lo compartido de las Edge Functions que hablan con la pantalla «Enter Results
// Online» de chess-results (https://chess-results.com/Results.aspx): mesa-arbitro,
// centroamericano-clave y centroamericano-mesa. Una sola copia: se copia a cada
// función al armarla (herramientas/funciones-armar.js). Ver «Mesa del árbitro:
// resultados y bitácora» y «Mesas de los árbitros del Centroamericano» en
// docs/decisiones/juegos-y-torneos.md.
//
// Lo que sabe hacer: leer la pantalla (torneo, ronda abierta y cada mesa con su
// jugador de blancas, el de negras y su resultado), entrar con el código del
// torneo y el SID, armar el envío de «Save» con TODOS los campos de la pantalla
// (el desplegable de cada mesa se llama por la POSICIÓN de la fila, no por la
// mesa), y guardar comprobando: antes, que la ronda y los jugadores sean los que
// vio quien guarda; después, volviendo a LEER con otra sesión, qué quedó de verdad.
//
// LA CLAVE (SID) NO SE IMPRIME NI SE DEVUELVE: nada de aquí la escribe en un
// registro ni en una respuesta.

export const VALORES = ["0", "1", "2", "3", "4", "5", "6", "D"];
export const MAX_CAMBIOS = 400;
const CR_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const URL_INGRESO = "https://chess-results.com/Results.aspx";

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
  grupo: string;
  torneos: { tnr: string; nombre: string; elegido: boolean }[];
  mesas: { mesa: number; blancas: string; negras: string; valor: string; campo: string }[];
} {
  const tnr = valorDeCampo(html, "ctl00$P1$txt_tnr") ?? "";
  const ronda = Number(valorDeCampo(html, "ctl00$P1$txt_rd")) || 0;
  const entro = /GridErg|P1_txt_rd/.test(html) && !!tnr;
  let torneo = "";
  // Los torneos LIGADOS en un grupo de chess-results salen todos en este desplegable:
  // una sola clave abre la pantalla de ingreso de cada uno.
  const torneos: { tnr: string; nombre: string; elegido: boolean }[] = [];
  const combo = html.match(/<select\b[^>]*name="ctl00\$P1\$combo_Tournament"[^>]*>([\s\S]*?)<\/select>/i);
  if (combo) {
    for (const o of combo[1].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)) {
      const v = atributoCrudo("<option" + o[1] + ">", "value") ?? "";
      if (!/^\d{1,7}$/.test(v)) continue;
      const elegido = /\sselected\b/i.test(o[1]);
      torneos.push({ tnr: v, nombre: texto(o[2]), elegido });
      if (elegido) torneo = texto(o[2]);
    }
  }
  const grupo = valorDeCampo(html, "ctl00$P1$txt_groupID") ?? "";
  const mesas: { mesa: number; blancas: string; negras: string; valor: string; campo: string }[] = [];
  const fila = /<tr\b[^>]*>\s*<td\b[^>]*>\s*(\d+)\s*<\/td>\s*<td\b[^>]*>([\s\S]*?)<\/td>\s*<td\b[^>]*>([\s\S]*?)<\/td>\s*<td\b[^>]*>\s*(<select\b[^>]*name="([^"]*GridErg[^"]*combo_erg)"[^>]*>[\s\S]*?<\/select>)/gi;
  for (const m of html.matchAll(fila)) {
    mesas.push({ mesa: Number(m[1]), blancas: texto(m[2]), negras: texto(m[3]), valor: opcionElegida(m[4]), campo: m[5] });
  }
  return { entro, tnr, torneo, ronda, grupo, torneos, mesas };
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

export class Sesion {
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

export const codificar = (pares: [string, string][]) => pares.map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");

const COMBO_TORNEO = "ctl00$P1$combo_Tournament";

// Entra con el código y la clave y devuelve la pantalla de ingreso (HTML) ya
// leída. Una sesión nueva en cada llamada: nada se comparte entre pedidos.
//
// `destino` es el torneo que se quiere, cuando los torneos están LIGADOS en un
// grupo (se entra con el código del GRUPO y la misma clave abre todos). Elegirlo en
// el desplegable NO basta: eso solo cambia el encabezado y la tabla de mesas sigue
// siendo la del torneo anterior (comprobado con un grupo de prueba). Hay que apretar
// «Search/Reload» para que carguen las mesas del torneo elegido; sin ese segundo
// paso, un «Save» escribiría los resultados de un torneo en el otro.
export async function entrar(tnr: string, sid: string, destino?: string): Promise<{ sesion: Sesion; html: string; url: string; pantalla: ReturnType<typeof leerPantalla> }> {
  const sesion = new Sesion();
  const inicio = await sesion.pedir(URL_INGRESO, { method: "GET" });
  const pares = camposDelFormulario(inicio.html).filter(([n]) => n.startsWith("__")).map(([n, v]): [string, string] => [n, v]);
  pares.push(["ctl00$P1$txt_tnr_login", tnr], ["ctl00$P1$txt_SID", sid], ["ctl00$P1$cb_login", nombreDeBoton(inicio.html, "ctl00$P1$cb_login") || "Login"]);
  const dentro = await sesion.pedir(inicio.url, { method: "POST", cuerpo: codificar(pares) });
  let html = dentro.html;
  let url = dentro.url;
  let pantalla = leerPantalla(html);
  if (destino && pantalla.entro && pantalla.tnr !== destino && pantalla.torneos.some((t) => t.tnr === destino)) {
    const elegir = camposDelFormulario(html).map(([n, v]): [string, string] => [n, n === COMBO_TORNEO ? destino : n === "__EVENTTARGET" ? COMBO_TORNEO : v]);
    const r1 = await sesion.pedir(url, { method: "POST", cuerpo: codificar(elegir) });
    const recargar = camposDelFormulario(r1.html);
    recargar.push(["ctl00$P1$cb_search", nombreDeBoton(r1.html, "ctl00$P1$cb_search") || "Search/Reload"]);
    const r2 = await sesion.pedir(r1.url, { method: "POST", cuerpo: codificar(recargar) });
    html = r2.html;
    url = r2.url;
    pantalla = leerPantalla(html);
  }
  return { sesion, html, url, pantalla };
}


// ------------------------------------------------------------- lo que usan las funciones

export type Pantalla = ReturnType<typeof leerPantalla>;
export type Cambio = { mesa: number; blancas: string; negras: string; valor: string };

export function resumir(p: Pantalla) {
  return { tnr: p.tnr, torneo: p.torneo, ronda: p.ronda, mesas: p.mesas.map(({ mesa, blancas, negras, valor }) => ({ mesa, blancas, negras, valor })) };
}

// Entra y comprueba que la clave abrió ESE torneo. Devuelve la pantalla leída o
// un error legible con el estado HTTP que le toca.
// `acceso` es el código con el que se entra (el del torneo, o el del GRUPO si están
// ligados) y `destino` el torneo que se quiere leer (por omisión, el mismo).
export async function leerRonda(acceso: string, sid: string, destino: string = acceso): Promise<{ pantalla: Pantalla } | { estado: number; error: string }> {
  const { pantalla } = await entrar(acceso, sid, destino);
  if (!pantalla.entro) return { estado: 401, error: "chess-results no aceptó el código o la clave. Revísalos en Swiss-Manager." };
  if (pantalla.tnr !== destino) {
    return pantalla.torneos.some((t) => t.tnr === destino)
      ? { estado: 502, error: "No se pudo abrir el torneo " + destino + " dentro del grupo. Intenta de nuevo." }
      : { estado: 409, error: "Esa clave no abre el torneo " + destino + " (abre " + (pantalla.torneos.map((t) => t.tnr).join(", ") || pantalla.tnr) + "). ¿Están ligados los torneos en un grupo?" };
  }
  return { pantalla };
}

// Guarda los cambios y comprueba lo que quedó. `antes` es la pantalla que se vio
// justo antes de guardar (para saber qué tenía cada mesa).
export async function guardarYComprobar(acceso: string, sid: string, destino: string, ronda: number, cambios: Cambio[]): Promise<
  { estado: number; error: string } |
  { estado: 200; antes: Pantalla; despues: Pantalla; cuerpo: { ok: boolean; ronda: number; resultados: { mesa: number; pedido: string; quedo: string | null; ok: boolean }[]; diferencias: { mesa: number; antes: string | null; ahora: string }[]; leido_en: string } }
> {
  const { sesion, html, url, pantalla } = await entrar(acceso, sid, destino);
  if (pantalla.entro && pantalla.tnr !== destino) return { estado: 409, error: "La clave abrió el torneo " + pantalla.tnr + " y no el " + destino + ". No se guardó nada." };
  const armado = armarGuardado(html, pantalla, ronda, cambios);
  if ("error" in armado) return { estado: pantalla.entro ? 409 : 401, error: armado.error };
  await sesion.pedir(url, { method: "POST", cuerpo: codificar(armado.pares) });

  // Lo que quedó de verdad: otra sesión, otra lectura.
  const despues = (await entrar(acceso, sid, destino)).pantalla;
  if (!despues.entro || despues.tnr !== destino) return { estado: 502, error: "Se mandó el envío pero no se pudo volver a leer chess-results. Revisa la ronda en chess-results." };
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
  return {
    estado: 200,
    antes: pantalla,
    despues,
    cuerpo: { ok: resultados.every((r) => r.ok) && diferencias.length === 0, ronda: despues.ronda, resultados, diferencias, leido_en: new Date().toISOString() },
  };
}
