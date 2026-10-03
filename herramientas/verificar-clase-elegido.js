#!/usr/bin/env node
/* El alumno elegido al azar para responder.

   El profe aprieta «🎲 Elegir a un alumno al azar» en la pestaña Alumnos: sale
   uno de los conectados, sin repetir hasta que les toque a todos, y queda en
   game_state.elegido ({id, at}). Al elegido le sale en grande en su pantalla;
   el profe ve a quién eligió y le puede dar una insignia o trofeos ahí mismo.

   Que solo el profe pueda elegir lo pone la base (protect_game_state_teacher_
   columns), comprobado impersonando: la alumna con el control no se puede
   elegir sola, y una forma que no es {id, at} la rechaza el CHECK.

   Se comprueba:
   - la elección sin repetir (js/partidas-clase.js), sin navegador;
   - que el profe mande {id, at} de un conectado, que vea su nombre, que
     «Elegir a otro» no repita mientras quede alguien, que «Ya respondió» lo
     deje en null y que el botón de insignias abra el panel de ESE alumno;
   - que a la elegida le salga el aviso grande (y se vea de verdad), con el
     foco en su botón, que al cerrarlo quede la franja «Te toca responder», que
     recargar no se lo vuelva a poner encima, y que los demás vean a quién
     eligieron (escrito, sin el aviso grande).

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-elegido.js
*/
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");

const { abrir, CHROME } = R;
const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
const seVe = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!(el && el.checkVisibility()); }, sel);
const fila = (elegido) => ({ id: 7, owner_id: "u-profe", fen: null, moves: [], start_fen: null, arrows: [], circles: [],
  active_player_color: "both", vista: null, comentarios: {}, elegido });

function pruebaSinRepetir() {
  console.log("\n=== Elegir entre los que llevan menos ===");
  const w = {};
  new Function("window", fs.readFileSync(path.join(__dirname, "..", "js", "partidas-clase.js"), "utf8"))(w);
  const P = w.PartidasClase;
  const cuentas = new Map();
  const vuelta = [1, 2, 3].map(() => { const id = P.elegirConMenos(["a", "b", "c"], cuentas); cuentas.set(id, (cuentas.get(id) || 0) + 1); return id; });
  igual("en una vuelta sale cada uno una vez", vuelta.slice().sort(), ["a", "b", "c"]);
  igual("quien lleva menos sale primero", P.elegirConMenos(["a", "b", "c"], new Map([["a", 2], ["b", 1], ["c", 2]])), "b");
  igual("quien se conecta tarde (con cero) entra primero", P.elegirConMenos(["a", "d"], new Map([["a", 1]])), "d");
  igual("sin nadie conectado, nadie", P.elegirConMenos([], new Map()), null);
}

