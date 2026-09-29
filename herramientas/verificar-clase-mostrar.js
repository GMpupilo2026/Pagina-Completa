#!/usr/bin/env node
/* Mostrar la respuesta de un alumno a toda la clase.

   En «Respuestas en el tablero», cada respuesta mandada trae «📺 Mostrar a la
   clase». La respuesta va al tablero de todos como una VARIANTE que mira el
   profe (game_state.vista): la partida no se toca y al volver al final todos
   la ven de nuevo. La vista lleva además de quién es ({nombre} o null): sin
   el nombre salvo que el profe marque «decir de quién es». Que solo el profe
   cambie la vista ya lo pone la base (protect_game_state_teacher_columns).

   Se comprueba:
   - que la vista nazca en la jugada de la partida donde está la posición de
     la pregunta (al principio o más adelante), con las jugadas del alumno;
   - que sin la casilla vaya sin nombre y con ella, con el nombre;
   - que si la posición ya no está en el tablero lo pregunte antes de
     reemplazar la partida;
   - que el alumno lea «Así lo resolvió …» con o sin nombre, de verdad en
     pantalla.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-mostrar.js
*/
const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");

const { abrir, CHROME } = R;
const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };
const INICIO = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const TRAS_E4_E5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
const seVe = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!(el && el.checkVisibility()); }, sel);
const fila = (moves, vista) => ({ id: 7, owner_id: "u-profe", fen: null, moves, start_fen: null, arrows: [], circles: [],
  active_player_color: "both", vista: vista || null, comentarios: {}, elegido: null, pensar: null });
const pregunta = (fen) => ({ id: "q1", fen, prompt: "¿Qué jugarías?", created_by: "u-profe", created_at: new Date().toISOString(),
  closed_at: null, expected_plies: 2, tipo: "jugada", opciones: null, tiempo_limite: null, para_alumno: null, class_session_id: "c-viva" });
const vistas = (page) => page.evaluate(() =>
  window.__updates.filter((u) => u.tabla === "game_state" && "vista" in u.campos).map((u) => u.campos.vista));
const boton = '#question-boards-grid > div[data-alumno="u-ana"] .respuesta-mini-mostrar';

async function abrirProfe(browser, moves, fen, respuesta) {
  const r = await abrir(browser, "u-profe", CLASE, {
    game_state: [fila(moves)], questions: [pregunta(fen)],
    question_answers: [{ id: "a1", question_id: "q1", student_id: "u-ana", moves: respuesta, is_correct: null }],
  });
  await r.page.evaluate(() => window.__entraAlumno());
  await r.page.waitForFunction((s) => { const b = document.querySelector(s); return b && b.checkVisibility(); }, boton, { timeout: 10000 });
  return r;
}

