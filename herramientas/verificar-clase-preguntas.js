#!/usr/bin/env node
/* Las preguntas de la clase en vivo: tiempo para contestar, preguntas de
   opciones (con el termómetro «¿lo entendiste?») y lo que contestó el grupo.

   Lo que manda está en la base (migración
   preguntas_con_tiempo_opciones_y_resultados), comprobado impersonando roles:
   la respuesta tardía se rechaza, la opción correcta vive en preguntas_clave
   (la alumna no la lee), la base califica sola una de opciones, el conteo sin
   nombres lo ven sus alumnos solo cuando el profe lo muestra, y —el hueco que
   había— una alumna ya no puede INSERTAR su respuesta marcada como correcta.

   Aquí se comprueba la pantalla, con el doble de verificar-clase-registrada.js:

   - que el tiempo elegido viaje en TODAS las preguntas, también las que nacen
     fuera del botón (Tipos, Táctica…: pasan por crearPregunta);
   - que «¿quién está mejor?», las opciones propias y el termómetro manden la
     pregunta con su correcta (o sin ella) por hacer_pregunta_de_opciones, y
     que las opciones propias se renumeren si queda una vacía en el medio;
   - que el profe vea lo que contestó el grupo, con la opción elegida en la
     lista, y que el botón de mostrarlo a la clase diga si está puesto;
   - que la alumna vea la cuenta regresiva, conteste con un botón que dice
     cuál eligió, no pueda mover cuando se acabó el tiempo, no vea el tablero
     en el termómetro, y vea los resultados (escritos y con flechas) cuando el
     profe los muestra — SIN que se le borre lo que llevaba jugado.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-preguntas.js
*/
const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");

const { abrir, CHROME } = R;
const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };
const FEN = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
const QUIEN = ["Mejor las blancas", "Están iguales", "Mejor las negras"];
const TERMO = ["👍 Lo entendí", "🤔 Más o menos", "🙋 No lo entendí"];

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
const seVe = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!(el && el.checkVisibility()); }, sel);
const ultimoRpc = (page, n) => page.evaluate((x) => { const r = (window.__rpcs || []).filter((y) => y.n === x); return r.length ? r[r.length - 1].args : null; }, n);
const hace = (seg) => new Date(Date.now() - seg * 1000).toISOString();

function pregunta(extra) {
  return Object.assign({ id: "q1", fen: FEN, prompt: "¿Qué jugarías?", created_by: "u-profe", expected_plies: 1,
    tipo: "jugada", opciones: null, tiempo_limite: null, resultados_visibles: false, created_at: hace(1), closed_at: null }, extra || {});
}