async function pruebaProfesor(browser) {
  console.log("\n=== El profe elige ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila(null)] });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForSelector("#elegir-azar-btn", { state: "attached", timeout: 10000 });
  await page.evaluate(() => activateTeacherTab("alumnos"));
  await page.click("#elegir-azar-btn");
  igual("sin conectados lo dice", /No hay alumnos conectados/.test(await page.textContent("#status-banner")), true);

  await page.evaluate(() => { window.__entraAlumno(); window.__entraOtroAlumno(); });
  await page.click("#elegir-azar-btn");
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state" && u.campos.elegido), null, { timeout: 5000 });
  const primero = await page.evaluate(() => window.__updates.filter((u) => u.tabla === "game_state" && u.campos.elegido).pop().campos.elegido);
  igual("manda {id, at} de un conectado", [["u-ana", "u-beto"].includes(primero.id), typeof primero.at], [true, "string"]);
  const nombres = { "u-ana": "Ana Rojas", "u-beto": "Beto Mora" };
  igual("y su nombre, para que lo vean los demás", primero.nombre, nombres[primero.id]);
  igual("el profe ve a quién eligió", await page.textContent("#elegido-nombre"), nombres[primero.id]);
  igual("y se ve", await seVe(page, "#elegido-caja"), true);

  await page.click("#elegido-otro-btn");
  await page.waitForFunction((n) => window.__updates.filter((u) => u.tabla === "game_state" && u.campos.elegido).length === n, 2, { timeout: 5000 });
  const segundo = await page.evaluate(() => window.__updates.filter((u) => u.tabla === "game_state" && u.campos.elegido).pop().campos.elegido);
  igual("«Elegir a otro» no repite mientras quede alguien", segundo.id !== primero.id, true);

  igual("cada elección queda en la historia de ESTA clase", await page.evaluate(() =>
    window.__inserts.filter((i) => i.tabla === "clase_elegidos").map((i) => i.fila.class_session_id)), ["c-viva", "c-viva"]);
  igual("y el profe ve cuántas veces le tocó a cada uno", await page.evaluate(() =>
    [...document.querySelectorAll("#elegidos-cuenta li")].map((li) => li.textContent).sort()), ["Ana Rojas1 vez", "Beto Mora1 vez"]);
  // Cerrada de entrada (con 20 alumnos repetía la lista entera): a un clic.
  igual("la cuenta está a un clic, cerrada para no estirar el panel", [await seVe(page, "#elegidos-cuenta-caja summary"), await seVe(page, "#elegidos-cuenta")], [true, false]);
  await page.click("#elegidos-cuenta-caja summary");
  igual("al abrirla, la cuenta se ve", await seVe(page, "#elegidos-cuenta"), true);

  await page.click("#elegido-insignia-btn");
  igual("las insignias se abren para ESE alumno", await page.textContent("#trofeos-en-clase-titulo"),
    "🏆 Trofeos e insignias de " + nombres[segundo.id]);
  igual("y se ven", await seVe(page, "#trofeos-en-clase"), true);

  await page.click("#elegido-listo-btn");
  await page.waitForTimeout(150);
  igual("«Ya respondió» lo deja en null", await page.evaluate(() => {
    const u = window.__updates.filter((x) => x.tabla === "game_state" && "elegido" in x.campos);
    return u[u.length - 1].campos.elegido;
  }), null);
  igual("y se va de su pantalla", await seVe(page, "#elegido-caja"), false);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

/* Al recargar, la cuenta vuelve de la base (no de la memoria de la página)
   y el sorteo la usa: con Ana en 2 y Beto en 0, sale Beto. */
async function pruebaTurnosGuardados(browser) {
  console.log("\n=== La cuenta sobrevive a recargar y guía el sorteo ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, {
    game_state: [fila(null)],
    clase_elegidos: [
      { id: "e1", class_session_id: "c-viva", student_id: "u-ana" },
      { id: "e2", class_session_id: "c-viva", student_id: "u-ana" },
      { id: "e0", class_session_id: "c-vieja", student_id: "u-beto" },
    ],
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForSelector("#elegir-azar-btn", { state: "attached", timeout: 10000 });
  await page.evaluate(() => { activateTeacherTab("alumnos"); window.__entraAlumno(); window.__entraOtroAlumno(); });
  await page.waitForFunction(() => document.querySelectorAll("#elegidos-cuenta li").length === 2, null, { timeout: 5000 });
  igual("la cuenta es la de ESTA clase, primero el que menos lleva", await page.evaluate(() =>
    [...document.querySelectorAll("#elegidos-cuenta li")].map((li) => li.textContent)), ["Beto Moratodavía no", "Ana Rojas2 veces"]);
  await page.click("#elegir-azar-btn");
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state" && u.campos.elegido), null, { timeout: 5000 });
  igual("el sorteo elige al que lleva menos", await page.evaluate(() =>
    window.__updates.filter((u) => u.tabla === "game_state" && u.campos.elegido).pop().campos.elegido.id), "u-beto");
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaAlumna(browser) {
  console.log("\n=== A la elegida le sale en grande ===");
  const elegido = { id: "u-ana", at: new Date().toISOString() };
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, { game_state: [fila(elegido)] });
  await page.waitForFunction(() => !document.getElementById("elegido-overlay").classList.contains("hidden"), null, { timeout: 10000 });
  igual("el aviso se ve de verdad", await seVe(page, "#elegido-overlay"), true);
  igual("y dice qué pasa, en grande", await page.textContent("#elegido-overlay-titulo"), "¡Te eligieron para responder!");
  igual("con letra grande", await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById("elegido-overlay-titulo")).fontSize) >= 30), true);
  await page.waitForTimeout(300);
  igual("el foco va a su botón", await page.evaluate(() => document.activeElement && document.activeElement.id), "elegido-overlay-ok");
  await page.click("#elegido-overlay-ok");
  igual("al cerrarlo, se va", await seVe(page, "#elegido-overlay"), false);
  igual("y queda la franja de que le toca", await seVe(page, "#elegido-chip"), true);
  await page.reload();
  await page.waitForSelector("#chessboard [data-square]", { timeout: 10000 });
  await page.waitForTimeout(400);
  igual("al recargar no se le vuelve a poner encima", await seVe(page, "#elegido-overlay"), false);
  igual("pero sigue la franja", await seVe(page, "#elegido-chip"), true);
  await page.evaluate((f) => window.__cambioEnBase("game_state", f), fila(null));
  igual("cuando el profe termina, se va la franja", await seVe(page, "#elegido-chip"), false);
  igual("la alumna nunca escribió elegido", await page.evaluate(() =>
    window.__updates.some((x) => x.tabla === "game_state" && "elegido" in x.campos)), false);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaOtroAlumno(browser) {
  console.log("\n=== Los demás ven a quién eligieron ===");
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, { game_state: [fila({ id: "u-beto", at: new Date().toISOString(), nombre: "Beto Mora" })] });
  await page.waitForSelector("#chessboard [data-square]", { timeout: 10000 });
  await page.waitForTimeout(400);
  igual("no le sale el aviso grande", await seVe(page, "#elegido-overlay"), false);
  igual("ni la franja de «te toca»", await seVe(page, "#elegido-chip"), false);
  igual("pero ve a quién eligieron", await seVe(page, "#elegido-otro"), true);
  igual("con su nombre", await page.textContent("#elegido-otro"), "🎯 Tu profe eligió a Beto Mora para responder.");
  await page.evaluate((f) => window.__cambioEnBase("game_state", f), fila(null));
  igual("cuando ya respondió, se va", await seVe(page, "#elegido-otro"), false);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

(async () => {
  try { pruebaSinRepetir(); } catch (e) { console.log("  ✗ se cayó: " + (e && e.stack || e)); fallos += 1; }
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaProfesor(browser);
    await pruebaTurnosGuardados(browser);
    await pruebaAlumna(browser);
    await pruebaOtroAlumno(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: el profe elige al azar y a la elegida le sale en grande.");
  process.exit(fallos ? 1 : 0);
})();
