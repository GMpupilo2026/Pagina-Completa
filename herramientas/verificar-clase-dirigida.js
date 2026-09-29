#!/usr/bin/env node
/* La pregunta dirigida y las respuestas en el tablero.

   Con alguien con el turno (game_state.elegido), el profe aprieta «❓
   Preguntarle con el tablero»: sale una pregunta de «¿qué jugarías?» con
   questions.para_alumno. Solo esa persona la contesta (lo rechaza la base:
   respuesta_calificar_y_plazo, comprobado impersonando); los demás ven para
   quién es y no se les abre nada encima.

   Mientras cada alumno piensa, lo que lleva jugado va a respuestas_en_curso
   (no a question_answers: los informes cuentan esas filas) y el profe lo ve en
   un tablero por alumno debajo del suyo, como en Practicar. Cuando lo manda,
   el tablero dice que respondió y deja calificarlo ahí mismo.

   Se comprueba:
   - que el botón mande para_alumno del que tiene el turno;
   - que el profe vea SOLO el tablero de esa persona (aunque haya otro
     conectado), escuchando respuestas_en_curso filtrado por la pregunta;
   - que la jugada en curso aparezca en su tablero, y que al responder diga
     «Respondió» y se pueda calificar desde ahí;
   - que con una pregunta para todos haya un tablero por conectado;
   - que la alumna de la pregunta vea «solo para ti» y que al mover mande la
     jugada en curso y después la respuesta;
   - que a otra alumna no se le abra la pregunta y lea para quién es.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-dirigida.js
*/
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
const fila = (elegido) => ({ id: 7, owner_id: "u-profe", fen: null, moves: [], start_fen: null, arrows: [], circles: [],
  active_player_color: "both", vista: null, comentarios: {}, elegido });
const pregunta = (extra) => Object.assign({ id: "q1", fen: INICIO, prompt: "¿Qué jugarías?", created_by: "u-profe",
  created_at: new Date().toISOString(), closed_at: null, expected_plies: 1, tipo: "jugada", opciones: null,
  tiempo_limite: null, resultados_visibles: false, para_alumno: null, class_session_id: "c-viva" }, extra);
const tableros = (page) => page.evaluate(() =>
  [...document.querySelectorAll("#question-boards-grid > div")].map((d) => d.querySelector(".respuesta-mini-nombre").textContent));
const estadoDe = (page, id) => page.evaluate((i) => {
  const d = document.querySelector('#question-boards-grid > div[data-alumno="' + i + '"]');
  return d ? d.querySelector(".respuesta-mini-estado").textContent : null;
}, id);

