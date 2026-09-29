#!/usr/bin/env node
/* El control remoto, la limpieza al cerrar, los avisos en voz, los votos
   como comentario, «Jugar votando» desde el plan y los puntos del mes
   (sesion.html y el panel del alumno).

   - Al cerrar la clase, lo que vive en game_state para ESA clase (mapa,
     calentamiento, podio, equipos, tiempo para pensar, turno) se quita: la
     clase siguiente no arranca con el podio de la anterior.
   - Lo que aparece para toda la clase se le dice en voz a quien usa lector de
     pantalla (#clase-voz), una vez por cambio y todo junto; al profe no.
   - Los votos de la clase quedan como comentario de la jugada votada
     (game_state.comentarios): van al PGN y a «Repasar mis clases».
   - «🗳️ Jugar votando» en una posición del plan la manda al tablero y empieza
     la partida desde ella, con la clase del lado que mueve.
   - El control remoto (sesion.html?control=1): el tablero y botones grandes;
     cada uno escribe lo mismo que su botón de siempre. Sigue lo que mira el
     profe, y lo que dice setStatus se lee en su panel.
   - Los puntos del mes: resumen_del_mes (la base suma las clases del mes) con
     la regla de js/puntos-clase.js; el profe ve a los suyos y el alumno, en
     su panel, lo suyo.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-remoto.js
*/
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");

const { abrir, CHROME } = R;
const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };
const INICIO = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const TRAS_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
const seVe = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!(el && el.checkVisibility()); }, sel);
const fila = (extra) => Object.assign({ id: 7, owner_id: "u-profe", fen: INICIO, moves: [], start_fen: INICIO, arrows: [], circles: [],
  active_player_color: "both", vista: null, comentarios: {}, elegido: null, pensar: null, encuesta: null, calentamiento: null, podio: null, equipos: null }, extra || {});
const EQUIPOS = { at: "e1", lista: [
  { nombre: "Azul", color: "azul", miembros: [{ id: "u-ana", nombre: "Ana Rojas" }, { id: "u-luis", nombre: "Luis Pérez" }] },
  { nombre: "Verde", color: "verde", miembros: [{ id: "u-beto", nombre: "Beto Mora" }] }] };
const PODIO = { at: "p1", con_nombres: false, lineas: [{ id: "u-beto", nombre: null, puntos: 5, puesto: 1 }, { id: "u-ana", nombre: null, puntos: 3, puesto: 2 }],
  equipos: [{ nombre: "Verde", color: "verde", puntos: 5, puesto: 1 }, { nombre: "Azul", color: "azul", puntos: 3, puesto: 2 }] };

