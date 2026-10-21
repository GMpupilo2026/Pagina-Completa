/* Pareo Integral: los torneos por equipos (js/pareo/equipos.js y su parte
 * en js/pareo/pagina.js).
 *
 * Lo que se rompe acá no da ningún error: un color mal puesto en el tablero
 * 2, un tablero vacío que no cuenta como perdido, un encuentro que se gana
 * con menos puntos de tablero, un equipo de uno que «juega», o los puntos
 * de tablero que no desempatan. Dos partes:
 *
 *   1. Sin navegador: armar los equipos, los colores (el equipo de la
 *      izquierda con blancas en los tableros 1 y 3), el resultado del
 *      encuentro, la incomparecencia con menos de 2 (art. 66.2.f), los
 *      puntos de tablero, la clasificación con «PT» primero, el orden de
 *      tableros fijo desde la ronda 1, y un suizo de 7 equipos emparejado de
 *      punta a punta por el motor de FIDE.
 *   2. En la página, con un .xlsx como el de los JDE (nombres inventados):
 *      la sugerencia arma el torneo por equipos, el orden de tableros se
 *      cambia con ↑ y ↓, se empareja, se anota tablero por tablero, el
 *      encuentro sale solo, quitar jugadores da la incomparecencia, y la
 *      clasificación trae los puntos de tablero.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-equipos.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const E = require(path.join(RAIZ, "js/pareo/equipos.js"));
const M = require(path.join(RAIZ, "js/pareo/motor.js")).enNode();
const TablaExcel = require(path.join(RAIZ, "js/tabla-excel.js"));

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));
const igual = (m, a, b) => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, m, ja === jb ? "" : "esperaba " + jb + ", salió " + ja);
};

/* ==================================================================
   1. Sin navegador
   ================================================================== */
let contador = 0;
const nuevoId = () => "x" + (++contador);
const persona = (nombre, institucion, elo) => ({ id: nuevoId(), nombre, institucion, elo: elo || 0, categoria: "C" });

function torneoDeEquipos(equipos, datos) {
  return T.nuevo(Object.assign({ tipo: "equipos", tableros: 4, puntos: Object.assign({}, E.PUNTOS_EQUIPOS), desempates: ["PT", "DE", "BH-C1", "BH"], jugadores: equipos }, datos));
}

