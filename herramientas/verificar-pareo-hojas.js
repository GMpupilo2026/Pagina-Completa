/* Pareo Integral: las hojas que se imprimen se ven ordenadas
 * (js/pareo/pagina.js, js/pareo/pdf.js, css/styles.css).
 *
 * Lo que se prueba, porque se rompe sin dar ningún error (la hoja sale,
 * pero desordenada):
 *   - la plantilla de la pared: el guion y la casilla del resultado en la
 *     misma columna en todas las filas, aunque un nombre ocupe dos líneas, y
 *     la casilla dentro de la hoja;
 *   - las planillas para firmar: al menos 4 por hoja carta;
 *   - las planillas de anotación: cada una en UNA hoja carta (antes las
 *     jugadas 27-30 y 57-60 se pasaban a otra), sin los márgenes del
 *     navegador (que imprimen la dirección y «1/14») y sin una hoja en
 *     blanco antes;
 *   - la marca de agua de Ajedrez Integral en todo lo impreso y en los PDF;
 *   - los avisos de la página no salen en el papel.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-hojas.js
 */
const fs = require("fs");
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const P = require("./lib/pareo-pruebas");

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));

const NOMBRES = ["PRUEBA LOPEZ LORENZO THOMAS ALEJANDRO", "PRUEBA DOS", "PRUEBA CESPEDES RYAN", "PRUEBA MUÑOZ ALESSANDRO ANDRES",
  "PRUEBA SOSA NOAH", "PRUEBA SEIS", "PRUEBA GUERRERO IAN ALEJANDRO", "PRUEBA HERRERA ISAAC", "PRUEBA SANCHEZ ANDY MARTIN"];
// Una hoja carta mide 27,94 cm; con los márgenes del navegador quedan unos 25.
const CM = 96 / 2.54;
// Con la vista de impresión los botones están escondidos: se tocan por código.
const tocar = (page, texto) => page.evaluate((t) => [...document.querySelectorAll("#pi-ronda button")].find((b) => b.textContent.includes(t)).click(), texto);