async function pruebaProfesor(browser) {
  console.log("\n=== El profe: tiempo, opciones y termómetro ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, {
    game_state: [{ id: 7, owner_id: "u-profe", fen: FEN, moves: [], start_fen: FEN, arrows: [], circles: [], active_player_color: "both", vista: null, comentarios: {} }],
  });
  await page.waitForFunction(() => document.querySelectorAll("#question-tiempo option").length > 0, null, { timeout: 10000 });
  igual("el tiempo se elige de una lista", await page.evaluate(() =>
    [...document.querySelectorAll("#question-tiempo option")].map((o) => o.textContent)),
    ["Sin límite", "30 segundos", "1 minuto", "2 minutos", "5 minutos"]);
  await page.evaluate(() => activateTeacherTab("preguntar"));
  await page.selectOption("#question-tiempo", "60");
  await page.click("#ask-question-btn");
  await page.waitForFunction(() => window.__inserts.some((i) => i.tabla === "questions"), null, { timeout: 5000 });
  igual("«¿qué jugarías?» lleva el tiempo", await page.evaluate(() =>
    window.__inserts.filter((i) => i.tabla === "questions").pop().fila.tiempo_limite), 60);
  await page.evaluate((f) => tiposPreguntar(f, "x"), FEN);
  await page.waitForFunction(() => window.__inserts.filter((i) => i.tabla === "questions").length === 2, null, { timeout: 5000 });
  igual("una de Tipos también (pasa por crearPregunta)", await page.evaluate(() =>
    window.__inserts.filter((i) => i.tabla === "questions").pop().fila.tiempo_limite), 60);

  await page.evaluate(() => { document.getElementById("otras-preguntas").open = true; });
  await page.selectOption("#quien-mejor-correcta", "0");
  await page.click("#ask-quien-mejor-btn");
  await page.waitForTimeout(150);
  igual("«¿quién está mejor?» con su correcta y el tiempo", await ultimoRpc(page, "hacer_pregunta_de_opciones"),
    { p_fen: FEN, p_prompt: "¿Quién está mejor en esta posición?", p_opciones: QUIEN, p_correcta: 0, p_tiempo_limite: 60 });

  await page.fill("#opciones-prompt", "¿Cuál es el plan?");
  await page.fill("#opcion-texto-0", "Atacar el rey");
  await page.fill("#opcion-texto-2", "Cambiar damas");
  await page.check('input[name="opcion-correcta"][value="2"]');
  await page.click("#ask-opciones-btn");
  await page.waitForTimeout(150);
  const propias = await ultimoRpc(page, "hacer_pregunta_de_opciones");
  igual("las propias se juntan y la correcta se renumera", [propias.p_opciones, propias.p_correcta], [["Atacar el rey", "Cambiar damas"], 1]);
  await page.fill("#opcion-texto-2", "");
  await page.click("#ask-opciones-btn");
  igual("con una sola opción no se manda, y se dice", /al menos dos opciones/.test(await page.textContent("#status-banner")), true);

  await page.selectOption("#question-tiempo", "");
  await page.click("#ask-termometro-btn");
  await page.waitForTimeout(150);
  const termo = await ultimoRpc(page, "hacer_pregunta_de_opciones");
  igual("el termómetro va sin correcta y sin límite", [termo.p_opciones, termo.p_correcta, termo.p_tiempo_limite], [TERMO, null, null]);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaProfesorResultados(browser) {
  console.log("\n=== El profe ve lo que contestó el grupo y se lo muestra ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, {
    questions: [pregunta({ tipo: "opciones", opciones: QUIEN, prompt: "¿Quién está mejor en esta posición?", tiempo_limite: 120 })],
    preguntas_clave: [{ question_id: "q1", correcta: 0 }],
    question_answers: [
      { id: "a1", question_id: "q1", student_id: "u-ana", opcion: 0, moves: [], is_correct: true, profiles: { full_name: "Ana Rojas" } },
      { id: "a2", question_id: "q1", student_id: "u-beto", opcion: 2, moves: [], is_correct: false, profiles: { full_name: "Beto Mora" } },
    ],
  });
  await page.waitForFunction(() => /contestó la clase/.test(document.getElementById("question-resultados-profe").textContent), null, { timeout: 10000 });
  await page.evaluate(() => activateTeacherTab("preguntar"));
  igual("la cuenta, escrita y con la correcta dicha", await page.evaluate(() =>
    [...document.querySelectorAll("#question-resultados-profe li")].map((l) => l.textContent)),
    ["✓ Mejor las blancas: 1 alumno (50 %), la correcta", "Están iguales: 0 alumnos (0 %)", "Mejor las negras: 1 alumno (50 %)"]);
  igual("en la lista, la opción que eligió cada uno", await page.evaluate(() =>
    [...document.querySelectorAll("#answers-list li span.font-mono")].map((s) => s.textContent)), ["Mejor las blancas", "Mejor las negras"]);
  igual("sin la respuesta del motor (no hay jugada)", await seVe(page, "#engine-reference-answer"), false);
  igual("con su tiempo", /Quedan 1:5\d|Quedan 2:00/.test(await page.textContent("#question-tiempo-profe")), true);
  const btn = "#mostrar-resultados-btn";
  igual("el botón dice que no se muestra", await page.getAttribute(btn, "aria-pressed"), "false");
  await page.click(btn);
  await page.waitForFunction(() => document.getElementById("mostrar-resultados-btn").getAttribute("aria-pressed") === "true", null, { timeout: 5000 });
  igual("mostrarlo lo guarda en la pregunta", await page.evaluate(() =>
    window.__updates.filter((u) => u.tabla === "questions" && "resultados_visibles" in u.campos).map((u) => [u.campos.resultados_visibles, u.donde])),
    [[true, [["id", "q1"]]]]);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaAlumnaOpciones(browser) {
  console.log("\n=== La alumna contesta con opciones, con el reloj corriendo ===");
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, {
    questions: [pregunta({ tipo: "opciones", opciones: QUIEN, prompt: "¿Quién está mejor en esta posición?", tiempo_limite: 60 })],
  });
  await page.waitForFunction(() => document.querySelectorAll("#question-opciones button").length === 3, null, { timeout: 10000 });
  igual("una opción por botón", await page.evaluate(() => [...document.querySelectorAll("#question-opciones button")].map((b) => b.textContent)), QUIEN);
  igual("se ve el tablero de la posición", await seVe(page, "#question-board"), true);
  igual("y la cuenta regresiva", /⏱️ Quedan 0:5\d|⏱️ Quedan 1:00/.test(await page.textContent("#question-tiempo-alumno")), true);
  await page.click("#question-opciones button:nth-child(2)");
  await page.waitForFunction(() => window.__inserts.some((i) => i.tabla === "question_answers"), null, { timeout: 5000 });
  igual("manda la opción, sin jugadas", await page.evaluate(() => {
    const f = window.__inserts.filter((i) => i.tabla === "question_answers").pop().fila;
    return [f.opcion, f.moves, f.question_id, f.is_correct];
  }), [1, [], "q1", undefined]);
  igual("el botón elegido lo dice", await page.evaluate(() =>
    [...document.querySelectorAll("#question-opciones button")].map((b) => b.getAttribute("aria-pressed"))), ["false", "true", "false"]);
  igual("y el estado repite cuál", /«Están iguales»/.test(await page.textContent("#question-status-text")), true);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaAlumnaTermometroYTiempo(browser) {
  console.log("\n=== El termómetro no muestra tablero; el tiempo vencido no deja mover ===");
  let r = await abrir(browser, "u-ana", CLASE, {
    questions: [pregunta({ tipo: "opciones", opciones: TERMO, prompt: "¿Entendiste lo que acabamos de ver?" })],
  });
  await r.page.waitForFunction(() => document.querySelectorAll("#question-opciones button").length === 3, null, { timeout: 10000 });
  igual("termómetro: sin tablero", await seVe(r.page, "#question-board"), false);
  igual("y dice que nadie ve quién eligió qué", /no le enseña a la clase quién eligió qué/.test(await r.page.textContent("#question-plies-hint")), true);
  igual("sin límite, sin reloj", await seVe(r.page, "#question-tiempo-alumno"), false);
  igual("sin errores en consola", r.errores, []);
  await r.ctx.close();

  r = await abrir(browser, "u-ana", CLASE, { questions: [pregunta({ tiempo_limite: 30, created_at: hace(90) })] });
  await r.page.waitForFunction(() => /Se acabó el tiempo/.test(document.getElementById("question-tiempo-alumno").textContent), null, { timeout: 10000 });
  await r.page.waitForTimeout(1100);
  igual("vencida: no puede mover", await r.page.evaluate(() => questionBoard.interactive), false);
  igual("y se le dice", /no alcanzaste a contestar/.test(await r.page.textContent("#question-status-text")), true);
  igual("y en voz, una vez", await r.page.textContent("#question-tiempo-aviso"), "Se acabó el tiempo.");
  igual("sin errores en consola", r.errores, []);
  await r.ctx.close();
}

