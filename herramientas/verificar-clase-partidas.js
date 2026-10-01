#!/usr/bin/env node
/* La práctica con reloj, las partidas entre alumnos y el «a ciegas» de la
   clase en vivo.

   La base (migración partidas_y_reloj_de_la_clase), comprobada impersonando
   roles: el profe arma una partida entre dos alumnos suyos durante la clase y
   queda ligada a ella (el trigger ligar_a_la_clase_abierta, el mismo de las
   preguntas), y resumen_de_la_clase la cuenta para los dos, desde su lado,
   junto con la derrota por tiempo de la práctica.

   Aquí, con el doble de verificar-clase-registrada.js:

   - el emparejador (js/partidas-clase.js): parejas sin repetir a nadie, el
     que sobra se dice, y con el mismo azar sale lo mismo;
   - el reloj elegido viaja en la práctica (crearPractica, la única puerta);
   - «Emparejar» arma una partida por pareja con el ritmo elegido, desde la
     posición inicial o la del tablero, y la lista de la clase dice cómo va;
   - la alumna ve su reloj, al mover se le descuenta lo que pensó más el
     incremento, y al caer la partida termina por tiempo;
   - con las piezas ocultas, la alumna ve la partida escrita;
   - el resumen del cierre cuenta las partidas entre alumnos.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-partidas.js
*/
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");

const { abrir, CHROME } = R;
const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };
const INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const FINAL = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
const seVe = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!(el && el.checkVisibility()); }, sel);

function pruebaEmparejador() {
  console.log("\n=== El emparejador ===");
  const w = {};
  new Function("window", fs.readFileSync(path.join(__dirname, "..", "js", "partidas-clase.js"), "utf8"))(w);
  const P = w.PartidasClase;
  let semilla = 7;
  const azar = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
  const r = P.emparejar(["a", "b", "c", "d", "e"], azar);
  const todos = r.parejas.flatMap((p) => [p.blancas, p.negras]).concat([r.sobra]);
  igual("dos parejas y uno que sobra", [r.parejas.length, !!r.sobra], [2, true]);
  igual("nadie repetido ni perdido", todos.slice().sort(), ["a", "b", "c", "d", "e"]);
  semilla = 7;
  igual("con el mismo azar, lo mismo", P.emparejar(["a", "b", "c", "d", "e"], azar), r);
  igual("con un número par no sobra nadie", P.emparejar(["a", "b"]).sobra, null);
  igual("el estado de una partida, dicho", P.estado({ result: "black", white_id: "a", black_id: "b" }, (x) => x.toUpperCase()), "Ganó B (negras)");
  igual("el reloj", [P.reloj(61000), P.reloj(9100), P.reloj(-5)], ["1:01", "0:10", "0:00"]);
}

