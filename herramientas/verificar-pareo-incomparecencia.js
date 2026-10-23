/* Pareo Integral: quien pierde por incomparecencia queda fuera de las rondas
 * que siguen, hasta que el árbitro lo vuelva a poner
 * (T.retirosPorIncomparecencia en js/pareo/torneo.js; js/pareo/pagina.js).
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - «-+», «+-» y «--» en la última ronda sacan a quien no vino (a los dos
 *     con «--») desde la ronda siguiente, marcado como automático;
 *   - corregir el resultado deshace el retiro automático, pero no uno a mano;
 *   - si el árbitro lo devuelve, esa misma incomparecencia no lo vuelve a
 *     sacar;
 *   - en la página: el aviso, «Fuera desde la ronda 2 (no se presentó)» en
 *     Jugadores, la ronda siguiente sin él y «Vuelve a jugar»;
 *   - en todos contra todos (calendario fijo), su partida de la ronda
 *     siguiente queda perdida sin jugar.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-incomparecencia.js
 */
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const P = require("./lib/pareo-pruebas");

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));
const igual = (m, a, b) => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, m, ja === jb ? "" : "esperaba " + jb + ", salió " + ja);
};

function torneo() {
  const t = T.nuevo({ nombre: "PRUEBA", rondasTotales: 5, jugadores: ["a", "b", "c", "d", "e", "f"].map((id) => ({ id, nombre: "PRUEBA " + id.toUpperCase(), retiradoDespuesDe: null })) });
  t.rondas = [{ mesas: [{ b: "a", n: "b", r: "-+" }, { b: "c", n: "d", r: "--" }, { b: "e", n: "f", r: "1-0" }], ausencias: {} }];
  return t;
}
const estadoDe = (t) => Object.fromEntries(t.jugadores.map((j) => [j.id, j.retiradoDespuesDe]));

function pruebaSinNavegador() {
  console.log("\n=== Quién queda fuera ===");
  const t = torneo();
  const x = T.retirosPorIncomparecencia(t);
  igual("«-+» saca a las blancas y «--» a los dos; el que vino y los que jugaron siguen", [x.fuera, estadoDe(t)], [["a", "c", "d"], { a: 1, b: null, c: 1, d: 1, e: null, f: null }]);
  ok(t.jugadores[0].retiroAuto === 1, "marcado como automático (desde la ronda 2)");
  igual("y no se les empareja en la ronda 2", T.participantes(t, 1), T.participantes(t, 1).filter((id) => !["a", "c", "d"].includes(id)));
  igual("volver a guardar no cambia nada", T.retirosPorIncomparecencia(t), { fuera: [], vuelven: [] });

  console.log("\n=== Corregir el resultado ===");
  t.rondas[0].mesas[0].r = "0-1";
  delete t.jugadores[2].retiroAuto; // c: como si lo hubiera retirado el árbitro a mano
  t.rondas[0].mesas[1].r = "=";
  const y = T.retirosPorIncomparecencia(t);
  igual("corregido, vuelve el automático (a y d), no el retiro a mano (c)", [y.vuelven, estadoDe(t)], [["a", "d"], { a: null, b: null, c: 1, d: null, e: null, f: null }]);
  t.rondas[0].mesas[2].r = "+-";
  T.retirosPorIncomparecencia(t);
  ok(t.jugadores[5].retiradoDespuesDe === 1, "«+-» saca a las negras");

  console.log("\n=== El árbitro lo devuelve ===");
  const f = t.jugadores[5];
  f.retiradoDespuesDe = null; f.vuelveTras = f.retiroAuto - 1; delete f.retiroAuto;
  T.retirosPorIncomparecencia(t);
  ok(f.retiradoDespuesDe === null, "la misma incomparecencia no lo vuelve a sacar");
  t.rondas.push({ mesas: [{ b: "f", n: "b", r: "-+" }], ausencias: {} });
  T.retirosPorIncomparecencia(t);
  ok(f.retiradoDespuesDe === 2, "una incomparecencia nueva, sí");
}

const sembrar = (t) => (page) => page.addInitScript((x) => {
  if (localStorage.getItem("pareo_lista_v1")) return;
  localStorage.setItem("pareo_lista_v1", JSON.stringify([{ id: "tp", nombre: x.nombre, actualizado: 1 }]));
  localStorage.setItem("pareo_torneo_v1_tp", JSON.stringify(x));
  localStorage.setItem("pareo_abierto_v1", "tp");
}, t);