async function pruebaSinNavegador() {
  console.log("\n=== Armar los equipos ===");
  const gente = [
    persona("A1", "Liceo Uno", 1500), persona("B1", "Colegio Dos"), persona("A2", "LICEO UNO", 1700),
    persona("A3", "Liceo Uno"), persona("B2", "Colegio Dos"), persona("A4", "Liceo Uno", 0), persona("A5", "Liceo Uno", 2000),
  ];
  const eqs = E.armarEquipos(gente, nuevoId);
  igual("uno por centro (sin mirar mayúsculas), con sus integrantes en el orden de la inscripción",
    eqs.map((e) => e.nombre + ":" + e.integrantes.map((j) => j.nombre).join(",")), ["Liceo Uno:A1,A2,A3,A4,A5", "Colegio Dos:B1,B2"]);
  igual("el Elo del equipo: promedio de los que tienen, entre los 4 primeros (el suplente no cuenta)", eqs[0].elo, 1600);

  console.log("\n=== Un encuentro, tablero por tablero ===");
  const t = torneoDeEquipos(eqs);
  const [uno, dos] = eqs;
  const m = E.prepararMesa(t, { b: uno.id, n: dos.id, r: null });
  igual("de entrada juegan los 4 primeros de cada equipo", [m.alineacion.b.length, m.alineacion.n.length], [4, 2]);
  const tabs = E.tablerosDe(t, m);
  igual("colores: el de la izquierda con blancas en 1 y 3, con negras en 2 y 4", tabs.map((x) => x.bBlancas), [true, false, true, false]);
  igual("el tablero 1: A1 con blancas contra B1", [tabs[0].blancas, tabs[0].negras], [uno.integrantes[0].id, dos.integrantes[0].id]);
  igual("el tablero 2: B2 con blancas contra A2", [tabs[1].blancas, tabs[1].negras], [dos.integrantes[1].id, uno.integrantes[1].id]);
  igual("los tableros 3 y 4, sin rival: los gana por incomparecencia el que vino", [tabs[2].r, tabs[2].fijo, tabs[3].r], ["+-", true, "-+"]);
  igual("faltan resultados: no hay resultado del encuentro", E.resultadoEncuentro(t, m), null);
  m.partidas[0].r = "0-1"; m.partidas[1].r = "=";
  // A1 pierde (0) · A2 con negras empata (½) · A3 gana el 3 sin rival (1) · A4 gana el 4 sin rival (1): 2½ a 1½.
  igual("los puntos de tablero (2½ – 1½)", [E.puntosDelEncuentro(t, m).b, E.puntosDelEncuentro(t, m).n], [2.5, 1.5]);
  igual("gana el que suma más tableros", E.resultadoEncuentro(t, m), "1-0");
  m.partidas[1].r = "1-0"; // B2 con blancas le gana a A2
  igual("2 – 2 es empate", E.resultadoEncuentro(t, m), "=");

  console.log("\n=== Menos de 2 presentes (art. 66.2.f) ===");
  m.alineacion.n = [dos.integrantes[0].id];
  igual("con uno solo, el encuentro se pierde por incomparecencia", E.resultadoEncuentro(t, m), "+-");
  igual("y el rival se lleva los 4 tableros", [E.puntosDelEncuentro(t, m).b, E.puntosDelEncuentro(t, m).n], [4, 0]);
  m.alineacion.b = [];
  igual("si ninguno completa, nadie gana", E.resultadoEncuentro(t, m), "--");

  console.log("\n=== Puntos de tablero y clasificación ===");
  const tres = E.armarEquipos([1, 2, 3, 4].map((k) => persona("C" + k, "Escuela Tres")), nuevoId)[0];
  const cuatro = E.armarEquipos([1, 2, 3, 4].map((k) => persona("D" + k, "Escuela Cuatro")), nuevoId)[0];
  const t2 = torneoDeEquipos([uno, dos, tres, cuatro].map((e) => JSON.parse(JSON.stringify(e))), { sistema: "todos" });
  const [U, Do, Tr, Cu] = t2.jugadores;
  const enc = (b, n, rs) => { const x = E.prepararMesa(t2, { b: b.id, n: n.id, r: null }); x.alineacion.n = E.alineacionPorOmision(t2, n.id); rs.forEach((r, k) => { x.partidas[k].r = r; }); x.r = E.resultadoEncuentro(t2, x); return x; };
  // Los resultados se escriben desde las blancas, y en los tableros 2 y 4
  // las blancas son del equipo de la derecha. Dos tiene solo 2: sus
  // tableros 3 y 4 se pierden solos.
  // Ronda 1 · Uno–Dos: 1-0 (Uno) y = → 3½ – ½. Tres–Cuatro: 1-0 (Tres) y
  // 0-1 (gana Tres, que lleva negras en el 2), = y = → 3 – 1.
  t2.rondas.push({ mesas: [enc(U, Do, ["1-0", "="]), enc(Tr, Cu, ["1-0", "0-1", "=", "="])], ausencias: {} });
  igual("los resultados de la ronda 1", t2.rondas[0].mesas.map((x) => x.r), ["1-0", "1-0"]);
  igual("puntos de encuentro: 2 por ganar", [T.puntos(t2, U.id), T.puntos(t2, Tr.id), T.puntos(t2, Do.id)], [2, 2, 0]);
  igual("puntos de tablero de cada uno", [U, Do, Tr, Cu].map((e) => E.puntosTablero(t2, e.id)), [3.5, 0.5, 3, 1]);
  // Ronda 2 · Uno–Tres: cada uno gana sus dos tableros con blancas → 2 – 2.
  // Dos–Cuatro: 1-0 (Dos con blancas), 1-0 (Cuatro con blancas) y los dos
  // tableros que Dos no tiene → 1 – 3.
  t2.rondas.push({ mesas: [enc(U, Tr, ["1-0", "1-0", "0-1", "0-1"]), enc(Do, Cu, ["1-0", "1-0"])], ausencias: {} });
  igual("los resultados de la ronda 2", t2.rondas[1].mesas.map((x) => x.r), ["=", "0-1"]);
  const clas = E.clasificacion(t2, ["PT", "DE"]);
  igual("empatados en encuentros (3 y 3), desempatan los puntos de tablero (5½ y 5)", clas.map((f) => [t2.jugadores.find((e) => e.id === f.id).nombre, f.puntos, f.valores.PT]),
    [["Liceo Uno", 3, 5.5], ["Escuela Tres", 3, 5], ["Escuela Cuatro", 2, 4], ["Colegio Dos", 0, 1.5]]);
  igual("cada uno con su puesto", clas.map((f) => f.puesto), [1, 2, 3, 4]);
  const sinPT = E.clasificacion(t2, ["DE"]);
  igual("sin PT, los empatados en encuentros comparten puesto (el encuentro directo fue empate)", sinPT.slice(0, 2).map((f) => f.puesto), [1, 1]);
  ok(E.catalogo(t2)[0].codigo === "PT" && !E.catalogo({ tipo: undefined }).some((x) => x.codigo === "PT"), "«PT» solo se ofrece en un torneo por equipos");

  console.log("\n=== El orden de tableros, fijo desde la ronda 1 (art. 66.2.h) ===");
  const t3 = torneoDeEquipos([JSON.parse(JSON.stringify(uno))]);
  ok(E.moverIntegrante(t3, t3.jugadores[0].id, 0, 1) && t3.jugadores[0].integrantes[0].nombre === "A2", "antes de la ronda 1 se cambia");
  t3.rondas.push({ mesas: [], ausencias: {} });
  ok(!E.moverIntegrante(t3, t3.jugadores[0].id, 0, 1), "después, no");

  console.log("\n=== Un suizo de 7 equipos, emparejado por el motor de FIDE ===");
  const siete = [];
  for (let k = 0; k < 7; k++) siete.push(...E.armarEquipos([0, 1, 2, 3, 4].map((q) => persona("E" + k + "-" + q, "Centro " + k, 1200 + 50 * k + q)), nuevoId));
  const ts = torneoDeEquipos(siete, { rondasTotales: 5 });
  let azar = 7;
  const rnd = () => { azar = (azar * 16807) % 2147483647; return azar / 2147483647; };
  const vistos = new Set();
  let repetido = false, byes = 0;
  for (let r = 0; r < 5; r++) {
    if (r === 0) T.fijarNumeracion(ts);
    const mesas = T.leerPareo(ts, await M.emparejar(T.aTrf(ts, { hasta: r, proxima: { ausencias: {} } })));
    for (const x of mesas) {
      if (x.n === null) { byes++; continue; }
      const k = [x.b, x.n].sort().join("|");
      if (vistos.has(k)) repetido = true;
      vistos.add(k);
      E.prepararMesa(ts, x);
      x.partidas.forEach((p) => { const z = rnd(); p.r = z < 0.4 ? "1-0" : z < 0.7 ? "=" : "0-1"; });
      x.r = E.resultadoEncuentro(ts, x);
    }
    ts.rondas.push({ mesas, ausencias: {} });
  }
  ok(!repetido, "nadie se enfrenta dos veces");
  igual("con 7 equipos, un bye por ronda", byes, 5);
  const totalTableros = ts.jugadores.reduce((a, e) => a + E.puntosTablero(ts, e.id), 0);
  igual("los puntos de tablero suman 4 por encuentro y 2 por bye (15 encuentros y 5 byes)", totalTableros, 15 * 4 + 5 * 2);
  const c = await M.comprobar(T.aTrf(ts));
  ok(c.correcto, "el comprobador de FIDE acepta los pareos de los encuentros", (c.diferencias || []).slice(0, 3).join(" | "));
}