async function pruebaLimpiarAlCerrar(browser) {
  console.log("\n=== Al cerrar, lo de la clase no pasa a la siguiente ===");
  const puesta = fila({
    arrows: [{ from: "e2", to: "e4", color: "verde" }], encuesta: { question_id: "q1", lineas: [{ jugada: "e4", cuantos: 2, color: "verde" }] },
    calentamiento: { at: "c1", fen: INICIO, solucion: ["e2e4"], titulo: null }, podio: PODIO, equipos: EQUIPOS,
    pensar: { at: new Date().toISOString(), segundos: 60, texto: null },
  });
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [puesta] });
  await page.waitForFunction(() => document.getElementById("podio-caja").checkVisibility(), null, { timeout: 10000 });
  igual("antes de cerrar se ven", [await seVe(page, "#podio-caja"), await seVe(page, "#equipos-caja"), await seVe(page, "#encuesta-caja")], [true, true, true]);
  await page.waitForSelector("#clase-cerrar-btn:not(.hidden)", { timeout: 10000 });
  await page.click("#clase-cerrar-btn");
  await page.click("#clase-cerrar-btn");
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state" && "equipos" in u.campos), null, { timeout: 5000 });
  const c = await page.evaluate(() => window.__updates.filter((u) => u.tabla === "game_state" && "equipos" in u.campos).pop().campos);
  igual("se quitan el mapa (con sus flechas), el calentamiento, el podio, los equipos, el tiempo y el turno",
    [c.encuesta, c.calentamiento, c.podio, c.equipos, c.pensar, c.elegido, c.arrows], [null, null, null, null, null, null, []]);
  igual("y la partida no se toca", "moves" in c, false);
  igual("ya no se ven", [await seVe(page, "#podio-caja"), await seVe(page, "#equipos-caja"), await seVe(page, "#encuesta-caja"),
    await seVe(page, "#calentamiento-caja"), await seVe(page, "#pensar-aviso-caja")], [false, false, false, false, false]);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaAvisosEnVoz(browser) {
  console.log("\n=== Lo que aparece se dice en voz ===");
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, { game_state: [fila()] });
  await page.waitForFunction(() => document.getElementById("chessboard").children.length > 0, null, { timeout: 10000 });
  igual("sin nada puesto, no dice nada", await page.textContent("#clase-voz"), "");
  await page.evaluate((f) => window.__cambioEnBase("game_state", f), fila({ equipos: EQUIPOS, podio: PODIO,
    arrows: [{ from: "e2", to: "e4", color: "verde" }], encuesta: { question_id: "q1", lineas: [{ jugada: "Nf3", cuantos: 3, color: "verde" }] },
    calentamiento: { at: "c1", fen: INICIO, solucion: ["e2e4"], titulo: "mate en 1" } }));
  await page.waitForFunction(() => document.getElementById("clase-voz").textContent.length > 0, null, { timeout: 3000 });
  const dicho = await page.textContent("#clase-voz");
  igual("el mapa, con la jugada dicha y el color escrito", /pasó al tablero lo que jugó la clase: .*3 alumnos \(flecha verde\)\./.test(dicho), true);
  igual("el calentamiento", /posición de calentamiento: mate en 1\. Resuélvela en tu tablero/.test(dicho), true);
  igual("su equipo, con quién", /Estás en el equipo Azul, con Luis Pérez\./.test(dicho), true);
  igual("y el podio, con su lugar", /mostró el podio de la clase\. Va primero el equipo Verde, con 5 puntos\. Tú: 2\.º lugar con 3 puntos\./.test(dicho), true);
  await page.evaluate(() => { document.getElementById("clase-voz").textContent = ""; });
  await page.evaluate((f) => window.__cambioEnBase("game_state", f), fila({ equipos: EQUIPOS, podio: PODIO,
    arrows: [{ from: "e2", to: "e4", color: "verde" }], encuesta: { question_id: "q1", lineas: [{ jugada: "Nf3", cuantos: 3, color: "verde" }] },
    calentamiento: { at: "c1", fen: INICIO, solucion: ["e2e4"], titulo: "mate en 1" } }));
  await page.waitForTimeout(300);
  igual("el mismo eco no lo repite", await page.textContent("#clase-voz"), "");
  igual("sin errores en consola", errores, []);
  await ctx.close();

  const p = await abrir(browser, "u-profe", CLASE, { game_state: [fila({ podio: PODIO, equipos: EQUIPOS })] });
  await p.page.waitForFunction(() => document.getElementById("podio-caja").checkVisibility(), null, { timeout: 10000 });
  await p.page.waitForTimeout(300);
  igual("al profe no se le dice: es él quien lo pone", await p.page.textContent("#clase-voz"), "");
  await p.ctx.close();
}