async function pruebaDesdeElPrincipio(browser) {
  console.log("\n=== Mostrar una respuesta, sin el nombre ===");
  const { page, ctx, errores } = await abrirProfe(browser, [], INICIO, ["e4", "e5", "Nf3"]);
  igual("el botón sale con la respuesta mandada", await seVe(page, boton), true);
  igual("sin nombre, de fábrica", await page.isChecked("#mostrar-con-nombre"), false);
  await page.click(boton);
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state" && u.campos.vista), null, { timeout: 5000 });
  igual("va como variante desde la posición de la pregunta, sin nombre", (await vistas(page)).pop(),
    { path: ["e4", "e5", "Nf3"], parent: null, root: 0, respuesta: { nombre: null } });
  igual("la partida no se tocó", await page.evaluate(() =>
    window.__updates.filter((u) => u.tabla === "game_state" && "moves" in u.campos).length), 0);
  igual("el profe la ve en su tablero", await page.evaluate(() => board.currentView() && board.currentView().path), ["e4", "e5", "Nf3"]);

  await page.check("#mostrar-con-nombre");
  await page.evaluate(() => board.viewLive());
  await page.click(boton);
  await page.waitForFunction(() => window.__updates.filter((u) => u.tabla === "game_state" && u.campos.vista).length === 2, null, { timeout: 5000 });
  igual("con la casilla, dice de quién es", (await vistas(page)).pop().respuesta, { nombre: "Ana Rojas" });
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaMasAdelante(browser) {
  console.log("\n=== La pregunta se hizo a mitad de la partida ===");
  const { page, ctx, errores } = await abrirProfe(browser, ["e4", "e5"], TRAS_E4_E5, ["Nf3", "Nc6"]);
  await page.click(boton);
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state" && u.campos.vista), null, { timeout: 5000 });
  igual("nace en la jugada 2, después de la partida", (await vistas(page)).pop(),
    { path: ["e4", "e5", "Nf3", "Nc6"], parent: null, root: 2, respuesta: { nombre: null } });
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaYaNoEsta(browser) {
  console.log("\n=== La posición ya no está en el tablero: pregunta antes ===");
  const { page, ctx, errores } = await abrirProfe(browser, ["d4"], TRAS_E4_E5, ["Nf3"]);
  await page.click(boton);
  const aceptar = page.getByRole("button", { name: "Mandar la posición y mostrarla" });
  await aceptar.waitFor({ timeout: 5000 });
  igual("antes de reemplazar nada, no mandó", await page.evaluate(() => window.__updates.filter((u) => u.tabla === "game_state").length), 0);
  await page.click("[data-avisos-cancelar]");
  await page.waitForTimeout(400);
  igual("si cancela, la partida se queda como estaba", await page.evaluate(() => window.__updates.filter((u) => u.tabla === "game_state").length), 0);
  await page.click(boton);
  await aceptar.waitFor({ timeout: 5000 });
  await aceptar.click();
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state" && u.campos.vista && u.campos.vista.respuesta), null, { timeout: 5000 });
  igual("manda la posición de la pregunta", await page.evaluate(() =>
    window.__updates.filter((u) => u.tabla === "game_state" && "start_fen" in u.campos).map((u) => u.campos.start_fen)), [TRAS_E4_E5]);
  igual("y la respuesta desde ahí", (await vistas(page)).pop(), { path: ["Nf3"], parent: null, root: 0, respuesta: { nombre: null } });
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaAlumna(browser) {
  console.log("\n=== Lo que lee la clase ===");
  const vista = (nombre) => ({ path: ["e4", "e5", "Nf3"], parent: null, root: 0, respuesta: { nombre } });
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, { game_state: [fila([], vista("Beto Mora"))] });
  await page.waitForFunction(() => /Así lo resolvió/.test(document.getElementById("vista-profe").textContent), null, { timeout: 10000 });
  igual("se ve", await seVe(page, "#vista-profe"), true);
  igual("con el nombre", await page.textContent("#vista-profe"),
    "📺 Así lo resolvió Beto Mora: 1. e4 e5 2. Nf3. La partida sigue guardada: cuando vuelva al final, la verás de nuevo.");
  igual("y su tablero la muestra", await page.evaluate(() => board.currentView().path), ["e4", "e5", "Nf3"]);
  await page.evaluate((f) => window.__cambioEnBase("game_state", f), fila([], vista(null)));
  igual("sin el nombre, «un compañero»", await page.textContent("#vista-profe"),
    "📺 Así lo resolvió un compañero: 1. e4 e5 2. Nf3. La partida sigue guardada: cuando vuelva al final, la verás de nuevo.");
  await page.evaluate((f) => window.__cambioEnBase("game_state", f), fila([], null));
  igual("cuando el profe vuelve, se va", await seVe(page, "#vista-profe"), false);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaDesdeElPrincipio(browser);
    await pruebaMasAdelante(browser);
    await pruebaYaNoEsta(browser);
    await pruebaAlumna(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: el profe le muestra a la clase la respuesta de un alumno, con o sin su nombre.");
  process.exit(fallos ? 1 : 0);
})();
