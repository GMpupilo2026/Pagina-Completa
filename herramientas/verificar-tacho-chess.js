/* La página del Torneo Intereducativo Tacho Chess 2 (tacho-chess-2.html) y sus
 * bases en PDF. Lo que se rompe acá no da error: la página se ve perfecta y
 * dice otra cosa que el afiche.
 *
 *   1. EL HTML, leído: los datos del afiche (sábado 14 de noviembre, 8:30
 *      a.m., Gimnasio del Centro, gratis, de primer grado a undécimo año) y
 *      lo que dio el dueño (7 rondas a 10 minutos + 2 segundos, la ronda 1 a
 *      las 9:00 y el árbitro principal); el calendario con la llegada a las
 *      8:30 y sus siete rondas, la primera a las 9:00 y las demás
 *      del mismo horario que las bases (BasesTorneo.horario); el formulario
 *      del código QR del afiche, que se abre encima; «Resultados» va
 *      «Pronto»; sin chess-results; el contacto, solo el de Adriana; la
 *      mascota, el escudo y las bases existen.
 *   2. LAS BASES EN PDF dicen lo mismo: la fecha, la sede, el ritmo, las 7
 *      rondas, la inscripción gratuita con el formulario, los once niveles y
 *      los cuatro torneos en que se juntan (1.º a 3.º, 4.º a 6.º, 7.º y 8.º,
 *      9.º a 11.º).
 *   3. «HOY EN EL TORNEO», con el reloj fijo y el navegador en Madrid: dos
 *      días antes (la cuenta regresiva), en la llegada, en la ronda 2 y de
 *      tarde (terminó).
 *   4. LOS RESULTADOS, EN PAREO INTEGRAL (js/tacho-chess-resultados.js), con
 *      un doble de la base que filtra de verdad: sin torneo, o con uno de
 *      una organización sin el sello «Organizador verificado», o de la
 *      edición anterior, la ficha sigue «Pronto»; con uno, lleva a SU página
 *      de Pareo y se abre encima; con varios (los niveles en varios
 *      torneos), abre la ventana con uno por torneo.
 *   5. EL PROFE AYUDA (js/tacho-chess-profe.js): el botón «¿Te ayudo?» con
 *      su cara, el panel con las ocho preguntas y su nombre, «el profe Oscar»
 *      (en el saludo y en la etiqueta del botón); cada respuesta sale de lo que dice
 *      la página: la próxima ronda según la hora (antes, en la llegada y en
 *      la ronda 2, con «hoy»), el contacto, el árbitro y la tolerancia, los
 *      once niveles sin emojis, y los resultados según la ficha; sus botones
 *      abren la ventana que toca; Escape lo cierra y el foco vuelve.
 *   6. La cara: el azul del afiche, la píldora roja con letra blanca, Tacho
 *      a la vista, la ficha «Inscribirme» abre el formulario encima y en el
 *      celular no hay scroll de costado.
 *
 * Ver «La del Tacho Chess 2» y «El profe ayuda en Tacho Chess 2» en
 * docs/decisiones/juegos-y-torneos.md.
 *
 *   python3 -m http.server 8777     (desde la raíz del sitio)
 *   node herramientas/verificar-tacho-chess.js
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");
const B = require("../js/bases-torneo.js");
const { bases } = require("./torneos-universitarios/tacho-chess-2.js");

const RAIZ = path.join(__dirname, "..");
const BASE = process.env.BASE_URL || "http://localhost:8777";
const PAGINA = "tacho-chess-2.html";
const PDF = "documentos/tacho-chess-2/bases-tacho-chess-2.pdf";
const FORMULARIO = "https://forms.gle/bLTnu979f2aj7kUUA";

let fallos = 0;
function ok(nombre, cond, detalle) {
  console.log((cond ? "  ✓ " : "  ✗ ") + nombre + (cond || !detalle ? "" : " — " + detalle));
  if (!cond) fallos++;
}

console.log(PAGINA + ", leída");
const html = fs.readFileSync(path.join(RAIZ, PAGINA), "utf8");
const visible = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
ok("la fecha, la hora y la sede del afiche", /Sábado 14 de noviembre de 2026/.test(visible) && /A partir de las 8:30 a\.m\./.test(visible) && /Gimnasio del Centro, Liceo Anastasio Alfaro/.test(visible));
ok("la inscripción gratuita y los niveles, de primer grado a undécimo año", /¡Inscripción gratuita!/.test(visible) && /de primer grado a undécimo año/i.test(visible));
ok("el ritmo que dio el dueño: 7 rondas a 10 minutos + 2 segundos", /7 rondas a 10 minutos \+ 2 segundos/.test(visible));
const filas = [...html.matchAll(/<tr data-inicio="([^"]+)" data-minutos="(\d+)"([^>]*)><th scope="row"[^>]*>([^<]+)<\/th>/g)]
  .map((m) => [m[4], m[1], (m[3].match(/data-ronda="(\d+)"/) || [])[1] || ""]);
const esperado = B.horario(bases).map((x) => ["Ronda " + x.ronda, "2026-11-14T" + String(Math.floor(x.min / 60)).padStart(2, "0") + ":" + String(x.min % 60).padStart(2, "0"), String(x.ronda)]);
ok("el calendario trae la llegada a las 8:30, las 7 rondas con el horario de las bases y la premiación", filas.length === 9 && JSON.stringify(filas[0]) === JSON.stringify(["Llegada y confirmación", "2026-11-14T08:30", ""]) && esperado.length === 7 && JSON.stringify(filas.slice(1, 8)) === JSON.stringify(esperado) && filas[8][0] === "Premiación", JSON.stringify(filas));
ok("la ronda 1 es a las 9:00 del sábado 14, y es la única marcada como la primera", filas[1][1] === "2026-11-14T09:00" && /<tr data-inicio="2026-11-14T09:00"[^>]*data-primera-ronda/.test(html) && (html.match(/data-primera-ronda/g) || []).length === 1);
ok("el árbitro principal que dio el dueño", /Árbitro principal: FA Jean Carlo Quesada Arauz/.test(visible));
ok("las horas de las rondas 2 a 7 y de la premiación dicen que son aproximadas", (html.match(/\(aprox\.\)<\/td><\/tr>/g) || []).length === 7);
ok("la ronda 7 queda a las 12:00 y la premiación a las 12:30", filas[7] && filas[7][0] === "Ronda 7" && filas[7][1] === "2026-11-14T12:00" && filas[8][1] === "2026-11-14T12:30", JSON.stringify(filas.slice(7)));
ok("el formulario es el del código QR del afiche y se abre encima", new RegExp('<a href="' + FORMULARIO.replace(/[./]/g, "\\$&") + '"[^>]*data-ventana=').test(html));
const torneosHtml = [...html.matchAll(/<div class="[^"]*" data-torneo>\s*<h3[^>]*>([^<]+)<\/h3>\s*<ul[^>]*>([\s\S]*?)<\/ul>/g)].map((m) => [m[1], [...m[2].matchAll(/<li>([^<]+)<\/li>/g)].map((x) => x[1])]);
ok("«Niveles y premios» trae los cuatro torneos, cada uno con sus niveles", JSON.stringify(torneosHtml) === JSON.stringify([
  ["Primero a tercer grado", ["Primer grado", "Segundo grado", "Tercer grado"]], ["Cuarto a sexto grado", ["Cuarto grado", "Quinto grado", "Sexto grado"]],
  ["Sétimo y octavo año", ["Sétimo año", "Octavo año"]], ["Noveno a undécimo año", ["Noveno año", "Décimo año", "Undécimo año"]]]), JSON.stringify(torneosHtml));
ok("«Resultados» va «Pronto» (sin enlace, con tabindex) hasta que el torneo esté en Pareo", /<div id="ficha-resultados" tabindex="0" aria-disabled="true"/.test(html));
ok("sin chess-results", !/chess-results\.com/.test(html));
ok("el contacto de la organización: Adriana, con su teléfono y su WhatsApp (los únicos)", /<dialog id="contacto"/.test(html) && /<a href="#contacto"/.test(html) && JSON.stringify([...html.matchAll(/href="(tel:[^"]+|https:\/\/wa\.me\/[^"]+)"/g)].map((m) => m[1])) === JSON.stringify(["tel:+50689122033", "https://wa.me/50689122033"]) && /Adriana/.test(visible));
const locales = [...html.matchAll(/(?:href|src)="((?:documentos|img)\/[^"#?]+)"/g)].map((m) => m[1]);
const faltan = [...new Set(locales)].filter((f) => !fs.existsSync(path.join(RAIZ, f)));
ok("las bases, la mascota y el escudo que enlaza existen", locales.includes(PDF) && locales.includes("img/tacho-chess-2/mascota.png") && !faltan.length, faltan.join(", "));

console.log("\nLas bases en PDF");
let textoPdf = "";
try {
  textoPdf = execFileSync("python3", ["-c", "import sys\nfrom pypdf import PdfReader\nprint(' '.join(p.extract_text() for p in PdfReader(sys.argv[1]).pages))", path.join(RAIZ, PDF)], { encoding: "utf8" }).replace(/\s+/g, " ");
} catch (e) { ok("se lee el PDF (pip install pypdf)", false, String(e.message).slice(0, 200)); }
if (textoPdf) {
  ok("el título y la fecha", /Bases del Torneo Intereducativo Tacho Chess 2/.test(textoPdf) && /14 de noviembre de 2026/.test(textoPdf));
  ok("la sede: el Gimnasio del Centro del Liceo Anastasio Alfaro", /Gimnasio del Centro, Liceo Anastasio Alfaro/.test(textoPdf));
  ok("el ritmo y las rondas: 10 minutos + 2 segundos, suizo a 7 rondas, ajedrez rápido", /10 minutos para toda la partida, con un incremento de 2 segundos/.test(textoPdf) && /Sistema suizo, a 7 rondas/.test(textoPdf) && /ajedrez rápido/.test(textoPdf));
  ok("la inscripción gratuita con el formulario del afiche", /La inscripción es gratuita/.test(textoPdf) && textoPdf.includes(FORMULARIO.replace("https://", "")));
  ok("los once niveles, de primer grado a undécimo año", ["Primer grado", "Sexto grado", "Sétimo año", "Undécimo año"].every((n) => textoPdf.includes(n)));
  ok("los cuatro torneos, cada uno con sus niveles, y el 1.º, 2.º y 3.º lugar de cada nivel por separado", /Se juegan cuatro torneos, cada uno con sus niveles: primero a tercer grado \(primer grado, segundo grado y tercer grado\); cuarto a sexto grado \(cuarto grado, quinto grado y sexto grado\); sétimo y octavo año \(sétimo año y octavo año\); noveno a undécimo año \(noveno año, décimo año y undécimo año\)\. Aunque jueguen mezclados, se premia por separado el 1\.er, 2\.º y 3\.er lugar de cada nivel/.test(textoPdf) && /Primero, segundo y tercer lugar de cada uno de los once niveles/.test(textoPdf), (textoPdf.match(/Se juegan cuatro[^]*?torneo\./) || [""])[0]);  ok("la ronda 1 a las 9:00 a. m., con la llegada a las 8:30", /1 sábado, 14 de noviembre de 2026 9:00 a\. m\./.test(textoPdf) && /De 8:30 a 9:00 a\. m\., llegada y confirmación/.test(textoPdf));
  ok("los resultados, en Pareo Integral", /se publican en Pareo Integral/.test(textoPdf));
  // Los desempates, los mismos de los torneos en Pareo y en su orden (el podio
  // de cada nivel sale de esa clasificación).
  ok("los desempates de Pareo, en su orden: encuentro directo, Buchholz −1, Buchholz, Sonneborn-Berger y rondas ganadas",
    /1\. Encuentro directo \(DE\) - 2\. Buchholz sin el peor \(BH-C1\) - 3\. Buchholz \(BH\) - 4\. Sonneborn-Berger \(SB\) - 5\. Rondas ganadas \(WIN\)/.test(textoPdf)
    && /<li>Encuentro directo<\/li>\s*<li>Buchholz sin el peor<\/li>\s*<li>Buchholz<\/li>\s*<li>Sonneborn-Berger<\/li>\s*<li>Rondas ganadas<\/li>/.test(html),
    (textoPdf.match(/1\. Encuentro[^]{0,200}/) || textoPdf.match(/1\. Buchholz[^]{0,200}/) || [""])[0]);
  ok("el contacto: Adriana, +506 8912-2033", /Información: Adriana, \+506 8912-2033/.test(textoPdf));
  ok("el árbitro principal", /Árbitro principal: FA Jean Carlo Quesada Arauz\./.test(textoPdf));
}

const MOMENTOS = [
  { cuando: "2026-11-12T15:00:00-06:00", etiqueta: "Cuenta regresiva", principal: /^Faltan \d+ horas$/, detalle: /el sábado 14 de noviembre a las 8:30 a\. ?m\. \(hora de Costa Rica\)/, reloj: true },
  { cuando: "2026-11-14T08:40:00-06:00", etiqueta: "Hoy en el torneo", principal: /^Ahora: Llegada y confirmación$/, detalle: /Después: Ronda 1, hoy a las 9:00 a\. ?m\./, reloj: true },
  { cuando: "2026-11-14T09:40:00-06:00", etiqueta: "Hoy en el torneo", principal: /^Ahora: Ronda 2$/, detalle: /Después: Ronda 3, hoy a las 10:00 a\. ?m\./, reloj: true },
  { cuando: "2026-11-14T16:00:00-06:00", etiqueta: "Tacho Chess 2 terminó", principal: /^¡Gracias por jugar!$/, detalle: /mejores de cada nivel/, reloj: false },
];

// La base de mentira: filas de verdad, y la consulta filtra como PostgREST.
function doble(datos) {
  return `(function(){
  const D = ${JSON.stringify(datos)};
  window.sb = { from(tabla) {
    const filas = (D[tabla] || []).slice();
    const f = [];
    let orden = null;
    const q = {
      select() { return q; },
      eq(c, v) { f.push((r) => r[c] === v); return q; },
      in(c, vs) { f.push((r) => vs.includes(r[c])); return q; },
      gte(c, v) { f.push((r) => r[c] >= v); return q; },
      // «%texto%», sin distinguir mayúsculas: cada pedazo, en orden.
      ilike(c, patron) { const partes = patron.toLowerCase().split("%"); f.push((r) => { let d = 0; const v = String(r[c]).toLowerCase(); return partes.every((x, k) => { const at = v.indexOf(x, d); if (at < 0 || (k === 0 && x && at !== 0)) return false; d = at + x.length; return true; }) && (partes[partes.length - 1] === "" || v.endsWith(partes[partes.length - 1])); }); return q; },
      order(c, o) { orden = [c, o && o.ascending === false ? -1 : 1]; return q; },
      range() { return q; },
      then(okf, ko) {
        let out = filas.filter((r) => f.every((g) => g(r)));
        if (orden) out.sort((a, b) => (a[orden[0]] < b[orden[0]] ? -1 : 1) * orden[1]);
        return Promise.resolve({ data: out, error: null }).then(okf, ko);
      },
    };
    return q;
  } };
})();`;
}
const ORGS = [{ id: "org-liceo", nombre: "Liceo Anastasio Alfaro", verificado: true }, { id: "org-falsa", nombre: "Tacho Chess", verificado: false }];
// Cada torneo publicado trae sus jugadores (con su nivel en «categoria»), como los publica Pareo.
const conJugadores = (nombres, cat) => ({ jugadores: nombres.map((n, i) => ({ id: "j" + i + n, nombre: n, categoria: cat, elo: 0, titulo: "", fed: "" })), rondas: [] });
// T2 se publicó antes que T1 pero es de un nivel más alto: la ficha los pone en el orden de los niveles.
const T1 = { id: "11111111-1111-4111-8111-111111111111", nombre: "Tacho Chess 2 · Primaria", creado: "2026-11-13T15:05:00Z", organizador_id: "org-liceo", datos: conJugadores(["Ana Uno", "Beto Dos"], "Primer grado") };
const T2 = { id: "22222222-2222-4222-8222-222222222222", nombre: "Tacho Chess 2 · Secundaria", creado: "2026-11-13T15:00:00Z", organizador_id: "org-liceo", datos: conJugadores(["Caro Tres", "Dani Cuatro"], "Sétimo año") };
// T2 publicado dos veces («Publicar» tocado dos veces): el huérfano, con otro id y sin actualizar.
const T2_REPETIDO = Object.assign({}, T2, { id: "66666666-6666-4666-8666-666666666666", creado: "2026-11-13T14:59:56Z", actualizado: "2026-11-13T14:59:56Z" });
const VIEJO = { id: "33333333-3333-4333-8333-333333333333", nombre: "Tacho Chess 1", creado: "2025-11-10T15:00:00Z", organizador_id: "org-liceo", datos: conJugadores(["Ana Uno"], "Primer grado") };
const FALSO = { id: "44444444-4444-4444-8444-444444444444", nombre: "Tacho Chess 2 (falso)", creado: "2026-11-13T16:00:00Z", organizador_id: "org-falsa", datos: conJugadores(["Eva Cinco"], "Primer grado") };
const OTRO = { id: "55555555-5555-4555-8555-555555555555", nombre: "Abierto de Noviembre", creado: "2026-11-13T16:00:00Z", organizador_id: "org-liceo", datos: conJugadores(["Fer Seis"], "Primer grado") };

async function fichaResultados(nav, publicados) {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: doble({ pareo_organizadores: ORGS, pareo_publicados: publicados }) }));
  await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
  await ctx.route("**/torneos-pareo.html*", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>torneo</p>" }));
  const p = await ctx.newPage();
  const errores = [];
  p.on("pageerror", (e) => errores.push(String(e)));
  await p.goto(BASE + "/" + PAGINA, { waitUntil: "load" });
  await p.waitForTimeout(400);
  const f = await p.evaluate(() => { const e = document.getElementById("ficha-resultados"); return { tag: e.tagName, href: e.getAttribute("href"), ventana: e.dataset.ventana || "", texto: e.textContent.replace(/\s+/g, " ").trim(),
    lista: [...document.querySelectorAll("#resultados-lista a")].map((a) => [a.getAttribute("href"), a.dataset.ventana || "", a.textContent.trim()]) }; });
  return { ctx, p, f, errores };
}

