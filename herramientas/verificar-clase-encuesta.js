#!/usr/bin/env node
/* Tres cosas que ve toda la clase, en game_state: el mapa de jugadas de una
   pregunta, la posición de calentamiento y el podio de los puntos.

   - El mapa (game_state.encuesta): las jugadas más elegidas pasan al tablero
     de la clase como flechas, y debajo va ESCRITO qué jugada es cada color y
     cuántos la eligieron (el color nunca va solo). Sin nombres. Borrar las
     flechas o mandar otra posición lo quita.
   - El calentamiento (game_state.calentamiento): cada alumno lo juega en su
     propio tablero; la primera jugada se compara con la solución (la de
     Táctica viene en SAN y se guarda en UCI). Al resolverlo lo anuncia en la
     presencia, y el profe ve «1 de 2 conectados ya lo resolvieron». En Modo
     Adaptado se contesta escribiendo, por la misma puerta que el clic.
   - Los puntos (js/puntos-clase.js): se cuentan de resumen_de_la_clase con
     la regla escrita a la vista, y el podio (game_state.podio) va con o sin
     nombres. Sin nombres, cada alumno ve igual su propio lugar.

   Que solo el profe pueda poner las tres columnas lo revisa la base
   (protect_game_state_teacher_columns, comprobado impersonando), y sus
   formas, los CHECK con coalesce: una clave que falta no pasa.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-encuesta.js
*/
const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");

const { abrir, CHROME } = R;
const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };
const INICIO = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
// Mate de pasillo: Ra8#.
const PASILLO = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
const seVe = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!(el && el.checkVisibility()); }, sel);
const fila = (extra) => Object.assign({ id: 7, owner_id: "u-profe", fen: INICIO, moves: [], start_fen: INICIO, arrows: [], circles: [],
  active_player_color: "both", vista: null, comentarios: {}, elegido: null, pensar: null, encuesta: null, calentamiento: null, podio: null }, extra || {});
const cambiosDeGameState = (page) => page.evaluate(() => window.__updates.filter((u) => u.tabla === "game_state").map((u) => u.campos));
const pregunta = (extra) => Object.assign({ id: "q1", fen: INICIO, prompt: "¿Qué jugarías?", created_by: "u-profe", created_at: new Date().toISOString(),
  closed_at: null, expected_plies: 1, tipo: "jugada", class_session_id: "c-viva" }, extra || {});

