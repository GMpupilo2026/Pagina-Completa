#!/usr/bin/env node
/* El repaso personal de una clase (js/repaso-clase.js).

   Al cerrar la clase, el profe le manda a cada alumno que vino UNA tarea con
   un renglón que abre repasar-clases.html?repaso=<clase>: ahí cada uno ve
   solo las preguntas de jugada que a ÉL no le salieron (las falló, no las
   contestó, o contestó otra cosa que el motor sin que el profe calificara) y
   las resuelve en el tablero, tocando o escribiendo. Al resolverlas todas, el
   renglón de la tarea se marca solo.

   Se comprueba:
   - la regla (RepasoClase.pendientes), con cada caso;
   - que desde la clase se mande la tarea solo a quien le quedó algo, con el
     enlace de su repaso, y que no se mande dos veces;
   - que el alumno vea las suyas, que una jugada equivocada no cuente, que la
     buena sí (también escrita, en Modo Adaptado), y que al terminar se marque
     el renglón de SU tarea.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-repaso-personal.js
*/
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");
const doble = require("./lib/doble-entreno");

const { CHROME } = R;
const INICIO = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const TRAS_E5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2";
const PASILLO = "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

function laRegla() {
  console.log("\n=== La regla: qué entra en el repaso de cada uno ===");
  global.window = {};
  global.Chess = require("chess.js").Chess;
  eval(fs.readFileSync(path.join(__dirname, "..", "js", "repaso-clase.js"), "utf8"));
  const RC = global.window.RepasoClase;
  const q = (id, extra) => Object.assign({ id, fen: INICIO, tipo: "jugada", para_alumno: null, closed_at: "x", created_at: id }, extra || {});
  const preguntas = [
    q("q1"), q("q2"), q("q3"), q("q4"), q("q5"),
    q("q6", { tipo: "opciones" }),                 // el termómetro: no
    q("q7", { closed_at: null }),                  // abierta: no
    q("q8", { para_alumno: "u-beto" }),            // dirigida a otro: no
    q("q9"),                                       // sin respuesta del motor: no
    q("qa"),                                       // la primera como el motor, pero el profe la marcó mal
  ];
  const motor = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "qa"].map((id) => ({ question_id: id, answer: { moves: ["e4", "e5"] } }));
  const respuestas = [
    { question_id: "q1", student_id: "u-ana", moves: ["d4"], is_correct: false },   // la falló
    { question_id: "q2", student_id: "u-ana", moves: ["e4"], is_correct: true },    // bien
    { question_id: "q3", student_id: "u-ana", moves: ["e2e4"], is_correct: null },  // la del motor, sin calificar
    { question_id: "q4", student_id: "u-ana", moves: ["Nf3"], is_correct: null },   // otra, sin calificar
    // q5: no la contestó
    { question_id: "qa", student_id: "u-ana", moves: ["e4", "d6"], is_correct: false },
  ];
  igual("las que falló, las que no contestó y otra jugada sin calificar",
    RC.pendientes(preguntas, respuestas, motor, "u-ana").map((x) => x.pregunta.id), ["q1", "q4", "q5", "qa"]);
  igual("la dirigida entra solo para quien era",
    RC.pendientes(preguntas, [], motor, "u-beto").map((x) => x.pregunta.id), ["q1", "q2", "q3", "q4", "q5", "q8", "qa"]);
  const muchas = Array.from({ length: 14 }, (_, i) => q("m" + String(i).padStart(2, "0")));
  igual("como mucho " + RC.MAXIMO + ", en el orden de la clase",
    RC.pendientes(muchas, [], muchas.map((x) => ({ question_id: x.id, answer: { moves: ["e4"] } })), "u-ana").map((x) => x.pregunta.id).slice(-1), ["m09"]);
  igual("el enlace del repaso", RC.href("c 1"), "repasar-clases.html?repaso=c%201");
}

