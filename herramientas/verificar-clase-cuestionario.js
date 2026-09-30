#!/usr/bin/env node
/* El cuestionario al estilo Kahoot de la clase en vivo (js/clase-cuestionario.js).

   - Lo puro (Cuestionario): los puntos por acertar rápido (de 500 a 1000,
     0 al fallar), que se cuentan con las horas de la BASE (la última
     respuesta, no la primera), la pregunta limpia con la correcta renumerada,
     lo que falta para poder jugarlo y el puesto compartido en el empate.
   - El profe lo arma y lo guarda (en `cuestionarios`, con las preguntas
     limpias), lo juega: cada pregunta es una de opciones con su clave y su
     tiempo, sin tablero si no lleva posición; «cerrar ya» acorta el plazo EN
     LA BASE; al terminar cada una la clase ve lo que contestó el grupo y el
     podio con su título; al final, el resultado y todas las preguntas cerradas.
   - El alumno: la pregunta sin tablero no le muestra un tablero; la que lleva
     posición, sí.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-cuestionario.js
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
  active_player_color: "both", vista: null, comentarios: {}, elegido: null, pensar: null, encuesta: null, calentamiento: null, podio: null, equipos: null }, extra || {});

function laParteQueNoTocaLaPagina() {
  console.log("\n=== Cuestionario, solo ===");
  global.window = {};
  global.Chess = require("chess.js").Chess;
  const s = fs.readFileSync(path.join(__dirname, "..", "js", "clase-cuestionario.js"), "utf8");
  const i = s.indexOf("window."), j = s.indexOf("})();", i) + 5;
  eval(s.slice(i, j));
  const C = global.window.Cuestionario;
  igual("acertar al instante: 1000", C.puntos(true, 0, 20), 1000);
  igual("acertar a la mitad del tiempo: 750", C.puntos(true, 10, 20), 750);
  igual("acertar al final (o en la gracia): 500", [C.puntos(true, 20, 20), C.puntos(true, 24, 20)], [500, 500]);
  igual("fallar o no calificada: 0", [C.puntos(false, 1, 20), C.puntos(null, 1, 20)], [0, 0]);
  const q = { created_at: "2026-09-30T10:00:00.000Z", tiempo_limite: 20 };
  igual("cuenta desde la pregunta hasta la ÚLTIMA respuesta (la que cambió)",
    C.segundosDe({ created_at: "2026-09-30T10:00:01.000Z", updated_at: "2026-09-30T10:00:12.000Z" }, q), 12);
  igual("la correcta se renumera si queda una opción vacía en medio",
    C.limpiar({ texto: " ¿Cuál? ", opciones: ["Uno", "", "Tres", ""], correcta: 2, tiempo: 30, fen: null }),
    { texto: "¿Cuál?", opciones: ["Uno", "Tres"], correcta: 1, tiempo: 30, fen: null });
  igual("un tiempo que no está en la lista vuelve al de siempre", C.limpiar({ opciones: [], tiempo: 5 }).tiempo, 20);
  igual("dice lo que falta", C.problemas({ titulo: "", preguntas: [{ texto: "x", opciones: ["a", "", ""], correcta: 1 }] }),
    ["Ponle un título al cuestionario.", "Pregunta 1: escribe al menos dos opciones.", "Pregunta 1: la opción que marcaste como correcta está vacía."]);
  igual("sin la correcta marcada, no se juega", C.problemas({ titulo: "T", preguntas: [{ texto: "x", opciones: ["a", "b"], correcta: null }] }),
    ["Pregunta 1: marca cuál es la opción correcta."]);
  igual("una posición inválida no se juega", C.problemas({ titulo: "T", preguntas: [{ texto: "x", opciones: ["a", "b"], correcta: 0, fen: "8/8/8 w" }] }),
    ["Pregunta 1: la posición no es válida."]);
  const tot = {};
  C.sumar(tot, [
    { student_id: "a", is_correct: true, created_at: "2026-09-30T10:00:05.000Z" },
    { student_id: "b", is_correct: true, created_at: "2026-09-30T10:00:05.000Z" },
    { student_id: "c", is_correct: false, created_at: "2026-09-30T10:00:01.000Z" }], q, { a: "Ana", b: "Beto", c: "Caro" });
  igual("los empatados comparten puesto", C.ranking(tot).map((x) => [x.nombre, x.puntos, x.puesto]),
    [["Ana", 875, 1], ["Beto", 875, 1], ["Caro", 0, 3]]);
  igual("el podio lleva solo a quien sumó, y sin nombres si así se pide",
    C.podio(C.ranking(tot), false, "T").lineas, [{ id: "a", nombre: null, puntos: 875, puesto: 1 }, { id: "b", nombre: null, puntos: 875, puesto: 1 }]);
}

async function pruebaProfe(browser) {
  console.log("\n=== El profe lo arma, lo guarda y lo juega ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila()], cuestionarios: [] });
  await page.evaluate(() => activateTeacherTab("preguntar"));
  await page.click("#cuestionario-caja > summary");
  await page.click("#cuestionario-nuevo-btn");
  await page.fill("#cuestionario-titulo", "Las piezas");
  await page.getByLabel("Pregunta 1: lo que se pregunta").fill("¿Qué pieza salta?");
  await page.getByLabel("Pregunta 1: opción A", { exact: true }).fill("La torre");
  await page.getByLabel("Pregunta 1: opción B", { exact: true }).fill("El caballo");
  await page.getByLabel("Pregunta 1: opción C", { exact: true }).fill("El alfil");
  // Guardar sin marcar la correcta: no se guarda, y dice por qué.
  await page.click("#cuestionario-guardar-btn");
  igual("sin la correcta no se guarda, y lo dice", [await page.textContent("#cuestionario-aviso"),
    await page.evaluate(() => window.__inserts.filter((i) => i.tabla === "cuestionarios").length)], ["Pregunta 1: marca cuál es la opción correcta.", 0]);
  await page.getByLabel("Pregunta 1: la opción B es la correcta").check();
  await page.getByLabel("Pregunta 1: tiempo para contestar").selectOption("20");
  await page.click("#cuestionario-agregar-btn");
  await page.getByLabel("Pregunta 2: lo que se pregunta").fill("¿Quién empieza?");
  await page.getByLabel("Pregunta 2: opción A", { exact: true }).fill("Las blancas");
  await page.getByLabel("Pregunta 2: opción B", { exact: true }).fill("Las negras");
  await page.getByLabel("Pregunta 2: la opción A es la correcta").check();
  await page.getByRole("button", { name: "Pregunta 2: Usar la posición del tablero de ahora" }).click();
  await page.click("#cuestionario-guardar-btn");
  await page.waitForFunction(() => window.__inserts.some((i) => i.tabla === "cuestionarios"), null, { timeout: 5000 });
  const guardado = await page.evaluate(() => window.__inserts.find((i) => i.tabla === "cuestionarios").fila);
  igual("se guarda con las preguntas limpias", [guardado.titulo, guardado.profesor_id, guardado.preguntas], ["Las piezas", "u-profe", [
    { texto: "¿Qué pieza salta?", opciones: ["La torre", "El caballo", "El alfil"], correcta: 1, tiempo: 20, fen: null },
    { texto: "¿Quién empieza?", opciones: ["Las blancas", "Las negras"], correcta: 0, tiempo: 20, fen: INICIO }]]);
  await page.waitForFunction(() => [...document.querySelectorAll("#cuestionario-select option")].some((o) => /Las piezas/.test(o.textContent)), null, { timeout: 5000 });
  igual("y queda en la lista de tus cuestionarios", await page.evaluate(() => document.querySelector("#cuestionario-select").selectedOptions[0].textContent), "Las piezas (2 preguntas)");

  // A jugarlo.
  await page.click("#cuestionario-jugar-btn");
  await page.waitForFunction(() => (window.__rpcs || []).some((r) => r.n === "hacer_pregunta_de_opciones"), null, { timeout: 5000 });
  const r1 = await page.evaluate(() => window.__rpcs.filter((r) => r.n === "hacer_pregunta_de_opciones")[0].args);
  igual("la primera sale como pregunta de opciones, con su clave, su tiempo y sin tablero",
    [r1.p_prompt, r1.p_opciones, r1.p_correcta, r1.p_tiempo_limite, r1.p_sin_tablero],
    ["🎯 Pregunta 1 de 2: ¿Qué pieza salta?", ["La torre", "El caballo", "El alfil"], 1, 20, true]);
  igual("mientras se juega, el editor no está", [await seVe(page, "#cuestionario-editor"), await seVe(page, "#cuestionario-juego")], [false, true]);
  // Ana acierta a los 2 s; Beto falla.
  await page.evaluate(() => {
    const q = window.__tablas.questions[window.__tablas.questions.length - 1];
    const t = new Date(new Date(q.created_at).getTime() + 2000).toISOString();
    window.__tablas.question_answers.push(
      { id: "r1", question_id: q.id, student_id: "u-ana", opcion: 1, is_correct: true, created_at: t, updated_at: t },
      { id: "r2", question_id: q.id, student_id: "u-beto", opcion: 0, is_correct: false, created_at: t, updated_at: t });
  });
  await page.click("#cuestionario-cerrar-btn");
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "questions" && u.campos.tiempo_limite), null, { timeout: 5000 });
  igual("«cerrar ya» acorta el plazo en la base (no menos de 10 s)",
    await page.evaluate(() => window.__updates.find((u) => u.tabla === "questions" && u.campos.tiempo_limite).campos.tiempo_limite), 10);
  // Se adelanta el reloj de la prueba: sin esto habría que esperar los 10 s más la gracia.
  await page.evaluate(() => { cuestionarioEnJuego.fin = Date.now() - 7000; });
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state" && u.campos.podio), null, { timeout: 5000 });
  igual("al terminar, la clase ve lo que contestó el grupo", await page.evaluate(() => window.__tablas.questions[window.__tablas.questions.length - 1].resultados_visibles), true);
  let podio = await page.evaluate(() => window.__updates.filter((u) => u.campos.podio).pop().campos.podio);
  igual("y el podio con su título: 900 puntos por acertar a los 2 de 10 s",
    [podio.titulo, podio.lineas.map((l) => [l.id, l.puntos, l.puesto])], ["🎯 «Las piezas»: así van después de la 1 de 2", [["u-ana", 900, 1]]]);
  igual("el profe ve cómo va, con lo de esta pregunta", await page.evaluate(() => [...document.querySelectorAll("#cuestionario-ranking li")].map((l) => l.textContent)),
    ["🥇 1.º Ana Rojas — 900 puntos (+900 en esta)", "🥈 2.º Alumno — 0 puntos (+0 en esta)"]);
  igual("y el botón de la siguiente", await page.textContent("#cuestionario-siguiente-btn"), "➡️ Siguiente pregunta");

  await page.click("#cuestionario-siguiente-btn");
  await page.waitForFunction(() => (window.__rpcs || []).filter((r) => r.n === "hacer_pregunta_de_opciones").length === 2, null, { timeout: 5000 });
  const r2 = await page.evaluate(() => window.__rpcs.filter((r) => r.n === "hacer_pregunta_de_opciones")[1].args);
  igual("la segunda lleva su posición, que el tablero de la clase muestra", [r2.p_fen, r2.p_sin_tablero, await page.evaluate(() => board.fen())], [INICIO, false, INICIO]);
  igual("el podio de antes se quitó para contestar", await page.evaluate(() => window.__updates.some((u) => u.tabla === "game_state" && "podio" in u.campos && u.campos.podio === null)), true);
  await page.evaluate(() => {
    const q = window.__tablas.questions[window.__tablas.questions.length - 1];
    const t0 = new Date(new Date(q.created_at).getTime() + 1000).toISOString();
    const t1 = new Date(new Date(q.created_at).getTime() + 5000).toISOString();
    // Contestó al segundo, pero cambió su respuesta a los 5: cuenta la última.
    window.__tablas.question_answers.push({ id: "r3", question_id: q.id, student_id: "u-ana", opcion: 0, is_correct: true, created_at: t0, updated_at: t1 });
    cuestionarioEnJuego.fin = Date.now() - 7000;
  });
  await page.waitForFunction(() => document.getElementById("cuestionario-siguiente-btn").checkVisibility(), null, { timeout: 5000 });
  podio = await page.evaluate(() => window.__updates.filter((u) => u.campos.podio).pop().campos.podio);
  igual("la última: podio final, y cuenta la hora de la última respuesta (+875)",
    [podio.titulo, podio.lineas.map((l) => [l.id, l.puntos])], ["🎯 Podio final de «Las piezas»", [["u-ana", 1775]]]);
  igual("el botón dice que termina", await page.textContent("#cuestionario-siguiente-btn"), "🏆 Terminar y mostrar el podio final");
  await page.click("#cuestionario-siguiente-btn");
  await page.waitForFunction(() => document.getElementById("cuestionario-final").checkVisibility(), null, { timeout: 5000 });
  igual("al final, el resultado de cada uno", await page.evaluate(() => [...document.querySelectorAll("#cuestionario-final li")].map((l) => l.textContent)),
    ["🥇 1.º Ana Rojas — 1775 puntos, 2 buenas", "🥈 2.º Alumno — 0 puntos, 0 buenas"]);
  igual("todas las preguntas quedaron cerradas", await page.evaluate(() => window.__tablas.questions.every((q) => !!q.closed_at)), true);
  igual("y se puede volver a elegir o editar", [await seVe(page, "#cuestionario-elegir"), await seVe(page, "#cuestionario-juego")], [true, false]);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaAlumno(browser) {
  console.log("\n=== El alumno: sin tablero cuando no hay posición ===");
  const q = (extra) => Object.assign({ id: "q1", fen: INICIO, prompt: "🎯 Pregunta 1 de 2: ¿Qué pieza salta?", created_by: "u-profe",
    created_at: new Date().toISOString(), closed_at: null, expected_plies: 1, tipo: "opciones", opciones: ["La torre", "El caballo"],
    tiempo_limite: 60, resultados_visibles: false, class_session_id: "c-viva" }, extra);
  for (const [sinTablero, esperado] of [[true, false], [false, true]]) {
    const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, { game_state: [fila()], questions: [q({ sin_tablero: sinTablero })] });
    await page.waitForFunction(() => document.getElementById("question-card").checkVisibility(), null, { timeout: 10000 });
    igual((sinTablero ? "sin posición: " : "con posición: ") + "las opciones se ven, el tablero " + (esperado ? "también" : "no"),
      [await seVe(page, "#question-opciones"), await seVe(page, "#question-board-caja")], [true, esperado]);
    igual("nunca ve el armador del profe", await seVe(page, "#cuestionario-caja"), false);
    igual("sin errores en consola", errores, []);
    await ctx.close();
  }
}

(async () => {
  laParteQueNoTocaLaPagina();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaProfe(browser);
    await pruebaAlumno(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: el cuestionario al estilo Kahoot.");
  process.exit(fallos ? 1 : 0);
})();
