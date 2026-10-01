#!/usr/bin/env node
/* El calentamiento de 20 ejercicios (sesion.html, js/clase-tanda.js,
   game_state.tanda_calentamiento).

   - La parte pura (TandaCalentamiento): cada alumno recibe 20 ejercicios de
     Táctica del MISMO nivel (uno de cada tramo de la banda) y DISTINTOS a los
     de sus compañeros; el profe rehace la tanda de cualquiera con la semilla;
     vale la jugada de la solución o cualquier mate, y nada más; la nota va de
     0 a 100 y lo no hecho cuenta como no resuelto.
   - El alumno: resuelve en su tablero (el rival contesta solo), si falla ve la
     que era y pasa al siguiente, «No sé» también pasa, lo que lleva va en la
     presencia, y al acabarse el tiempo ve su nota.
   - El profe: manda el nivel, el tiempo y la lista de conectados; ve cuántos
     lleva cada uno (también quien se desconectó), mira el ejercicio en que
     está un alumno, termina antes y quita el calentamiento.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-tanda.js
*/
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");

const { abrir, CHROME } = R;
const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };
const INICIO = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
const seVe = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!(el && el.checkVisibility()); }, sel);
const fila = (extra) => Object.assign({ id: 7, owner_id: "u-profe", fen: INICIO, moves: [], start_fen: INICIO, arrows: [], circles: [],
  active_player_color: "both", vista: null, comentarios: {}, elegido: null, pensar: null, encuesta: null, calentamiento: null,
  podio: null, equipos: null, tanda_calentamiento: null }, extra || {});
const cambiosDeGameState = (page) => page.evaluate(() => window.__updates.filter((u) => u.tabla === "game_state").map((u) => u.campos));

function laParteQueNoTocaLaPagina() {
  console.log("\n=== TandaCalentamiento, sola ===");
  global.window = {};
  global.Chess = require("chess.js").Chess;
  const s = fs.readFileSync(path.join(__dirname, "..", "js", "clase-tanda.js"), "utf8");
  const i = s.indexOf("window."), j = s.indexOf("})();", i) + 5;
  eval(s.slice(i, j));
  const T = global.window.TandaCalentamiento;
  const banco = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "entreno", "data", "temas.json"), "utf8")).puzzles;

  const alumnos = Array.from({ length: 12 }, (_, k) => "u-" + k);
  for (const elo of [600, 1200, 2200]) {
    const tanda = { semilla: "prueba1", elo, cantidad: 20, alumnos };
    const tandas = alumnos.map((id) => T.paraAlumno(banco, tanda, id));
    const ids = tandas.flat().map((e) => e.id);
    const media = (x) => x.reduce((a, e) => a + e.rating, 0) / x.length;
    const medias = tandas.map(media);
    igual("nivel " + elo + ": 20 para cada uno", tandas.every((t) => t.length === 20), true);
    igual("nivel " + elo + ": ninguno se repite entre 12 alumnos", new Set(ids).size, ids.length);
    igual("nivel " + elo + ": el mismo nivel para todos (la media no se separa más de 30 puntos)", Math.max(...medias) - Math.min(...medias) <= 30, true);
    igual("nivel " + elo + ": la media cerca del nivel pedido", Math.abs(media(tandas.flat()) - elo) <= 80, true);
    igual("nivel " + elo + ": de más fácil a más difícil", tandas.every((t) => t.every((e, k) => !k || e.rating >= t[k - 1].rating)), true);
  }
  const tanda = { semilla: "prueba1", elo: 1400, cantidad: 20, alumnos: ["u-ana"] };
  igual("el profe rehace la misma tanda del alumno", T.paraAlumno(banco, tanda, "u-ana").map((e) => e.id).join(),
    T.paraAlumno(banco, Object.assign({}, tanda), "u-ana").map((e) => e.id).join());
  igual("otra semilla, otros ejercicios", T.paraAlumno(banco, tanda, "u-ana").map((e) => e.id).join() !==
    T.paraAlumno(banco, Object.assign({}, tanda, { semilla: "prueba2" }), "u-ana").map((e) => e.id).join(), true);
  const tarde = T.paraAlumno(banco, tanda, "u-tarde");
  igual("quien entró tarde (no está en la lista) recibe igual sus 20", tarde.length, 20);
  igual("los ejercicios sin rating quedan fuera", T.banda({ a: { fen: INICIO, solution: ["e4"] }, b: { fen: INICIO, solution: ["e4"], rating: 1200 } }, 1200), ["b"]);

  // Dos torres: Ta8# y Tb8# dan mate. La solución guarda una sola.
  const ej = T.preparar({ fen: "6k1/5ppp/8/8/8/8/5PPP/RR4K1 w - - 0 1", solution: ["Ra8#"], rating: 900 });
  igual("la solución queda en UCI", ej.uci, ["a1a8"]);
  igual("vale la de la solución", T.revisar(ej, 0, "a1a8"), { bien: true, fin: true });
  igual("vale otro mate", T.revisar(ej, 0, "b1b8"), { bien: true, fin: true });
  igual("otra jugada no vale", T.revisar(ej, 0, "b1b7"), { bien: false, fin: false });
  igual("una ilegal no vale", T.revisar(ej, 0, "a1h8"), { bien: false, fin: false });
  const largo = T.preparar(banco["000h0"]);
  igual("en uno largo, la primera buena sigue (no termina)", T.revisar(largo, 0, largo.uci[0]), { bien: true, fin: false });
  igual("y el segundo paso se revisa después de la respuesta del rival", T.revisar(largo, 2, largo.uci[2]).bien, true);
  igual("una solución que termina con la jugada del rival no se usa", T.preparar({ fen: INICIO, solution: ["e4", "e5"], rating: 900 }), null);
  igual("una solución que no se reproduce no se usa", T.preparar({ fen: INICIO, solution: ["e5"], rating: 900 }), null);
  igual("la nota, de 0 a 100", [T.nota(17, 20), T.nota(0, 20), T.nota(20, 20), T.nota(1, 3)], [85, 0, 100, 33]);
  igual("lo que queda, desde la hora de la base", T.quedan({ at: "2026-10-01T10:00:00Z", segundos: 600 }, Date.parse("2026-10-01T10:09:00Z")), 60);
}