async function pruebaElMapa(browser) {
  console.log("\n=== El mapa de jugadas pasa al tablero de la clase ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, {
    game_state: [fila()],
    questions: [pregunta()],
    question_answers: [
      { id: "a1", question_id: "q1", student_id: "u-ana", moves: ["e4"], is_correct: null },
      { id: "a2", question_id: "q1", student_id: "u-beto", moves: ["e4"], is_correct: null },
      { id: "a3", question_id: "q1", student_id: "u-luis", moves: ["Nf3"], is_correct: null },
    ],
  });
  await page.evaluate(() => activateTeacherTab("preguntar"));
  await page.waitForFunction(() => { const b = document.getElementById("encuesta-btn"); return b && b.checkVisibility(); }, null, { timeout: 10000 });
  await page.click("#encuesta-btn");
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state" && u.campos.encuesta), null, { timeout: 5000 });
  const c = (await cambiosDeGameState(page)).find((x) => x.encuesta);
  igual("las flechas van por orden de votos, cada una con su color", c.arrows,
    [{ from: "e2", to: "e4", color: "verde" }, { from: "g1", to: "f3", color: "azul" }]);
  igual("y el mapa dice qué jugada es cada una, sin nombres", c.encuesta,
    { question_id: "q1", lineas: [{ jugada: "e4", cuantos: 2, color: "verde" }, { jugada: "Nf3", cuantos: 1, color: "azul" }] });
  // Una punta por flecha (la del caballo dobla: son dos tramos y una punta).
  igual("el tablero de la clase dibuja las dos flechas, con su color", await page.evaluate(() =>
    [...document.querySelectorAll("#chessboard svg line[marker-end]")].map((l) => l.getAttribute("marker-end"))),
    ["url(#clases-arrowhead-verde)", "url(#clases-arrowhead-azul)"]);
  igual("la leyenda se ve, con el color y el dato escritos", [await seVe(page, "#encuesta-caja"),
    await page.evaluate(() => [...document.querySelectorAll("#encuesta-lineas li")].map((li) => li.textContent))],
    [true, ["Verde: e4 — 2 alumnos", "Azul: Nf3 — 1 alumno"]]);

  await page.click("#clear-marks-btn");
  await page.waitForFunction(() => window.__updates.filter((u) => u.tabla === "game_state").slice(-1)[0].campos.encuesta === null, null, { timeout: 5000 });
  igual("borrar las flechas quita también el mapa", await seVe(page, "#encuesta-caja"), false);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaElMapaConOtraPosicion(browser) {
  console.log("\n=== Si el tablero ya no tiene la posición, se pregunta antes ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, {
    game_state: [fila({ fen: PASILLO, start_fen: PASILLO, moves: [] })],
    questions: [pregunta()],
    question_answers: [{ id: "a1", question_id: "q1", student_id: "u-ana", moves: ["e4"], is_correct: null }],
  });
  await page.evaluate(() => activateTeacherTab("preguntar"));
  await page.waitForFunction(() => { const b = document.getElementById("encuesta-btn"); return b && b.checkVisibility(); }, null, { timeout: 10000 });
  await page.click("#encuesta-btn");
  await page.getByRole("button", { name: "Cancelar" }).click();
  await page.waitForTimeout(300);
  igual("con «Cancelar» no se toca el tablero", (await cambiosDeGameState(page)).length, 0);
  await page.click("#encuesta-btn");
  await page.getByRole("button", { name: "Mandar la posición y el mapa" }).click();
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state" && u.campos.encuesta), null, { timeout: 5000 });
  const cs = await cambiosDeGameState(page);
  igual("manda la posición de la pregunta y después el mapa", [cs[0].fen, cs[0].encuesta, cs[cs.length - 1].encuesta.lineas.length], [INICIO, null, 1]);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaElMapaDelAlumno(browser) {
  console.log("\n=== El alumno ve el mapa, sin el botón de quitarlo ===");
  const encuesta = { question_id: "q1", lineas: [{ jugada: "e4", cuantos: 3, color: "verde" }] };
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, {
    game_state: [fila({ arrows: [{ from: "e2", to: "e4", color: "verde" }], encuesta })],
  });
  await page.waitForFunction(() => { const c = document.getElementById("encuesta-caja"); return c && c.checkVisibility(); }, null, { timeout: 10000 });
  igual("la leyenda", await page.textContent("#encuesta-lineas"), "Verde: e4 — 3 alumnos");
  igual("sin «Quitar el mapa»", await seVe(page, "#encuesta-quitar-btn"), false);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaCalentamientoDelAlumno(browser) {
  console.log("\n=== El alumno resuelve el calentamiento en su tablero ===");
  const at = new Date().toISOString();
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, {
    game_state: [fila({ calentamiento: { at, fen: PASILLO, solucion: ["a1a8"], titulo: "mate en 1" } })],
  });
  await page.waitForFunction(() => { const c = document.getElementById("calentamiento-caja"); return c && c.checkVisibility(); }, null, { timeout: 10000 });
  igual("se ve, con su título y de quién es la jugada", [await page.textContent("#calentamiento-titulo"), await page.textContent("#calentamiento-turno")],
    [": mate en 1", "Juegan ⚪ Blancas: encuentra la mejor jugada."]);
  igual("su tablero, de verdad en pantalla", await page.evaluate(() => {
    const t = document.getElementById("calentamiento-tablero");
    return [t.querySelectorAll("[data-square]").length, t.checkVisibility()];
  }), [64, true]);
  const jugar = async (de, a) => { await page.click('#calentamiento-tablero [data-square="' + de + '"]'); await page.click('#calentamiento-tablero [data-square="' + a + '"]'); };
  await jugar("g1", "f1");
  igual("una jugada que no es: lo dice y deja intentarlo otra vez", [await page.textContent("#calentamiento-msg"), await seVe(page, "#calentamiento-otra-btn")],
    ["❌ Kf1 no es la mejor. Inténtalo otra vez.", true]);
  igual("y todavía no se anuncia como resuelto", await page.evaluate(() => (window.__tracks || []).some((t) => t.calentamiento)), false);
  await page.click("#calentamiento-otra-btn");
  await jugar("a1", "a8");
  igual("la buena", await page.textContent("#calentamiento-msg"), "✅ ¡Bien! Ra8# es la jugada.");
  igual("se anuncia en la presencia, con el «at» de este calentamiento",
    await page.evaluate(() => (window.__tracks || []).slice(-1)[0].calentamiento), at);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaCalentamientoEscrito(browser) {
  console.log("\n=== En Modo Adaptado, el calentamiento se contesta escribiendo ===");
  const at = new Date().toISOString();
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, {
    game_state: [fila({ calentamiento: { at, fen: PASILLO, solucion: ["a1a8"], titulo: null } })],
  });
  await page.waitForFunction(() => { const c = document.getElementById("calentamiento-caja"); return c && c.checkVisibility(); }, null, { timeout: 10000 });
  await page.evaluate(() => document.documentElement.classList.add("adaptive-mode"));
  igual("el cuadro para escribir se ve", await seVe(page, "#calentamiento-cmd .cc-caja"), true);
  const inp = page.locator("#calentamiento-cmd .cc-input");
  await inp.fill("Ta8");
  await inp.press("Enter");
  await page.waitForFunction(() => /Bien/.test(document.getElementById("calentamiento-msg").textContent), null, { timeout: 5000 });
  igual("la jugada escrita cuenta igual que el clic", await page.textContent("#calentamiento-msg"), "✅ ¡Bien! Ra8# es la jugada.");
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaCalentamientoDelProfe(browser) {
  console.log("\n=== El profe lo manda y ve cuántos lo resolvieron ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila()] });
  // La solución de Táctica viene en SAN: se guarda en UCI.
  await page.evaluate((f) => mandarCalentamiento(f, ["Ra8#"], "mate en 1"), PASILLO);
  const cal = (await cambiosDeGameState(page)).find((x) => x.calentamiento).calentamiento;
  igual("con la solución en UCI y su título", [cal.fen, cal.solucion, cal.titulo], [PASILLO, ["a1a8"], "mate en 1"]);
  igual("una posición imposible no se manda", await page.evaluate(() => mandarCalentamiento("8/8/8/8/8/8/8/8 w - - 0 1", null, null)), false);
  await page.evaluate((at) => {
    window.__ponerPresencia("u-ana", { email: "ana@x.cr", full_name: "Ana Rojas", role: "alumno", calentamiento: at });
    window.__ponerPresencia("u-beto", { email: "beto@x.cr", full_name: "Beto Mora", role: "alumno", calentamiento: null });
  }, cal.at);
  igual("la cuenta", await page.textContent("#calentamiento-cuenta"), "1 de 2 conectados ya lo resolvieron.");
  await page.click("#calentamiento-terminar-btn");
  await page.waitForFunction(() => window.__updates.filter((u) => u.tabla === "game_state").slice(-1)[0].campos.calentamiento === null, null, { timeout: 5000 });
  igual("«Terminar» lo quita", await seVe(page, "#calentamiento-caja"), false);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaLosPuntos(browser) {
  console.log("\n=== Los puntos de la clase y el podio ===");
  const semilla = {
    game_state: [fila()],
    class_attendance: [{ session_id: "c-viva", student_id: "u-ana" }],
    questions: [pregunta({ closed_at: new Date().toISOString() })],
    question_answers: [{ id: "a1", question_id: "q1", student_id: "u-ana", moves: ["e4"], is_correct: true }],
    clase_elegidos: [{ class_session_id: "c-viva", student_id: "u-ana", resultado: "bien" }],
  };
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, semilla);
  await page.evaluate(() => activateTeacherTab("alumnos"));
  await page.click("#puntos-caja summary");
  await page.waitForFunction(() => /Ana/.test(document.getElementById("puntos-lista").textContent), null, { timeout: 5000 });
  // 1 contestada + 2 correcta + 2 turno bien.
  igual("cuenta los puntos, con de dónde salen", await page.evaluate(() =>
    [...document.querySelectorAll("#puntos-lista li p")].map((p) => p.textContent)),
    ["🥇 1.º Ana Rojas — 5 puntos", "1 × pregunta contestada (+1) · 1 × respuesta correcta (+2) · 1 × turno de palabra bien (+2)"]);
  igual("la regla va escrita", /respuesta correcta: 2 puntos/.test(await page.textContent("#puntos-regla")), true);

  await page.uncheck("#podio-con-nombres");
  await page.click("#podio-mostrar-btn");
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state" && u.campos.podio), null, { timeout: 5000 });
  const podio = (await cambiosDeGameState(page)).find((x) => x.podio).podio;
  igual("sin nombres, el podio no lleva ninguno", [podio.con_nombres, podio.lineas], [false, [{ id: "u-ana", nombre: null, puntos: 5, puesto: 1 }]]);
  igual("y se ve también en la pantalla del profe", await page.textContent("#podio-lineas"), "🥇 1.º lugar — 5 puntos");
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaElPodioDelAlumno(browser) {
  console.log("\n=== El alumno ve el podio y su propio lugar ===");
  const podio = { at: new Date().toISOString(), con_nombres: false, lineas: [
    { id: "u-beto", nombre: null, puntos: 9, puesto: 1 }, { id: "u-luis", nombre: null, puntos: 7, puesto: 2 },
    { id: "u-eva", nombre: null, puntos: 7, puesto: 2 }, { id: "u-ana", nombre: null, puntos: 3, puesto: 4 }] };
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, { game_state: [fila({ podio })] });
  await page.waitForFunction(() => { const c = document.getElementById("podio-caja"); return c && c.checkVisibility(); }, null, { timeout: 10000 });
  igual("los tres primeros puestos, con los empates", await page.evaluate(() => [...document.querySelectorAll("#podio-lineas li")].map((l) => l.textContent)),
    ["🥇 1.º lugar — 9 puntos", "🥈 2.º lugar — 7 puntos", "🥈 2.º lugar — 7 puntos"]);
  igual("y su lugar, aunque no esté en el podio", await page.textContent("#podio-tu-lugar"), "Tú: 4.º lugar con 3 puntos.");
  igual("sin «Quitar el podio»", await seVe(page, "#podio-quitar-btn"), false);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaElMapa(browser);
    await pruebaElMapaConOtraPosicion(browser);
    await pruebaElMapaDelAlumno(browser);
    await pruebaCalentamientoDelAlumno(browser);
    await pruebaCalentamientoEscrito(browser);
    await pruebaCalentamientoDelProfe(browser);
    await pruebaLosPuntos(browser);
    await pruebaElPodioDelAlumno(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: el mapa, el calentamiento y el podio los ve toda la clase.");
  process.exit(fallos ? 1 : 0);
})();
