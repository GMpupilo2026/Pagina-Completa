/* Pareo Integral: el Sistema Scheveningen (js/pareo/torneo.js, pagina.js,
 * desempates.js, evento.js, publicar.js).
 *
 * Dos equipos (las dos instituciones de la lista) y cada jugador contra todos
 * los del otro, nunca contra uno de su equipo. Lo que se rompe acá no da
 * ningún error: un calendario mal armado repite un rival o empareja a dos del
 * mismo colegio y se ve igual de prolijo, y unos colores mal repartidos dejan
 * a un equipo con blancas en todas las rondas. Dos partes:
 *
 *   1. La lógica, en Node: con 1 a 12 por equipo, cada pareja A-B se juega una
 *      sola vez, cada jugador tiene tantas blancas como negras (con n impar, a
 *      lo sumo una de diferencia) y nunca tres seguidas del mismo color; la
 *      doble vuelta da vuelta los colores; los errores (sin institución, tres
 *      equipos, distinto número, demasiados); el marcador; el TRF (092 sin la
 *      línea 192 del Holandés, que se vuelve a leer como Scheveningen) y los
 *      desempates de calendario fijo.
 *   2. La página, en un navegador: elegir Scheveningen, ver los dos equipos
 *      con su orden de tableros, emparejar (sin el motor), anotar y ver el
 *      marcador del encuentro arriba de la clasificación; con equipos
 *      desparejos, no empareja y dice por qué.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-scheveningen.js
 */
const fs = require("fs");
const { chromium } = require("playwright");
const T = require("../js/pareo/torneo.js");
const D = require("../js/pareo/desempates.js");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const P = require("./lib/pareo-pruebas");

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));

function torneo(n, extra) {
  const jugadores = [];
  for (let i = 0; i < 2 * n; i++) {
    jugadores.push({ id: "j" + i, nombre: "Jugador " + i, elo: 2400 - i * 10, institucion: i % 2 ? "Colegio Bé" : "Liceo A" });
  }
  return T.nuevo(Object.assign({ sistema: "scheveningen", jugadores }, extra || {}));
}