async function jugarUci(page, uci) {
  await page.evaluate((u) => tandaBoard.jugar({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined }), uci);
}

async function pruebaDelAlumno(browser) {
  console.log("\n=== El alumno resuelve sus ejercicios, falla, pasa y ve su nota ===");
  const tanda = { at: new Date().toISOString(), semilla: "abcd1234", elo: 1200, cantidad: 20, segundos: 600, alumnos: ["u-ana"] };
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, { game_state: [fila({ tanda_calentamiento: tanda })] });
  await page.waitForFunction(() => tandaMia && tandaMia.ejercicios.length === 20 && document.getElementById("tanda-tablero").checkVisibility(), null, { timeout: 20000 });
  igual("se ve, con su reloj y en qué va", [await seVe(page, "#tanda-caja"), /^⏱️ Quedan (9:5\d|10:00)$/.test(await page.textContent("#tanda-reloj")),
    await page.textContent("#tanda-estado")], [true, true, "Ejercicio 1 de 20 · llevas 0 bien"]);
  const ejs = await page.evaluate(() => tandaMia.ejercicios);
  igual("son los de su tanda (los que el profe puede rehacer)", ejs.map((e) => e.id).join(),
    await page.evaluate((t) => TandaCalentamiento.paraAlumno(tandaBanco, t, "u-ana").map((e) => e.id).join(), tanda));
  igual("el tablero tiene la posición del primero", await page.evaluate(() => tandaBoard.fen().split(" ")[0]), ejs[0].fen.split(" ")[0]);
  igual("anuncia que empezó, con cero hechos (el profe lo ve en la lista)", await page.evaluate(() => {
    const t = (window.__tracks || []).filter((x) => x.tanda).slice(-1)[0].tanda;
    return [t.hechos, t.buenas, t.i, t.fin];
  }), [0, 0, 0, false]);

  // El primero, entero: las jugadas del alumno; las del rival van solas.
  const e0 = ejs[0];
  for (let p = 0; p < e0.uci.length; p += 2) {
    await page.waitForFunction((n) => tandaBoard.interactive && tandaBoard.moves().length === n, p, { timeout: 5000 });
    await jugarUci(page, e0.uci[p]);
  }
  igual("lo resolvió", (await page.textContent("#tanda-msg")).startsWith("✅"), true);
  await page.waitForFunction(() => /Ejercicio 2 de 20/.test(document.getElementById("tanda-estado").textContent), null, { timeout: 5000 });
  igual("pasa al segundo, con una buena", await page.textContent("#tanda-estado"), "Ejercicio 2 de 20 · llevas 1 bien");
  igual("y lo anuncia en la presencia", await page.evaluate(() => { const t = window.__tracks.slice(-1)[0].tanda; return [t.hechos, t.buenas, t.i, t.fin]; }), [1, 1, 1, false]);

  // El segundo: una jugada legal que no es la de la solución ni da mate.
  const mala = await page.evaluate((ej) => {
    const g = new Chess(ej.fen);
    const m = g.moves({ verbose: true }).find((x) => x.from + x.to + (x.promotion || "") !== ej.uci[0] && !/#/.test(x.san) && !x.promotion);
    return m.from + m.to;
  }, ejs[1]);
  await jugarUci(page, mala);
  const msg = await page.textContent("#tanda-msg");
  igual("falla: lo dice, dice cuál era y pasa al siguiente", [msg.startsWith("❌ Respuesta incorrecta"), / Era .+\. Pasas al siguiente\.$/.test(msg)], [true, true]);
  igual("con la buena marcada en la posición de antes, y sin «No sé» mientras", [await page.evaluate(() => [tandaBoard.moves().length, tandaBoard.interactive]), await seVe(page, "#tanda-pasar-btn")], [[0, false], false]);
  await page.waitForFunction(() => /Ejercicio 3 de 20/.test(document.getElementById("tanda-estado").textContent), null, { timeout: 6000 });
  igual("la mala no suma", await page.textContent("#tanda-estado"), "Ejercicio 3 de 20 · llevas 1 bien");

  await page.click("#tanda-pasar-btn");
  await page.waitForFunction(() => /Ejercicio 4 de 20/.test(document.getElementById("tanda-estado").textContent), null, { timeout: 5000 });
  igual("«No sé» pasa al siguiente sin sumar", await page.textContent("#tanda-estado"), "Ejercicio 4 de 20 · llevas 1 bien");
  igual("lo hecho queda guardado (al recargar sigue donde iba)", await page.evaluate(() => JSON.parse(localStorage.getItem(tandaMia.clave)).resultados), [true, false, false]);

  // Se acaba el tiempo (el profe lo terminó: la base acorta el plazo).
  await page.evaluate((t) => pintarTanda(Object.assign({}, t, { segundos: 0 })), tanda);
  await page.waitForFunction(() => document.getElementById("tanda-final").checkVisibility(), null, { timeout: 5000 });
  igual("al acabarse el tiempo ve su nota (lo no hecho cuenta como no resuelto)",
    [await page.textContent("#tanda-final-titulo"), await page.textContent("#tanda-nota"), await page.textContent("#tanda-detalle")],
    ["⏱️ Se acabó el tiempo.", "Tu nota: 5", "1 de 20 ejercicios resueltos (17 sin llegar a hacer)."]);
  igual("el tablero ya no se ve, y el reloj no se queda corriendo", [await seVe(page, "#tanda-tablero"), await page.textContent("#tanda-reloj")], [false, "⏱️ Se acabó el tiempo"]);
  igual("y anuncia que terminó", await page.evaluate(() => window.__tracks.slice(-1)[0].tanda.fin), true);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaQuienLlegaTarde(browser) {
  console.log("\n=== Quien entra cuando ya terminó no recibe un 0 ===");
  const tanda = { at: new Date(Date.now() - 20 * 60000).toISOString(), semilla: "abcd1234", elo: 1200, cantidad: 20, segundos: 600, alumnos: [] };
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, { game_state: [fila({ tanda_calentamiento: tanda })] });
  await page.waitForFunction(() => document.getElementById("tanda-final").checkVisibility(), null, { timeout: 20000 });
  igual("dice que ya terminó, sin nota", [await page.textContent("#tanda-final-titulo"), await seVe(page, "#tanda-nota")], ["⏱️ Este calentamiento ya terminó.", false]);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaDelProfe(browser) {
  console.log("\n=== El profe lo manda, ve cuántos lleva cada uno y lo termina ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila()] });
  await page.evaluate(() => {
    window.__ponerPresencia("u-beto", { email: "beto@x.cr", full_name: "Beto Mora", role: "alumno" });
    window.__ponerPresencia("u-ana", { email: "ana@x.cr", full_name: "Ana Rojas", role: "alumno" });
    activateTeacherTab("preguntar");
  });
  await page.click("#tanda-config summary");
  igual("el nivel y el tiempo se eligen", [await seVe(page, "#tanda-nivel"), await seVe(page, "#tanda-minutos")], [true, true]);
  await page.selectOption("#tanda-nivel", "1400");
  await page.selectOption("#tanda-minutos", "5");
  await page.click("#tanda-mandar-btn");
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state" && u.campos.tanda_calentamiento), null, { timeout: 20000 });
  const t = (await cambiosDeGameState(page)).find((x) => x.tanda_calentamiento).tanda_calentamiento;
  igual("manda la receta: nivel, cantidad, tiempo y los conectados en orden", [t.elo, t.cantidad, t.segundos, t.alumnos, typeof t.semilla], [1400, 20, 300, ["u-ana", "u-beto"], "string"]);
  await page.waitForFunction(() => document.getElementById("tanda-caja").checkVisibility(), null, { timeout: 5000 });
  igual("el profe ve la caja, no el tablero del alumno", [await seVe(page, "#tanda-profe"), await seVe(page, "#tanda-tablero")], [true, false]);

  await page.evaluate((at) => {
    window.__ponerPresencia("u-ana", { email: "ana@x.cr", full_name: "Ana Rojas", role: "alumno", tanda: { at, hechos: 5, buenas: 3, i: 5, fin: false } });
  }, t.at);
  igual("cuántos lleva cada uno", await page.evaluate(() => [...document.querySelectorAll("#tanda-lista li")].map((li) => li.textContent)),
    ["Ana Rojas5 de 20 hechos · 3 bienVer su ejercicio", "Beto Mora0 de 20 hechos · 0 bienVer su ejercicio"]);
  igual("la cuenta de arriba", await page.textContent("#tanda-cuenta"), "0 de 2 ya terminaron · 2 conectados.");

  await page.click("#tanda-lista li:first-child button");
  await page.waitForFunction(() => document.getElementById("tanda-mirando").checkVisibility(), null, { timeout: 5000 });
  const suyo = await page.evaluate((tt) => TandaCalentamiento.paraAlumno(tandaBanco, tt, "u-ana")[5], t);
  igual("mira el ejercicio en que está Ana (el 6.º de SU tanda)", [await page.evaluate(() => tandaProfeBoard.fen().split(" ")[0]),
    (await page.textContent("#tanda-mirando-titulo")).startsWith("Ana Rojas: ejercicio 6 de 20")], [suyo.fen.split(" ")[0], true]);
  igual("el botón dice que está abierto", await page.getAttribute("#tanda-lista li:first-child button", "aria-pressed"), "true");

  await page.evaluate(() => window.__presencia("u-ana", null));
  igual("quien se desconecta no se pierde", await page.evaluate(() => [...document.querySelectorAll("#tanda-lista li")][0].textContent.startsWith("Ana Rojas (se desconectó)5 de 20")), true);

  await page.click("#tanda-terminar-btn");
  await page.waitForFunction(() => window.__updates.filter((u) => u.tabla === "game_state" && u.campos.tanda_calentamiento).length === 2, null, { timeout: 5000 });
  const fin = (await cambiosDeGameState(page)).filter((x) => x.tanda_calentamiento).slice(-1)[0].tanda_calentamiento;
  igual("«Terminar ya» acorta el plazo a lo que pasó, con la misma semilla", [fin.semilla === t.semilla, fin.segundos < 30], [true, true]);
  await page.waitForFunction(() => /notas/.test(document.getElementById("tanda-cuenta").textContent), null, { timeout: 5000 });
  igual("y quedan las notas, de mayor a menor", await page.evaluate(() => [...document.querySelectorAll("#tanda-lista li")].map((li) => li.textContent)),
    ["Ana Rojas (se desconectó)Nota 15 · 3 de 20 bien", "Beto MoraNota 0 · 0 de 20 bien"]);
  igual("ya no ofrece terminar", await seVe(page, "#tanda-terminar-btn"), false);

  await page.click("#tanda-quitar-btn");
  await page.waitForFunction(() => window.__updates.filter((u) => u.tabla === "game_state").slice(-1)[0].campos.tanda_calentamiento === null, null, { timeout: 5000 });
  igual("«Quitar» lo quita", await seVe(page, "#tanda-caja"), false);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

(async () => {
  laParteQueNoTocaLaPagina();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaDelAlumno(browser);
    await pruebaQuienLlegaTarde(browser);
    await pruebaDelProfe(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: cada alumno resuelve sus 20, del mismo nivel, y ve su nota.");
  process.exit(fallos ? 1 : 0);
})();
