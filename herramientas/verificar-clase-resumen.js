#!/usr/bin/env node
/* Lo que hizo cada alumno en la clase, al cerrarla.

   Las preguntas («¿Qué jugarías?») y las prácticas contra el motor no tenían
   clase: lo que contestó cada alumno estaba guardado pero no se podía decir
   al cerrar, ni en el registro. Ahora las liga a la clase abierta un trigger
   (ligar_a_la_clase_abierta) y las cuenta la base (resumen_de_la_clase,
   SECURITY INVOKER), comprobado impersonando roles: el profe ve a los suyos,
   otro profesor cero filas y la alumna solo la suya.

   Se comprueba en un navegador, con el doble de verificar-clase-registrada.js
   (que cuenta de sus propias tablas, como la base):

   - que el primer toque de «Cerrar la clase» pida el resumen de ESA clase y lo
     pinte ESCRITO: cuántas preguntas y prácticas, y por alumno «2 de 2
     contestadas: 1 bien, 1 sin calificar» y «1 partida: 1 ganada»;
   - que diga cuántas respuestas faltan por calificar, y que calificar una con
     el panel de cierre abierto lo vuelva a contar;
   - que una clase sin preguntas ni prácticas lo diga, en vez de una tabla de
     guiones;
   - que el cierre siga mandando el título y la nota como siempre.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-resumen.js
*/
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
const filasTabla = (page) => page.evaluate(() =>
  [...document.querySelectorAll("#clase-resumen tbody tr")].map((tr) => [...tr.children].map((c) => c.textContent)));

const HOY = new Date().toISOString();
function semilla() {
  return {
    questions: [
      { id: "q1", fen: "x", created_by: "u-profe", class_session_id: "c-viva", created_at: HOY, closed_at: HOY },
      { id: "q2", fen: "x", created_by: "u-profe", class_session_id: "c-viva", created_at: HOY, closed_at: null },
      // Una de otra clase no cuenta.
      { id: "q0", fen: "x", created_by: "u-profe", class_session_id: "c-vieja", created_at: HOY, closed_at: HOY },
    ],
    question_answers: [
      { id: "a1", question_id: "q1", student_id: "u-ana", moves: ["Ka2"], is_correct: true },
      { id: "a2", question_id: "q2", student_id: "u-ana", moves: ["Kb1"], is_correct: null },
      { id: "a0", question_id: "q0", student_id: "u-ana", moves: ["Kb1"], is_correct: false },
    ],
    practice_sessions: [{ id: "p1", fen: "x", level: "max", created_by: "u-profe", class_session_id: "c-viva", created_at: HOY, ended_at: HOY }],
    practice_games: [{ id: "g1", session_id: "p1", student_id: "u-ana", status: "checkmate_win", moves: [] }],
    class_attendance: [{ id: "at1", session_id: "c-viva", student_id: "u-ana" }],
  };
}

async function pruebaCierre(browser) {
  console.log("\n=== Al cerrar, lo que hizo cada alumno ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, semilla());
  await page.waitForSelector("#clase-cerrar-btn:not(.hidden)", { timeout: 10000 });
  igual("antes de cerrar no se ve", await seVe(page, "#clase-resumen"), false);
  await page.click("#clase-cerrar-btn");
  await page.waitForFunction(() => document.querySelectorAll("#clase-resumen tbody tr").length === 1, null, { timeout: 5000 });
  igual("pide el resumen de ESA clase", await page.evaluate(() =>
    (window.__rpcs || []).filter((r) => r.n === "resumen_de_la_clase").map((r) => r.args.p_clase)), ["c-viva"]);
  igual("se ve", await seVe(page, "#clase-resumen"), true);
  igual("el titular lo dice escrito", await page.textContent("#clase-resumen p"),
    "En esta clase: 2 preguntas y 1 partida de práctica. Queda 1 respuesta sin calificar.");
  igual("y por alumno", await filasTabla(page),
    [["Ana Rojas", "2 de 2 contestadas: 1 bien, 1 sin calificar", "1 partida: 1 ganada"]]);
  igual("la tabla dice qué es cada columna", await page.evaluate(() =>
    [...document.querySelectorAll("#clase-resumen thead th")].map((t) => t.scope)), ["col", "col", "col"]);

  // Califica la que faltaba con el cierre abierto: se vuelve a contar.
  await page.evaluate(() => setAnswerCorrect("a2", false));
  await page.waitForFunction(() => /1 mal/.test(document.getElementById("clase-resumen").textContent), null, { timeout: 5000 });
  igual("calificar la vuelve a contar", await filasTabla(page),
    [["Ana Rojas", "2 de 2 contestadas: 1 bien, 1 mal", "1 partida: 1 ganada"]]);
  igual("y ya no quedan sin calificar", /sin calificar/.test(await page.textContent("#clase-resumen p")), false);

  await page.fill("#clase-titulo", "Finales de torre");
  await page.click("#clase-cerrar-btn");
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "class_sessions" && u.campos.ended_at), null, { timeout: 5000 });
  igual("el cierre manda el título sobre esa clase", await page.evaluate(() => {
    const u = window.__updates.find((x) => x.tabla === "class_sessions" && x.campos.ended_at);
    return [u.campos.title, u.donde];
  }), ["Finales de torre", [["id", "c-viva"]]]);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaSinNada(browser) {
  console.log("\n=== Una clase sin preguntas ni prácticas ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { class_attendance: [{ id: "at1", session_id: "c-viva", student_id: "u-ana" }] });
  await page.waitForSelector("#clase-cerrar-btn:not(.hidden)", { timeout: 10000 });
  await page.click("#clase-cerrar-btn");
  await page.waitForFunction(() => /no se hicieron/.test(document.getElementById("clase-resumen").textContent), null, { timeout: 5000 });
  igual("lo dice", await page.textContent("#clase-resumen p"), "En esta clase no se hicieron preguntas ni prácticas contra el motor.");
  igual("sin una tabla de guiones", await page.evaluate(() => !!document.querySelector("#clase-resumen table")), false);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaCierre(browser);
    await pruebaSinNada(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: al cerrar la clase se ve lo que hizo cada alumno.");
  process.exit(fallos ? 1 : 0);
})();