async function desdeLaClase(browser, yaTienen) {
  console.log("\n=== Al cerrar: la tarea, solo a quien le quedó algo" + (yaTienen ? " (y no dos veces)" : "") + " ===");
  const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };
  const semilla = {
    class_attendance: [{ session_id: "c-viva", student_id: "u-ana" }, { session_id: "c-viva", student_id: "u-beto" }],
    questions: [
      { id: "q1", fen: INICIO, tipo: "jugada", class_session_id: "c-viva", closed_at: "x", created_at: "1", created_by: "u-profe" },
      { id: "q2", fen: INICIO, tipo: "opciones", class_session_id: "c-viva", closed_at: "x", created_at: "2", created_by: "u-profe" },
    ],
    question_engine_answers: [{ question_id: "q1", answer: { moves: ["e4", "e5"] } }],
    question_answers: [
      { question_id: "q1", student_id: "u-ana", moves: ["d4"], is_correct: false },
      { question_id: "q1", student_id: "u-beto", moves: ["e4"], is_correct: null },
    ],
    tarea_items: yaTienen ? [{ material_href: "repasar-clases.html?repaso=c-viva", tareas: { alumno_id: "u-ana" } }] : [],
  };
  const { page, ctx, errores } = await R.abrir(browser, "u-profe", CLASE, semilla);
  await page.evaluate(() => { ultimaClaseCerrada = "c-viva"; document.getElementById("clase-despues").hidden = false; });
  await page.getByRole("button", { name: "Mandarle a cada uno su repaso: las preguntas que falló o no contestó" }).click();
  await page.waitForFunction(() => !/Buscando/.test(document.getElementById("repaso-personal-resultado").textContent), null, { timeout: 5000 });
  const tareas = await page.evaluate(() => (window.__rpcs || []).filter((r) => r.n === "crear_tarea").map((r) => r.args));
  if (yaTienen) {
    igual("no se manda otra", tareas.length, 0);
    igual("y lo dice", await page.textContent("#repaso-personal-resultado"), "Ya les mandaste el repaso de esta clase.");
  } else {
    igual("una tarea, solo para Ana (Beto jugó la del motor)", tareas.map((t) => t.p_alumnos), [["u-ana"]]);
    igual("con un renglón que abre su repaso", tareas[0].p_items.map((i) => [i.material_href, i.meta_tipo, i.material_tipo]),
      [["repasar-clases.html?repaso=c-viva", "completar", "herramienta"]]);
    igual("vence en una semana", Math.round((new Date(tareas[0].p_vence) - Date.now()) / 86400000), 7);
    igual("y dice a quién y cuántas", await page.textContent("#repaso-personal-resultado"),
      "📌 Se mandó el repaso a 1 alumno: Ana Rojas (1 pregunta). 1 no tenía nada pendiente.");
  }
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function elAlumno(browser) {
  console.log("\n=== El alumno resuelve su repaso ===");
  const HREF = "repasar-clases.html?repaso=c4";
  const tablas = {
    saved_games: [],
    class_sessions: [{ id: "c4", title: "Finales", started_at: "2026-09-25T22:00:00Z" }],
    questions: [
      { id: "q1", class_session_id: "c4", fen: TRAS_E5, prompt: "¿Qué jugarías?", tipo: "jugada", para_alumno: null, closed_at: "x", created_at: "1" },
      { id: "q2", class_session_id: "c4", fen: PASILLO, prompt: "Mate en uno", tipo: "jugada", para_alumno: null, closed_at: "x", created_at: "2" },
      { id: "q3", class_session_id: "c4", fen: INICIO, prompt: "La que le salió", tipo: "jugada", para_alumno: null, closed_at: "x", created_at: "3" },
    ],
    question_engine_answers: [
      { question_id: "q1", answer: { moves: ["Nf3", "Nc6"] } },
      { question_id: "q2", answer: { moves: ["Rd8#"] } },
      { question_id: "q3", answer: { moves: ["e4"] } },
    ],
    question_answers: [
      { question_id: "q1", student_id: "u-ana", moves: ["d4"], is_correct: false },
      { question_id: "q3", student_id: "u-ana", moves: ["e4"], is_correct: true },
    ],
    tarea_items: [
      { id: "i1", tarea_id: "t1", material_href: HREF, completada_at: null },
      // Otra tarea suya con el mismo repaso: se marca la que trajo hasta acá.
      { id: "i2", tarea_id: "t2", material_href: HREF, completada_at: null },
      { id: "i9", tarea_id: "t9", material_href: "repasar-clases.html?repaso=c9", completada_at: null },
    ],
  };
  const { page, ctx, errores } = await doble.abrir(browser, "/" + HREF + "&tarea=t1", tablas);
  await page.waitForFunction(() => { const e = document.getElementById("repaso-ejercicio"); return e && e.checkVisibility(); }, null, { timeout: 15000 });
  igual("se ve, con cuántas le quedaron", [await page.textContent("#repaso-intro"), await page.textContent("#repaso-progreso")],
    ["2 preguntas de la clase no te salieron: resuélvelas otra vez en el tablero.", "Pregunta 1 de 2"]);
  igual("la primera es la que falló", await page.textContent("#repaso-pregunta"), "¿Qué jugarías?");
  igual("su tablero, de verdad en pantalla", await page.evaluate(() => {
    const t = document.getElementById("repaso-board");
    return [t.querySelectorAll("[data-square]").length, t.checkVisibility()];
  }), [64, true]);
  const jugar = async (de, a) => { await page.click('#repaso-board [data-square="' + de + '"]'); await page.click('#repaso-board [data-square="' + a + '"]'); };
  await jugar("d2", "d4");
  igual("una equivocada no cuenta", await page.textContent("#repaso-msg"), "Respuesta incorrecta: d4 no es la jugada que buscamos. Inténtalo otra vez.");
  igual("y todavía no se marca nada", await page.evaluate(() => (window.__updates || []).length), 0);
  await page.click("#repaso-otra-btn");
  await jugar("g1", "f3");
  igual("la buena", await page.textContent("#repaso-msg"), "✅ ¡Bien! Cf3 es la jugada.");
  await page.click("#repaso-siguiente-btn");
  igual("pasa a la otra", [await page.textContent("#repaso-progreso"), await page.textContent("#repaso-pregunta")], ["Pregunta 2 de 2", "Mate en uno"]);
  await page.evaluate(() => document.documentElement.classList.add("adaptive-mode"));
  const inp = page.locator("#repaso-cmd .cc-input");
  await inp.fill("Td8");
  await inp.press("Enter");
  await page.waitForFunction(() => /Bien/.test(document.getElementById("repaso-msg").textContent), null, { timeout: 5000 });
  igual("escrita también vale", await page.textContent("#repaso-msg"), "✅ ¡Bien! Td8# es la jugada.");
  await page.waitForFunction(() => (window.__updates || []).length > 0, null, { timeout: 5000 });
  igual("al terminar lo dice", await page.textContent("#repaso-fin"), "🎉 Terminaste tu repaso: resolviste todas las preguntas que te habían quedado.");
  const u = await page.evaluate(() => window.__updates.map((x) => [x.tabla, !!x.campos.completada_at, x.filas]));
  igual("y marca el renglón de SU tarea, y solo ese", u, [["tarea_items", true, 1]]);
  igual("sin errores en la página", errores, []);
  await ctx.close();
}