async function pruebaSuizo(browser) {
  console.log("\n=== En la página: suizo ===");
  const t = T.nuevo({ nombre: "PRUEBA SUIZO", rondasTotales: 3, jugadores: ["Ana", "Beatriz", "Carla", "Diana", "Elena", "Fabiola"].map((n, k) => ({ id: "j" + k, nombre: "PRUEBA " + n, elo: 1800 - 50 * k, retiradoDespuesDe: null })) });
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", sembrar(t));
  await page.click('[data-ficha="rondas"]');
  await page.click("#pi-emparejar");
  await page.waitForSelector("#pi-mesa-0");
  const [l0] = await P.leerTodos(page);
  const blancas = l0.rondas[0].mesas[0].b;
  const nombre = l0.jugadores.find((j) => j.id === blancas).nombre;
  await page.selectOption("#pi-mesa-0", "-+");
  const [l1] = await P.esperarGuardado(page, (l, id) => l[0].jugadores.find((j) => j.id === id).retiradoDespuesDe === 1, blancas);
  ok(l1.jugadores.find((j) => j.id === blancas).retiroAuto === 1, "al anotar «-+», quien no vino queda fuera desde la ronda 2");
  await page.waitForFunction((n) => document.body.textContent.includes(n + " perdió por incomparecencia: queda fuera desde la ronda 2"), nombre);
  bien("y lo dice");
  await page.selectOption("#pi-mesa-0", "1-0");
  await P.esperarGuardado(page, (l, id) => l[0].jugadores.find((j) => j.id === id).retiradoDespuesDe === null, blancas);
  bien("corregir el resultado lo devuelve");
  await page.selectOption("#pi-mesa-0", "-+");
  await P.esperarGuardado(page, (l, id) => l[0].jugadores.find((j) => j.id === id).retiradoDespuesDe === 1, blancas);
  for (const i of [1, 2]) await page.selectOption("#pi-mesa-" + i, "1-0");
  await page.click('[data-ficha="jugadores"]');
  const fila = await page.$eval('[aria-label="' + nombre + ' vuelve a jugar"]', (b) => b.closest("tr").textContent);
  ok(/Fuera desde la ronda 2 \(no se presentó\)/.test(fila), "Jugadores dice por qué está fuera", fila);

  await page.click('[data-ficha="rondas"]');
  await (await page.$$("#pi-rondas-nav button")).pop().click();
  await page.click("#pi-emparejar");
  await page.waitForFunction(() => !document.getElementById("pi-emparejar"));
  const [l2] = await P.leerTodos(page);
  ok(l2.rondas[1].mesas.every((m) => m.b !== blancas && m.n !== blancas), "la ronda 2 se empareja sin él");
  await page.click('[data-ficha="jugadores"]');
  await page.click('[aria-label="' + nombre + ' vuelve a jugar"]');
  const [l3] = await P.esperarGuardado(page, (l, id) => l[0].jugadores.find((j) => j.id === id).retiradoDespuesDe === null, blancas);
  const j3 = l3.jugadores.find((j) => j.id === blancas);
  igual("«Vuelve a jugar» lo devuelve, y la ronda 1 queda como su excepción", [j3.retiroAuto, j3.vuelveTras], [undefined, 0]);
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

async function pruebaTodos(browser) {
  console.log("\n=== En la página: todos contra todos ===");
  const t = T.nuevo({ nombre: "PRUEBA TODOS", sistema: "todos", jugadores: ["Ana", "Beatriz", "Carla", "Diana"].map((n, k) => ({ id: "j" + k, nombre: "PRUEBA " + n, retiradoDespuesDe: null })) });
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", sembrar(t));
  await page.click('[data-ficha="rondas"]');
  await page.click("#pi-emparejar");
  await page.waitForSelector("#pi-mesa-0");
  const [l0] = await P.leerTodos(page);
  const negras = l0.rondas[0].mesas[0].n;
  await page.selectOption("#pi-mesa-0", "+-");
  await P.esperarGuardado(page, (l, id) => l[0].jugadores.find((j) => j.id === id).retiradoDespuesDe === 1, negras);
  await page.selectOption("#pi-mesa-1", "=");
  await (await page.$$("#pi-rondas-nav button")).pop().click();
  await page.click("#pi-emparejar");
  await page.waitForFunction(() => !document.getElementById("pi-emparejar"));
  const [l1] = await P.leerTodos(page);
  const suya = l1.rondas[1].mesas.find((m) => m.b === negras || m.n === negras);
  igual("su partida de la ronda 2 queda perdida sin jugar (el calendario no cambia)", suya.r, suya.b === negras ? "-+" : "+-");
  ok(l1.rondas[1].mesas.filter((m) => m !== suya).every((m) => !m.r), "las demás, por jugar");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

(async () => {
  pruebaSinNavegador();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaSuizo(browser);
    await pruebaTodos(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
