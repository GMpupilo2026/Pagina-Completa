/* La página del Torneo Intereducativo Tacho Chess 2 (tacho-chess-2.html) y sus
 * bases en PDF. Lo que se rompe acá no da error: la página se ve perfecta y
 * dice otra cosa que el afiche.
 *
 *   1. EL HTML, leído: los datos del afiche (sábado 14 de noviembre, 8:30
 *      a.m., Gimnasio del Centro, gratis, de primer grado a undécimo año) y
 *      lo que dio el dueño (5 rondas a 10 minutos + 2 segundos, la ronda 1 a
 *      las 9:00 y el árbitro principal); el calendario con la llegada a las
 *      8:30 y sus cinco rondas, la primera a las 9:00 y las demás
 *      del mismo horario que las bases (BasesTorneo.horario); el formulario
 *      del código QR del afiche, que se abre encima; «Resultados» va
 *      «Pronto»; sin chess-results; el contacto, solo el de Adriana; la
 *      mascota, el escudo y las bases existen.
 *   2. LAS BASES EN PDF dicen lo mismo: la fecha, la sede, el ritmo, las 5
 *      rondas, la inscripción gratuita con el formulario y los once niveles.
 *   3. «HOY EN EL TORNEO», con el reloj fijo y el navegador en Madrid: dos
 *      días antes (la cuenta regresiva), en la llegada, en la ronda 2 y de
 *      tarde (terminó).
 *   4. LOS RESULTADOS, EN PAREO INTEGRAL (js/tacho-chess-resultados.js), con
 *      un doble de la base que filtra de verdad: sin torneo, o con uno de
 *      una organización sin el sello «Organizador verificado», o de la
 *      edición anterior, la ficha sigue «Pronto»; con uno, lleva a SU página
 *      de Pareo y se abre encima; con varios (los niveles en varios
 *      torneos), abre la ventana con uno por torneo.
 *   5. La cara: el azul del afiche, la píldora roja con letra blanca, Tacho
 *      a la vista, la ficha «Inscribirme» abre el formulario encima y en el
 *      celular no hay scroll de costado.
 *
 * Ver «La del Tacho Chess 2» en docs/decisiones/juegos-y-torneos.md.
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
ok("el ritmo que dio el dueño: 5 rondas a 10 minutos + 2 segundos", /5 rondas a 10 minutos \+ 2 segundos/.test(visible));
const filas = [...html.matchAll(/<tr data-inicio="([^"]+)" data-minutos="(\d+)"([^>]*)><th scope="row"[^>]*>([^<]+)<\/th>/g)]
  .map((m) => [m[4], m[1], (m[3].match(/data-ronda="(\d+)"/) || [])[1] || ""]);
const esperado = B.horario(bases).map((x) => ["Ronda " + x.ronda, "2026-11-14T" + String(Math.floor(x.min / 60)).padStart(2, "0") + ":" + String(x.min % 60).padStart(2, "0"), String(x.ronda)]);
ok("el calendario trae la llegada a las 8:30, las 5 rondas con el horario de las bases y la premiación", filas.length === 7 && JSON.stringify(filas[0]) === JSON.stringify(["Llegada y confirmación", "2026-11-14T08:30", ""]) && JSON.stringify(filas.slice(1, 6)) === JSON.stringify(esperado) && filas[6][0] === "Premiación", JSON.stringify(filas));
ok("la ronda 1 es a las 9:00 del sábado 14, y es la única marcada como la primera", filas[1][1] === "2026-11-14T09:00" && /<tr data-inicio="2026-11-14T09:00"[^>]*data-primera-ronda/.test(html) && (html.match(/data-primera-ronda/g) || []).length === 1);
ok("el árbitro principal que dio el dueño", /Árbitro principal: FA Jean Carlo Quesada Arauz/.test(visible));
ok("las horas de las rondas 2 a 5 dicen que son aproximadas", (html.match(/\(aprox\.\)<\/td><\/tr>/g) || []).length === 5);
ok("el formulario es el del código QR del afiche y se abre encima", new RegExp('<a href="' + FORMULARIO.replace(/[./]/g, "\\$&") + '"[^>]*data-ventana=').test(html));
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
  ok("el ritmo y las rondas: 10 minutos + 2 segundos, suizo a 5 rondas, ajedrez rápido", /10 minutos para toda la partida, con un incremento de 2 segundos/.test(textoPdf) && /Sistema suizo, a 5 rondas/.test(textoPdf) && /ajedrez rápido/.test(textoPdf));
  ok("la inscripción gratuita con el formulario del afiche", /La inscripción es gratuita/.test(textoPdf) && textoPdf.includes(FORMULARIO.replace("https://", "")));
  ok("los once niveles, de primer grado a undécimo año", ["Primer grado", "Sexto grado", "Sétimo año", "Undécimo año"].every((n) => textoPdf.includes(n)));
  ok("la ronda 1 a las 9:00 a. m., con la llegada a las 8:30", /1 sábado, 14 de noviembre de 2026 9:00 a\. m\./.test(textoPdf) && /De 8:30 a 9:00 a\. m\., llegada y confirmación/.test(textoPdf));
  ok("los resultados, en Pareo Integral", /se publican en Pareo Integral/.test(textoPdf));
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
const T1 = { id: "11111111-1111-4111-8111-111111111111", nombre: "Tacho Chess 2 · Primaria", creado: "2026-11-13T15:00:00Z", organizador_id: "org-liceo" };
const T2 = { id: "22222222-2222-4222-8222-222222222222", nombre: "Tacho Chess 2 · Secundaria", creado: "2026-11-13T15:05:00Z", organizador_id: "org-liceo" };
const VIEJO = { id: "33333333-3333-4333-8333-333333333333", nombre: "Tacho Chess 1", creado: "2025-11-10T15:00:00Z", organizador_id: "org-liceo" };
const FALSO = { id: "44444444-4444-4444-8444-444444444444", nombre: "Tacho Chess 2 (falso)", creado: "2026-11-13T16:00:00Z", organizador_id: "org-falsa" };
const OTRO = { id: "55555555-5555-4555-8555-555555555555", nombre: "Abierto de Noviembre", creado: "2026-11-13T16:00:00Z", organizador_id: "org-liceo" };

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
      ok("con un torneo: la ficha lleva a SU página de Pareo y se abre encima", r.f.tag === "A" && r.f.href === "torneos-pareo.html#t=" + T1.id && r.f.ventana && /Ver el torneo/.test(r.f.texto) && !/Pronto/.test(r.f.texto), JSON.stringify(r.f));
      await r.p.click("#ficha-resultados");
      const marco = await r.p.waitForFunction(() => { const f = [...document.querySelectorAll("dialog[open] iframe")].find((x) => x.checkVisibility()); return f && f.src; }, null, { timeout: 5000 }).then((x) => x.jsonValue()).catch(() => "");
      ok("con un torneo: tocarla abre el torneo encima, sin salir de la página", marco.includes("torneos-pareo.html#t=" + T1.id) && r.p.url().includes(PAGINA), marco);
      await r.ctx.close();
    }
    {
      const r = await fichaResultados(nav, [T2, T1, FALSO]);
      ok("con dos torneos (los niveles separados): la ficha abre la ventana con uno por torneo, en orden", r.f.href === "#resultados" && JSON.stringify(r.f.lista.map((x) => x[0])) === JSON.stringify(["torneos-pareo.html#t=" + T1.id, "torneos-pareo.html#t=" + T2.id]) && r.f.lista.every((x) => x[1]), JSON.stringify(r.f));
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
