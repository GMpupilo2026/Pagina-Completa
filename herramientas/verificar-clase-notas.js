#!/usr/bin/env node
/* Notas rápidas en la clase en vivo: la bitácora desde donde el profe mira.

   Cada tablero de «Respuestas en el tablero», cada tablero de Practicar y la
   caja de quien tiene el turno traen «📝 Anotar en su bitácora»: abre la
   bitácora de ESE alumno (la de siempre, js/notas-alumno.js) con la posición
   de su tablero marcada. Desde la lista de alumnos se ofrece la del tablero
   de la clase, sin marcar. Toda nota escrita en clase queda ligada a ella
   (notas_alumno.class_session_id); que la clase sea del profe que firma lo
   revisa la base (trigger notas_alumno_clase_propia, comprobado impersonando:
   colgarla de la clase de otro se rechaza, y una posición rara también).

   Se comprueba:
   - que desde la respuesta de un alumno se abra SU bitácora, con la posición
     de su respuesta marcada, y que la nota lleve la clase y esa posición;
   - que los comienzos rápidos pongan el texto y no se dupliquen;
   - que desde la lista de alumnos la posición quede sin marcar y no viaje;
   - que la nota guardada muestre «En clase» y dibuje su posición (64
     casillas, de verdad en pantalla);
   - que el botón de la caja del elegido abra la bitácora de quien tiene el
     turno.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-notas.js
*/
const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");

const { abrir, CHROME } = R;
const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };
const INICIO = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const TRAS_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
const seVe = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!(el && el.checkVisibility()); }, sel);
const fila = (elegido) => ({ id: 7, owner_id: "u-profe", fen: null, moves: [], start_fen: null, arrows: [], circles: [],
  active_player_color: "both", vista: null, comentarios: {}, elegido: elegido || null, pensar: null });
const notas = (page) => page.evaluate(() => window.__inserts.filter((i) => i.tabla === "notas_alumno").map((i) => i.fila));

async function pruebaDesdeLaRespuesta(browser) {
  console.log("\n=== Anotar desde la respuesta de un alumno ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, {
    game_state: [fila()],
    questions: [{ id: "q1", fen: INICIO, prompt: "¿Qué jugarías?", created_by: "u-profe", created_at: new Date().toISOString(),
      closed_at: null, expected_plies: 1, tipo: "jugada", class_session_id: "c-viva" }],
    question_answers: [{ id: "a1", question_id: "q1", student_id: "u-ana", moves: ["e4"], is_correct: null }],
  });
  await page.evaluate(() => window.__entraAlumno());
  const boton = '#question-boards-grid > div[data-alumno="u-ana"] .respuesta-mini-anotar';
  await page.waitForFunction((s) => { const b = document.querySelector(s); return b && b.checkVisibility(); }, boton, { timeout: 10000 });
  await page.click(boton);
  igual("abre la bitácora de ESE alumno", await page.textContent("#notas-en-clase-titulo"), "📝 Bitácora de Ana Rojas");
  igual("y se ve", await seVe(page, "#notas-en-clase"), true);
  igual("con la posición de su respuesta, marcada", await page.evaluate(() => {
    const c = document.getElementById("nota-posicion-u-ana");
    return [c.checked, c.parentElement.textContent];
  }), [true, "Con la posición de su respuesta"]);
  igual("el cursor queda para escribir", await page.evaluate(() => document.activeElement && document.activeElement.id), "nota-texto-u-ana");

  const rapida = (t) => page.locator("#notas-en-clase-body").getByRole("button", { name: t, exact: true }).click();
  await rapida("Lo hizo muy bien");
  await rapida("Le costó");
  igual("el comienzo rápido pone el texto sin duplicarse", await page.inputValue("#nota-texto-u-ana"), "Le costó: ");
  await page.type("#nota-texto-u-ana", "no vio la clavada");
  await page.click('#notas-en-clase-body button[type="submit"]');
  await page.waitForFunction(() => window.__inserts.some((i) => i.tabla === "notas_alumno"), null, { timeout: 5000 });
  const n = (await notas(page))[0];
  igual("la nota lleva la clase y la posición de su respuesta", [n.texto, n.class_session_id, n.fen, n.alumno_id],
    ["Le costó: no vio la clavada", "c-viva", TRAS_E4, "u-ana"]);
  await page.waitForSelector("#notas-en-clase-body .nota-posicion", { timeout: 5000 });
  igual("guardada, dice que fue en clase", /🏫 En clase/.test(await page.textContent("#notas-en-clase-body ul")), true);
  igual("y dibuja su posición", await page.evaluate(() => {
    const d = document.querySelector("#notas-en-clase-body .nota-posicion");
    return [d.children.length, d.checkVisibility(), d.querySelectorAll(".piece-white, .piece-black").length];
  }), [64, true, 32]);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaDesdeLaLista(browser) {
  console.log("\n=== Desde la lista de alumnos: la posición, sin marcar ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila()] });
  await page.evaluate(() => { activateTeacherTab("alumnos"); window.__entraAlumno(); });
  await page.waitForSelector("#students-list li", { timeout: 10000 });
  await page.locator("#students-list li").first().getByRole("button", { name: "Bitácora de Ana Rojas" }).click();
  igual("se ofrece la del tablero de la clase, sin marcar", await page.evaluate(() => {
    const c = document.getElementById("nota-posicion-u-ana");
    return [c.checked, c.parentElement.textContent];
  }), [false, "Con la posición del tablero de la clase"]);
  await page.fill("#nota-texto-u-ana", "Llegó tarde");
  await page.click('#notas-en-clase-body button[type="submit"]');
  await page.waitForFunction(() => window.__inserts.some((i) => i.tabla === "notas_alumno"), null, { timeout: 5000 });
  const n = (await notas(page))[0];
  igual("va con la clase y sin posición", [n.class_session_id, "fen" in n], ["c-viva", false]);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaDesdeElElegido(browser) {
  console.log("\n=== Desde la caja de quien tiene el turno ===");
  const elegido = { id: "u-ana", at: new Date().toISOString(), nombre: "Ana Rojas", motivo: "azar" };
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila(elegido)] });
  await page.evaluate(() => { activateTeacherTab("alumnos"); window.__entraAlumno(); });
  await page.waitForFunction(() => { const b = document.getElementById("elegido-anotar-btn"); return b && b.checkVisibility(); }, null, { timeout: 10000 });
  await page.click("#elegido-anotar-btn");
  igual("abre la bitácora de quien tiene el turno", await page.textContent("#notas-en-clase-titulo"), "📝 Bitácora de Ana Rojas");
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaDesdeLaRespuesta(browser);
    await pruebaDesdeLaLista(browser);
    await pruebaDesdeElElegido(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: las notas rápidas de la clase llevan la clase y la posición.");
  process.exit(fallos ? 1 : 0);
})();
