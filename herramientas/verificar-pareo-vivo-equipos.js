/* Pareo Integral: en el enlace para ver desde el celular, un torneo por
 * equipos se puede abrir encuentro por encuentro (js/pareo/ver.js: tablas;
 * js/pareo/evento.js: tablerosVista; js/pareo/pagina.js: datosLecturaActual).
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - tocar un equipo abre sus tableros (quién juega con cada color y cómo
 *     va cada uno), y dice que está abierto;
 *   - lo abierto sigue abierto cuando llega otra novedad en vivo (la vista
 *     se vuelve a pintar entera con cada una);
 *   - el bye no sale como «corto_bye»;
 *   - con la ronda en juego, la clasificación dice que todavía no la suma
 *     (antes salían todos primeros con 0 y parecía un error).
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-vivo-equipos.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const E = require(path.join(RAIZ, "js/pareo/equipos.js"));
const P = require("./lib/pareo-pruebas");

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));

// Cinco equipos (uno queda con bye), cuatro integrantes cada uno.
let n = 0;
const equipos = ["UNO", "DOS", "TRES", "CUATRO", "CINCO"].map((e) => ({
  id: "e" + (++n), nombre: "COLEGIO PRUEBA " + e, institucion: "COLEGIO PRUEBA " + e, elo: 0,
  integrantes: [1, 2, 3, 4].map((k) => ({ id: "j" + n + k, nombre: "PRUEBA " + e + " " + k, elo: 0, institucion: "COLEGIO PRUEBA " + e })),
}));
const torneo = T.nuevo({ nombre: "PRUEBA EQUIPOS EN VIVO", tipo: "equipos", tableros: 4, puntos: Object.assign({}, E.PUNTOS_EQUIPOS),
  desempates: ["PT", "DE", "BH-C1", "BH"], jugadores: equipos });

async function prueba(browser) {
  const sembrar = (page) => page.addInitScript((t) => {
    if (localStorage.getItem("pareo_lista_v1")) return;
    localStorage.setItem("pareo_lista_v1", JSON.stringify([{ id: "prueba", nombre: t.nombre, actualizado: 1 }]));
    localStorage.setItem("pareo_torneo_v1_prueba", JSON.stringify(t));
    localStorage.setItem("pareo_abierto_v1", "prueba");
  }, torneo);
  const org = await P.abrirPagina(browser, BASE, "", sembrar);
  const page = org.page;
  await page.click('[data-ficha="rondas"]');
  await page.click("#pi-emparejar");
  await page.waitForSelector("#pi-enc-0-t0");
  await page.selectOption("#pi-enc-0-t0", "1-0");
  await page.click('#pi-ronda button:has-text("Ver desde el celular")');
  await page.check("#pi-ver-en-vivo");
  await page.waitForFunction(() => window.__enviados.some((x) => /^pareo-vivo-/.test(x.canal)));
  // Otro resultado: lo que le llega al celular después.
  await page.selectOption("#pi-enc-0-t1", "=");
  await page.waitForFunction(() => window.__enviados.filter((x) => /^pareo-vivo-/.test(x.canal)).length >= 2);
  const mandados = await page.evaluate(() => window.__enviados.filter((x) => /^pareo-vivo-/.test(x.canal)).map((x) => x.payload));
  ok(!org.errores.length, "sin errores en la página del árbitro", org.errores.join(" | "));
  await org.ctx.close();

  console.log("\n=== En el celular ===");
  const cel = await P.abrirPagina(browser, BASE, "#vivo=prueba12");
  const p = cel.page;
  await p.setViewportSize({ width: 390, height: 840 });
  await p.evaluate((d) => window.__llega("pareo-vivo-prueba12", "estado", d), mandados[0]);
  await p.waitForSelector("#pi-ver [data-encuentro]");
  const encuentros = await p.$eval("#pi-ver table tbody", (c) => c.querySelectorAll(":scope > tr:not(.pi-ver-tableros)").length);
  const botones = await p.$$eval("#pi-ver button[data-encuentro]", (l) => l.length);
  ok(encuentros === 3 && botones === 4, "cada equipo que juega se puede tocar (2 encuentros, 4 equipos; el del bye no)", encuentros + " filas, " + botones + " botones");
  ok(!(await P.vis(p, "#pi-ver .pi-ver-tableros")), "los tableros no se ven hasta tocar");
  ok(!/corto_/.test(await p.textContent("#pi-ver")), "el bye no sale como «corto_bye»", await p.textContent("#pi-ver"));
  const nota = await p.$eval("#pi-ver [data-clasif-hasta]", (x) => x.textContent).catch(() => "");
  ok(/Todavía no termina ninguna ronda/.test(nota), "la clasificación dice que la ronda en juego todavía no se suma", nota);

  await p.click('#pi-ver button[data-encuentro="1"] >> nth=1');
  const abierta = await p.$eval("#pi-ver .pi-ver-tableros:not([hidden])", (x) => x.textContent).catch(() => "");
  ok(/Tablero 1/.test(abierta) && /1-0/.test(abierta) && /jugando/.test(abierta) && /Tableros terminados: 1 de 4/.test(abierta),
    "al tocar el equipo: cada tablero, con quién juega y cómo va", abierta);
  ok(/PRUEBA \w+ 1 \(Blancas\)/.test(abierta), "con los nombres de quienes juegan", abierta);
  ok((await p.$$eval('#pi-ver button[data-encuentro="1"]', (l) => l.map((b) => b.getAttribute("aria-expanded")))).every((x) => x === "true"), "y los dos botones del encuentro dicen que está abierto");
  ok(await P.vis(p, "#pi-ver .pi-ver-tableros"), "se ve de verdad");

  // Llega otra novedad: la vista se pinta de nuevo y lo abierto sigue abierto.
  await p.evaluate((d) => window.__llega("pareo-vivo-prueba12", "estado", d), mandados[mandados.length - 1]);
  await p.waitForFunction(() => /Tableros terminados: 2 de 4/.test(document.getElementById("pi-ver").textContent));
  ok(await P.vis(p, "#pi-ver .pi-ver-tableros"), "cuando llega otro resultado, sigue abierto");
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "cabe en el celular, sin correrse de lado");

  await p.click('#pi-ver button[data-encuentro="1"] >> nth=0');
  ok(!(await P.vis(p, "#pi-ver .pi-ver-tableros")), "y se cierra al volver a tocar");
  ok(!cel.errores.length, "sin errores en el celular", cel.errores.join(" | "));
  await cel.ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try { await prueba(browser); }
  catch (e) { mal("la prueba se cayó", e.stack); }
  finally { await browser.close(); }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