async function prueba(browser) {
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE);
  await page.click('[data-ficha="torneo"]');
  await page.fill('#pi-form-torneo [name="nombre"]', "PRUEBA JDE 2026 · Etapa Regional · DRE Alajuela — Individual · Categoría A · Abierto");
  await page.press('#pi-form-torneo [name="nombre"]', "Tab");
  await page.click('[data-ficha="jugadores"]');
  await page.click("#pi-pegar-caja summary");
  await page.fill("#pi-pegar", NOMBRES.join("\n"));
  await page.click("#pi-pegar-agregar");
  await page.click('[data-ficha="rondas"]');
  await page.click("#pi-emparejar");
  await page.waitForSelector("#pi-mesa-0");
  await page.emulateMedia({ media: "print" });
  await page.setViewportSize({ width: Math.round(19 * CM), height: 1000 });

  console.log("\n=== La plantilla de la pared ===");
  await tocar(page, "Plantilla para la pared");
  const filas = await page.$$eval("#pi-plantilla .pi-plantilla-mesa:not(.pi-plantilla-mesa-bye)", (l) => l.map((f) => {
    const vs = f.querySelector(".pi-plantilla-vs").getBoundingClientRect();
    const caja = f.querySelector(".pi-plantilla-resultado").getBoundingClientRect();
    return { vs: Math.round(vs.left), caja: Math.round(caja.left), der: Math.round(caja.right), alto: Math.round(f.getBoundingClientRect().height) };
  }));
  const ancho = await page.evaluate(() => document.getElementById("pi-plantilla").getBoundingClientRect().right);
  ok(filas.length === 4 && new Set(filas.map((f) => f.vs)).size === 1 && new Set(filas.map((f) => f.caja)).size === 1, "el guion y la casilla del resultado, en la misma columna en todas las filas", JSON.stringify(filas));
  ok(new Set(filas.map((f) => f.alto)).size > 1, "(con nombres de una y de dos líneas)", JSON.stringify(filas.map((f) => f.alto)));
  ok(filas.every((f) => f.der <= ancho + 1), "la casilla queda dentro de la hoja", JSON.stringify({ ancho, filas }));
  ok(await page.$eval("#pi-marca-agua", (m) => getComputedStyle(m).display !== "none" && getComputedStyle(m).position === "fixed" && Number(getComputedStyle(m).opacity) < 0.2), "al imprimir lleva la marca de agua, clara, en cada hoja");
  ok(/img\/marca-agua-ajedrez-integral\.png$/.test(await page.$eval("#pi-marca-agua", (m) => m.src)), "la de Ajedrez Integral (sin el nombre de Oscar)");
  ok(await page.$eval("#avisos-zona", (z) => getComputedStyle(z).display === "none").catch(() => true), "y los avisos de la página no salen en el papel");
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));

  console.log("\n=== Las planillas para firmar ===");
  await tocar(page, "Planillas para firmar");
  const tarjetas = await page.$$eval("#pi-firmas .pi-ft", (l) => l.map((x) => {
    const r = x.getBoundingClientRect();
    return { alto: r.height + parseFloat(getComputedStyle(x).marginBottom), corte: getComputedStyle(x).breakAfter };
  }));
  const cuatro = tarjetas.slice(0, 4).reduce((a, x) => a + x.alto, 0);
  ok(tarjetas.length === 5 && cuatro < 24 * CM, "caben al menos 4 por hoja carta (4 miden " + (cuatro / CM).toFixed(1) + " cm)", JSON.stringify(tarjetas));
  ok(tarjetas.every((x) => x.corte !== "page"), "sin salto de hoja entre una y otra");
  const textos = await page.$$eval("#pi-firmas .pi-ft", (l) => l.map((x) => x.textContent));
  ok(/Mesa 1/.test(textos[0]) && /Blancas/.test(textos[0]) && /Negras/.test(textos[0]) && /☐ 1-0/.test(textos[0]) && /Firma de PRUEBA/.test(textos[0]), "cada una con la mesa, los colores, las casillas del resultado y las firmas", textos[0]);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));

  console.log("\n=== Las planillas de anotación ===");
  // Esta hoja no tiene márgenes: mide lo que la hoja carta entera (21,6 cm).
  await page.setViewportSize({ width: Math.round(21.59 * CM), height: 1000 });
  await tocar(page, "Planillas de anotación");
  const hojas = await page.$$eval("#pi-firmas .pi-planilla", (l) => l.length);
  // (Se mide antes del PDF: al terminar de imprimir, la hoja se vacía.)
  const alto = await page.$eval("#pi-firmas .pi-planilla", (x) => x.getBoundingClientRect().height);
  ok(alto < 27.2 * CM, "la planilla mide menos que la hoja (" + (alto / CM).toFixed(1) + " cm de 27,9)");
  const renglon = await page.$eval("#pi-firmas .pi-planilla tbody td", (x) => x.getBoundingClientRect().height);
  ok(renglon >= 0.66 * CM, "con renglones altos para anotar (" + (renglon / CM).toFixed(2) + " cm)");
  // El PDF que arma Chromium con la vista de impresión: las hojas de verdad.
  const enPdf = await page.pdf({ format: "Letter", preferCSSPageSize: true, printBackground: true });
  const paginas = (enPdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  ok(hojas === 4 && paginas === hojas, "una hoja carta por planilla, con las 60 jugadas (" + hojas + " planillas, " + paginas + " hojas)");
  const sinMargen = await page.evaluate(() => [...document.styleSheets].some((h) => { try { return [...h.cssRules].some((r) => r instanceof CSSPageRule && r.selectorText === "planilla" && r.style.margin === "0px"); } catch (e) { return false; } }));
  ok(sinMargen, "sin los márgenes del navegador (la dirección y el número de página no salen)");
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.emulateMedia({ media: "screen" });
  ok(!(await P.vis(page, "#pi-marca-agua")), "en pantalla, la marca de agua no se ve");

  console.log("\n=== La marca de agua en los PDF ===");
  await page.click('[data-ficha="clasificacion"]');
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#pi-clas-pdf")]);
  const pdf = fs.readFileSync(await dl.path()).toString("latin1");
  ok(/\/Marca Do/.test(pdf), "la clasificación en PDF lleva la marca de agua");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try { await prueba(browser); }
  catch (e) { mal("la prueba de la página se cayó", e.stack); }
  finally { await browser.close(); }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
