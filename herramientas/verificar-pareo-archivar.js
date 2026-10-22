/* Pareo Integral: archivar los torneos que ya no hacen falta a la vista, y
 * pasar de un torneo a otro del mismo evento desde el celular
 * (js/pareo/pagina.js: pintarArchivar, archivarMarcados, abrirRespaldo,
 * enlacesDelEvento; js/pareo/ver.js: otrosDelEvento, irATorneo).
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - «Marcar los terminados» marca solo los terminados, y archivar baja el
 *     archivo ANTES de quitarlos (con lo que se quitó adentro);
 *   - el torneo abierto, si se archiva, deja abierto otro;
 *   - el archivo se vuelve a abrir, y abrir un archivo con solo ALGUNOS
 *     torneos de un evento no pisa a los que siguen en el navegador (antes
 *     los reemplazaba a todos los del evento);
 *   - desde el enlace de un torneo se ven los otros del evento, cada uno
 *     abre el enlace del evento con ese torneo desplegado, y un código que no
 *     parece código no se pone en un enlace;
 *   - en el enlace del evento, «Ir a un torneo» lo abre.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-archivar.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
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
const dialogo = 'dialog[data-avisos="confirmar"][open]';

// Tres torneos: dos de un evento (uno terminado, otro sin empezar) y uno suelto terminado.
const EVENTO = { id: "ev-prueba", nombre: "PRUEBA JDE" };
function torneo(nombre, evento, jugado) {
  const t = T.nuevo({ nombre, rondasTotales: 1, jugadores: [{ id: "a", nombre: "PRUEBA A", elo: 0 }, { id: "b", nombre: "PRUEBA B", elo: 0 }] });
  if (evento) t.evento = Object.assign({}, evento);
  if (jugado) t.rondas = [{ mesas: [{ b: "a", n: "b", r: "1-0" }] }];
  return t;
}
const A = torneo("PRUEBA SUB-10", EVENTO, true);
const B = torneo("PRUEBA SUB-12", EVENTO, false);
const C = torneo("PRUEBA SUELTO", null, true);

const sembrar = (page) => page.addInitScript((ts) => {
  if (localStorage.getItem("pareo_lista_v1")) return;
  localStorage.setItem("pareo_lista_v1", JSON.stringify(ts.map(([id, t], i) => ({ id, nombre: t.nombre, actualizado: 10 - i }))));
  for (const [id, t] of ts) localStorage.setItem("pareo_torneo_v1_" + id, JSON.stringify(t));
  localStorage.setItem("pareo_abierto_v1", "tb");
}, [["ta", A], ["tb", B], ["tc", C]]);

const nombres = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("pareo_lista_v1")).map((x) => x.nombre).sort());

async function archivarConDescarga(page) {
  await page.click("#pi-archivar-hacer");
  await page.waitForSelector(dialogo);
  const [descarga] = await Promise.all([page.waitForEvent("download"), page.click(dialogo + " [data-avisos-aceptar]")]);
  const ruta = await descarga.path();
  return { nombre: descarga.suggestedFilename(), ruta, datos: JSON.parse(fs.readFileSync(ruta, "utf8")) };
}
async function abrirArchivo(page, ruta) {
  await page.click('[data-ficha="archivos"]');
  await page.setInputFiles("#pi-abrir", ruta);
}

async function pruebaArchivar(browser) {
  console.log("\n=== Archivar ===");
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", sembrar);
  ok(!(await P.vis(page, "#pi-archivar-caja")), "el panel no se ve hasta pedirlo");
  await page.click("#pi-archivar");
  ok(await P.vis(page, "#pi-archivar-caja") && (await page.getAttribute("#pi-archivar", "aria-expanded")) === "true", "al tocar «Archivar torneos» se abre, y lo dice");
  igual("una casilla por torneo, sin marcar", await page.$$eval("#pi-archivar-caja input[type=checkbox]", (l) => l.map((c) => c.checked)), [false, false, false]);
  ok(await page.$eval("#pi-archivar-hacer", (b) => b.disabled), "sin nada marcado, no se puede archivar");
  ok(/terminado/.test(await page.textContent("#pi-archivar-caja")) && /sin empezar/.test(await page.textContent("#pi-archivar-caja")) && /abierto ahora/.test(await page.textContent("#pi-archivar-caja")),
    "cada uno dice cómo va (terminado, sin empezar) y cuál está abierto");
  await page.click("#pi-archivar-terminados");
  igual("«Marcar los terminados» marca solo los terminados", await page.$$eval("#pi-archivar-caja input:checked", (l) => l.map((c) => c.value).sort()), ["ta", "tc"]);
  ok(/\(2\)/.test(await page.textContent("#pi-archivar-hacer")), "y el botón dice cuántos");

  let a = await archivarConDescarga(page);
  ok(V.esRespaldo(a.datos) && /\.json$/.test(a.nombre), "baja un archivo que se vuelve a abrir (" + a.nombre + ")");
  igual("con los dos archivados adentro", a.datos.torneos.map((x) => x.nombre).sort(), ["PRUEBA SUB-10", "PRUEBA SUELTO"]);
  igual("y en la lista queda solo el que sigue", await nombres(page), ["PRUEBA SUB-12"]);
  ok(/archivados en/.test(await page.textContent("#avisos-zona").catch(() => "")), "y lo dice");

  console.log("\n=== Volver a abrirlos ===");
  await abrirArchivo(page, a.ruta);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("pareo_lista_v1")).length === 3);
  igual("vuelven los dos, y el que estaba sigue", await nombres(page), ["PRUEBA SUB-10", "PRUEBA SUB-12", "PRUEBA SUELTO"]);

  console.log("\n=== Archivar todo un evento, con el torneo abierto adentro ===");
  await page.selectOption("#pi-lista", { label: "PRUEBA SUB-12" });
  await page.click('#pi-archivar-caja [data-archivar-evento="ev-prueba"]');
  igual("«Marcar todo el evento» marca sus dos torneos", (await page.$$eval("#pi-archivar-caja input:checked", (l) => l.map((c) => c.nextSibling && c.closest("label").textContent))).length, 2);
  a = await archivarConDescarga(page);
  igual("el archivo es el respaldo de ese evento", [a.datos.evento.id, a.datos.torneos.length], ["ev-prueba", 2]);
  igual("queda el suelto", await nombres(page), ["PRUEBA SUELTO"]);
  igual("y queda abierto otro (no uno vacío)", await page.$eval("#pi-lista", (s) => s.selectedOptions[0].textContent), "PRUEBA SUELTO");
  await abrirArchivo(page, a.ruta);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("pareo_lista_v1")).length === 3);

  console.log("\n=== Un archivo con solo algunos torneos del evento ===");
  await page.click("#pi-archivar-caja input[value]");
  for (const c of await page.$$("#pi-archivar-caja input:checked")) await c.uncheck();
  const idSub10 = await page.evaluate(() => JSON.parse(localStorage.getItem("pareo_lista_v1")).find((x) => x.nombre === "PRUEBA SUB-10").id);
  await page.check("#pi-archivar-" + idSub10);
  a = await archivarConDescarga(page);
  igual("se archiva solo el SUB-10", await nombres(page), ["PRUEBA SUB-12", "PRUEBA SUELTO"]);
  await abrirArchivo(page, a.ruta);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("pareo_lista_v1")).length === 3);
  ok(!(await page.$(dialogo)), "al abrirlo no pregunta si reemplazar al SUB-12, que no viene en el archivo");
  igual("y el SUB-12 sigue", await nombres(page), ["PRUEBA SUB-10", "PRUEBA SUB-12", "PRUEBA SUELTO"]);
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

async function pruebaEnlaces(browser) {
  console.log("\n=== El enlace de un torneo lleva a los otros del evento ===");
  const org = await P.abrirPagina(browser, BASE, "", sembrar);
  await org.page.click('[data-ficha="rondas"]');
  await org.page.click("#pi-emparejar");
  await org.page.waitForSelector("#pi-mesa-0");
  await org.page.click('#pi-ronda button:has-text("Ver desde el celular")');
  await org.page.check("#pi-ver-en-vivo");
  await org.page.waitForFunction(() => window.__enviados.some((x) => /^pareo-vivo-/.test(x.canal)));
  // El evento se pone en vivo un instante después que el torneo: se le da
  // hasta 5 s (leerlo enseguida fallaba a veces en el CI).
  await org.page.waitForFunction(() => window.__enviados.some((x) => /^pareo-evento-/.test(x.canal)), null, { timeout: 5000 }).catch(() => {});
  const vivo = await org.page.evaluate(() => window.__enviados.filter((x) => /^pareo-vivo-/.test(x.canal)).pop().payload);
  ok(await org.page.evaluate(() => window.__enviados.some((x) => /^pareo-evento-/.test(x.canal))), "al poner en vivo un torneo de un evento, el evento también se pone en vivo");
  ok(vivo.evento && /^[a-z0-9]{8}$/.test(vivo.evento.codigo) && vivo.evento.este === "PRUEBA SUB-12", "el torneo manda el código del evento y cuál es él", JSON.stringify(vivo.evento));
  igual("y los torneos del evento (no el suelto)", vivo.evento && vivo.evento.torneos.slice().sort(), ["PRUEBA SUB-10", "PRUEBA SUB-12"]);
  const evento = await org.page.evaluate(() => window.__enviados.filter((x) => /^pareo-evento-/.test(x.canal)).pop().payload);
  await org.ctx.close();

  const cel = await P.abrirPagina(browser, BASE, "#vivo=prueba12");
  const p = cel.page;
  await p.evaluate((d) => window.__llega("pareo-vivo-prueba12", "estado", d), Object.assign({}, vivo, { evento: Object.assign({}, vivo.evento, { codigo: "evprueba" }) }));
  await p.waitForSelector("[data-otros-torneos]");
  igual("se ven los otros torneos del evento, cada uno con su enlace", await p.$$eval("[data-otros-torneos] li a", (l) => l.map((a) => [a.textContent, a.getAttribute("href")])),
    [["PRUEBA SUB-10", "/pareo.html#evento=evprueba&t=PRUEBA%20SUB-10"]]);
  igual("y «Ver todo el evento»", await p.getAttribute("[data-todo-evento]", "href"), "/pareo.html#evento=evprueba");
  // Un código que no es un código no se pone en un enlace.
  await p.evaluate((d) => window.__llega("pareo-vivo-prueba12", "estado", d), Object.assign({}, vivo, { evento: Object.assign({}, vivo.evento, { codigo: "javascript:alert(1)" }) }));
  await p.waitForFunction(() => !document.querySelector("[data-otros-torneos]"));
  ok(true, "un código raro no se vuelve enlace");
  await p.evaluate((d) => window.__llega("pareo-vivo-prueba12", "estado", d), Object.assign({}, vivo, { evento: Object.assign({}, vivo.evento, { codigo: "evprueba" }) }));
  await p.waitForSelector("[data-otros-torneos] li a");
  await p.click("[data-otros-torneos] li a");
  await p.waitForFunction(() => location.hash.startsWith("#evento=evprueba") && window.__enviados.some((x) => x.canal === "pareo-evento-evprueba" && x.evento === "pedir"));
  await p.evaluate((d) => window.__llega("pareo-evento-evprueba", "estado", d), evento);
  await p.waitForSelector('details[data-torneo="PRUEBA SUB-10"]');
  igual("al tocarlo, se abre el evento con ese torneo desplegado", await p.$$eval("details[data-torneo]", (l) => l.map((d) => [d.dataset.torneo, d.open])),
    [["PRUEBA SUB-10", true], ["PRUEBA SUB-12", false]]);

  console.log("\n=== «Ir a un torneo» en el enlace del evento ===");
  igual("un botón por torneo", await p.$$eval("[data-ir-torneo]", (l) => l.map((b) => b.textContent)), ["PRUEBA SUB-10", "PRUEBA SUB-12"]);
  await p.click('[data-ir-torneo="PRUEBA SUB-12"]');
  ok(await p.$eval('details[data-torneo="PRUEBA SUB-12"]', (d) => d.open), "lo abre");
  ok(await p.evaluate(() => document.activeElement && document.activeElement.closest('details[data-torneo="PRUEBA SUB-12"]') !== null), "y lleva el foco hasta él");
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "sin correrse de lado");
  ok(!cel.errores.length, "sin errores en el celular", cel.errores.join(" | "));
  await cel.ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try { await pruebaArchivar(browser); } catch (e) { mal("la prueba de archivar se cayó", e.stack); }
  try { await pruebaEnlaces(browser); } catch (e) { mal("la prueba de los enlaces se cayó", e.stack); }
  finally { await browser.close(); }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