/* ==================================================================
   2. En la página
   ================================================================== */
// Un .xlsx como el de los JDE: tres centros en equipos C abierto (uno con
// 5: el quinto es suplente) y dos en individual C (para que haya dos grupos).
function excelEquipos() {
  const filas = [["Nombre", "Sexo", "Nombre de Centro Educativo", "Categoría", "Equipo/Ind", "FDN"]];
  const centros = [["LICEO NORTE", 5], ["LICEO SUR", 4], ["LICEO ESTE", 4]];
  for (const [c, n] of centros) for (let i = 0; i < n; i++) filas.push(["PRUEBA " + c.split(" ")[1] + " " + (i + 1), "HOMBRE", c, "C", "Equipo", "2013-05-0" + (i + 1)]);
  filas.push(["PRUEBA INDIVIDUAL 1", "HOMBRE", "LICEO NORTE", "C", "Individual", "2013-01-01"]);
  filas.push(["PRUEBA INDIVIDUAL 2", "HOMBRE", "LICEO SUR", "C", "Individual", "2013-01-02"]);
  return Buffer.from(TablaExcel.armar([{ nombre: "Hoja1", filas }]));
}

async function pruebaPagina(browser) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.goto(BASE + "/pareo.html", { waitUntil: "networkidle" });
  await page.evaluate(() => { window.print = () => {}; });
  await page.click('[data-ficha="jugadores"]');
  await page.setInputFiles("#pi-subir-lista", { name: "equipos.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: excelEquipos() });
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").checkVisibility());

  console.log("\n=== La sugerencia arma el torneo por equipos ===");
  const filas = await page.$$eval("#pi-sugerencia fieldset li", (l) => l.map((x) => x.textContent));
  const deEquipos = filas.find((x) => /^Equipos/.test(x)) || "";
  ok(/13 jugadores en 3 equipos/.test(deEquipos), "cuenta los equipos, no solo los jugadores", deEquipos);
  ok(/todos contra todos/.test(deEquipos), "el sistema sale de cuántos equipos hay (3: todos contra todos)", deEquipos);
  await page.click("#pi-sugerencia-crear");
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").hidden);
  // Abrir el de equipos.
  const idEquipos = await page.evaluate(() => {
    const lista = JSON.parse(localStorage.getItem("pareo_lista_v1"));
    return lista.find((x) => /Equipos/.test(x.nombre)).id;
  });
  await page.selectOption("#pi-lista", idEquipos);
  const leer = () => page.evaluate(() => JSON.parse(localStorage.getItem("pareo_torneo_v1_" + localStorage.getItem("pareo_abierto_v1"))));
  let tor = await leer();
  igual("es un torneo por equipos, todos contra todos, con PT primero", [tor.tipo, tor.sistema, tor.desempates[0]], ["equipos", "todos", "PT"]);

  console.log("\n=== Jugadores: los equipos y su orden de tableros ===");
  const vis = (sel) => page.$eval(sel, (n) => n.checkVisibility()).catch(() => false);
  ok(await vis("#pi-equipos") && !(await vis("#pi-tabla-jugadores")), "se ven los equipos, no la tabla de jugadores");
  ok(!(await vis("#pi-form-jugador")) && !(await vis("#pi-elo-nacional")) && await vis("#pi-nota-equipos"), "no se agrega gente a mano ni se busca Elo de un equipo, y lo dice");
  igual("tres equipos inscritos", await page.textContent("#pi-cuenta"), "3");
  const norte = tor.jugadores.find((e) => e.nombre === "LICEO NORTE");
  ok(/suplente/.test(await page.textContent(`[data-equipo="${norte.id}"]`)), "el quinto es el suplente");
  await page.click(`#pi-orden-${norte.id}-0-baja`);
  tor = await leer();
  igual("↓ cambia el orden de tableros", tor.jugadores.find((e) => e.nombre === "LICEO NORTE").integrantes.slice(0, 2).map((j) => j.nombre), ["PRUEBA NORTE 2", "PRUEBA NORTE 1"]);
  ok(await page.$eval(`#pi-orden-${norte.id}-1-baja`, (b) => document.activeElement === b), "el foco sigue al que se movió");
  await page.click("#pi-equipos button:has-text('orden de tableros')");
  ok(/Orden de tableros: LICEO NORTE/.test(await page.textContent("#pi-firmas")) && /Firma del delegado/.test(await page.textContent("#pi-firmas")), "la hoja del orden de tableros para firmar");
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));

  console.log("\n=== Emparejar y anotar por tableros ===");
  await page.click('[data-ficha="rondas"]');
  await page.click('#pi-ronda button:has-text("Emparejar la ronda 1")');
  await page.waitForFunction(() => document.querySelector("#pi-ronda section"));
  tor = await leer();
  const m = tor.rondas[0].mesas.find((x) => x.n);
  igual("cada encuentro trae su alineación (4 y 4) y 4 tableros", [m.alineacion.b.length, m.alineacion.n.length, m.partidas.length], [4, 4, 4]);
  ok(/No juegan esta ronda|libre/i.test(await page.textContent("#pi-ronda")), "con 3 equipos, uno queda libre", (await page.textContent("#pi-ronda")).slice(-200));
  const i = tor.rondas[0].mesas.indexOf(m);
  for (const [k, r] of [[0, "1-0"], [1, "="], [2, "0-1"]]) await page.selectOption(`#pi-enc-${i}-t${k}`, r);
  // 1-0 en el 1 (gana el de la izquierda, con blancas), = en el 2 y 0-1 en el 3 (gana el de la derecha): 1½ – 1½.
  igual("con un tablero sin anotar, dice cuánto van", await page.textContent(`#pi-enc-${i}-r`), "Faltan tableros por anotar (van 1½ – 1½).");
  tor = await leer();
  igual("todavía sin resultado del encuentro", tor.rondas[0].mesas[i].r, null);
  await page.selectOption(`#pi-enc-${i}-t3`, "1-0");
  tor = await leer();
  // 1 (blancas del de la izq.) + ½ + el 3: 0-1 (pierde el de la izq. con blancas) + el 4: 1-0 (gana el del rival con blancas): 1½ – 2½.
  igual("el encuentro sale solo de los tableros", tor.rondas[0].mesas[i].r, "0-1");
  ok(/Resultado: 1½ – 2½ \(gana /.test(await page.textContent(`#pi-enc-${i}-r`)), "y lo dice con los puntos de tablero", await page.textContent(`#pi-enc-${i}-r`));
  ok(await page.$eval(`#pi-enc-${i}-t3`, (s) => document.activeElement === s), "el foco se queda en el tablero que se anotó");

  console.log("\n=== Menos de 2: incomparecencia ===");
  for (const k of [0, 1, 2]) await page.click(`#pi-enc-${i}-n-${k}`);
  tor = await leer();
  igual("con un solo jugador, el equipo pierde el encuentro", tor.rondas[0].mesas[i].r, "+-");
  ok(/incomparecencia/.test(await page.textContent(`#pi-enc-${i}-r`)), "y lo dice");
  for (const k of [0, 1, 2]) await page.click(`#pi-enc-${i}-n-${k}`);
  tor = await leer();
  igual("al volver a marcarlos, el resultado vuelve", tor.rondas[0].mesas[i].r, "0-1");

  console.log("\n=== Clasificación con puntos de tablero ===");
  await page.click('[data-ficha="clasificacion"]');
  const cabeza = await page.$$eval("#pi-tabla-clas thead th", (l) => l.map((x) => x.textContent));
  ok(cabeza.includes("PT"), "la clasificación trae la columna PT", cabeza.join(" | "));
  const primera = await page.$$eval("#pi-tabla-clas tbody tr:first-child td", (l) => l.map((x) => x.textContent));
  ok(primera[6] === "2" || primera[6] === "1", "los puntos son de encuentro", primera.join(" | "));
  ok(/Puntos de tablero/.test(await page.textContent("#pi-clas-leyenda")), "la leyenda explica PT");
  await page.click('[data-ficha="cruzada"]');
  ok((await page.$$eval("#pi-tabla-cruzada tbody tr", (l) => l.length)) === 3, "la tabla cruzada muestra los 3 equipos");
  await page.click('[data-ficha="archivos"]');
  await page.click('[data-ficha="torneo"]');
  ok(await page.$eval("#pi-config-jde-aplicar", (b) => b.disabled), "con la ronda 1 emparejada, la configuración ya no se aplica");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

(async () => {
  try { await pruebaSinNavegador(); } catch (e) { mal("la parte sin navegador se cayó", e.stack); }
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try { await pruebaPagina(browser); }
  catch (e) { mal("la prueba de la página se cayó", e.stack); }
  finally { await browser.close(); }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
