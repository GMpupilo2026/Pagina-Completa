#!/usr/bin/env node
/* El PGN de la clase y los comentarios de las jugadas.

   «💾 Guardar PGN» rehacía la línea principal desde la posición estándar, y
   eso perdía en silencio tres cosas: la posición de arranque (una clase que
   empezó en una posición de Táctica salía con el PGN VACÍO: chess.js
   rechazaba la primera jugada sin avisar), las variantes de variant_nodes y
   lo que el profe dijo de cada jugada.

   Se comprueba:

   - el armador (js/pgn-clase.js), sin navegador: variantes anidadas en su
     lugar, el número de jugada correcto al entrar y salir de una variante,
     los signos como NAG, los comentarios sin «}», la posición de arranque con
     SetUp/FEN y la numeración que sigue a la de ese FEN; y que el PGN se
     pueda volver a leer (chess.js 0.10.3 lee la línea principal si se le
     quitan las variantes y los comentarios);
   - en la clase, con el doble de verificar-clase-registrada.js: que el
     profe comente la jugada que está mirando (signo + texto), que viaje a
     game_state.comentarios, que la lista la marque, que el PGN guardado lleve
     la posición de arranque, la variante y el comentario, y que mandar una
     posición nueva vacíe los comentarios;
   - que la alumna vea el comentario debajo de su tablero cuando mira esa
     jugada, y no cuando mira otra, y que no tenga el editor.

   Que un alumno no pueda escribir los comentarios lo pone la base (el
   trigger protect_game_state_teacher_columns), comprobado impersonando roles.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-pgn.js
*/
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");
const { Chess } = require("chess.js");

const { abrir, CHROME } = R;

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

function cargarArmador() {
  const sandbox = { window: {} };
  new Function("window", fs.readFileSync(path.join(__dirname, "..", "js", "pgn-clase.js"), "utf8"))(sandbox.window);
  return sandbox.window.PgnClase;
}

const cuerpo = (pgn) => pgn.split("\n\n").slice(1).join(" ").replace(/\s+/g, " ").trim();
// Lo que chess.js puede leer: sin variantes, sin comentarios ni NAG.
function soloLinea(pgn) {
  let t = pgn.replace(/\{[^}]*\}/g, "").replace(/\$\d+/g, "");
  let prev;
  do { prev = t; t = t.replace(/\([^()]*\)/g, ""); } while (t !== prev);
  return t;
}

function pruebaArmador() {
  console.log("\n=== El armador del PGN ===");
  const P = cargarArmador();
  const pgn = P.armar({
    jugadas: ["e4", "e5", "Nf3", "Nc6", "Bb5"],
    variantes: [
      { id: "a", parent_id: null, root_ply: 1, san: "c5" },
      { id: "b", parent_id: "a", root_ply: 1, san: "Nf3" },
      { id: "c", parent_id: "b", root_ply: 1, san: "d6" },
      { id: "d", parent_id: "b", root_ply: 1, san: "Nc6" },
      { id: "e", parent_id: null, root_ply: 4, san: "Bc4" },
    ],
    comentarios: {
      "e4 e5": { nag: 1, texto: "Lo {clásico}" },
      "e4 c5 Nf3": { nag: 5, texto: "" },
      "e4 e5 Nf3 Nc6 Bb5": { nag: null, texto: "La española" },
      "d4": { nag: 2, texto: "de otra partida" },
    },
  });
  igual("variantes anidadas, números al entrar y al salir, NAG y comentario",
    cuerpo(pgn), "1. e4 e5 $1 {Lo clásico} (1... c5 2. Nf3 $5 d6 (2... Nc6)) 2. Nf3 Nc6 3. Bb5 {La española} (3. Bc4) *");
  igual("sin SetUp desde la posición inicial", /SetUp|FEN/.test(pgn), false);
  const g = new Chess();
  igual("chess.js lee la línea principal", g.load_pgn(soloLinea(pgn)) && g.history(), ["e4", "e5", "Nf3", "Nc6", "Bb5"]);
  igual("contar: solo los comentarios de jugadas que existen",
    P.contar({ jugadas: ["e4", "e5"], variantes: [], comentarios: { "e4 e5": { nag: 1 }, "d4": { nag: 2 }, "e4": { texto: " " } } }),
    { jugadas: 2, variantes: 0, comentarios: 1 });

  const fen = "6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 30";
  const pgn2 = P.armar({ inicio: fen, jugadas: ["h6", "Ra8+", "Kh7"],
    variantes: [{ id: "x", parent_id: null, root_ply: 0, san: "g6" }], encabezados: { Annotator: "Ana \"la profe\"" } });
  igual("con la posición de arranque", /\[SetUp "1"\]\n\[FEN "6k1\/5ppp\/8\/8\/8\/8\/5PPP\/R5K1 b - - 0 30"\]/.test(pgn2), true);
  igual("la numeración sigue la del FEN", cuerpo(pgn2), "30... h6 (30... g6) 31. Ra8+ Kh7 *");
  igual("las comillas del encabezado van escapadas", /\[Annotator "Ana \\"la profe\\""\]/.test(pgn2), true);
  const g2 = new Chess();
  igual("chess.js lo lee desde ese FEN", g2.load_pgn(soloLinea(pgn2)) && g2.history(), ["h6", "Ra8+", "Kh7"]);
  igual("caminos: las jugadas del árbol", [...P.caminos(["e4", "e5"], [{ id: "a", parent_id: null, root_ply: 1, san: "c5" }])],
    ["e4", "e4 e5", "e4 c5"]);
}