(async () => {
  const nav = await chromium.launch();
  try {
    console.log("\n«Hoy en el torneo», en el navegador (en Madrid, para ver que las horas son de Costa Rica)");
    for (const M of MOMENTOS) {
      const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", timezoneId: "Europe/Madrid" });
      const p = await ctx.newPage();
      const errores = [];
      p.on("pageerror", (e) => errores.push(String(e)));
      await p.clock.setFixedTime(new Date(M.cuando));
      await p.goto(BASE + "/" + PAGINA, { waitUntil: "load" });
      await p.waitForFunction(() => document.getElementById("hoy").dataset.estado, null, { timeout: 5000 }).catch(() => {});
      const h = await p.evaluate(() => ({ etiqueta: document.getElementById("hoy-etiqueta").textContent, principal: document.getElementById("hoy-principal").textContent,
        detalle: document.getElementById("hoy-detalle").textContent, reloj: document.getElementById("hoy-reloj").checkVisibility(),
        fondo: (() => { const c = document.querySelector(".cac-hoy-reloj-casilla"); return c ? getComputedStyle(c).backgroundColor : ""; })() }));
      const dice = M.cuando.slice(0, 16).replace("T", " ");
      ok(dice + ": «" + M.etiqueta + "» / " + M.principal, h.etiqueta === M.etiqueta && M.principal.test(h.principal), JSON.stringify([h.etiqueta, h.principal]));
      ok(dice + ": el detalle, en hora de Costa Rica", M.detalle.test(h.detalle), h.detalle);
      ok(dice + (M.reloj ? ": el reloj cuenta, en el azul del afiche" : ": sin reloj"), M.reloj ? h.reloj && h.fondo === "rgb(6, 76, 167)" : !h.reloj, JSON.stringify([h.reloj, h.fondo]));
      ok(dice + ": sin errores de JavaScript", !errores.length, errores.join(" | "));
      await ctx.close();
    }

    console.log("\nLos resultados, en Pareo Integral (con un doble de la base)");
    for (const [nombre, publicados] of [["sin torneo publicado", []], ["con uno de una organización sin el sello, la edición anterior y otro torneo", [FALSO, VIEJO, OTRO]]]) {
      const r = await fichaResultados(nav, publicados);
      ok(nombre + ": la ficha sigue «Pronto», sin enlace", r.f.tag === "DIV" && !r.f.href && /Pronto/.test(r.f.texto), JSON.stringify(r.f));
      ok(nombre + ": sin errores de JavaScript", !r.errores.length, r.errores.join(" | "));
      await r.ctx.close();
    }
    {
      const r = await fichaResultados(nav, [T1, FALSO, VIEJO, OTRO]);
      ok("con un torneo: la ficha lleva a SU página de Pareo y se abre encima", r.f.tag === "A" && r.f.href === "torneos-pareo.html?en-ventana=1#t=" + T1.id && r.f.ventana && /Ver el torneo/.test(r.f.texto) && !/Pronto/.test(r.f.texto), JSON.stringify(r.f));
      await r.p.click("#ficha-resultados");
      const marco = await r.p.waitForFunction(() => { const f = [...document.querySelectorAll("dialog[open] iframe")].find((x) => x.checkVisibility()); return f && f.src; }, null, { timeout: 5000 }).then((x) => x.jsonValue()).catch(() => "");
      ok("con un torneo: tocarla abre el torneo encima, sin salir de la página", marco.includes("torneos-pareo.html?en-ventana=1#t=" + T1.id) && r.p.url().includes(PAGINA), marco);
      await r.ctx.close();
    }
    {
      const r = await fichaResultados(nav, [T2_REPETIDO, T2, T1, FALSO]);
      ok("con dos torneos (uno publicado dos veces): la ficha abre la ventana con uno por torneo, sin el repetido y en el orden de los niveles", r.f.href === "#resultados" && JSON.stringify(r.f.lista.map((x) => x[0])) === JSON.stringify(["torneos-pareo.html?en-ventana=1#t=" + T1.id, "torneos-pareo.html?en-ventana=1#t=" + T2.id]) && r.f.lista.every((x) => x[1]), JSON.stringify(r.f));
      // «La sala de juego» con dos torneos que empiezan los dos en la mesa 1 (sin
      // evento en Pareo no hay «Numerar seguido»): cada torneo es una zona.
      await r.p.click('a.cac-ficha[href="#sala"]');
      await r.p.waitForTimeout(500);
      const sala = await r.p.evaluate(() => ({ texto: document.getElementById("sala-mesas").innerText.replace(/\s+/g, " "), numeros: document.querySelectorAll("#sala-mesas .cac-sala-mesas").length,
        foto: (() => { const i = document.querySelector("#sala img.cac-sala-foto"); return !!(i && i.alt && i.getAttribute("src") === "img/tacho-chess-2/sala.jpg"); })() }));
      ok("«La sala de juego» trae la foto del gimnasio, con su texto alternativo", sala.foto);
      ok("con dos torneos que empiezan en la mesa 1 (sin evento en Pareo), cada uno es una zona con sus mesas desde la 1, en el orden de los niveles, y se explica",
        sala.numeros === 2 && /Cada torneo juega en su propia zona del gimnasio, con sus mesas numeradas desde la 1/.test(sala.texto)
        && /Mesa 1 Zona de Tacho Chess 2 · Primaria Primer grado 2 jugadores Mesa 1 Zona de Tacho Chess 2 · Secundaria Sétimo año 2 jugadores/.test(sala.texto), JSON.stringify(sala));
      await r.ctx.close();
    }

    console.log("\nEl profe ayuda (js/tacho-chess-profe.js)");
    const textos = async (cuando, publicados) => {
      const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", timezoneId: "Europe/Madrid" });
      await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: doble({ pareo_organizadores: ORGS, pareo_publicados: publicados || [] }) }));
      await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
      const p = await ctx.newPage();
      const errores = [];
      p.on("pageerror", (e) => errores.push(String(e)));
      await p.clock.setFixedTime(new Date(cuando));
      await p.goto(BASE + "/" + PAGINA, { waitUntil: "load" });
      await p.waitForTimeout(400);
      const t = await p.evaluate(() => window.TachoProfe && Object.fromEntries(window.TachoProfe.PREGUNTAS.map((q) => [q.k, window.TachoProfe.texto(q.k)])));
      return { ctx, p, t: t || {}, errores };
    };
    {
      const r = await textos("2026-11-12T16:00:00-06:00");
      const b = await r.p.evaluate(() => { const x = document.getElementById("profe-boton"); const i = x && x.querySelector("img");
        return x && { visible: x.checkVisibility(), etiqueta: x.getAttribute("aria-label"), expandido: x.getAttribute("aria-expanded"), cara: !!(i && i.complete && i.naturalWidth > 0), alt: i.getAttribute("alt") }; });
      ok("el botón «¿Te ayudo?» se ve, con su cara (alt vacío) y aria-expanded", b && b.visible && /¿Te ayudo\?/.test(b.etiqueta) && b.expandido === "false" && b.cara && b.alt === "", JSON.stringify(b));
      await r.p.click("#profe-boton");
      const panel = await r.p.evaluate(() => { const x = document.getElementById("profe-panel"); return { visible: x.checkVisibility(), preguntas: x.querySelectorAll("[data-pregunta]").length, texto: x.textContent, foco: document.activeElement && document.activeElement.dataset.pregunta }; });
      ok("el panel abre con las ocho preguntas y el foco en la primera", panel.visible && panel.preguntas === 8 && panel.foco === "inscribir", JSON.stringify([panel.visible, panel.preguntas, panel.foco]));
      ok("se presenta como «el profe Oscar», en el saludo y en la etiqueta del botón", /¡Hola! Soy el profe Oscar/.test(panel.texto) && /El profe Oscar contesta/.test(b.etiqueta), panel.texto.slice(0, 80) + " · " + b.etiqueta);
      ok("dos días antes: la próxima es la ronda 1, el sábado 14 a las 9:00", /^La próxima es la ronda 1: sábado 14 de noviembre a las 9:00 a\. ?m\./.test(r.t.hora || ""), r.t.hora);
      ok("el contacto, de su ventana: Adriana y su teléfono", /Adriana.*\+506 8912-2033/.test(r.t.contacto || ""), r.t.contacto);
      ok("el ritmo, la tolerancia y el árbitro, de la página", /7 rondas a 10 minutos \+ 2 segundos/.test(r.t.ritmo || "") && /Tolerancia de 10 minutos/.test(r.t.ritmo) && /FA Jean Carlo Quesada Arauz/.test(r.t.ritmo), r.t.ritmo);
      ok("los torneos: los cuatro, y el 1.º, 2.º y 3.º lugar de cada nivel por separado", /Juegan en 4 torneos: primero a tercer grado, cuarto a sexto grado, sétimo y octavo año y noveno a undécimo año\. Aunque jueguen mezclados, se premia por separado el 1\.er, 2\.º y 3\.er lugar de cada nivel/.test(r.t.niveles || ""), r.t.niveles);
      ok("lo que hay además, sin los emojis de adorno", /^Además del torneo: feria de comerciantes de la comunidad, open house y venta de comida\.$/.test(r.t.ademas || ""), r.t.ademas);
      ok("«¿Contra quién juega?» lleva al buscador de la página, con los datos de Pareo Integral", /^Escribe su nombre en «Busca a tu jugador», aquí mismo/.test(r.t.resultados || "") && /Pareo Integral/.test(r.t.resultados), r.t.resultados);
      await r.p.click('[data-pregunta="contacto"]');
      await r.p.click('#profe-panel [data-accion="contacto"]');
      const abierto = await r.p.evaluate(() => [document.getElementById("contacto").open, document.getElementById("profe-panel").hidden]);
      ok("«Ver el contacto» cierra el panel y abre la ventana del contacto", abierto[0] === true && abierto[1] === true, JSON.stringify(abierto));
      await r.p.keyboard.press("Escape");
      await r.p.click("#profe-boton");
      await r.p.keyboard.press("Escape");
      const cerro = await r.p.evaluate(() => [document.getElementById("profe-panel").hidden, document.activeElement && document.activeElement.id]);
      ok("Escape cierra el panel y el foco vuelve al botón", cerro[0] === true && cerro[1] === "profe-boton", JSON.stringify(cerro));
      ok("sin errores de JavaScript", !r.errores.length, r.errores.join(" | "));
      await r.ctx.close();
    }
    for (const [cuando, patron, que] of [
      ["2026-11-14T08:40:00-06:00", /^Ahora: Llegada y confirmación, desde las 8:30 a\. ?m\. Después viene la ronda 1: hoy a las 9:00 a\. ?m\./, "en la llegada: lo de ahora y la ronda 1, hoy a las 9:00"],
      ["2026-11-14T09:40:00-06:00", /^Ahora: ronda 2, desde las 9:30 a\. ?m\. \(aproximadamente\)\. Después viene la ronda 3: hoy a las 10:00/, "en la ronda 2: la que se juega y la ronda 3, hoy a las 10:00"],
    ]) {
      const r = await textos(cuando);
      ok(cuando.slice(11, 16) + " (con el navegador en Madrid), " + que, patron.test(r.t.hora || ""), r.t.hora);
      await r.ctx.close();
    }
    {
      const r = await textos("2026-11-14T09:40:00-06:00");
      await r.p.click("#profe-boton");
      await r.p.click('[data-pregunta="resultados"]');
      await r.p.click('#profe-panel [data-accion="resultados"]');
      const foco = await r.p.evaluate(() => document.activeElement && document.activeElement.id);
      ok("«Buscar a mi jugador» cierra el panel y pone el foco en el buscador", foco === "buscador-nombre", String(foco));
      await r.ctx.close();
    }

    console.log("\nLos resultados de Pareo, como en el Centroamericano (js/torneo-pareo-datos.js)");
    {
      // Un torneo de Pareo que va por la ronda 2: la 1 completa (con el
      // resumen que calcula Pareo al publicar) y la 2 a medias, con un bye.
      const J = (id, nombre, cat) => ({ id, nombre, institucion: "", elo: 0, titulo: "", fed: "", categoria: cat, retiradoDespuesDe: null });
      const datos = { nombre: "Tacho Chess 2 · Primer ciclo", rondasTotales: 7, puntos: { victoria: 1, tablas: 0.5, derrota: 0, bye: 1 }, mesaInicial: 3,
        jugadores: [J("a", "Ana Uno", "Primer grado"), J("b", "Beto Dos", "Primer grado"), J("c", "Caro Tres", "Primer grado"),
          J("d", "Dani Cuatro", "Segundo grado"), J("e", "Eva Cinco", "Segundo grado"), J("f", "Fer Seis", "Segundo grado"), J("g", "Gabo Siete", "Segundo grado")],
        numeracion: ["a", "b", "c", "d", "e", "f", "g"],
        rondas: [{ mesas: [{ b: "a", n: "d", r: "1-0" }, { b: "e", n: "b", r: "=" }, { b: "c", n: "f", r: "0-1" }, { b: "g", n: null, r: null }], ausencias: {} },
          { mesas: [{ b: "f", n: "a", r: null }, { b: "b", n: "g", r: "1-0" }, { b: "d", n: "c", r: null }, { b: "e", n: null, r: null }], ausencias: {} }],
        resumen: [["a", 1, 1], ["f", 2, 1], ["g", 3, 1], ["b", 4, 0.5], ["e", 5, 0.5], ["c", 6, 0], ["d", 7, 0]].map(([id, puesto, puntos]) => ({ id, puesto, puntos, rondas: 1 })) };
      const r = await fichaResultados(nav, [Object.assign({}, T1, { datos }), Object.assign({}, FALSO, { datos })]);
      const buscar = async (n) => { await r.p.fill("#buscador-nombre", n); await r.p.waitForTimeout(500);
        return r.p.evaluate(() => ({ estado: document.getElementById("buscador-estado").textContent, tarjetas: [...document.querySelectorAll("#buscador-resultados > li")].map((l) => l.innerText.replace(/\s+/g, " ")) })); };
      const ana = await buscar("Ana");
      ok("«Busca a tu jugador» lee Pareo Integral (no chess-results) y solo el torneo de la organización con el sello", /Leído en Pareo Integral/.test(ana.estado) && !/chess-results/.test(ana.estado) && ana.tarjetas.length === 1, JSON.stringify(ana));
      ok("su tarjeta: el nivel, el puesto EN SU NIVEL, los puntos y la mesa de la sala (la primera del torneo + su lugar), el color y el rival",
        /Primer grado · Puesto 1 de 3 en Primer grado · 1 punto/.test(ana.tarjetas[0] || "") && /Ronda 2 · Mesa 3 · Juega con negras contra Fer Seis/.test(ana.tarjetas[0]), ana.tarjetas[0]);
      const eva = await buscar("Eva");
      ok("los puntos son los de las rondas completas (la ronda en juego no suma todavía) y el bye se dice", /Puesto 3 de 4 en Segundo grado · ½ puntos/.test(eva.tarjetas[0] || "") && /Ronda 2: tiene bye/.test(eva.tarjetas[0]), eva.tarjetas[0]);
      await r.p.click('a.cac-ficha[href="#medallero"]');
      await r.p.waitForTimeout(400);
      const podio = await r.p.evaluate(() => document.getElementById("medallero-contenido").innerText.replace(/\s+/g, " "));
      ok("el podio va por nivel, en el orden de los niveles, con el 1.º, 2.º y 3.º de cada uno",
        /Primer grado .*1\. Ana Uno · 1 punto .*2\. Beto Dos · ½ puntos .*3\. Caro Tres · 0 puntos .*Segundo grado .*1\. Fer Seis · 1 punto .*2\. Gabo Siete · 1 punto .*3\. Eva Cinco · ½ puntos/.test(podio), podio);
      await r.p.keyboard.press("Escape");
      await r.p.click('a.cac-ficha[href="#clasificacion"]');
      await r.p.waitForTimeout(400);
      const cl = await r.p.evaluate(() => ({ niveles: [...document.querySelectorAll("#clasificacion-categoria option")].map((o) => o.textContent),
        cabeza: [...document.querySelectorAll("#clasificacion-contenido th[scope=col]")].map((t) => t.textContent) }));
      ok("la clasificación se elige por nivel, de primer grado en adelante, y sin la columna «FED» (vacía en un torneo de Costa Rica)",
        JSON.stringify(cl.niveles) === JSON.stringify(["Primer grado", "Segundo grado"]) && !cl.cabeza.includes("FED"), JSON.stringify(cl));
      await r.p.keyboard.press("Escape");
      await r.p.click('a.cac-ficha[href="#pareos"]');
      await r.p.waitForTimeout(400);
      const pa = await r.p.evaluate(() => ({ abierta: document.getElementById("pareos").open, estado: (document.querySelector("#pareos-contenido > p") || {}).textContent || "",
        mesas: [...document.querySelectorAll("#pareos-contenido .cac-pareo-mesa")].map((li) => li.innerText.replace(/\s+/g, " ").trim()) }));
      ok("«Pareos de la ronda» abre solo el pareo: cuántas van terminadas, sin el punto doble", pa.abierta && /^Ronda 2 de 7: 1 de 3 partidas terminadas\. Leído en Pareo Integral: .+ [ap]\. m\.$/.test(pa.estado) && !/\.\.$/.test(pa.estado), pa.estado);
      ok("cada mesa: la de la sala, blancas y negras escritas con su nivel, y el resultado o «Se juega»; el bye dice que descansa",
        pa.mesas.length === 4 && /^Mesa 3 BLANCAS Fer Seis Segundo grado NEGRAS Ana Uno Primer grado Se juega$/i.test(pa.mesas[0]) && /1 - 0$/.test(pa.mesas[1]) && /^Mesa 6 BLANCAS Eva Cinco Segundo grado Descansa: bye de un punto\. Bye$/i.test(pa.mesas[3]), JSON.stringify(pa.mesas));
      await r.p.keyboard.press("Escape");
      await r.p.click('a.cac-ficha[href="#sala"]');
      await r.p.waitForTimeout(400);
      const mesasSala = await r.p.evaluate(() => [...document.querySelectorAll("#sala-mesas .cac-sala-torneo")].map((li) => li.innerText.replace(/\s+/g, " ").trim()));
      ok("«La sala de juego»: las mesas del torneo salen de Pareo (desde su primera mesa, una por cada dos jugadores) con sus niveles",
        JSON.stringify(mesasSala) === JSON.stringify(["Mesas 3 a 6 Tacho Chess 2 · Primaria Primer grado · Segundo grado 7 jugadores"]), JSON.stringify(mesasSala));
      ok("sin errores de JavaScript", !r.errores.length, r.errores.join(" | "));
      await r.ctx.close();
    }

    console.log("\nLa cara, la inscripción y el celular");
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    // Sin salir a Google: el formulario se contesta con una página vacía.
    await ctx.route(/forms\.gle|docs\.google\.com/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>formulario</p>" }));
    const p = await ctx.newPage();
    await p.goto(BASE + "/" + PAGINA, { waitUntil: "load" });
    const cara = await p.evaluate(() => {
      const pil = getComputedStyle(document.querySelector(".cac-pildora"));
      const t = document.querySelector(".cac-portada .u-logo");
      return { portada: getComputedStyle(document.querySelector(".cac-portada")).backgroundImage, pildora: [pil.backgroundColor, pil.color],
        tacho: !!(t && t.complete && t.naturalWidth === 450 && t.checkVisibility()),
        escudo: (() => { const i = document.querySelector(".u-aliado"); return !!(i && i.complete && i.naturalWidth > 0 && i.checkVisibility()); })() };
    });
    ok("la portada lleva el azul del afiche", cara.portada.includes("6, 76, 167") && cara.portada.includes("4, 42, 105"), cara.portada.slice(0, 160));
    ok("la píldora va en el rojo del afiche con letra blanca (5,1 : 1)", cara.pildora[0] === "rgb(220, 13, 25)" && cara.pildora[1] === "rgb(255, 255, 255)", JSON.stringify(cara.pildora));
    ok("Tacho, la mascota, se ve en la portada", cara.tacho);
    ok("el escudo del liceo se ve en la franja de quién organiza", cara.escudo);
    await p.click("#ficha-inscribirme");
    await p.click('#inscribirme a[data-ventana]');
    const marco = await p.waitForFunction(() => { const f = [...document.querySelectorAll("dialog[open] iframe")].find((x) => x.checkVisibility()); return f && f.src; }, null, { timeout: 5000 }).then((x) => x.jsonValue()).catch(() => "");
    ok("«Inscribirme» → «Abrir el formulario» lo abre encima, sin salir de la página", marco.startsWith(FORMULARIO) && p.url().includes(PAGINA), marco + " · " + p.url());
    await ctx.close();

    const cel = await nav.newContext({ viewport: { width: 375, height: 800 }, serviceWorkers: "block" });
    const pc = await cel.newPage();
    await pc.goto(BASE + "/" + PAGINA, { waitUntil: "load" });
    const ancho = await pc.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    ok("en el celular no hay scroll de costado", ancho[0] <= ancho[1], ancho.join(" > "));
    await cel.close();
  } finally {
    await nav.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})();

/*! rev bfb5bbb0d2d82f9f */
