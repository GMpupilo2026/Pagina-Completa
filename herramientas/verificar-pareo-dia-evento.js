/* Pareo Integral: lo que ayuda en un día de JDE con muchas categorías
 * (js/pareo/pagina.js, js/pareo/ver.js, js/pareo/evento.js).
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - las plantillas de la pared de TODAS las categorías en un solo trabajo
 *     de impresión, una por hoja, cada una con sus nombres;
 *   - reimprimir la planilla (de anotación o para firmar) de una sola mesa;
 *   - con el evento en vivo, un QR por jugador en la planilla de anotación,
 *     que abre «Mi jugador» ya buscado, y la planilla sigue en una hoja;
 *   - al completarse una ronda, el aviso y, en la lista, «lista para la
 *     ronda N»;
 *   - en equipos, los puntos de tablero y los mejores tableros en el celular;
 *   - al bajar el paquete final, archivar el evento, y la lista de lo
 *     archivado;
 *   - el adjunto: una ronda nueva hace vibrar y lo dice hasta «Listo»;
 *   - «Mi jugador» dice a qué hora es su próxima ronda.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-dia-evento.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const E = require(path.join(RAIZ, "js/pareo/equipos.js"));
const V = require(path.join(RAIZ, "js/pareo/evento.js"));
const P = require("./lib/pareo-pruebas");

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));
const igual = (m, a, b) => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, m, ja === jb ? "" : "esperaba " + jb + ", salió " + ja);
};
const CM = 96 / 2.54;
const confirmar = 'dialog[data-avisos="confirmar"][open]';

const EVENTO = { id: "ev-dia", nombre: "PRUEBA JDE 2026 · Etapa Regional · DRE Alajuela", jde: { anio: 2026, etapa: "regional", lugar: "Alajuela" }, creado: "2026-10-21", decisiones: {} };
function torneo(nombre, letras) {
  const t = T.nuevo({ nombre, rondasTotales: 3, jugadores: letras.map((l) => ({ id: l, nombre: "PRUEBA " + nombre.slice(-6) + " " + l.toUpperCase(), elo: 0 })) });
  t.evento = Object.assign({}, EVENTO);
  t.rondas = [{ mesas: [{ b: letras[0], n: letras[1], r: null }, { b: letras[2], n: letras[3], r: null }] }];
  return t;
}
const A = torneo("PRUEBA SUB-10", ["a", "b", "c", "d"]);
const B = torneo("PRUEBA SUB-12", ["e", "f", "g", "h"]);
const sembrar = (page) => page.addInitScript((ts) => {
  if (localStorage.getItem("pareo_lista_v1")) return;
  localStorage.setItem("pareo_lista_v1", JSON.stringify(ts.map(([id, t], i) => ({ id, nombre: t.nombre, actualizado: 10 - i }))));
  for (const [id, t] of ts) localStorage.setItem("pareo_torneo_v1_" + id, JSON.stringify(t));
  localStorage.setItem("pareo_abierto_v1", "ta");
}, [["ta", A], ["tb", B]]);

async function pruebaImprimir(browser) {
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", sembrar);
  console.log("\n=== Las plantillas de todas las categorías ===");
  await page.click('[data-ficha="archivos"]');
  await page.click("#pi-evento-plantillas");
  const hojas = await page.$$eval("#pi-plantilla .pi-plantilla-hoja", (l) => l.map((h) => h.textContent));
  ok(hojas.length === 2 && /SUB-10/.test(hojas[0]) && /PRUEBA SUB-10 A/.test(hojas[0]) && /PRUEBA SUB-12 E/.test(hojas[1]), "una plantilla por categoría, cada una con sus nombres", JSON.stringify(hojas).slice(0, 300));
  await page.emulateMedia({ media: "print" });
  igual("cada una en su hoja", await page.$$eval("#pi-plantilla .pi-plantilla-hoja", (l) => l.map((h) => getComputedStyle(h).breakBefore)), ["auto", "page"]);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.emulateMedia({ media: "screen" });

  console.log("\n=== Una sola mesa ===");
  await page.click('[data-ficha="rondas"]');
  await page.selectOption("#pi-imprimir-mesa", "1");
  await page.click("#pi-una-anotacion");
  await page.waitForFunction(() => document.querySelectorAll("#pi-firmas .pi-planilla").length > 0);
  igual("la planilla de anotación de la mesa 2, sola", await page.$$eval("#pi-firmas .pi-planilla .pi-pl-datos", (l) => l.map((x) => /Mesa 2/.test(x.textContent))), [true]);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.click("#pi-una-firma");
  igual("y la de firmar, igual", await page.$$eval("#pi-firmas .pi-ft .pi-ft-mesa", (l) => l.map((x) => x.textContent)), ["Mesa 2"]);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.click("#pi-planillas-firma");
  ok((await page.$$eval("#pi-firmas .pi-ft", (l) => l.length)) === 2, "y las de arriba siguen siendo de todas las mesas");
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));

  console.log("\n=== El QR del jugador en la planilla ===");
  await page.click("#pi-planillas-anotacion");
  await page.waitForFunction(() => document.querySelectorAll("#pi-firmas .pi-planilla").length === 2);
  ok(!(await page.$("#pi-firmas .pi-pl-qr")), "sin el evento en vivo, sin QR (llevaría a una página que espera)");
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.click('[data-ficha="archivos"]');
  await page.click("#pi-evento-vivo");
  await page.waitForFunction(() => window.__enviados.some((x) => /^pareo-evento-/.test(x.canal)));
  await page.click('[data-ficha="rondas"]');
  await page.emulateMedia({ media: "print" });
  await page.setViewportSize({ width: Math.round(21.59 * CM), height: 1000 });
  await page.click("#pi-planillas-anotacion", { force: true }).catch(() => page.evaluate(() => document.getElementById("pi-planillas-anotacion").click()));
  await page.waitForFunction(() => document.querySelectorAll("#pi-firmas .pi-pl-qr svg").length === 4);
  const titulos = await page.$$eval("#pi-firmas .pi-planilla:first-child .pi-pl-qr", (l) => l.map((x) => x.getAttribute("title")));
  ok(titulos.length === 2 && /PRUEBA SUB-10 A/.test(titulos[0]) && /PRUEBA SUB-10 B/.test(titulos[1]), "con el evento en vivo, un QR por jugador", JSON.stringify(titulos));
  const alto = await page.$eval("#pi-firmas .pi-planilla", (x) => x.getBoundingClientRect().height);
  ok(alto < 27.2 * CM, "y la planilla sigue en una hoja (" + (alto / CM).toFixed(1) + " cm)");
  const qr = await page.$eval("#pi-firmas .pi-pl-qr", (x) => x.getBoundingClientRect().width);
  ok(qr >= 1.5 * CM, "con el QR de al menos 1,5 cm, para que el celular lo lea (" + (qr / CM).toFixed(1) + " cm)");
  const codigo = await page.evaluate(() => window.__enviados.find((x) => /^pareo-evento-/.test(x.canal)).canal.slice("pareo-evento-".length));
  const eventoVivo = await page.evaluate(() => window.__enviados.filter((x) => /^pareo-evento-/.test(x.canal)).pop().payload);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.emulateMedia({ media: "screen" });
  await page.setViewportSize({ width: 1280, height: 1000 });

  console.log("\n=== La ronda completa ===");
  await page.selectOption("#pi-mesa-0", "1-0");
  await page.selectOption("#pi-mesa-1", "=");
  await page.waitForFunction(() => /la ronda 1 está completa/.test((document.getElementById("avisos-zona") || {}).textContent || ""));
  ok(true, "al anotar la última mesa, avisa que ya se puede emparejar la ronda 2");
  ok(/PRUEBA SUB-10 — lista para la ronda 2/.test(await page.$eval("#pi-lista", (s) => [...s.options].map((o) => o.textContent).join("|"))), "y en la lista de torneos lo dice junto al nombre");
  ok(!/SUB-12 — lista/.test(await page.$eval("#pi-lista", (s) => [...s.options].map((o) => o.textContent).join("|"))), "solo en el que está listo");
  await page.check("#pi-sonido-ronda");
  ok(await page.evaluate(() => localStorage.getItem("pareo_sonido_ronda_v1") === "1"), "el sonido se puede prender, y se recuerda");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();

  console.log("\n=== «Mi jugador» desde el QR, con la hora de su próxima ronda ===");
  const cel = await P.abrirPagina(browser, BASE, "#evento=" + codigo + "&q=" + encodeURIComponent("PRUEBA SUB-10 A"), async (p) => {
    await p.clock.install({ time: new Date("2026-10-21T14:00:00-06:00") });
  });
  const datos = JSON.parse(JSON.stringify(eventoVivo));
  datos.torneos[0].horas = ["09:00", "15:00", "17:00"];
  await cel.page.evaluate(([c, d]) => window.__llega("pareo-evento-" + c, "estado", d), [codigo, datos]);
  await cel.page.waitForSelector("#pi-ver-mio li");
  igual("el buscador ya trae el nombre", await cel.page.inputValue("#pi-ver-buscar"), "PRUEBA SUB-10 A");
  ok(/PRUEBA SUB-10 A/.test(await cel.page.textContent("#pi-ver-mio")), "y lo encuentra");
  const prox = await cel.page.$eval("#pi-ver-mio [data-mio-proxima]", (x) => x.textContent).catch(() => "");
  ok(/2/.test(prox) && /15:00/.test(prox), "con la hora de su próxima ronda", prox);
  ok(!cel.errores.length, "sin errores en el celular", cel.errores.join(" | "));
  await cel.ctx.close();
}

async function pruebaCierre(browser) {
  console.log("\n=== Archivar al bajar el paquete final ===");
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", sembrar);
  await page.click('[data-ficha="archivos"]');
  await page.click("#pi-evento-cierre");
  if (await page.$(confirmar)) await page.click(confirmar + " [data-avisos-aceptar]");
  const [descarga] = await Promise.all([page.waitForEvent("download"), page.waitForSelector(confirmar)]);
  ok(/paquete-final\.zip$/.test(descarga.suggestedFilename()), "baja el paquete final");
  ok(/respaldo\.json/.test(await page.textContent(confirmar)), "y ofrece quitar el evento de la lista, porque el paquete trae su respaldo");
  await page.click(confirmar + " [data-avisos-aceptar]");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("pareo_lista_v1")).every((x) => !/SUB-1/.test(x.nombre)));
  ok(true, "al aceptar, los torneos del evento salen de la lista");
  await page.click("#pi-archivar");
  const hechos = await page.textContent("#pi-archivados").catch(() => "");
  ok(/paquete-final\.zip/.test(hechos) && /PRUEBA SUB-10/.test(hechos) && /PRUEBA SUB-12/.test(hechos), "y la lista de lo archivado dice en qué archivo están", hechos);
  await page.click("#pi-archivados-olvidar");
  ok(!(await page.$("#pi-archivados")), "«Olvidar esta lista» la borra");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

async function pruebaEquiposYAdjunto(browser) {
  console.log("\n=== Equipos: puntos de tablero y mejores tableros ===");
  let n = 0;
  const equipos = ["UNO", "DOS"].map((e) => ({ id: "e" + (++n), nombre: "COLEGIO " + e, institucion: "COLEGIO " + e, elo: 0,
    integrantes: [1, 2, 3, 4].map((k) => ({ id: "j" + n + k, nombre: "PRUEBA " + e + " " + k, elo: 0 })) }));
  const t = T.nuevo({ nombre: "PRUEBA EQUIPOS", tipo: "equipos", tableros: 4, rondasTotales: 3, puntos: Object.assign({}, E.PUNTOS_EQUIPOS), desempates: ["PT", "DE"], jugadores: equipos });
  const m = { b: "e1", n: "e2", r: null };
  E.prepararMesa(t, m);
  m.partidas = [{ r: "1-0" }, { r: "1-0" }, { r: "=" }, { r: "0-1" }];
  m.r = E.resultadoEncuentro(t, m);
  t.rondas = [{ mesas: [m] }];
  const vista = V.vistaTorneo(t);
  igual("la clasificación trae los puntos de tablero", vista.clasificacion.map((f) => [f.n, f.pt]).sort(), [["COLEGIO DOS", 1.5], ["COLEGIO UNO", 2.5]]);
  ok(vista.mejores && vista.mejores.length === 4 && vista.mejores[0].filas[0].p === 1, "y los mejores de cada tablero", JSON.stringify(vista.mejores).slice(0, 200));
  const cel = await P.abrirPagina(browser, BASE, "#vivo=prueba77");
  await cel.page.evaluate((d) => window.__llega("pareo-vivo-prueba77", "estado", d), { v: 1, nombre: "PRUEBA EQUIPOS", ronda: null, hasta: 1, clasificacion: vista.clasificacion.map((f) => ({ p: f.p, n: f.n, pts: f.pts, pt: f.pt })), mejores: vista.mejores });
  await cel.page.waitForSelector("[data-mejores]");
  igual("en el celular, la columna PT", await cel.page.$$eval("#pi-ver table th", (l) => l.map((x) => x.textContent)), ["Puesto", "Nombre", "Pts", "PT"]);
  ok(/Tablero 1/.test(await cel.page.textContent("#pi-ver")) && /PRUEBA UNO 1/.test(await cel.page.textContent("#pi-ver")), "y los mejores tableros");
  ok(!cel.errores.length, "sin errores", cel.errores.join(" | "));
  await cel.ctx.close();

  console.log("\n=== El adjunto, avisado ===");
  const adj = await P.abrirPagina(browser, BASE, "#adjunto=prueba55&m=1-5", (p) => p.addInitScript(() => { window.__vibro = []; navigator.vibrate = (x) => { window.__vibro.push(x); return true; }; }));
  const estado = (r) => ({ nombre: "PRUEBA SUB-10", ronda: r, mesas: [{ m: 1, b: "PRUEBA A", n: "PRUEBA B", r: null, quien: [] }] });
  await adj.page.waitForFunction(() => window.__enviados.some((x) => x.evento === "pedir"));
  await adj.page.evaluate((d) => window.__llega("pareo-adjunto-prueba55", "estado", d), estado(1));
  await adj.page.waitForSelector('[data-mesa="1"]');
  ok(!(await adj.page.$("#pi-adj-aviso")) && (await adj.page.evaluate(() => window.__vibro.length)) === 0, "al entrar, ningún aviso");
  await adj.page.evaluate((d) => window.__llega("pareo-adjunto-prueba55", "estado", d), estado(2));
  await adj.page.waitForSelector("#pi-adj-aviso");
  ok(/Empezó la ronda 2/.test(await adj.page.textContent("#pi-adj-aviso")) && (await adj.page.getAttribute("#pi-adj-aviso", "role")) === "alert", "con una ronda nueva, lo dice arriba (y el lector de pantalla lo anuncia)");
  ok((await adj.page.evaluate(() => window.__vibro.length)) === 1, "y el celular vibra");
  await adj.page.evaluate((d) => window.__llega("pareo-adjunto-prueba55", "estado", d), estado(2));
  ok(await adj.page.$("#pi-adj-aviso") !== null, "se queda aunque llegue otro resultado");
  await adj.page.click("#pi-adj-aviso-listo");
  await adj.page.evaluate((d) => window.__llega("pareo-adjunto-prueba55", "estado", d), estado(2));
  ok(!(await adj.page.$("#pi-adj-aviso")), "hasta tocar «Listo»");
  ok(!adj.errores.length, "sin errores", adj.errores.join(" | "));
  await adj.ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  for (const [nombre, f] of [["imprimir", pruebaImprimir], ["cierre", pruebaCierre], ["equipos y adjunto", pruebaEquiposYAdjunto]]) {
    try { await f(browser); } catch (e) { mal("la prueba de " + nombre + " se cayó", e.stack); }
  }
  await browser.close();
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
