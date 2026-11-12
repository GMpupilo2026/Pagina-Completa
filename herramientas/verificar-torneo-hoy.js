/* Las páginas de torneo de la plantilla (herramientas/torneo-universitario.js)
 * cuando el torneo todavía no se juega: hoy, jdn-pz-2026.html, la de la
 * Eliminatoria Cantonal JDN de Pérez Zeledón.
 *
 * Lo que se rompe acá no da error: la página se ve perfecta y dice otra cosa.
 *
 *   1. EL HTML, leído: arriba va «Hoy en el torneo» (#hoy), no «El podio»;
 *      carga js/torneo-hoy.js y no js/torneo-podio.js; el calendario trae
 *      las cinco rondas, el almuerzo y la clausura con su hora de Costa Rica
 *      (data-inicio), y una sola marcada como la primera; sin chess-results:
 *      ni el buscador ni la clasificación que lo leían; «Resultados U12» y
 *      «Resultados U20» van «Pronto» hasta que exista su torneo, y nada
 *      lleva a la lista de Pareo, que trae los torneos de otros; las bases que enlaza
 *      existen; el logo y el del CCDR existen.
 *   2. «HOY EN EL TORNEO», en un navegador con el reloj fijo (page.clock),
 *      en cuatro momentos: diez días antes (la cuenta regresiva a la ronda
 *      1), en plena ronda 1 (lo que se juega y el reloj a la ronda 2), en el
 *      almuerzo (el reloj a la ronda 3) y de noche (terminó, sin reloj).
 *      Las horas se dicen en hora de Costa Rica aunque el navegador esté en
 *      otra zona (el contexto va en Madrid a propósito).
 *   3. La cara: el azul de la ADAPZ, las casillas de la cuenta en ese azul
 *      (no en el morado del Centroamericano) y sin scroll de costado en el
 *      celular.
 *
 * Ver «La de la Eliminatoria Cantonal JDN de Pérez Zeledón» en
 * docs/decisiones/juegos-y-torneos.md.
 *
 *   python3 -m http.server 8777     (desde la raíz del sitio)
 *   node herramientas/verificar-torneo-hoy.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const PAGINA = "jdn-pz-2026.html";

let fallos = 0;
function ok(nombre, cond, detalle) {
  console.log((cond ? "  ✓ " : "  ✗ ") + nombre + (cond || !detalle ? "" : " — " + detalle));
  if (!cond) fallos++;
}

console.log(PAGINA + ", leída");
const html = fs.readFileSync(path.join(RAIZ, PAGINA), "utf8");
ok("arriba va «Hoy en el torneo», no «El podio»", html.includes('<section id="hoy"') && !html.includes('id="podio"'));
ok("carga js/torneo-hoy.js y no js/torneo-podio.js", html.includes('src="js/torneo-hoy.js"') && !html.includes('src="js/torneo-podio.js"'));
const filas = [...html.matchAll(/<tr data-inicio="([^"]+)" data-minutos="(\d+)"([^>]*)><th scope="row"[^>]*>([^<]+)<\/th>/g)]
  .map((m) => [m[4], m[1], Number(m[2]), (m[3].match(/data-ronda="(\d+)"/) || [])[1] || ""]);
ok("el calendario trae las cinco rondas, el almuerzo y la clausura, el domingo 22 de noviembre", JSON.stringify(filas) === JSON.stringify([
  ["Ronda 1", "2026-11-22T08:00", 120, "1"], ["Ronda 2", "2026-11-22T10:00", 120, "2"], ["Almuerzo", "2026-11-22T12:00", 60, ""],
  ["Ronda 3", "2026-11-22T13:00", 120, "3"], ["Ronda 4", "2026-11-22T15:00", 120, "4"], ["Ronda 5", "2026-11-22T17:00", 120, "5"],
  ["Clausura", "2026-11-22T19:30", 60, ""]]), JSON.stringify(filas));
ok("una sola fila es la primera ronda", (html.match(/data-primera-ronda/g) || []).length === 1);
ok("sin chess-results: ni el enlace, ni el buscador, ni sus scripts", !/chess-results\.com|id="buscador"|centroamericano-vivo\.js/.test(html));
ok("«Resultados U12» y «Resultados U20» van «Pronto» (sin enlace, con tabindex) hasta que exista su torneo", ["u12", "u20"].every((k) => new RegExp('<div id="ficha-resultados-' + k + '" tabindex="0" aria-disabled="true"').test(html)));
ok("nada lleva a la lista de torneos de Pareo (trae los de otros)", !html.includes('href="torneos-pareo.html"'));
ok("la ficha «Inscribirme» abre el formulario", /<a href="#inscribirme" id="ficha-inscribirme"/.test(html) && html.includes('<dialog id="inscribirme"'));
const locales = [...html.matchAll(/(?:href|src)="((?:documentos|img)\/[^"#?]+)"/g)].map((m) => m[1]);
const faltan = [...new Set(locales)].filter((f) => !fs.existsSync(path.join(RAIZ, f)));
ok("las bases y los logos que enlaza existen", locales.some((f) => f.endsWith(".pdf")) && !faltan.length, faltan.join(", "));
ok("no lleva ningún teléfono (las bases no traen uno)", !/href="tel:|wa\.me\//.test(html));

const MOMENTOS = [
  { cuando: "2026-11-11T20:00:00-06:00", etiqueta: "Cuenta regresiva", principal: "Faltan 10 días", detalle: /^Empieza con «Ronda 1», el domingo 22 de noviembre a las 8:00 a\. ?m\. \(hora de Costa Rica\)\.$/, reloj: /^Faltan para la ronda 1 \(el domingo 22 de noviembre a las 8:00 a\. ?m\.\):$/ },
  { cuando: "2026-11-22T09:10:00-06:00", etiqueta: "Hoy en el torneo", principal: "Ahora: Ronda 1", detalle: /^Empezó a las 8:00 a\. ?m\. Después: Ronda 2, hoy a las 10:00 a\. ?m\.$/, reloj: /^Faltan para la ronda 2 \(hoy a las 10:00 a\. ?m\.\):$/ },
  { cuando: "2026-11-22T12:20:00-06:00", etiqueta: "Hoy en el torneo", principal: "Ahora: Almuerzo", detalle: /Después: Ronda 3, hoy a las 1:00 p\. ?m\./, reloj: /^Faltan para la ronda 3 \(hoy a las 1:00 p\. ?m\.\):$/ },
  { cuando: "2026-11-22T21:00:00-06:00", etiqueta: "La eliminatoria terminó", principal: "¡Gracias por jugar!", detalle: /«Resultados U12» y «Resultados U20»/, reloj: null },
];

(async () => {
  const nav = await chromium.launch(fs.existsSync(CHROME) ? { executablePath: CHROME } : {});
  try {
    console.log("\n«Hoy en el torneo», en el navegador (en Madrid, para ver que las horas son de Costa Rica)");
    for (const M of MOMENTOS) {
      const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", timezoneId: "Europe/Madrid" });
      // Sin la función de verdad: la sala todavía no tiene chess-results.
      await ctx.addInitScript(() => {
        window.sb = { functions: { invoke: async () => ({ data: { torneos: [], modalidades: ["clasico"], modalidad: "clasico" }, error: null }) } };
      });
      const p = await ctx.newPage();
      const errores = [];
      p.on("pageerror", (e) => errores.push(String(e)));
      await p.clock.setFixedTime(new Date(M.cuando));
      await p.goto(BASE + "/" + PAGINA, { waitUntil: "load" });
      await p.waitForFunction(() => document.getElementById("hoy").dataset.estado, null, { timeout: 5000 }).catch(() => {});
      const h = await p.evaluate(() => {
        const reloj = document.getElementById("hoy-reloj");
        return { etiqueta: document.getElementById("hoy-etiqueta").textContent, principal: document.getElementById("hoy-principal").textContent,
          detalle: document.getElementById("hoy-detalle").textContent, reloj: reloj.checkVisibility() ? reloj.querySelector("[data-reloj-etiqueta]").textContent : null,
          casillas: reloj.querySelectorAll(".cac-hoy-reloj-casilla").length, texto: reloj.querySelector("[data-reloj-texto]").textContent,
          fondo: reloj.querySelector(".cac-hoy-reloj-casilla") ? getComputedStyle(reloj.querySelector(".cac-hoy-reloj-casilla")).backgroundColor : "" };
      });
      const dice = M.cuando.slice(0, 16).replace("T", " ");
      ok(dice + ": «" + M.etiqueta + "» / «" + M.principal + "»", h.etiqueta === M.etiqueta && h.principal === M.principal, JSON.stringify([h.etiqueta, h.principal]));
      ok(dice + ": el detalle dice lo que sigue, en hora de Costa Rica", M.detalle.test(h.detalle), h.detalle);
      if (M.reloj) {
        ok(dice + ": el reloj cuenta hasta la próxima ronda, con su frase para el lector de pantalla", M.reloj.test(h.reloj || "") && h.casillas >= 3 && /^Faltan .+ para la ronda \d\.$/.test(h.texto), JSON.stringify([h.reloj, h.casillas, h.texto]));
        ok(dice + ": las casillas van en el azul de la ADAPZ, no en el morado del Centroamericano", h.fondo === "rgb(31, 58, 122)", h.fondo);
      } else ok(dice + ": sin reloj: ya no hay ronda que esperar", h.reloj === null, String(h.reloj));
      ok(dice + ": sin errores de JavaScript", !errores.length, errores.join(" | "));
      await ctx.close();
    }

    console.log("\nLa cara y el celular");
    const ctx = await nav.newContext({ viewport: { width: 375, height: 800 }, serviceWorkers: "block" });
    const p = await ctx.newPage();
    await p.goto(BASE + "/" + PAGINA, { waitUntil: "load" });
    const cara = await p.evaluate(() => ({ portada: getComputedStyle(document.querySelector(".cac-portada")).backgroundImage,
      logo: (() => { const i = document.querySelector(".u-logo-redondo"); return !!(i && i.complete && i.naturalWidth > 0 && i.checkVisibility()); })(),
      aliado: (() => { const i = document.querySelector(".u-aliado"); return !!(i && i.complete && i.naturalWidth > 0 && i.checkVisibility()); })(),
      ancho: document.documentElement.scrollWidth, ventana: window.innerWidth }));
    ok("la portada lleva el azul de la ADAPZ y su logo redondo", cara.portada.includes("31, 58, 122") && cara.logo, JSON.stringify(cara));
    ok("la franja de quién organiza lleva el logo del CCDR", cara.aliado);
    ok("en el celular no hay scroll de costado", cara.ancho <= cara.ventana, cara.ancho + " > " + cara.ventana);
    await ctx.close();
  } finally {
    await nav.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})();

/*! rev bfb5bbb0d2d82f9f */