async function pruebaVotosYPlan(browser) {
  console.log("\n=== Los votos, como comentario; «Jugar votando» desde el plan ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, {
    game_state: [fila()],
    planes_clase: [{ id: "pl-1", profesor_id: "u-profe", titulo: "Aperturas", notas: null, created_at: "1" }],
    plan_items: [{ id: "it-1", plan_id: "pl-1", orden: 0, tipo: "posicion", titulo: "Tras 1. e4", fen: TRAS_E4, pregunta: null, nota: null }],
  });
  await page.evaluate(() => {
    window.PracticeEngine = Object.assign({}, window.PracticeEngine, { preload() {}, getMove: async () => "g1f3", jugadaDeRespaldo: () => null });
    activateTeacherTab("plan");
  });
  await page.selectOption("#plan-select", "pl-1");
  await page.waitForSelector("#plan-items li[data-plan-item]", { timeout: 5000 });
  await page.locator("#plan-items").getByRole("button", { name: "🗳️ Jugar votando" }).click();
  await page.waitForFunction(() => window.__inserts.some((i) => i.tabla === "questions"), null, { timeout: 5000 });
  const q = await page.evaluate(() => window.__inserts.filter((i) => i.tabla === "questions")[0].fila);
  igual("manda la posición y la clase juega con las que mueven (negras)", [q.fen, q.prompt], [TRAS_E4, "La clase contra el motor: ¿qué jugamos con las negras?"]);
  igual("en la pestaña Preguntar, con la partida en curso", [await seVe(page, "#partida-en-curso")], [true]);
  await page.evaluate(() => {
    const q = window.__tablas.questions[window.__tablas.questions.length - 1];
    ["e7e5", "e5", "c5"].forEach((m, i) => window.__tablas.question_answers.push({ id: "v" + i, question_id: q.id, student_id: "u-" + i, moves: [m], is_correct: null }));
  });
  await page.click("#partida-jugar-ya-btn");
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state" && u.campos.comentarios && Object.keys(u.campos.comentarios).length), null, { timeout: 5000 });
  const com = await page.evaluate(() => window.__updates.filter((u) => u.tabla === "game_state" && u.campos.comentarios).pop().campos.comentarios);
  igual("los votos quedan como comentario de la jugada votada", com, { e5: { nag: null, texto: "Votos de la clase: e5 2, c5 1 (3 votos)." } });
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaControlRemoto(browser) {
  console.log("\n=== El control remoto ===");
  {
    const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila()] });
    await page.click("#control-btn");
    igual("el profe ve la dirección para su celular", [await seVe(page, "#control-enlace"), await page.textContent("#control-enlace-url"),
      await page.getAttribute("#control-btn", "aria-expanded")], [true, "http://localhost:8777/sesion.html?control=1", "true"]);
    igual("en la clase de siempre, el panel del control no se ve", await seVe(page, "#control-remoto"), false);
    igual("sin errores en consola", errores, []);
    await ctx.close();
  }
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE,
    { game_state: [fila({ moves: ["e4", "e5", "Nf3"], podio: PODIO })], class_attendance: [] }, { ruta: "/sesion.html?control=1" });
  await page.waitForFunction(() => document.getElementById("control-remoto").checkVisibility(), null, { timeout: 10000 });
  igual("se ven el tablero, el panel y lo de la clase", [await seVe(page, "#chessboard"), await seVe(page, "#control-remoto"), await seVe(page, "#podio-caja")], [true, true, true]);
  igual("y no el resto de la página", [await seVe(page, "#header"), await seVe(page, "#teacher-tabs-wrap"), await seVe(page, "#status-banner"),
    await seVe(page, "#proyector-btn"), await seVe(page, "#control-btn")], [false, false, false, false, false]);
  await page.click("#control-anterior-btn");
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state" && u.campos.vista), null, { timeout: 5000 });
  igual("◀ lleva a la clase a la jugada anterior", await page.evaluate(() => window.__updates.filter((u) => u.campos.vista).pop().campos.vista.path), ["e4", "e5"]);
  await page.click("#control-pensar-btn");
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state" && u.campos.pensar), null, { timeout: 5000 });
  igual("⏳ pone un minuto para pensar", await page.evaluate(() => window.__updates.filter((u) => u.campos.pensar).pop().campos.pensar.segundos), 60);
  igual("y lo que pasó se lee en el panel", await page.textContent("#control-estado"), "⏳ 1 minuto para pensar: toda la clase ve la cuenta regresiva.");
  await page.click("#control-mapa-btn");
  igual("sin pregunta abierta, lo dice", await page.textContent("#control-estado"), "No hay una pregunta abierta para pasar su mapa.");
  // Otra ventana del profe muestra otra jugada: el control la sigue.
  await page.evaluate((f) => window.__cambioEnBase("game_state", f), fila({ moves: ["e4", "e5", "Nf3"], vista: { path: ["e4"], parent: null, root: 1 } }));
  await page.waitForTimeout(200);
  await page.click("#control-siguiente-btn");
  await page.waitForTimeout(300);
  // El último cambio de vista, también si es «en vivo» (null): sin seguir, ▶ iría de 2… e5 a la jugada en vivo.
  igual("sigue lo que mira el profe en la computadora (▶ desde 1. e4)", await page.evaluate(() => {
    const v = window.__updates.filter((u) => u.tabla === "game_state" && "vista" in u.campos).pop().campos.vista;
    return v && v.path;
  }), ["e4", "e5"]);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaPuntosDelMes(browser) {
  console.log("\n=== Los puntos del mes ===");
  const hoy = new Date().toISOString();
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, {
    game_state: [fila()],
    clases_del_mes: [{ id: "c-antes", created_by: "u-profe", started_at: hoy, ended_at: hoy }, { id: "c-ajena", created_by: "u-otro", started_at: hoy, ended_at: hoy }],
    class_attendance: [{ session_id: "c-antes", student_id: "u-ana" }, { session_id: "c-viva", student_id: "u-ana" }, { session_id: "c-ajena", student_id: "u-ana" }],
    questions: [
      { id: "q1", class_session_id: "c-antes", fen: INICIO, tipo: "jugada", created_by: "u-profe", created_at: "1", closed_at: "x" },
      { id: "q2", class_session_id: "c-viva", fen: INICIO, tipo: "jugada", created_by: "u-profe", created_at: "2", closed_at: "x" },
      { id: "q3", class_session_id: "c-ajena", fen: INICIO, tipo: "jugada", created_by: "u-otro", created_at: "3", closed_at: "x" },
    ],
    question_answers: [
      { id: "a1", question_id: "q1", student_id: "u-ana", moves: ["e4"], is_correct: true },
      { id: "a2", question_id: "q2", student_id: "u-ana", moves: ["e4"], is_correct: false },
      { id: "a3", question_id: "q3", student_id: "u-ana", moves: ["e4"], is_correct: true },
    ],
  });
  await page.evaluate(() => activateTeacherTab("alumnos"));
  await page.click("#puntos-caja summary");
  await page.click("#puntos-mes-btn");
  await page.waitForFunction(() => /Ana/.test(document.getElementById("puntos-mes-lista").textContent), null, { timeout: 5000 });
  // Sus dos clases del mes (no la de otro profe): 2 contestadas (+2) y 1 correcta (+2).
  igual("suma las clases del mes del profe, con la misma regla", await page.evaluate(() =>
    [...document.querySelectorAll("#puntos-mes-lista li p")].map((p) => p.textContent)),
    ["🥇 1.º Ana Rojas — 4 puntos", "2 × pregunta contestada (+2) · 1 × respuesta correcta (+2)"]);
  igual("el botón dice que está abierto", await page.getAttribute("#puntos-mes-btn", "aria-expanded"), "true");

  console.log("\n--- La tarjeta del panel del alumno ---");
  const tarjeta = await page.evaluate(async () => {
    const caja = document.createElement("section");
    caja.hidden = true;
    document.body.appendChild(caja);
    const sbFalso = { rpc: async (n, a) => ({ data: n === "resumen_del_mes" && a.p_profesor === null
      ? [{ student_id: "u-ana", nombre: "Ana Rojas", clases: 3, respondidas: 4, correctas: 2, turnos_bien: 1 }] : [], error: null }) };
    await PuntosClase.pintarDelMesDelAlumno(sbFalso, caja);
    const r = [caja.checkVisibility(), caja.querySelector("h2").textContent, caja.querySelectorAll("p")[0].textContent];
    const vacia = document.createElement("section");
    document.body.appendChild(vacia);
    await PuntosClase.pintarDelMesDelAlumno({ rpc: async () => ({ data: [], error: null }) }, vacia);
    return r.concat([vacia.hidden]);
  });
  igual("con sus puntos del mes (pide solo lo suyo: sin profe)", tarjeta.slice(1, 3), ["🏆 Tus puntos de " + new Intl.DateTimeFormat("es-CR", { timeZone: "America/Costa_Rica", month: "long" }).format(new Date()), "10 puntos en 3 clases"]);
  igual("se ve, y sin clases este mes no aparece", [tarjeta[0], tarjeta[3]], [true, true]);
  const raiz = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(raiz, "clases.html"), "utf8"), js = fs.readFileSync(path.join(raiz, "js", "clases.js"), "utf8");
  igual("el panel la carga y la pinta", [/<section id="puntos-mes" hidden/.test(html), /<script src="js\/puntos-clase.js"><\/script>/.test(html),
    /PuntosClase\.pintarDelMesDelAlumno\(sb, document\.getElementById\("puntos-mes"\)\)/.test(js)], [true, true, true]);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaLimpiarAlCerrar(browser);
    await pruebaAvisosEnVoz(browser);
    await pruebaVotosYPlan(browser);
    await pruebaControlRemoto(browser);
    await pruebaPuntosDelMes(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: la clase se limpia al cerrar, avisa en voz, se maneja desde el celular y suma el mes.");
  process.exit(fallos ? 1 : 0);
})();