async function pruebaProfesor(browser) {
  console.log("\n=== El profe: práctica con reloj y partidas entre alumnos ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, {
    game_state: [{ id: 7, owner_id: "u-profe", fen: FINAL, moves: [], start_fen: FINAL, arrows: [], circles: [], active_player_color: "both", vista: null, comentarios: {} }],
    game_rooms: [
      { id: "g1", class_session_id: "c-viva", created_by: "u-profe", white_id: "u-ana", black_id: "u-beto", status: "finished", result: "white", moves: ["e4"], created_at: "1" },
    ],
  });
  await page.waitForFunction(() => document.querySelectorAll("#practice-reloj option").length > 0, null, { timeout: 10000 });
  await page.evaluate(() => activateTeacherTab("practicar"));
  await page.selectOption("#practice-reloj", "180");
  await page.selectOption("#practice-incremento", "2");
  await page.click("#start-practice-btn");
  await page.waitForFunction(() => window.__inserts.some((i) => i.tabla === "practice_sessions"), null, { timeout: 5000 });
  igual("la práctica lleva el reloj y el incremento", await page.evaluate(() => {
    const f = window.__inserts.filter((i) => i.tabla === "practice_sessions").pop().fila;
    return [f.reloj_segundos, f.incremento_segundos];
  }), [180, 2]);

  igual("la lista de la clase dice cómo va", await page.evaluate(() =>
    [...document.querySelectorAll("#partidas-lista li span")].map((s) => s.textContent)),
    ["Alumno (blancas) – Alumno (negras) · Ganó Alumno (blancas)"]);
  igual("con un enlace para mirarla", await page.getAttribute("#partidas-lista a", "href"), "estandar.html?room=g1");

  await page.click("#emparejar-btn");
  igual("con menos de dos conectados no arma nada", /al menos dos alumnos/.test(await page.textContent("#partidas-msg")), true);
  await page.evaluate(() => { window.__entraAlumno(); window.__entraOtroAlumno(); });
  await page.selectOption("#partidas-ritmo", "2");
  await page.check("#partidas-desde-tablero");
  await page.click("#emparejar-btn");
  await page.waitForFunction(() => window.__inserts.some((i) => i.tabla === "game_rooms"), null, { timeout: 5000 });
  const filas = await page.evaluate(() => window.__inserts.filter((i) => i.tabla === "game_rooms").pop().fila);
  igual("una partida para la pareja, estándar", [filas.length, filas[0].variant], [1, "estandar"]);
  igual("con los dos conectados", [filas[0].white_id, filas[0].black_id].sort(), ["u-ana", "u-beto"]);
  igual("el ritmo elegido (10 + 5)", [filas[0].initial_seconds, filas[0].increment_seconds, filas[0].white_time_left], [600, 5, 600]);
  igual("desde la posición del tablero", filas[0].fen, FINAL);
  igual("y lo dice", /Se armó 1 partida \(10 \+ 5\)/.test(await page.textContent("#partidas-msg")), true);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaAlumnaReloj(browser) {
  console.log("\n=== La alumna juega la práctica con reloj ===");
  const sesion = { id: "p1", fen: FINAL, level: "max", created_by: "u-profe", reloj_segundos: 180, incremento_segundos: 2,
    created_at: new Date().toISOString(), ended_at: null };
  let r = await abrir(browser, "u-ana", CLASE, {
    practice_sessions: [sesion],
    practice_games: [{ id: "pg1", session_id: "p1", student_id: "u-ana", fen: FINAL, moves: [], status: "playing", student_color: "w", attempts: 1, reloj_ms: 20000 }],
  });
  await r.page.waitForFunction(() => /Tu reloj/.test(document.getElementById("practice-reloj-alumno").textContent), null, { timeout: 10000 });
  igual("ve su reloj", /⏱️ Tu reloj: 0:(20|19)/.test(await r.page.textContent("#practice-reloj-alumno")), true);
  await r.page.waitForTimeout(1200);
  await r.page.evaluate(() => practiceBoard.jugar({ from: "a1", to: "a8" }));
  await r.page.waitForFunction(() => window.__updates.some((u) => u.tabla === "practice_games" && "reloj_ms" in u.campos), null, { timeout: 5000 });
  const reloj = await r.page.evaluate(() => window.__updates.filter((u) => u.tabla === "practice_games" && "reloj_ms" in u.campos).pop().campos);
  igual("al mover se descuenta lo que pensó y se suma el incremento", reloj.reloj_ms > 20000 && reloj.reloj_ms < 21000, true);
  igual("y la jugada va con él", reloj.moves, ["Ra8#"]);
  igual("sin errores en consola", r.errores, []);
  await r.ctx.close();

  r = await abrir(browser, "u-ana", CLASE, {
    practice_sessions: [sesion],
    practice_games: [{ id: "pg1", session_id: "p1", student_id: "u-ana", fen: FINAL, moves: [], status: "playing", student_color: "w", attempts: 1, reloj_ms: 1200 }],
  });
  await r.page.waitForFunction(() => window.__updates.some((u) => u.tabla === "practice_games" && u.campos.status === "timeout"), null, { timeout: 8000 });
  igual("al caer, termina por tiempo", await r.page.evaluate(() =>
    window.__updates.filter((u) => u.tabla === "practice_games" && u.campos.status === "timeout").pop().campos), { status: "timeout", reloj_ms: 0 });
  await r.page.waitForTimeout(300);
  igual("se le dice", await r.page.textContent("#practice-card-status"), "⏱️ Se quedó sin tiempo");
  igual("y en voz", await r.page.textContent("#practice-reloj-aviso"), "Se te acabó el tiempo.");
  igual("ya no mueve", await r.page.evaluate(() => practiceBoard.interactive), false);
  igual("sin errores en consola", r.errores, []);
  await r.ctx.close();
}

async function pruebaACiegas(browser) {
  console.log("\n=== A ciegas: la partida escrita ===");
  const fila = { id: 7, owner_id: "u-profe", fen: null, moves: ["e4", "e5", "Nf3"], start_fen: null, arrows: [], circles: [],
    active_player_color: "both", vista: null, comentarios: {}, pieces_hidden: true };
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, { game_state: [fila] });
  await page.waitForFunction(() => !document.getElementById("jugadas-a-ciegas").hidden, null, { timeout: 10000 });
  igual("con las piezas ocultas ve las jugadas", await page.textContent("#jugadas-a-ciegas"),
    "🙈 Piezas ocultas: síguela de memoria. Jugadas: 1. e4 e5 2. Cf3.");
  await page.evaluate((f) => window.__cambioEnBase("game_state", Object.assign({}, f, { pieces_hidden: false })), fila);
  igual("con las piezas a la vista, no", await seVe(page, "#jugadas-a-ciegas"), false);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaResumen(browser) {
  console.log("\n=== El resumen del cierre cuenta las partidas entre alumnos ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, {
    class_attendance: [{ session_id: "c-viva", student_id: "u-ana" }],
    game_rooms: [{ id: "g1", class_session_id: "c-viva", created_by: "u-profe", white_id: "u-ana", black_id: "u-beto", status: "finished", result: "black", moves: [] }],
  });
  await page.waitForSelector("#clase-cerrar-btn:not(.hidden)", { timeout: 10000 });
  await page.click("#clase-cerrar-btn");
  await page.waitForFunction(() => /partida entre alumnos/.test(document.getElementById("clase-resumen").textContent), null, { timeout: 5000 });
  igual("el titular la cuenta una vez", await page.textContent("#clase-resumen p"), "En esta clase: 1 partida entre alumnos.");
  igual("y la fila de Ana dice cómo le fue", await page.evaluate(() =>
    [...document.querySelectorAll("#clase-resumen tbody tr")].map((tr) => [...tr.children].map((c) => c.textContent)).find((f) => f[0] === "Ana Rojas")),
    ["Ana Rojas", "—", "—", "1 partida: 1 perdida"]);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

(async () => {
  try { pruebaEmparejador(); } catch (e) { console.log("  ✗ el emparejador se cayó: " + (e && e.stack || e)); fallos += 1; }
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaProfesor(browser);
    await pruebaAlumnaReloj(browser);
    await pruebaACiegas(browser);
    await pruebaResumen(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: práctica con reloj, partidas entre alumnos y a ciegas.");
  process.exit(fallos ? 1 : 0);
})();