const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };
const INICIO = "6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 30";
function fila(extra) {
  return Object.assign({
    id: 7, owner_id: "u-profe", fen: null, moves: ["h6", "Ra8+", "Kh7"], start_fen: INICIO, last_move: "Kh7",
    arrows: [], circles: [], active_player_id: null, active_player_color: "both",
    shown_curso: null, shown_leccion: null, vista: null, comentarios: {}, updated_by: "u-profe",
    updated_at: new Date().toISOString(),
  }, extra || {});
}
const seVe = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!(el && el.checkVisibility()); }, sel);

async function pruebaProfesor(browser) {
  console.log("\n=== El profe comenta y guarda el PGN ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, {
    game_state: [fila()],
    variant_nodes: [{ id: "v1", teacher_id: "u-profe", parent_id: null, root_ply: 0, san: "g6", fen: "x", created_at: new Date().toISOString() }],
  });
  await page.waitForFunction(() => document.querySelectorAll("#move-list button").length === 4, null, { timeout: 10000 });
  igual("el editor se ve, sobre la última jugada", await seVe(page, "#comentar-jugada"), true);
  igual("y dice cuál es", await page.textContent("#comentar-jugada-cual"), "31… Rh7");

  // Comentar la jugada 31. Ra8+: se va a ella y se comenta.
  await page.click("#move-nav-prev");
  igual("al volver una jugada, comenta esa", await page.textContent("#comentar-jugada-cual"), "31. Ta8+");
  await page.click('#comentar-signos button[data-nag="1"]');
  igual("el signo elegido se marca", await page.getAttribute('#comentar-signos button[data-nag="1"]', "aria-pressed"), "true");
  await page.fill("#comentar-texto", "El mate del pasillo");
  await page.click("#comentar-guardar-btn");
  await page.waitForTimeout(200);
  igual("viaja a game_state.comentarios", await page.evaluate(() => {
    const u = window.__updates.filter((x) => x.tabla === "game_state" && "comentarios" in x.campos);
    return u.length ? u[u.length - 1].campos.comentarios : null;
  }), { "h6 Ra8+": { nag: 1, texto: "El mate del pasillo" } });
  igual("la lista marca la jugada", await page.evaluate(() =>
    [...document.querySelectorAll("#move-list button")].map((b) => b.textContent).includes("Ta8+! 💬")), true);

  // Guardar el PGN: posición de arranque, variante y comentario.
  await page.click("#move-nav-last");
  await page.click("#save-game-btn");
  await page.waitForFunction(() => window.__inserts.some((i) => i.tabla === "saved_games"), null, { timeout: 5000 });
  const pgn = await page.evaluate(() => window.__inserts.filter((i) => i.tabla === "saved_games").pop().fila.pgn);
  igual("el PGN arranca en la posición de la clase", pgn.includes('[FEN "' + INICIO + '"]'), true);
  igual("y lleva la variante y el comentario", cuerpo(pgn), "30... h6 (30... g6) 31. Ra8+ $1 {El mate del pasillo} 31... Kh7 *");
  igual("el aviso dice lo que lleva", /3 jugadas, 1 jugada de variante, 1 comentario/.test(await page.textContent("#status-banner")), true);

  // Mandar una posición nueva vacía los comentarios.
  await page.evaluate(() => aplicarPosicionEnClase("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"));
  igual("una posición nueva los vacía", await page.evaluate(() => {
    const u = window.__updates.filter((x) => x.tabla === "game_state" && "comentarios" in x.campos);
    return u[u.length - 1].campos.comentarios;
  }), {});
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaAlumna(browser) {
  console.log("\n=== La alumna ve el comentario de la jugada que se mira ===");
  const comentarios = { "h6 Ra8+": { nag: 1, texto: "El mate del pasillo" } };
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, {
    game_state: [fila({ comentarios, vista: { path: ["h6", "Ra8+"], parent: null, root: 2 } })],
  });
  await page.waitForFunction(() => !!document.querySelector('#chessboard [data-square="a8"]'), null, { timeout: 10000 });
  igual("lo ve debajo del tablero", await seVe(page, "#comentario-profe"), true);
  igual("con la jugada, el signo dicho y el texto", await page.textContent("#comentario-profe"),
    "📝 Tu profe comentó 31. Ta8+! (buena jugada): El mate del pasillo");
  await page.evaluate((v) => window.__cambioEnBase("game_state", v), fila({ comentarios, vista: null }));
  igual("mirando otra jugada, no", await seVe(page, "#comentario-profe"), false);
  igual("no tiene el editor", await seVe(page, "#comentar-jugada"), false);
  igual("nunca escribió los comentarios", await page.evaluate(() =>
    window.__updates.some((x) => x.tabla === "game_state" && "comentarios" in x.campos)), false);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

(async () => {
  try {
    pruebaArmador();
  } catch (e) {
    console.log("  ✗ el armador se cayó: " + (e && e.stack || e));
    fallos += 1;
  }
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaProfesor(browser);
    await pruebaAlumna(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: el PGN de la clase lleva su arranque, sus variantes y sus comentarios.");
  process.exit(fallos ? 1 : 0);
})();
