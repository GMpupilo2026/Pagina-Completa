#!/usr/bin/env node
/* Que un alumno al que se le cortó la conexión vea lo que pasó mientras tanto.

   Realtime vuelve a suscribir solo un canal que se cayó (el celular se
   bloqueó, el wifi parpadeó), pero los cambios de ese rato NO se reenvían: el
   alumno se quedaba con la posición vieja hasta la jugada siguiente del
   profe, y con la pregunta de antes. No da ningún error. Con 30 alumnos, a
   alguno le pasa en cada clase.

   Se comprueba, contra el doble de verificar-clase-registrada.js (que guarda
   lo que la página hace al quedar suscrita, en window.__suscritos):

   - que al volver a suscribirse el alumno relea el tablero y vea la jugada
     que se perdió, en las casillas;
   - que relea la pregunta en curso;
   - que el profe NO relea su tablero: manda él, y releer en medio de una
     jugada que todavía viaja se la desharía un instante;
   - que la primera suscripción no pida nada de más (ya tiene su carga).

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-reconexion.js
*/
const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");

const { abrir, CHROME } = R;
const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };
function fila(extra) {
  return Object.assign({
    id: 7, owner_id: "u-profe", fen: null, moves: ["e4", "e5"], start_fen: null, last_move: "e5",
    arrows: [], circles: [], active_player_id: null, active_player_color: "both",
    shown_curso: null, shown_leccion: null, vista: null, updated_by: "u-profe",
    updated_at: new Date().toISOString(),
  }, extra || {});
}

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

const casilla = (page, sq) => page.getAttribute('#chessboard [data-square="' + sq + '"]', "aria-label");
const vuelveLaConexion = (page, canal) => page.evaluate((c) => window.__suscritos[c]("SUBSCRIBED"), canal);

async function pruebaAlumna(browser) {
  console.log("\n=== La alumna pierde la conexión y vuelve ===");
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, { game_state: [fila()] });
  await page.waitForFunction(() => board && board.moves().length === 2, null, { timeout: 15000 });
  igual("los canales del tablero y de la pregunta avisan al quedar suscritos", await page.evaluate(() =>
    ["game_state-changes:u-profe", "questions-changes:u-profe"].map((c) => typeof (window.__suscritos || {})[c])), ["function", "function"]);
  igual("antes del corte, f3 está vacía", (await casilla(page, "f3")).includes("caballo"), false);

  // Mientras está desconectada, el profe juega Nf3 y lanza una pregunta: no le llega ningún aviso.
  await page.evaluate(() => {
    const g = window.__tablas.game_state[0];
    g.moves = ["e4", "e5", "Nf3"]; g.last_move = "Nf3";
    window.__tablas.questions.push({ id: "q-perdida", created_by: "u-profe", prompt: "¿Qué juegan las negras?",
      fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2", expected_plies: 1, tipo: "jugada", opciones: null,
      tiempo_limite: null, resultados_visibles: false, created_at: new Date().toISOString(), closed_at: null, class_session_id: "c-viva" });
  });
  await page.waitForTimeout(300);
  igual("sin aviso, sigue viendo lo de antes (el corte de verdad)", await page.evaluate(() => board.moves().length), 2);

  await vuelveLaConexion(page, "game_state-changes:u-profe");
  await page.waitForFunction(() => board.moves().length === 3, null, { timeout: 5000 }).catch(() => {});
  igual("al volver relee el tablero y ve la jugada que se perdió", await page.evaluate(() => board.moves()), ["e4", "e5", "Nf3"]);
  igual("en las casillas, no solo en la lista", (await casilla(page, "f3")).includes("caballo"), true);

  await vuelveLaConexion(page, "questions-changes:u-profe");
  await page.waitForFunction(() => currentQuestion && currentQuestion.id === "q-perdida", null, { timeout: 5000 }).catch(() => {});
  igual("y relee la pregunta en curso", await page.evaluate(() => currentQuestion && currentQuestion.id), "q-perdida");
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaProfe(browser) {
  console.log("\n=== El profe no relee su propio tablero ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila()] });
  await page.waitForFunction(() => board && board.moves().length === 2, null, { timeout: 15000 });
  await page.evaluate(() => { window.__tablas.game_state[0].moves = ["d4"]; });
  await vuelveLaConexion(page, "game_state-changes:u-profe");
  await page.waitForTimeout(600);
  igual("su tablero queda como lo tiene él", await page.evaluate(() => board.moves()), ["e4", "e5"]);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaAlumna(browser);
    await pruebaProfe(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)." : "\nTodo bien: quien se reconecta ve lo que pasó mientras tanto.");
  process.exit(fallos ? 1 : 0);
})();
