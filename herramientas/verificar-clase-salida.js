#!/usr/bin/env node
/* La pregunta de salida: la última de la clase, sobre lo visto.

   Al cerrar la clase, junto al título y la nota, el profe puede hacer una
   última pregunta: el termómetro «¿lo entendiste?» o «¿qué jugarías?» en la
   posición del tablero. Queda marcada (questions.de_salida) y la base la
   cuenta (salida_de_la_clase, SECURITY INVOKER, comprobada impersonando: el
   profe ve todo, otro profe nada y una alumna solo lo suyo). Con esos números
   la página dice si el tema quedó, quedó a medias o hay que repetirlo, y lo
   dice en tres lugares: al cerrar, en el registro del panel
   (verificar-panel.js) y al profe cuando abre la clase siguiente.

   Se comprueba:
   - el veredicto (js/resumen-clase.js), sin navegador;
   - que en el cierre se vean los dos botones, que el termómetro salga
     marcado de salida, que el veredicto cambie cuando llegan respuestas, y
     que «¿qué jugarías?» mande de_salida en la pregunta;
   - que al entrar a la clase siguiente el profe lea lo que dijo la de salida
     de la anterior.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-salida.js
*/
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");

const { abrir, CHROME } = R;
const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };
const FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const TERMOMETRO = ["👍 Lo entendí", "🤔 Más o menos", "🙋 No lo entendí"];

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
const seVe = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!(el && el.checkVisibility()); }, sel);
const fila = () => ({ id: 7, owner_id: "u-profe", fen: null, moves: [], start_fen: null, arrows: [], circles: [],
  active_player_color: "both", vista: null, comentarios: {}, elegido: null, pensar: null });

function pruebaVeredicto() {
  console.log("\n=== El veredicto ===");
  const w = {};
  new Function("window", fs.readFileSync(path.join(__dirname, "..", "js", "resumen-clase.js"), "utf8"))(w);
  const V = (f) => { const v = w.ResumenClase.veredictoSalida(f); return v && [v.tono, v.texto, v.detalle]; };
  const base = { tipo: "opciones", asistentes: 8, respondieron: 8, bien: 0, medio: 0, mal: 0, sin_calificar: 0 };
  igual("sin pregunta de salida, nada", V(null), null);
  igual("termómetro: quedó (más o menos vale la mitad)", V(Object.assign({}, base, { bien: 5, medio: 2, mal: 1 })),
    ["quedo", "✅ El tema quedó.", "8 de 8 alumnos contestaron: 5 lo entendieron, 2 más o menos, 1 no lo entendió."]);
  igual("termómetro: a medias", V(Object.assign({}, base, { respondieron: 4, bien: 2, mal: 2 }))[0], "medias");
  igual("jugada: repetir, y lo que falta calificar se dice", V(Object.assign({}, base, { tipo: "jugada", respondieron: 4, bien: 1, mal: 2, sin_calificar: 1 })),
    ["repetir", "🔁 Conviene repetir el tema la próxima clase.", "4 de 8 alumnos contestaron: 1 bien, 2 a revisar, 1 sin calificar."]);
  igual("jugada sin calificar: no adivina", V(Object.assign({}, base, { tipo: "jugada", respondieron: 2, sin_calificar: 2 }))[0], "falta");
  igual("nadie contestó", V(Object.assign({}, base, { respondieron: 0 }))[1], "Nadie contestó la pregunta de salida.");
}