function pruebaLogica() {
  console.log("\n=== El calendario, de 1 a 12 por equipo ===");
  const problemas = [];
  for (let n = 1; n <= T.MAX_SCHEVENINGEN; n++) {
    const t = torneo(n);
    const e = T.equiposScheveningen(t);
    if (e.error) { problemas.push(n + ": " + e.error); continue; }
    const deA = new Set(e.a.ids);
    if (T.rondasDelTorneo(t) !== n) problemas.push(n + ": " + T.rondasDelTorneo(t) + " rondas");
    const vistos = new Set();
    const colores = new Map(t.jugadores.map((j) => [j.id, []]));
    for (let r = 0; r < n; r++) {
      const { mesas } = T.rondaFija(t, r);
      if (mesas.length !== n) problemas.push(n + ": la ronda " + (r + 1) + " tiene " + mesas.length + " mesas");
      const juegan = new Set();
      for (const m of mesas) {
        if (deA.has(m.b) === deA.has(m.n)) problemas.push(n + ": " + m.b + " y " + m.n + " son del mismo equipo");
        const par = [m.b, m.n].sort().join("-");
        if (vistos.has(par)) problemas.push(n + ": " + par + " se repite");
        vistos.add(par);
        juegan.add(m.b); juegan.add(m.n);
        colores.get(m.b).push("B"); colores.get(m.n).push("N");
      }
      if (juegan.size !== 2 * n) problemas.push(n + ": en la ronda " + (r + 1) + " alguien no juega o juega dos veces");
      // El tablero i lleva al i-ésimo de A (el orden de tableros).
      if (mesas.some((m, i) => m.b !== e.a.ids[i] && m.n !== e.a.ids[i])) problemas.push(n + ": el tablero no sigue el orden de A");
    }
    if (vistos.size !== n * n) problemas.push(n + ": " + vistos.size + " de " + n * n + " parejas");
    for (const [id, c] of colores) {
      const b = c.filter((x) => x === "B").length;
      if (Math.abs(2 * b - n) > 1) problemas.push(n + ": " + id + " con " + b + " blancas de " + n);
      if (/BBB|NNN/.test(c.join(""))) problemas.push(n + ": " + id + " con tres seguidas (" + c.join("") + ")");
    }
  }
  ok(!problemas.length, "cada pareja A-B una vez, nadie contra su equipo, colores parejos y nunca tres seguidos", problemas.slice(0, 8).join(" | "));

  const t4 = torneo(4, { dobleVuelta: true });
  ok(T.rondasDelTorneo(t4) === 8, "a doble vuelta, el doble de rondas");
  const r1 = T.rondaFija(t4, 0).mesas, r5 = T.rondaFija(t4, 4).mesas;
  ok(r1.every((m, i) => r5[i].b === m.n && r5[i].n === m.b), "la segunda vuelta repite los encuentros con los colores al revés");
  const tn = torneo(4, { colorInicial: "b" });
  ok(T.rondaFija(tn, 0).mesas.every((m, i) => m.b === r1[i].n), "con el n.º 1 de negras, los colores de la ronda 1 se dan vuelta");

  console.log("\n=== Lo que no se puede emparejar ===");
  const sin = torneo(2); sin.jugadores[3].institucion = " ";
  ok(T.equiposScheveningen(sin).error === "sinEquipo", "un jugador sin institución");
  const tres = torneo(2); tres.jugadores[3].institucion = "Otro";
  ok(T.equiposScheveningen(tres).error === "dosEquipos", "tres instituciones");
  const desp = torneo(2); desp.jugadores.push({ id: "x", nombre: "X", elo: 0, institucion: "Liceo A" });
  ok(T.equiposScheveningen(desp).error === "mismoNumero", "equipos de distinto tamaño");
  ok(T.equiposScheveningen(torneo(13)).error === "muchos", "más de 12 por equipo");
  const tildes = torneo(2); tildes.jugadores[2].institucion = "  liceo   a ";
  ok(!T.equiposScheveningen(tildes).error, "la misma institución con otras mayúsculas o espacios es el mismo equipo");
  let tiro = null;
  try { T.rondaFija(desp, 0); } catch (e) { tiro = e; }
  ok(tiro && tiro.detalle && tiro.detalle.error === "mismoNumero", "rondaFija no arma un calendario con equipos desparejos");

  console.log("\n=== El marcador, el TRF y los desempates ===");
  const t = torneo(2);
  T.fijarNumeracion(t);
  for (let r = 0; r < 2; r++) t.rondas.push(T.rondaFija(t, r));
  // Ronda 1: gana A en las dos; ronda 2: tablas y gana B.
  const e = T.equiposScheveningen(t);
  const deA = new Set(e.a.ids);
  const ganaA = (m) => (deA.has(m.b) ? "1-0" : "0-1");
  t.rondas[0].mesas.forEach((m) => { m.r = ganaA(m); });
  t.rondas[1].mesas[0].r = "=";
  t.rondas[1].mesas[1].r = deA.has(t.rondas[1].mesas[1].b) ? "0-1" : "1-0";
  const mk = T.marcadorScheveningen(t);
  ok(mk.totalA === 2.5 && mk.totalB === 1.5 && mk.rondas[0].a === 2 && mk.rondas[1].b === 1.5, "el marcador suma por equipo, ronda a ronda", JSON.stringify(mk));
  t.rondas[1].mesas[0].r = null;
  ok(T.marcadorScheveningen(t).rondas[1].faltan === 1, "y dice cuántas mesas faltan");
  t.rondas[1].mesas[0].r = "=";
  const trf = T.aTrf(t);
  ok(/^092 Individual: Scheveningen$/m.test(trf) && /^142 2$/m.test(trf), "el TRF dice Scheveningen y sus rondas");
  ok(!/^192 /m.test(trf), "sin la línea 192 (es la del Sistema Holandés)");
  const vuelta = T.deTrf(trf);
  ok(vuelta.sistema === "scheveningen" && vuelta.rondas.length === 2, "el TRF se vuelve a leer como Scheveningen");
  ok(T.fijo(t) && /const todos = T\.fijo\(t\);/.test(fs.readFileSync(require.resolve("../js/pareo/desempates.js"), "utf8")),
    "los desempates lo tratan como calendario fijo (la incomparecencia, con el rival programado)");
  ok(D.clasificacion(t, t.desempates).length === 4, "y la clasificación individual sale con sus desempates");
}