async function pruebaAlumnaResultados(browser) {
  console.log("\n=== La alumna ve lo que contestó el grupo, sin perder su jugada ===");
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, {
    questions: [pregunta({ expected_plies: 2 })],
    question_answers: [
      { id: "b1", question_id: "q1", student_id: "u-beto", moves: ["Bb5", "a6", "Ba4"] },
      { id: "b2", question_id: "q1", student_id: "u-otro", moves: ["Bb5", "Nf6", "O-O"] },
      { id: "b3", question_id: "q1", student_id: "u-otra", moves: ["Bc4", "Bc5", "c3"] },
    ],
  });
  await page.waitForFunction(() => typeof questionBoard !== "undefined" && questionBoard && questionBoard.interactive, null, { timeout: 10000 });
  igual("antes de mostrarlo, no ve nada", await seVe(page, "#question-resultados-alumno"), false);
  // Juega su primera jugada (el motor todavía no contesta en el doble).
  await page.evaluate(() => questionBoard.jugar({ from: "d2", to: "d4" }));
  const jugadas = await page.evaluate(() => questionBoard.moves().length);
  // El profe los muestra: la base cambia y Realtime avisa.
  await page.evaluate(() => { window.__tablas.questions[0].resultados_visibles = true; window.__cambioEnBase("questions", window.__tablas.questions[0]); });
  await page.waitForFunction(() => /contestó la clase/.test(document.getElementById("question-resultados-alumno").textContent), null, { timeout: 5000 });
  igual("los ve, escritos y sin nombres", await page.evaluate(() =>
    [...document.querySelectorAll("#question-resultados-alumno li")].map((l) => l.textContent)),
    ["Bb5: 2 alumnos (67 %)", "Bc4: 1 alumno (33 %)"]);
  igual("con una flecha por jugada en su tablero", await page.evaluate(() => questionBoard.arrows.map((a) => a.from + a.to + ":" + a.color)),
    ["f1b5:verde", "f1c4:azul"]);
  igual("y no se le borró lo que llevaba jugado", await page.evaluate(() => questionBoard.moves().length), jugadas);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaProfesor(browser);
    await pruebaProfesorResultados(browser);
    await pruebaAlumnaOpciones(browser);
    await pruebaAlumnaTermometroYTiempo(browser);
    await pruebaAlumnaResultados(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: las preguntas llevan su tiempo, sus opciones y lo que contestó la clase.");
  process.exit(fallos ? 1 : 0);
})();