async function pruebaProfeDirigida(browser) {
  console.log("\n=== El profe le pregunta a quien tiene el turno ===");
  const elegido = { id: "u-ana", at: new Date().toISOString(), nombre: "Ana Rojas", motivo: "azar" };
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila(elegido)] });
  await page.waitForSelector("#elegido-preguntar-btn", { state: "attached", timeout: 10000 });
  await page.evaluate(() => { activateTeacherTab("alumnos"); window.__entraAlumno(); window.__entraOtroAlumno(); });
  igual("el botón se ve junto al elegido", await seVe(page, "#elegido-preguntar-btn"), true);
  await page.click("#elegido-preguntar-btn");
  await page.waitForFunction(() => window.__inserts.some((i) => i.tabla === "questions"), null, { timeout: 5000 });
  const q = await page.evaluate(() => window.__inserts.filter((i) => i.tabla === "questions").pop().fila);
  igual("la pregunta va para quien tiene el turno", q.para_alumno, "u-ana");
  igual("sobre la posición del tablero", q.fen, INICIO);

  // Realtime avisaría que hay pregunta nueva: acá se empuja a mano.
  await page.evaluate(() => {
    const q = window.__tablas.questions[0];
    q.closed_at = null; q.tipo = "jugada"; q.created_at = new Date().toISOString();
    window.__cambioEnBase("questions", q, "INSERT");
  });
  await page.waitForFunction(() => document.querySelectorAll("#question-boards-grid > div").length > 0, null, { timeout: 5000 });
  igual("los tableros se ven debajo del suyo", await seVe(page, "#question-boards-section"), true);
  igual("solo el de esa persona, aunque haya otro conectado", await tableros(page), ["Ana Rojas"]);
  igual("y lo dice", await page.textContent("#question-boards-hint"), "Pregunta solo para Ana Rojas.");
  const qid = await page.evaluate(() => window.__tablas.questions[0].id);
  igual("escucha las jugadas en curso de ESTA pregunta", await page.evaluate(() =>
    (window.__escuchas || []).filter((e) => e.tabla === "respuestas_en_curso").map((e) => e.filtro)), ["question_id=eq." + qid]);
  igual("todavía no movió", await estadoDe(page, "u-ana"), "Todavía no mueve.");

  await page.evaluate((id) => window.__cambioEnBase("respuestas_en_curso",
    { question_id: id, student_id: "u-ana", moves: ["e4"], fen: null }, "INSERT"), qid);
  igual("la jugada que piensa sale en su tablero", await estadoDe(page, "u-ana"), "Pensando… lleva 1 de 1 jugada: e4");
  igual("con la pieza movida", await page.evaluate(() => {
    const d = document.querySelector('#question-boards-grid > div[data-alumno="u-ana"]');
    const e4 = d.querySelector('[data-square="e4"]'), e2 = d.querySelector('[data-square="e2"]');
    return [!!(e4 && e4.querySelector("img, svg, span")), !!(e2 && e2.querySelector("img, svg, span"))];
  }), [true, false]);
  igual("sin botones de calificar mientras piensa", await seVe(page, '#question-boards-grid > div[data-alumno="u-ana"] [data-nota="bien"]'), false);

  await page.evaluate((id) => {
    const r = { id: "a1", question_id: id, student_id: "u-ana", moves: ["e4"], is_correct: null, profiles: { full_name: "Ana Rojas" } };
    window.__tablas.question_answers.push(r);
    window.__cambioEnBase("question_answers", r, "INSERT");
  }, qid);
  await page.waitForFunction(() => {
    const d = document.querySelector('#question-boards-grid > div[data-alumno="u-ana"] .respuesta-mini-estado');
    return d && /Respondió/.test(d.textContent);
  }, null, { timeout: 5000 });
  igual("cuando la manda, dice que respondió", await estadoDe(page, "u-ana"), "Respondió: e4 · sin calificar");
  await page.click('#question-boards-grid > div[data-alumno="u-ana"] [data-nota="bien"]');
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "question_answers"), null, { timeout: 5000 });
  igual("y se califica desde el tablero", await page.evaluate(() =>
    window.__updates.filter((u) => u.tabla === "question_answers").map((u) => [u.campos.is_correct, u.donde])), [[true, [["id", "a1"]]]]);
  igual("queda escrito", await estadoDe(page, "u-ana"), "Respondió: e4 · ✅ correcta");
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaProfeParaTodos(browser) {
  console.log("\n=== Una pregunta para todos: un tablero por conectado ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila(null)], questions: [pregunta({ expected_plies: 2 })] });
  await page.waitForSelector("#question-boards-grid", { state: "attached", timeout: 10000 });
  await page.evaluate(() => { window.__entraAlumno(); window.__entraOtroAlumno(); });
  await page.waitForFunction(() => document.querySelectorAll("#question-boards-grid > div").length === 2, null, { timeout: 5000 });
  igual("uno por cada conectado", (await tableros(page)).sort(), ["Ana Rojas", "Beto Mora"]);
  igual("y cuántos respondieron", await page.textContent("#question-boards-hint"), "Respondieron 0 de 2.");
  await page.evaluate(() => window.__cambioEnBase("respuestas_en_curso",
    { question_id: "q1", student_id: "u-beto", moves: ["d4", "d5"], fen: null }, "UPDATE"));
  igual("cuenta sus jugadas, no las del motor", await estadoDe(page, "u-beto"), "Pensando… lleva 1 de 2 jugadas: d4 d5");
  await page.evaluate(() => window.__cambioEnBase("respuestas_en_curso",
    { question_id: "otra", student_id: "u-ana", moves: ["c4"], fen: null }, "UPDATE"));
  igual("lo de otra pregunta no se cuela", await estadoDe(page, "u-ana"), "Todavía no mueve.");
  await page.evaluate(() => {
    const q = window.__tablas.questions[0];
    q.closed_at = new Date().toISOString();
    window.__cambioEnBase("questions", q, "UPDATE");
  });
  await page.waitForFunction(() => document.getElementById("question-boards-section").hidden, null, { timeout: 5000 });
  igual("al cerrar la pregunta se van", await seVe(page, "#question-boards-section"), false);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaAlumnaDeLaPregunta(browser) {
  console.log("\n=== A la alumna de la pregunta: solo para ella, y el profe ve lo que mueve ===");
  const elegido = { id: "u-ana", at: new Date().toISOString(), nombre: "Ana Rojas", motivo: "azar" };
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, {
    game_state: [fila(elegido)], questions: [pregunta({ para_alumno: "u-ana" })] });
  await page.waitForFunction(() => !document.getElementById("question-card").classList.contains("hidden"), null, { timeout: 10000 });
  igual("se le abre la pregunta", await seVe(page, "#question-card"), true);
  igual("y sabe que es solo para ella", await seVe(page, "#question-para-ti"), true);
  igual("sin la línea de los demás", await seVe(page, "#pregunta-para-otro"), false);
  // Primero le sale el aviso grande de que la eligieron; con «¡Voy!» queda la pregunta.
  await page.click("#elegido-overlay-ok");
  igual("detrás del aviso estaba su pregunta", await seVe(page, "#question-card"), true);
  await page.click('#question-board [data-square="e2"]');
  await page.click('#question-board [data-square="e4"]');
  await page.waitForFunction(() => window.__inserts.some((i) => i.tabla === "question_answers"), null, { timeout: 5000 });
  igual("lo que juega va a respuestas_en_curso", await page.evaluate(() =>
    window.__inserts.filter((i) => i.tabla === "respuestas_en_curso").map((i) => [i.fila.question_id, i.fila.student_id, i.fila.moves])),
  [["q1", "u-ana", ["e4"]]]);
  igual("y la respuesta, a question_answers", await page.evaluate(() =>
    window.__inserts.filter((i) => i.tabla === "question_answers").map((i) => i.fila.moves)), [["e4"]]);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaOtraAlumna(browser) {
  console.log("\n=== A otra alumna no se le abre: lee para quién es ===");
  const elegido = { id: "u-beto", at: new Date().toISOString(), nombre: "Beto Mora", motivo: "azar" };
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, {
    game_state: [fila(elegido)], questions: [pregunta({ para_alumno: "u-beto" })] });
  await page.waitForSelector("#chessboard [data-square]", { timeout: 10000 });
  await page.waitForFunction(() => !document.getElementById("pregunta-para-otro").hidden, null, { timeout: 5000 });
  igual("no se le abre la pregunta", await seVe(page, "#question-card"), false);
  igual("ni el botón para volver a ella", await seVe(page, "#question-reopen-btn"), false);
  igual("pero ve para quién es", await seVe(page, "#pregunta-para-otro"), true);
  igual("con su nombre", await page.textContent("#pregunta-para-otro"),
    "❓ Tu profe le hizo una pregunta a Beto Mora. Piensa tu respuesta en silencio.");
  igual("no manda nada", await page.evaluate(() =>
    window.__inserts.filter((i) => i.tabla === "respuestas_en_curso" || i.tabla === "question_answers").length), 0);
  await page.evaluate(() => {
    const q = window.__tablas.questions[0];
    q.closed_at = new Date().toISOString();
    window.__cambioEnBase("questions", q, "UPDATE");
  });
  await page.waitForFunction(() => document.getElementById("pregunta-para-otro").hidden, null, { timeout: 5000 });
  igual("al cerrarla, se va la línea", await seVe(page, "#pregunta-para-otro"), false);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaProfeDirigida(browser);
    await pruebaProfeParaTodos(browser);
    await pruebaAlumnaDeLaPregunta(browser);
    await pruebaOtraAlumna(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: la pregunta dirigida llega solo a quien tiene el turno y el profe ve los tableros en vivo.");
  process.exit(fallos ? 1 : 0);
})();