async function pruebaPagina(browser) {
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE);
  await page.click('[data-ficha="torneo"]');
  await page.fill('#pi-form-torneo [name="nombre"]', "PRUEBA Scheveningen");
  await page.press('#pi-form-torneo [name="nombre"]', "Tab");
  await page.check('#pi-form-torneo input[name="sistema"][value="scheveningen"]');
  ok(!(await P.vis(page, "#pi-campo-rondas")) && await P.vis(page, "#pi-campo-doble"), "con Scheveningen, sin «Número de rondas» y con «A doble vuelta»");

  await page.click('[data-ficha="jugadores"]');
  await page.click("#pi-pegar-caja summary");
  const lista = ["Ana A;Liceo A;1900", "Beto A;Liceo A;1800", "Caro A;Liceo A;1700",
    "Dani B;Colegio B;1850", "Eva B;Colegio B;1750"];
  await page.fill("#pi-pegar", lista.join("\n"));
  await page.click("#pi-pegar-agregar");
  await page.click('[data-ficha="rondas"]');
  ok(/misma cantidad de jugadores: Liceo A tiene 3 y Colegio B tiene 2/.test(await page.textContent("#pi-ronda")), "con equipos desparejos dice cuántos tiene cada uno");
  await page.click("#pi-emparejar");
  await page.waitForTimeout(400);
  ok(!(await page.$("#pi-mesa-0")), "y no empareja");

  await page.click('[data-ficha="jugadores"]');
  await page.$eval("#pi-pegar-caja", (d) => { d.open = true; });
  await page.fill("#pi-pegar", "Fede B;Colegio B;1650");
  await page.click("#pi-pegar-agregar");
  await page.click('[data-ficha="rondas"]');
  const equipos = await page.textContent("#pi-ronda");
  ok(/Equipo A: Liceo A/.test(equipos) && /Equipo B: Colegio B/.test(equipos), "antes de la ronda 1 muestra los dos equipos", equipos.slice(0, 300));
  const ordenA = await page.$$eval("#pi-ronda ol", (l) => l.map((o) => [...o.querySelectorAll("li")].map((x) => x.textContent)));
  ok(JSON.stringify(ordenA) === JSON.stringify([["Ana A", "Beto A", "Caro A"], ["Dani B", "Eva B", "Fede B"]]), "con su orden de tableros por Elo", JSON.stringify(ordenA));

  await page.click("#pi-emparejar");
  await page.waitForSelector("#pi-mesa-0");
  const t1 = (await P.leerTodos(page)).find((x) => x.nombre === "PRUEBA Scheveningen");
  const ids = new Map(t1.jugadores.map((j) => [j.id, j.institucion]));
  ok(t1.rondas[0].mesas.length === 3 && t1.rondas[0].mesas.every((m) => ids.get(m.b) !== ids.get(m.n)), "la ronda 1: tres mesas, cada una entre los dos equipos");

  await P.anotar(page, "1-0");
  await P.jugarRondas(page, "1-0");
  const tf = (await P.leerTodos(page)).find((x) => x.nombre === "PRUEBA Scheveningen");
  const parejas = new Set(tf.rondas.flatMap((r) => r.mesas.map((m) => [m.b, m.n].sort().join())));
  ok(tf.rondas.length === 3 && parejas.size === 9, "tres rondas y las nueve parejas distintas", tf.rondas.length + " rondas, " + parejas.size + " parejas");
  ok(!(await page.$("#pi-emparejar")) || !(await P.vis(page, "#pi-emparejar")), "terminado, no ofrece emparejar una cuarta ronda");

  await page.click('[data-ficha="clasificacion"]');
  ok(await P.vis(page, "#pi-clas-schev"), "la clasificación trae el encuentro entre equipos");
  const marcador = await page.textContent("#pi-clas-schev");
  ok(/Liceo A \d½? – \d½? Colegio B/.test(marcador) && /Ganó el encuentro|terminó empatado/.test(marcador), "con el resultado escrito, no solo en números", marcador.slice(0, 200));
  const filas = await page.$$eval("#pi-clas-schev tbody tr", (l) => l.length);
  ok(filas === 3, "y una fila por ronda");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));

  console.log("\n=== Con rondas jugadas ===");
  await page.click('[data-ficha="torneo"]');
  ok(await page.$eval('#pi-form-torneo input[name="sistema"][value="scheveningen"]', (r) => r.disabled), "con rondas jugadas, el sistema ya no se cambia");
  await ctx.close();
}

(async () => {
  try { pruebaLogica(); } catch (e) { mal("la prueba de la lógica se cayó", e.stack); }
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try { console.log("\n=== La página ==="); await pruebaPagina(browser); }
  catch (e) { mal("la prueba de la página se cayó", e.stack); }
  finally { await browser.close(); }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
