#!/usr/bin/env node
/* La clase juega votando, los equipos y el modo proyector (sesion.html).

   - La clase juega votando: cada turno de la clase es una pregunta con
     tiempo en la posición del tablero; al cerrarse se juega la más votada
     (con empate se sortea entre las empatadas, y se dice), y después contesta
     el motor (desde la computadora del profe) o el profe. Si nadie votó, no
     se juega nada y se ofrece seguir.
   - Los equipos (game_state.equipos): repartidos al azar y parejos, se pueden
     cambiar a mano, los ve toda la clase («tu equipo»), y el podio suma los
     puntos de cada uno.
   - El proyector (sesion.html?proyector=1): el tablero y lo que ve la clase;
     ni la barra del profe, ni las pestañas, ni el encabezado. Y no se mueve
     desde ahí.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-juega.js
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
const fila = (extra) => Object.assign({ id: 7, owner_id: "u-profe", fen: INICIO, moves: [], start_fen: INICIO, arrows: [], circles: [],
  active_player_color: "both", vista: null, comentarios: {}, elegido: null, pensar: null, encuesta: null, calentamiento: null, podio: null, equipos: null }, extra || {});
const preguntasHechas = (page) => page.evaluate(() => window.__inserts.filter((i) => i.tabla === "questions").map((i) => i.fila));
const jugadas = (page) => page.evaluate(() => window.__tablas.game_state[0].moves);

// Votos a la última pregunta abierta, como si los alumnos contestaran.
async function votar(page, votos) {
  await page.evaluate((v) => {
    const q = window.__tablas.questions[window.__tablas.questions.length - 1];
    v.forEach((m, i) => window.__tablas.question_answers.push({ id: "v" + Math.random(), question_id: q.id, student_id: "u-" + i, moves: [m], is_correct: null }));
  }, votos);
}

async function empezar(page, rival, color) {
  await page.evaluate(() => activateTeacherTab("preguntar"));
  await page.click("#partida-clase summary");
  await page.selectOption("#partida-rival", rival);
  await page.selectOption("#partida-color", color);
  await page.selectOption("#partida-segundos", "20");
  // El motor, sin Stockfish: contesta lo que diga la prueba.
  await page.evaluate(() => {
    window.__respuestaDelMotor = "e7e5";
    window.PracticeEngine = Object.assign({}, window.PracticeEngine, { preload() {}, getMove: async () => window.__respuestaDelMotor, jugadaDeRespaldo: () => null });
  });
  await page.click("#partida-empezar-btn");
}

async function pruebaContraElMotor(browser) {
  console.log("\n=== La clase contra el motor ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila()] });
  await empezar(page, "motor", "w");
  await page.waitForFunction(() => window.__inserts.some((i) => i.tabla === "questions"), null, { timeout: 5000 });
  const q1 = (await preguntasHechas(page))[0];
  igual("abre una pregunta con tiempo en la posición del tablero", [q1.fen, q1.expected_plies, q1.tiempo_limite, q1.prompt],
    [INICIO, 1, 20, "La clase contra el motor: ¿qué jugamos con las blancas?"]);
  igual("y dice que están votando", await page.textContent("#partida-estado"), "🗳️ La clase está votando (20 segundos).");
  await votar(page, ["e4", "e4", "d4"]);
  await page.click("#partida-jugar-ya-btn");
  await page.waitForFunction(() => window.__tablas.game_state[0].moves.length === 2, null, { timeout: 5000 });
  igual("se juega la más votada y contesta el motor", await jugadas(page), ["e4", "e5"]);
  igual("la pregunta de la votación se cerró", await page.evaluate(() => !!window.__tablas.questions[0].closed_at), true);
  igual("y se dice qué pasó", await page.textContent("#partida-ultima"), "La clase jugó e4 (2 de 3 votos). El motor contestó e5.");
  await page.waitForFunction(() => window.__inserts.filter((i) => i.tabla === "questions").length === 2, null, { timeout: 5000 });
  igual("vuelve a votar la clase, en la posición nueva", (await preguntasHechas(page))[1].fen.split(" ").slice(0, 2),
    ["rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR", "w"]);

  console.log("\n=== Empate, y nadie vota ===");
  await page.evaluate(() => { window.__respuestaDelMotor = "b8c6"; });
  await votar(page, ["Nf3", "Bc4"]);
  await page.click("#partida-jugar-ya-btn");
  await page.waitForFunction(() => window.__tablas.game_state[0].moves.length === 4, null, { timeout: 5000 });
  const tras = await jugadas(page);
  igual("con empate se juega una de las empatadas", ["Nf3", "Bc4"].includes(tras[2]), true);
  igual("y se dice que se sorteó", /hubo empate entre Ac4, Cf3 y se sorteó/.test(await page.textContent("#partida-ultima")), true);
  await page.waitForFunction(() => window.__inserts.filter((i) => i.tabla === "questions").length === 3, null, { timeout: 5000 });
  await page.click("#partida-jugar-ya-btn");
  await page.waitForFunction(() => /Nadie votó/.test(document.getElementById("partida-estado").textContent), null, { timeout: 5000 });
  igual("si nadie votó no se juega nada", (await jugadas(page)).length, 4);
  igual("y se ofrece seguir", await seVe(page, "#partida-reabrir-btn"), true);
  await page.click("#partida-reabrir-btn");
  await page.waitForFunction(() => window.__inserts.filter((i) => i.tabla === "questions").length === 4, null, { timeout: 5000 });
  igual("«Seguir» abre otra votación", await page.textContent("#partida-estado"), "🗳️ La clase está votando (20 segundos).");
  await page.click("#partida-terminar-btn");
  await page.waitForFunction(() => !document.getElementById("partida-en-curso").checkVisibility(), null, { timeout: 5000 });
  igual("«Terminar» cierra la votación abierta", await page.evaluate(() => window.__tablas.questions.every((q) => !!q.closed_at)), true);
  igual("y vuelve la configuración", await seVe(page, "#partida-config"), true);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaContraElProfe(browser) {
  console.log("\n=== La clase contra el profe ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila()] });
  await empezar(page, "profe", "b");
  await page.waitForFunction(() => /Te toca a ti/.test(document.getElementById("partida-estado").textContent), null, { timeout: 5000 });
  igual("empieza el profe si le toca a él", await page.textContent("#partida-estado"), "Te toca a ti con las blancas: juega en el tablero de la clase.");
  igual("y no se abre ninguna votación", (await preguntasHechas(page)).length, 0);
  await page.click('#chessboard [data-square="e2"]');
  await page.click('#chessboard [data-square="e4"]');
  await page.waitForFunction(() => window.__inserts.some((i) => i.tabla === "questions"), null, { timeout: 5000 });
  igual("al mover el profe, vota la clase", (await preguntasHechas(page))[0].prompt, "La clase contra tu profe: ¿qué jugamos con las negras?");
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaEquipos(browser) {
  console.log("\n=== Los equipos ===");
  const semilla = {
    game_state: [fila()],
    questions: [{ id: "q1", fen: INICIO, created_by: "u-profe", created_at: "1", closed_at: "x", expected_plies: 1, tipo: "jugada", class_session_id: "c-viva" }],
    question_answers: [{ id: "a1", question_id: "q1", student_id: "u-ana", moves: ["e4"], is_correct: true }],
  };
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, semilla);
  await page.evaluate(() => { activateTeacherTab("alumnos"); window.__entraAlumno(); window.__entraOtroAlumno(); });
  await page.click("#equipos-profe summary");
  await page.click("#equipos-armar-btn");
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state" && u.campos.equipos), null, { timeout: 5000 });
  const eq = (await page.evaluate(() => window.__updates.filter((u) => u.campos.equipos).pop().campos.equipos));
  igual("dos equipos parejos, con todos los conectados", [eq.lista.map((e) => e.nombre), eq.lista.map((e) => e.miembros.length),
    eq.lista.flatMap((e) => e.miembros.map((m) => m.id)).sort()], [["Azul", "Verde"], [1, 1], ["u-ana", "u-beto"]]);
  igual("toda la clase los ve, con el color escrito", await seVe(page, "#equipos-caja"), true);
  // Beto al equipo de Ana.
  const deAna = eq.lista.find((e) => e.miembros.some((m) => m.id === "u-ana")).nombre;
  await page.selectOption('select[aria-label="Equipo de Beto Mora"]', { label: "Equipo " + deAna });
  await page.waitForFunction((n) => {
    const e = window.__tablas.game_state[0].equipos;
    return e && e.lista.find((x) => x.nombre === n).miembros.length === 2;
  }, deAna, { timeout: 5000 });
  igual("se cambia a uno de equipo a mano", await page.evaluate((n) => window.__tablas.game_state[0].equipos.lista.map((e) => [e.nombre, e.miembros.length]), deAna),
    deAna === "Azul" ? [["Azul", 2], ["Verde", 0]] : [["Azul", 0], ["Verde", 2]]);

  await page.click("#puntos-caja summary");
  await page.click("#podio-mostrar-btn");
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state" && u.campos.podio), null, { timeout: 5000 });
  const podio = await page.evaluate(() => window.__updates.filter((u) => u.campos.podio).pop().campos.podio);
  // Ana acertó primera y a la primera una pregunta sin dificultad anotada: 25 × 1,5 = 38.
  igual("el podio suma los puntos de cada equipo (Ana: contestó y bien)", podio.equipos.map((e) => [e.nombre, e.puntos, e.puesto]),
    [[deAna, 38, 1], [deAna === "Azul" ? "Verde" : "Azul", 0, 2]]);
  igual("y se ve en el podio", await page.evaluate(() => [...document.querySelectorAll("#podio-equipos li")].map((l) => l.textContent)),
    ["🥇 1.º Equipo " + deAna + " — 38 puntos", "🥈 2.º Equipo " + (deAna === "Azul" ? "Verde" : "Azul") + " — 0 puntos"]);

  await page.click("#equipos-armar-btn");
  igual("armar otros pregunta antes", await page.getByRole("button", { name: "Armar equipos nuevos" }).isVisible(), true);
  await page.getByRole("button", { name: "Cancelar" }).click();
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaEquiposDelAlumno(browser) {
  console.log("\n=== El alumno ve su equipo ===");
  const equipos = { at: "x", lista: [
    { nombre: "Azul", color: "azul", miembros: [{ id: "u-beto", nombre: "Beto Mora" }] },
    { nombre: "Verde", color: "verde", miembros: [{ id: "u-ana", nombre: "Ana Rojas" }, { id: "u-luis", nombre: "Luis <b>Pérez</b>" }] }] };
  const podio = { at: "x", con_nombres: false, lineas: [{ id: "u-ana", nombre: null, puntos: 3, puesto: 1 }],
    equipos: [{ nombre: "Verde", color: "verde", puntos: 3, puesto: 1 }, { nombre: "Azul", color: "azul", puntos: 0, puesto: 2 }] };
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, { game_state: [fila({ equipos, podio })] });
  await page.waitForFunction(() => { const c = document.getElementById("equipos-caja"); return c && c.checkVisibility(); }, null, { timeout: 10000 });
  igual("los equipos, con el suyo marcado", await page.evaluate(() => [...document.querySelectorAll("#equipos-lineas li")].map((l) => [l.textContent, l.className])),
    [["Equipo Azul: Beto Mora", ""], ["Equipo Verde: Ana Rojas, Luis <b>Pérez</b> (tu equipo)", "font-bold"]]);
  igual("un nombre con HTML no crea nodos", await page.evaluate(() => document.querySelectorAll("#equipos-lineas b").length), 0);
  igual("en el podio, el de su equipo", await page.textContent("#podio-equipos"), "🥇 1.º Equipo Verde — 3 puntos (tu equipo)🥈 2.º Equipo Azul — 0 puntos");
  igual("sin los controles del profe", await seVe(page, "#equipos-profe"), false);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaProyector(browser) {
  console.log("\n=== El modo proyector ===");
  {
    const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila()] });
    igual("el profe tiene el botón", await seVe(page, "#proyector-btn"), true);
    const [ventana] = await Promise.all([ctx.waitForEvent("page"), page.click("#proyector-btn")]);
    igual("abre otra ventana en modo proyector", new URL(ventana.url()).search, "?proyector=1");
    await ventana.close();
    igual("sin errores en consola", errores, []);
    await ctx.close();
  }
  const podio = { at: "x", con_nombres: true, lineas: [{ id: "u-ana", nombre: "Ana Rojas", puntos: 3, puesto: 1 }] };
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila({ podio })] }, { ruta: "/sesion.html?proyector=1" });
  await page.waitForFunction(() => document.getElementById("podio-caja").checkVisibility(), null, { timeout: 10000 });
  igual("el tablero y lo que ve la clase", [await seVe(page, "#chessboard"), await seVe(page, "#podio-caja"), await seVe(page, "#turn-indicator")], [true, true, true]);
  igual("sin encabezado, pestañas, barra del profe ni chat", [await seVe(page, "#header"), await seVe(page, "#teacher-tabs-wrap"),
    await seVe(page, "#teacher-toolbar"), await seVe(page, "#status-banner"), await seVe(page, "#proyector-btn")], [false, false, false, false, false]);
  igual("ni el botón de quitar el podio", await seVe(page, "#podio-quitar-btn"), false);
  igual("con la salida a la vista", await page.getByRole("link", { name: "Salir del modo proyector" }).isVisible(), true);
  // En la clase, con esta pantalla (720 de alto), el tablero se topa en 420 px: en la tele ocupa el alto.
  igual("el tablero ocupa al menos tres cuartos del alto de la pantalla", await page.evaluate(() =>
    document.getElementById("chessboard").getBoundingClientRect().width >= 0.75 * innerHeight), true);
  await page.click('#chessboard [data-square="e2"]');
  await page.click('#chessboard [data-square="e4"]');
  await page.waitForTimeout(300);
  igual("desde el proyector no se mueve", await page.evaluate(() => window.__updates.filter((u) => u.tabla === "game_state" && u.campos.moves).length), 0);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaContraElMotor(browser);
    await pruebaContraElProfe(browser);
    await pruebaEquipos(browser);
    await pruebaEquiposDelAlumno(browser);
    await pruebaProyector(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: la clase vota, juega en equipos y se ve en el proyector.");
  process.exit(fallos ? 1 : 0);
})();