/* Lo que vuelve: la que resolvió DESPUÉS de ver la respuesta vuelve a la
   semana (cola clase_repaso_v1 de js/repaso-fallados.js, que viaja con la
   cuenta), y se avisa en esta página y en el hub de Entrenamiento. */
const CLASE_C4 = {
  saved_games: [],
  class_sessions: [{ id: "c4", title: "Finales", started_at: "2026-09-25T22:00:00Z" }],
  questions: [{ id: "q1", class_session_id: "c4", fen: TRAS_E5, prompt: "¿Qué jugarías?", tipo: "jugada", para_alumno: null, closed_at: "x", created_at: "1" }],
  question_engine_answers: [{ question_id: "q1", answer: { moves: ["Nf3", "Nc6"] } }],
  question_answers: [{ question_id: "q1", student_id: "u-ana", moves: ["d4"], is_correct: false }],
  tarea_items: [],
};
const cola = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("clase_repaso_v1") || "{}"));
const hoyYEn = (page, dias) => page.evaluate((d) => [RepasoEspaciado.hoy(), RepasoEspaciado.sumarDias(RepasoEspaciado.hoy(), d)], dias);
const jugarEn = (page) => async (de, a) => { await page.click('#repaso-board [data-square="' + de + '"]'); await page.click('#repaso-board [data-square="' + a + '"]'); };

