#!/usr/bin/env node
/* La ronda rápida, el aviso de quién no contesta y «Ver como alumno»
   (sesion.html).

   - La ronda rápida (js/clase-ronda.js): desde Táctica, 5 ejercicios al azar
     del tema y la dificultad elegidos; cada uno es una pregunta con tiempo que
     se califica SOLA con la solución del ejercicio (o un mate); al final, el
     resultado y un podio con su título.
   - La participación pareja (js/clase-callados.js): al profe (solo a él) se le
     avisa quién lleva 3 o más de las últimas 4 preguntas sin contestar, sin
     contarle a quien entró tarde lo de antes; «Darle el turno» lo registra con
     origen 'profe' (no como un sorteo que no fue).
   - «Ver como alumno» (sesion.html?como=alumno): el profe ve su clase como un
     alumno, con la barra que lo dice, y NADA se manda: ni respuestas, ni
     cambios; la presencia entra como «vista-previa».

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-ronda.js
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
const preguntasHechas = (page) => page.evaluate(() => window.__inserts.filter((i) => i.tabla === "questions").map((i) => i.fila));

function laParteQueNoTocaLaPagina() {
  console.log("\n=== RondaRapida y Callados, solos ===");
  global.window = {};
  global.Chess = require("chess.js").Chess;
  const raiz = path.join(__dirname, "..");
  for (const f of ["repaso-clase.js", "clase-ronda.js", "clase-callados.js"]) {
    // Solo las partes puras (window.X = …): lo demás usa la página.
    const s = fs.readFileSync(path.join(raiz, "js", f), "utf8");
    const i = s.indexOf("window."), j = s.indexOf("})();", i) + 5;
    eval(s.slice(i, j));
  }
  const { RondaRapida, Callados } = global.window;
  const PASILLO = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";
  igual("buena: la jugada de la solución", RondaRapida.esBuena(PASILLO, ["Ra8#"], ["Ra8#"]), true);
  igual("buena: escrita de otra forma (a1a8)", RondaRapida.esBuena(PASILLO, ["a1a8"], ["Ra8#"]), true);
  igual("mala: otra jugada", RondaRapida.esBuena(PASILLO, ["Kf1"], ["Ra8#"]), false);
  // Dos torres: Ra8# y Rb8# dan mate (comprobado con chess.js). La solución guarda una sola.
  igual("buena: otro mate que no es el guardado", RondaRapida.esBuena("6k1/5ppp/8/8/8/8/5PPP/RR4K1 w - - 0 1", ["Rb8#"], ["Ra8#"]), true);
  igual("sin respuesta, mala", RondaRapida.esBuena(PASILLO, [], ["Ra8#"]), false);
  const cinco = RondaRapida.elegir(["a", "b", "c", "d", "e", "f", "g"], 5);
  igual("elige 5 sin repetir", [cinco.length, new Set(cinco).size], [5, 5]);
  igual("el resultado, con puesto compartido", RondaRapida.resultado([
    { student_id: "a", is_correct: true }, { student_id: "a", is_correct: false },
    { student_id: "b", is_correct: true }, { student_id: "c", is_correct: false }], { a: "Ana", b: "Beto", c: "Caro" })
    .map((x) => [x.nombre, x.buenas, x.puesto]), [["Ana", 1, 1], ["Beto", 1, 1], ["Caro", 0, 3]]);

  const t = (min) => new Date(Date.now() - min * 60000).toISOString();
  const qs = [{ id: "q5", created_at: t(1) }, { id: "q4", created_at: t(3), para_alumno: "u-x" }, { id: "q3", created_at: t(5) }, { id: "q2", created_at: t(7) }, { id: "q1", created_at: t(9) }];
  const resp = [{ question_id: "q5", student_id: "b" }, { question_id: "q3", student_id: "b" }, { question_id: "q2", student_id: "b" }, { question_id: "q1", student_id: "b" }, { question_id: "q2", student_id: "a" }];
  igual("avisa de quien no contestó 3 de las últimas 4 (la dirigida no cuenta)", Callados.calcular(qs, resp, [
    { id: "a", nombre: "Ana", desde: Date.now() - 3600000 }, { id: "b", nombre: "Beto", desde: Date.now() - 3600000 },
    { id: "c", nombre: "Caro", desde: Date.now() - 4 * 60000 }]).map((x) => [x.nombre, x.sin, x.de]), [["Ana", 3, 4]]);
}

async function pruebaRonda(browser) {
  console.log("\n=== La ronda rápida, desde Táctica ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila()] });
  await page.evaluate(async () => {
    activateTeacherTab("tactica");
    await ensureTacticsLoaded();
    tacticsView = Object.assign({}, tacticsView, { level: "exercises", themeKey: Object.keys(tacticsData.themes)[0], diffIndex: 0 });
    renderTacticsView();
  });
  // El tiempo se elige al lado del botón, en Táctica mismo.
  await page.locator("#tactics-body").getByLabel("Tiempo por posición").selectOption("20");
  await page.locator("#tactics-body").getByRole("button", { name: /Ronda rápida con 5 de estos/ }).click();
  await page.waitForFunction(() => window.__inserts.some((i) => i.tabla === "questions"), null, { timeout: 5000 });
  const q1 = (await preguntasHechas(page))[0];
  igual("abre la primera: pregunta con tiempo, en la posición del ejercicio", [q1.prompt, q1.tiempo_limite, q1.expected_plies], ["⚡ Ronda rápida: 1 de 5", 20, 1]);
  const ej = await page.evaluate((fen) => Object.values(tacticsData.puzzles).find((p) => p.fen === fen), q1.fen);
  igual("y es un ejercicio del banco, que el tablero de la clase muestra", [!!ej, await page.evaluate(() => board.fen())], [true, q1.fen]);
  // Ana contesta la de la solución; Beto, otra jugada legal.
  await page.evaluate((sol) => {
    const q = window.__tablas.questions[window.__tablas.questions.length - 1];
    const g = new Chess(q.fen);
    const otra = g.moves().find((m) => m !== sol);
    window.__tablas.question_answers.push({ id: "r1", question_id: q.id, student_id: "u-ana", moves: [sol], is_correct: null },
      { id: "r2", question_id: q.id, student_id: "u-beto", moves: [otra], is_correct: null });
  }, ej.solution[0]);
  await page.click("#ronda-siguiente-btn");
  await page.waitForFunction(() => window.__inserts.filter((i) => i.tabla === "questions").length === 2, null, { timeout: 6000 });
  igual("se califica sola: Ana bien, Beto mal", await page.evaluate(() => window.__tablas.question_answers.filter((a) => a.id === "r1" || a.id === "r2").map((a) => a.is_correct)), [true, false]);
  igual("la primera quedó cerrada y ya va la segunda", [await page.evaluate(() => !!window.__tablas.questions[0].closed_at),
    (await preguntasHechas(page))[1].prompt], [true, "⚡ Ronda rápida: 2 de 5"]);
  await page.click("#ronda-terminar-btn");
  await page.waitForFunction(() => document.getElementById("ronda-resultado").checkVisibility(), null, { timeout: 5000 });
  igual("al terminar, el resultado", await page.evaluate(() => [...document.querySelectorAll("#ronda-resultado-lista li")].map((l) => l.textContent)),
    ["🥇 1.º Ana Rojas — 1 de 2 buena", "🥈 2.º Alumno — 0 de 2 buenas"]);
  igual("y las preguntas de la ronda, todas cerradas", await page.evaluate(() => window.__tablas.questions.every((q) => !!q.closed_at)), true);
  await page.click("#ronda-podio-btn");
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state" && u.campos.podio), null, { timeout: 5000 });
  const podio = await page.evaluate(() => window.__updates.filter((u) => u.campos.podio).pop().campos.podio);
  igual("el podio de la ronda, con su título", [podio.titulo, podio.lineas.map((l) => [l.id, l.puntos, l.puesto])], ["Podio de la ronda rápida", [["u-ana", 1, 1]]]);
  igual("y se ve con ese título", await page.textContent("#podio-titulo"), "Podio de la ronda rápida");
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaCallados(browser) {
  console.log("\n=== Quién lleva un rato sin contestar ===");
  const ahora = Date.now();
  const q = (id, min) => ({ id, fen: INICIO, tipo: "jugada", class_session_id: "c-viva", created_by: "u-profe", closed_at: "x", expected_plies: 1,
    created_at: new Date(ahora - min * 1000).toISOString() });
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, {
    game_state: [fila()],
    questions: [q("q1", 40), q("q2", 30), q("q3", 20), q("q4", 10)],
    question_answers: [
      { id: "a1", question_id: "q1", student_id: "u-ana", moves: ["e4"] },
      ...["q1", "q2", "q3", "q4"].map((x, i) => ({ id: "b" + i, question_id: x, student_id: "u-beto", moves: ["e4"] })),
    ],
  });
  await page.evaluate(() => { window.__entraAlumno(); window.__entraOtroAlumno(); });
  await page.waitForFunction(() => document.getElementById("callados-aviso").checkVisibility(), null, { timeout: 5000 });
  igual("al profe le avisa de Ana, no de Beto", await page.evaluate(() => [...document.querySelectorAll("#callados-lista li span")].map((s) => s.textContent)),
    ["Ana Rojas — 3 de las últimas 4 sin contestar"]);
  await page.getByRole("button", { name: "Darle el turno a Ana Rojas" }).click();
  await page.waitForFunction(() => window.__inserts.some((i) => i.tabla === "clase_elegidos"), null, { timeout: 5000 });
  igual("el turno queda con origen «profe» (no como un sorteo)", await page.evaluate(() => [window.__inserts.find((i) => i.tabla === "clase_elegidos").fila.origen,
    window.__updates.filter((u) => u.campos.elegido).pop().campos.elegido.motivo]), ["profe", "profe"]);
  igual("sin errores en consola", errores, []);
  await ctx.close();

  const a = await abrir(browser, "u-ana", CLASE, { game_state: [fila()], questions: [q("q1", 40), q("q2", 30), q("q3", 20), q("q4", 10)] });
  await a.page.waitForTimeout(800);
  igual("la clase nunca lo ve", await seVe(a.page, "#callados-aviso"), false);
  await a.ctx.close();
}

async function pruebaVistaDeAlumno(browser) {
  console.log("\n=== «Ver como alumno» ===");
  {
    const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila()] });
    igual("el profe tiene el botón", await seVe(page, "#vista-alumno-btn"), true);
    const [ventana] = await Promise.all([ctx.waitForEvent("page"), page.click("#vista-alumno-btn")]);
    igual("abre otra ventana como alumno", new URL(ventana.url()).search, "?como=alumno");
    await ventana.close();
    igual("sin errores en consola", errores, []);
    await ctx.close();
  }
  const pregunta = { id: "q1", fen: INICIO, prompt: "¿Qué jugarías?", created_by: "u-profe", created_at: new Date().toISOString(), closed_at: null, expected_plies: 1, tipo: "jugada", class_session_id: "c-viva" };
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, {
    game_state: [fila({ podio: { at: "p", con_nombres: true, lineas: [{ id: "u-ana", nombre: "Ana Rojas", puntos: 3, puesto: 1 }] } })], questions: [pregunta],
  }, { ruta: "/sesion.html?como=alumno" });
  await page.waitForFunction(() => document.getElementById("question-card").checkVisibility(), null, { timeout: 10000 });
  igual("dice que es la vista de alumno y que no se manda nada", [await seVe(page, "#vista-previa-barra"), await page.textContent("#role-badge")], [true, "Vista de alumno"]);
  igual("ve lo del alumno: la pregunta y el podio con su lugar", [await seVe(page, "#question-card"), await page.textContent("#podio-tu-lugar")],
    [true, "Todavía no sumaste puntos en esta clase: contesta la próxima pregunta."]);
  igual("y no lo del profe", [await seVe(page, "#teacher-toolbar"), await seVe(page, "#teacher-tabs-wrap")], [false, false]);
  await page.click('#question-board [data-square="e2"]');
  await page.click('#question-board [data-square="e4"]');
  await page.waitForTimeout(600);
  igual("contestar no manda nada (ni la respuesta ni la de en curso)", await page.evaluate(() => window.__inserts.filter((i) => /question_answers|respuestas_en_curso/.test(i.tabla)).length), 0);
  igual("su presencia entra como «vista-previa», no como alumno", await page.evaluate(() => [...new Set((window.__tracks || []).map((t) => t.role))]), ["vista-previa"]);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

(async () => {
  laParteQueNoTocaLaPagina();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaRonda(browser);
    await pruebaCallados(browser);
    await pruebaVistaDeAlumno(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: la ronda rápida, el aviso de quién no contesta y la vista de alumno.");
  process.exit(fallos ? 1 : 0);
})();
