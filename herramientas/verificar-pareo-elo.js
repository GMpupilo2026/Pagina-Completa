/* Pareo Integral: el Elo que gana o pierde cada jugador (js/pareo/elo.js)
 * y cómo se ve en la clasificación (js/pareo/pagina.js).
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - lo esperado es el de la tabla de FIDE (8.1.2), con el tope de 400;
 *   - el factor K por edad y Elo, y el que se anota a mano;
 *   - solo cuentan las partidas jugadas entre dos jugadores con Elo;
 *   - el rendimiento (Rp);
 *   - en la página: las columnas Rp, K y ±Elo de la clasificación, y el K en
 *     «Editar».
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-elo.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const L = require(path.join(RAIZ, "js/pareo/elo.js"));
const X = require(path.join(RAIZ, "js/pareo/textos.js"));
const P = require("./lib/pareo-pruebas");

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));
const igual = (m, a, b) => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, m, ja === jb ? "" : "esperaba " + jb + ", salió " + ja);
};
const dialogo = 'dialog[data-avisos="formulario"][open]';

function pruebaSinNavegador() {
  console.log("\n=== Lo esperado (tabla 8.1.2 de FIDE) ===");
  igual("los cortes de la tabla", [0, 3, 4, 10, 11, 99, 106, 107, 391, 392].map(L.esperado), [0.5, 0.5, 0.51, 0.51, 0.52, 0.64, 0.64, 0.65, 0.91, 0.92]);
  igual("en los empates de la tabla, lo que dice FIDE (25 → 0,53; 26 → 0,54)", [L.esperado(25), L.esperado(26)], [0.53, 0.54]);
  igual("y al revés, para el de menos Elo", [-4, -100, -400].map(L.esperado), [0.49, 0.36, 0.08]);

  console.log("\n=== El factor K ===");
  igual("40 con menos de 18 años y menos de 2300; 20; 10 desde 2400", [
    L.kDe({ elo: 1500, nacimiento: "2012-05-01" }, 2026), L.kDe({ elo: 2350, nacimiento: "2012-05-01" }, 2026),
    L.kDe({ elo: 1500, nacimiento: "2008-01-01" }, 2026), L.kDe({ elo: 2000 }, 2026), L.kDe({ elo: 2450 }, 2026),
  ], [40, 20, 20, 20, 10]);
  igual("el que se anota a mano manda", L.kDe({ elo: 2000, kFide: 40 }, 2026), 40);

  console.log("\n=== El cambio de Elo ===");
  const j = (id, elo, extra) => Object.assign({ id, nombre: id, elo }, extra);
  const t = T.nuevo({ sistema: "suizo", rondasTotales: 3, fechaInicio: "2026-05-01", jugadores: [j("a", 1800), j("b", 1600), j("c", 2200), j("d", 0), j("e", 1700)] });
  t.rondas.push({ mesas: [{ b: "a", n: "b", r: "0-1" }, { b: "c", n: "e", r: "1-0" }, { b: "d", n: null }] });
  t.rondas.push({ mesas: [{ b: "a", n: "d", r: "1-0" }, { b: "b", n: "e", r: "+-" }, { b: "c", n: null }] });
  const x = L.calcular(t);
  igual("200 de diferencia: el de abajo gana 15,2 y el de arriba pierde 15,2", [x.get("a").cambio, x.get("b").cambio], [-15.2, 15.2]);
  igual("contra uno sin Elo y por incomparecencia no cuenta", [x.get("a").partidas, x.get("b").partidas], [1, 1]);
  igual("más de 400 de diferencia cuenta como 400 (lo esperado 0,92)", [x.get("c").esperado, x.get("c").cambio], [0.92, 1.6]);
  igual("el rendimiento: el Elo medio de los rivales más la tabla (1 de 1: +800)", x.get("b").rp, 2600);
  ok(x.get("d").cambio == null && x.get("d").k == null, "el que no tiene Elo, sin cambio");
  igual("se escribe con su signo", [L.textoCambio(15.2, "es"), L.textoCambio(-3, "es"), L.textoCambio(0, "es")], ["+15,2", "-3", "0"]);
}

async function pruebaPagina(browser) {
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE);
  console.log("\n=== En la clasificación ===");
  await page.click('[data-ficha="jugadores"]');
  await page.click("#pi-pegar-caja summary");
  await page.fill("#pi-pegar", ["PRUEBA UNO;LICEO;2000", "PRUEBA DOS;LICEO;1800", "PRUEBA TRES;LICEO;1600", "PRUEBA CUATRO;LICEO;1400"].join("\n"));
  await page.click("#pi-pegar-agregar");
  await page.click(`button[aria-label="${X.t("es", "editarA", { n: "PRUEBA CUATRO" })}"]`);
  await page.waitForSelector(dialogo);
  await page.selectOption(dialogo + ' [name="kFide"]', "40");
  await page.click(dialogo + " [data-avisos-aceptar]");
  let todos = await P.esperarGuardado(page, (l) => l[0].jugadores.some((x) => x.kFide === 40));
  ok(true, "el K se anota en «Editar»");
  await page.click('[data-ficha="rondas"]');
  await page.click("#pi-emparejar");
  await page.waitForSelector("#pi-mesa-0");
  await P.anotar(page, "0-1");
  await page.click('[data-ficha="clasificacion"]');
  const enc = await page.$$eval("#pi-tabla-clas thead th", (l) => l.map((x) => x.textContent));
  ok(enc.includes("Rp") && enc.includes("K") && enc.includes("±Elo"), "la clasificación trae Rp, K y ±Elo", JSON.stringify(enc));
  todos = await P.leerTodos(page);
  const esperado = L.calcular(todos[0]);
  const celdas = await page.$$eval("#pi-tabla-clas tbody tr", (l) => l.map((tr) => [tr.dataset.id, tr.querySelector('[data-elo="cambio"]').textContent, tr.querySelector('[data-elo="k"]').textContent]));
  igual("con los números de js/pareo/elo.js", celdas.map(([id, c, k]) => [c, k]), celdas.map(([id]) => [L.textoCambio(esperado.get(id).cambio, "es"), String(esperado.get(id).k)]));
  ok(celdas.some(([, , k]) => k === "40"), "y el K anotado a mano");
  ok(/más de 400 de diferencia cuenta como 400/.test(await page.textContent("#pi-clas-leyenda")), "la leyenda explica qué es");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#pi-clas-pdf")]);
  const pdf = fs.readFileSync(await dl.path()).toString("latin1");
  ok(pdf.includes("+/-Elo") && pdf.includes("Rp"), "y el PDF también");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

(async () => {
  try { pruebaSinNavegador(); } catch (e) { mal("la parte sin navegador se cayó", e.stack); }
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try { await pruebaPagina(browser); }
  catch (e) { mal("la prueba de la página se cayó", e.stack); }
  finally { await browser.close(); }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