async function pruebaCierre(browser) {
  console.log("\n=== Al cerrar, la pregunta de salida ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, {
    game_state: [fila()],
    class_attendance: [{ session_id: "c-viva", student_id: "u-ana" }, { session_id: "c-viva", student_id: "u-beto" }],
  });
  await page.waitForSelector("#clase-cerrar-btn:not(.hidden)", { timeout: 10000 });
  igual("antes de cerrar no se ve", await seVe(page, "#salida-caja"), false);
  await page.click("#clase-cerrar-btn");
  igual("al cerrar, se ofrece", await seVe(page, "#salida-caja"), true);
  igual("con sus dos preguntas", [await seVe(page, "#salida-termometro-btn"), await seVe(page, "#salida-jugada-btn")], [true, true]);

  await page.click("#salida-termometro-btn");
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "questions" && u.campos.de_salida), null, { timeout: 5000 });
  const q = await page.evaluate(() => window.__tablas.questions.find((x) => x.tipo === "opciones"));
  igual("el termómetro sale y queda marcado de salida", [q.prompt, q.de_salida, q.class_session_id], ["¿Entendiste lo que acabamos de ver?", true, "c-viva"]);
  await page.waitForFunction(() => !document.getElementById("salida-resultado").hidden, null, { timeout: 5000 });
  igual("todavía nadie contestó", await page.textContent("#salida-resultado"), "Nadie contestó la pregunta de salida.");

  await page.evaluate((id) => {
    const r = [{ id: "a1", question_id: id, student_id: "u-ana", opcion: 0, is_correct: null },
               { id: "a2", question_id: id, student_id: "u-beto", opcion: 2, is_correct: null }];
    window.__tablas.question_answers.push(...r);
    window.__cambioEnBase("question_answers", r[1], "INSERT");
  }, q.id);
  await page.waitForFunction(() => /medias/.test(document.getElementById("salida-resultado").textContent), null, { timeout: 5000 });
  igual("con las respuestas, dice cómo quedó", await page.textContent("#salida-resultado"),
    "🤔 Quedó a medias: conviene un repaso corto la próxima clase. 2 de 2 alumnos contestaron: 1 lo entendió, 1 no lo entendió.");

  await page.click("#salida-jugada-btn");
  await page.waitForFunction(() => window.__inserts.some((i) => i.tabla === "questions" && i.fila.de_salida), null, { timeout: 5000 });
  igual("«¿qué jugarías?» sale marcada de salida", await page.evaluate(() =>
    window.__inserts.filter((i) => i.tabla === "questions" && i.fila.de_salida).map((i) => [i.fila.fen, i.fila.expected_plies])), [[FEN, 1]]);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaClaseSiguiente(browser) {
  console.log("\n=== En la clase siguiente, se le recuerda al profe ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, {
    game_state: [fila()],
    class_sessions: [
      { id: "c-vieja", created_by: "u-profe", title: "Finales de torre", started_at: "2026-09-20T15:00:00Z", ended_at: "2026-09-20T16:00:00Z" },
      CLASE,
    ],
    class_attendance: [{ session_id: "c-vieja", student_id: "u-ana" }, { session_id: "c-vieja", student_id: "u-beto" }],
    questions: [{ id: "q-s", class_session_id: "c-vieja", created_by: "u-profe", prompt: "¿Entendiste?", tipo: "opciones",
      opciones: TERMOMETRO, de_salida: true, fen: FEN, created_at: "2026-09-20T15:55:00Z", closed_at: "2026-09-20T16:00:00Z" }],
    question_answers: [{ id: "a1", question_id: "q-s", student_id: "u-ana", opcion: 2, is_correct: null },
                       { id: "a2", question_id: "q-s", student_id: "u-beto", opcion: 2, is_correct: null }],
  });
  await page.waitForFunction(() => !document.getElementById("salida-pasada").hidden, null, { timeout: 10000 });
  igual("se ve arriba", await seVe(page, "#salida-pasada"), true);
  igual("y dice qué hacer con el tema", await page.textContent("#salida-pasada"),
    "📌 La clase pasada («Finales de torre»), la pregunta de salida dijo: 🔁 Conviene repetir el tema la próxima clase. 2 de 2 alumnos contestaron: 2 no lo entendieron.");
  igual("pidió la de ESA clase", await page.evaluate(() =>
    (window.__rpcs || []).filter((r) => r.n === "salida_de_la_clase").map((r) => r.args.p_clase)), ["c-vieja"]);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaAlumna(browser) {
  console.log("\n=== La alumna no ve nada de esto ===");
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, { game_state: [fila()] });
  await page.waitForSelector("#chessboard [data-square]", { timeout: 10000 });
  await page.waitForTimeout(400);
  igual("ni el recordatorio", await seVe(page, "#salida-pasada"), false);
  igual("ni lo pide", await page.evaluate(() => (window.__rpcs || []).filter((r) => r.n === "salida_de_la_clase").length), 0);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

(async () => {
  try { pruebaVeredicto(); } catch (e) { console.log("  ✗ se cayó: " + (e && e.stack || e)); fallos += 1; }
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaCierre(browser);
    await pruebaClaseSiguiente(browser);
    await pruebaAlumna(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: la pregunta de salida dice si el tema quedó, al cerrar y en la clase siguiente.");
  process.exit(fallos ? 1 : 0);
})();