async function loQueVuelve(browser) {
  console.log("\n=== Lo que vio la respuesta vuelve a la semana ===");
  {
    const { page, ctx, errores } = await doble.abrir(browser, "/repasar-clases.html?repaso=c4", CLASE_C4);
    await page.waitForFunction(() => { const e = document.getElementById("repaso-ejercicio"); return e && e.checkVisibility(); }, null, { timeout: 15000 });
    igual("la cola viaja con la cuenta (está en las claves de ProgresoUsuario)", await page.evaluate(() => ProgresoUsuario.claves().some((c) => c.clave === "clase_repaso_v1")), true);
    await page.click("#repaso-ver-btn");
    igual("al ver la respuesta, se le dice que vuelve", /en una semana te vuelve a salir/.test(await page.textContent("#repaso-msg")), true);
    const [, enSiete] = await hoyYEn(page, 7);
    let c = await cola(page);
    igual("y entra a la cola para dentro de 7 días, con la pregunta guardada",
      [c.q1 && c.q1.vence, c.q1 && c.q1.fen, c.q1 && c.q1.jugada, c.q1 && c.q1.prompt, c.q1 && c.q1.clase],
      [enSiete, TRAS_E5, "Nf3", "¿Qué jugarías?", "Finales del " + await page.evaluate(() => fechaCR("2026-09-25T22:00:00Z"))]);
    await page.click("#repaso-otra-btn");
    await jugarEn(page)("g1", "f3");
    c = await cola(page);
    igual("resolverla recién vista no la saca: sigue para dentro de 7 días", [c.q1.vence, !!c.q1.fuera], [enSiete, false]);
    igual("hoy no se avisa nada (todavía no vuelve)", await page.evaluate(() => document.getElementById("vuelven-aviso").checkVisibility()), false);
    // Vuelve a abrir el repaso de esa clase (la tarea) y ahora la resuelve limpia:
    // eso tampoco prueba nada, la tiene fresca. La semana no se mueve.
    await page.reload();
    await page.waitForFunction(() => { const e = document.getElementById("repaso-ejercicio"); return e && e.checkVisibility(); }, null, { timeout: 15000 });
    await jugarEn(page)("g1", "f3");
    c = await cola(page);
    igual("resolverla limpia en el repaso de la clase tampoco la adelanta", [c.q1.vence, c.q1.limpiosSeguidos], [enSiete, 0]);
    igual("sin errores en la página", errores, []);
    await ctx.close();
  }
  // Una semana después: la ficha vencida, tal como la dejó la página.
  const vencida = (extra) => JSON.stringify({ q1: Object.assign({ facilidad: 2.35, intervalo: 7, repasos: 1, fallos: 0, vence: "2026-01-01", ultimo: null,
    fen: TRAS_E5, jugada: "Nf3", prompt: "¿Qué jugarías?", clase: "Finales del 25 de septiembre", limpiosSeguidos: 0, fuera: false }, extra || {}) });
  {
    // Solo en la cuenta (se vio la respuesta en OTRO aparato): se trae antes de contar.
    const { page, ctx, errores } = await doble.abrir(browser, "/repasar-clases.html", { saved_games: [],
      training_state: [{ student_id: "u-ana", key: "clase_repaso_v1", value: { raw: vencida() }, updated_at: "2026-09-23T12:00:00Z" }] });
    await page.waitForFunction(() => document.getElementById("vuelven-aviso").checkVisibility(), null, { timeout: 15000 }).catch(() => {});
    igual("una semana después se avisa en Repasar mis clases, aunque la viera en otro aparato", [await page.evaluate(() => document.getElementById("vuelven-aviso").checkVisibility()),
      await page.textContent("#vuelven-enlace"), await page.getAttribute("#vuelven-enlace", "href")],
      [true, "🔁 Te vuelve 1 pregunta de tus clases", "repasar-clases.html?vuelven=1"]);
    igual("sin errores en la página", errores, []);
    await ctx.close();
  }
  {
    const { page, ctx, errores } = await doble.abrir(browser, "/repasar-clases.html?vuelven=1", { saved_games: [] }, { clase_repaso_v1: vencida() });
    await page.waitForFunction(() => { const e = document.getElementById("repaso-ejercicio"); return e && e.checkVisibility(); }, null, { timeout: 15000 });
    igual("se abre con su título y la clase de donde viene", [await page.textContent("#repaso-titulo"), await page.textContent("#repaso-pregunta")],
      ["🔁 Lo que vuelve de tus clases", "¿Qué jugarías? (Finales del 25 de septiembre)"]);
    igual("y el aviso no se repite arriba", await page.evaluate(() => document.getElementById("vuelven-aviso").checkVisibility()), false);
    await jugarEn(page)("d2", "d4");
    await page.click("#repaso-otra-btn");
    await jugarEn(page)("g1", "f3");
    const [hoy] = await hoyYEn(page, 0);
    const c = await cola(page);
    igual("con un error antes de la buena, vuelve hoy mismo (y empieza de cero)", [c.q1.vence, c.q1.repasos], [hoy, 0]);
    igual("al terminar lo dice, y que esa vuelve hoy", await page.textContent("#repaso-fin"), "🎉 Resolviste todas. Las que tuvieron un error te vuelven a salir hoy mismo, para que queden.");
    igual("y no toca ninguna tarea", await page.evaluate(() => (window.__updates || []).length), 0);
    igual("sin errores en la página", errores, []);
    await ctx.close();
  }
  {
    const { page, ctx, errores } = await doble.abrir(browser, "/repasar-clases.html?vuelven=1", { saved_games: [] }, { clase_repaso_v1: vencida() });
    await page.waitForFunction(() => { const e = document.getElementById("repaso-ejercicio"); return e && e.checkVisibility(); }, null, { timeout: 15000 });
    await jugarEn(page)("g1", "f3");
    const [hoy] = await hoyYEn(page, 0);
    const c = await cola(page);
    igual("limpia, avanza: ya no toca hoy, y suma a la racha", [c.q1.vence > hoy, c.q1.limpiosSeguidos], [true, 1]);
    igual("y al terminar: listo por hoy", await page.textContent("#repaso-fin"), "🎉 Listo por hoy: resolviste todas las preguntas que te volvían.");
    igual("sin errores en la página", errores, []);
    await ctx.close();
  }
  {
    const { page, ctx, errores } = await doble.abrir(browser, "/entreno/index.html", {}, { clase_repaso_v1: vencida() });
    await page.waitForFunction(() => /Te vuelve 1 pregunta de tus clases/.test(document.body.textContent), null, { timeout: 15000 }).catch(() => {});
    const enlace = await page.evaluate(() => { const a = [...document.querySelectorAll("a")].find((x) => /Te vuelve 1 pregunta de tus clases/.test(x.textContent)); return a ? [a.getAttribute("href"), a.checkVisibility()] : null; });
    igual("el hub de Entrenamiento también lo propone", enlace, ["../repasar-clases.html?vuelven=1", true]);
    igual("sin errores en la página", errores, []);
    await ctx.close();
  }
}

(async () => {
  laRegla();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await desdeLaClase(browser, false);
    await desdeLaClase(browser, true);
    await elAlumno(browser);
    await loQueVuelve(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: cada alumno repasa lo que no le salió.");
  process.exit(fallos ? 1 : 0);
})();
