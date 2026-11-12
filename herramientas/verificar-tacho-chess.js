/* La página del Torneo Intereducativo Tacho Chess 2 (tacho-chess-2.html) y sus
 * bases en PDF. Lo que se rompe acá no da error: la página se ve perfecta y
 * dice otra cosa que el afiche.
 *
 *   1. EL HTML, leído: los datos del afiche (sábado 14 de noviembre, 8:30
 *      a.m., Gimnasio del Centro, gratis, de primer grado a undécimo año) y el
 *      ritmo que dio el dueño (5 rondas, 10 minutos + 2 segundos); el
 *      calendario con sus cinco rondas, la primera a las 8:30 y las demás
 *      del mismo horario que las bases (BasesTorneo.horario); el formulario
 *      del código QR del afiche, que se abre encima; «Resultados» va
 *      «Pronto»; sin chess-results ni teléfonos (el afiche no trae); la
 *      mascota, el escudo y las bases existen.
 *   2. LAS BASES EN PDF dicen lo mismo: la fecha, la sede, el ritmo, las 5
 *      rondas, la inscripción gratuita con el formulario y los once niveles.
 *   3. «HOY EN EL TORNEO», con el reloj fijo y el navegador en Madrid: dos
 *      días antes (la cuenta regresiva), en la ronda 2 y de tarde (terminó).
 *   4. La cara: el azul del afiche, la píldora roja con letra blanca, Tacho
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
ok("el calendario trae las 5 rondas con el horario de las bases y después la premiación", JSON.stringify(filas.slice(0, 5)) === JSON.stringify(esperado) && filas.length === 6 && filas[5][0] === "Premiación", JSON.stringify(filas));
ok("la ronda 1 es a las 8:30 del sábado 14, y es la única marcada como la primera", filas[0][1] === "2026-11-14T08:30" && (html.match(/data-primera-ronda/g) || []).length === 1);
ok("las horas de las rondas 2 a 5 dicen que son aproximadas", (html.match(/\(aprox\.\)<\/td><\/tr>/g) || []).length === 5);
ok("el formulario es el del código QR del afiche y se abre encima", new RegExp('<a href="' + FORMULARIO.replace(/[./]/g, "\\$&") + '"[^>]*data-ventana=').test(html));
ok("«Resultados» va «Pronto» (sin enlace, con tabindex)", /<div id="ficha-resultados" tabindex="0" aria-disabled="true"/.test(html));
ok("sin chess-results ni teléfonos (el afiche no trae)", !/chess-results\.com|href="tel:|wa\.me\//.test(html));
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
  ok("la ronda 1 a las 8:30 a. m.", /1 sábado, 14 de noviembre de 2026 8:30 a\. m\./.test(textoPdf));
}

const MOMENTOS = [
  { cuando: "2026-11-12T15:00:00-06:00", etiqueta: "Cuenta regresiva", principal: /^Faltan \d+ horas$/, detalle: /el sábado 14 de noviembre a las 8:30 a\. ?m\. \(hora de Costa Rica\)/, reloj: true },
  { cuando: "2026-11-14T09:10:00-06:00", etiqueta: "Hoy en el torneo", principal: /^Ahora: Ronda 2$/, detalle: /Después: Ronda 3, hoy a las 9:30 a\. ?m\./, reloj: true },
  { cuando: "2026-11-14T16:00:00-06:00", etiqueta: "Tacho Chess 2 terminó", principal: /^¡Gracias por jugar!$/, detalle: /mejores de cada nivel/, reloj: false },
];

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
