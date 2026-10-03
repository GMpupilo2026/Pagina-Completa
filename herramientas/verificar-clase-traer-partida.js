/* La partida de un alumno en el tablero de la clase, los intentos de la
   práctica y el aviso de que el motor ya jugó (sesion.html). Ver «Llevar la
   partida de un alumno a la clase», «La práctica con un límite de intentos» y
   «El aviso de que el bot ya jugó» en docs/decisiones/clase-en-vivo.md.

   Lo que se rompe acá no da ningún error: la partida llega al tablero sin sus
   jugadas (o con la posición final, sin nada que recorrer), el alumno ve
   «Reintentar» cuando ya no le quedan intentos, o el motor juega y nadie se
   entera. Se comprueba lo que la página MANDA y lo que se VE:

   El profe lleva la práctica de un alumno a la clase
   - «📥 Llevarla a la clase» sale en «Mirar y ayudar» (y no para supervisión);
   - lo que manda al tablero es la partida ENTERA: posición de salida, jugadas
     y la última; y la muestra desde el principio (vista en la jugada 0).

   «La partida de un alumno»
   - lista sus prácticas y sus partidas en línea, con el rival por su nombre;
   - una partida armada desde la posición del tablero se reproduce desde ahí
     (variant_state.inicio), y una cuya historia no cierra se dice y no se
     ofrece llevar;
   - «📥 A la clase» manda esa partida entera.

   Los intentos
   - el profe elige cuántos y viajan en la ronda; sin límite no se manda nada;
   - la miniatura y la ronda dicen «intento 2 de 3» / «3 intentos por alumno»;
   - la alumna ve «Intento 2 de 2», sin «Reintentar» y con el motivo escrito;
     con intentos de sobra, reintentar suma uno.
   Que no se pueda reintentar de más desde la consola lo hace cumplir la base
   (trigger practica_ayuda_proteger, migración practica_limite_de_intentos).

   El motor ya jugó
   - la jugada queda escrita encima del tablero («El motor jugó e5. Te toca.»)
     y suena el aviso (TurnAlert.botJugo); el sonido se apaga y se recuerda.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-traer-partida.js
*/
const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");

const { abrir, CHROME } = R;
const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };
const INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const DESDE_TABLERO = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";
const BETO = { id: "u-beto", role: "alumno", is_admin: false, es_coordinador: false, es_supervisor: false,
               full_name: "Beto <b>Mora</b>", email: "beto@x.cr", grupo: null };

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
function cumple(nombre, ok, detalle) {
  if (!ok) { console.log("  ✗ " + nombre + (detalle !== undefined ? "\n      salió: " + JSON.stringify(detalle) : "")); fallos += 1; }
  else console.log("  ✓ " + nombre);
}
const seVe = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  return !!(el && el.checkVisibility());
}, sel);
const texto = (page, sel) => page.evaluate((s) => (document.querySelector(s) || {}).textContent || "", sel);
const updatesDe = (page, tabla) => page.evaluate((t) => window.__updates.filter((u) => u.tabla === t).map((u) => u.campos), tabla);
const sinErroresPropios = (errores) => errores.filter((e) => !/stockfish|Worker|wasm/i.test(e));

function rondaYPartida(extraRonda, extraPartida) {
  const ronda = Object.assign({ id: "p-1", fen: INICIAL, level: "1500", created_by: "u-profe", ended_at: null,
    created_at: new Date().toISOString(), reloj_segundos: null, incremento_segundos: 0, max_intentos: 3 }, extraRonda || {});
  return {
    practice_sessions: [ronda],
    practice_games: [Object.assign({ id: "g-1", session_id: "p-1", student_id: "u-ana", student_color: "w", fen: INICIAL,
      moves: ["e4", "e5", "Nf3"], status: "playing", eval_cp: null, attempts: 2, reloj_ms: null, ayuda: null,
      created_at: new Date().toISOString(), profiles: { full_name: "Ana Rojas", email: "ana@x.cr" },
      practice_sessions: { fen: ronda.fen, level: ronda.level } }, extraPartida || {})],
  };
}

async function pruebaLlevarPractica(browser) {
  console.log("\n=== El profe lleva la práctica de Ana a la clase ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, rondaYPartida());
  await page.waitForSelector("#practice-boards-grid .practice-mini-mirar", { timeout: 30000 });
  cumple("la miniatura dice el intento contra el tope", /intento 2 de 3/.test(await texto(page, "#practice-boards-grid .practice-mini-status")),
    await texto(page, "#practice-boards-grid .practice-mini-status"));
  igual("la ronda dice cuántos intentos hay", await texto(page, "#practice-active-intentos"), " · 3 intentos por alumno");

  await page.click("#practice-boards-grid .practice-mini-mirar");
  await page.waitForSelector("#practica-mirar:not(.hidden)");
  cumple("«Llevarla a la clase» se ve en el diálogo", await seVe(page, "#practica-mirar-llevar"));
  await page.evaluate(() => { window.__updates.length = 0; });
  await page.click("#practica-mirar-llevar");
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state" && "vista" in u.campos && u.campos.vista), null, { timeout: 5000 });
  const ups = await updatesDe(page, "game_state");
  const partida = ups.find((c) => Array.isArray(c.moves));
  igual("manda la partida entera", partida && [partida.start_fen, partida.moves, partida.last_move],
    [INICIAL, ["e4", "e5", "Nf3"], "Nf3"]);
  cumple("con la posición final como la actual", partida && /^rnbqkbnr\/pppp1ppp\/8\/4p3\/4P3\/5N2\/PPPP1PPP\/RNBQKB1R b/.test(partida.fen), partida && partida.fen);
  igual("y la muestra desde el principio", ups.filter((c) => c.vista).pop().vista, { path: [], parent: null, root: 0 });
  cumple("el diálogo se cierra", !(await seVe(page, "#practica-mirar")));
  cumple("y lo dice", /3 jugadas/.test(await texto(page, "#status-banner")), await texto(page, "#status-banner"));
  igual("sin errores en la página", sinErroresPropios(errores), []);
  await ctx.close();
}

async function pruebaPartidasDelAlumno(browser) {
  console.log("\n=== «La partida de un alumno»: sus prácticas y sus partidas en línea ===");
  const semilla = rondaYPartida({ ended_at: new Date().toISOString() });
  semilla.profiles = [R.PROFE, R.ALUMNA, BETO];
  // d4 d5 desde la inicial; Ta8# desde la posición del tablero de la clase; una
  // tercera cuyas jugadas no llevan a su posición (no se sabe desde dónde empezó).
  semilla.game_rooms = [
    { id: "r1", variant: "estandar", white_id: "u-ana", black_id: "u-beto", status: "finished", result: "draw",
      moves: ["d4", "d5"], fen: "rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq d6 0 2", created_at: "2026-10-03T15:00:00Z" },
    { id: "r2", variant: "estandar", white_id: "u-ana", black_id: "u-beto", status: "finished", result: "white",
      moves: ["Ra8#"], fen: "R5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 1 1", variant_state: { inicio: DESDE_TABLERO }, created_at: "2026-10-03T16:00:00Z" },
    { id: "r3", variant: "estandar", white_id: "u-beto", black_id: "u-ana", status: "playing", result: null,
      moves: ["Ra8#"], fen: "R5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 1 1", created_at: "2026-10-03T14:00:00Z" },
  ];
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, semilla);
  await page.evaluate(() => window.__entraAlumno());
  await page.click("#teacher-tab-practicar");
  cumple("la sección se ve en la pestaña Practicar", await seVe(page, "#traer-partida"));
  await page.focus("#traer-alumno");
  await page.click("#traer-buscar");
  cumple("sin alumno elegido, lo pide", /Elige primero/.test(await texto(page, "#traer-msg")));
  await page.selectOption("#traer-alumno", "u-ana");
  await page.click("#traer-buscar");
  await page.waitForFunction(() => document.querySelectorAll("#traer-lista li").length >= 4, null, { timeout: 5000 });
  const renglones = await page.evaluate(() => [...document.querySelectorAll("#traer-lista li")].map((li) => ({
    t: li.querySelector("span").textContent, boton: !!li.querySelector("button"),
  })));
  igual("cuatro partidas, de la más nueva a la más vieja", renglones.map((r) => r.t.slice(0, 18)),
    ["🎯 Contra el motor", "♟️ Contra Beto <b>", "♟️ Contra Beto <b>", "♟️ Contra Beto <b>"].map((x) => x.slice(0, 18)));
  cumple("el rival va por su nombre, como texto", renglones.some((r) => r.t.includes("Beto <b>Mora</b>")), renglones);
  igual("la que no se puede reproducir lo dice y no se ofrece", renglones.map((r) => r.boton), [true, true, true, false]);
  cumple("con el motivo escrito", /no se sabe desde dónde empezó/.test(renglones[3].t), renglones[3].t);

  await page.evaluate(() => { window.__updates.length = 0; });
  await page.click("#traer-lista li:nth-child(2) button");
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state" && Array.isArray(u.campos.moves)), null, { timeout: 5000 });
  let p = (await updatesDe(page, "game_state")).find((c) => Array.isArray(c.moves));
  igual("la armada desde el tablero se reproduce desde ahí", [p.start_fen, p.moves], [DESDE_TABLERO, ["Ra8#"]]);

  await page.evaluate(() => { window.__updates.length = 0; });
  await page.click("#traer-lista li:nth-child(3) button");
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state" && Array.isArray(u.campos.moves)), null, { timeout: 5000 });
  p = (await updatesDe(page, "game_state")).find((c) => Array.isArray(c.moves));
  igual("la de la posición inicial, entera", [p.start_fen, p.moves], [INICIAL, ["d4", "d5"]]);
  igual("sin errores en la página", sinErroresPropios(errores), []);
  await ctx.close();
}

async function pruebaElegirIntentos(browser) {
  console.log("\n=== El profe elige los intentos al lanzar la práctica ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, {});
  await page.click("#teacher-tab-practicar");
  await page.selectOption("#practice-intentos", "3");
  await page.click("#start-practice-btn");
  await page.waitForFunction(() => window.__inserts.some((i) => i.tabla === "practice_sessions"), null, { timeout: 5000 });
  igual("viajan en la ronda", await page.evaluate(() => window.__inserts.filter((i) => i.tabla === "practice_sessions").pop().fila.max_intentos), 3);
  igual("sin errores en la página", sinErroresPropios(errores), []);
  await ctx.close();

  const sin = await abrir(browser, "u-profe", CLASE, {});
  await sin.page.click("#teacher-tab-practicar");
  await sin.page.click("#start-practice-btn");
  await sin.page.waitForFunction(() => window.__inserts.some((i) => i.tabla === "practice_sessions"), null, { timeout: 5000 });
  igual("sin límite no se manda la columna", await sin.page.evaluate(() =>
    "max_intentos" in window.__inserts.filter((i) => i.tabla === "practice_sessions").pop().fila), false);
  await sin.ctx.close();
}

async function pruebaAlumnaIntentos(browser) {
  console.log("\n=== La alumna con los intentos contados ===");
  let r = await abrir(browser, "u-ana", CLASE, rondaYPartida({ max_intentos: 2 }, { status: "checkmate_loss", attempts: 2 }));
  await r.page.waitForSelector("#practice-card:not(.hidden)", { timeout: 15000 });
  await r.page.waitForFunction(() => /Intento/.test(document.getElementById("practice-card-intentos").textContent), null, { timeout: 5000 });
  igual("ve en qué intento va", await texto(r.page, "#practice-card-intentos"), " · Intento 2 de 2");
  cumple("sin intentos, no hay «Reintentar»", !(await seVe(r.page, "#practice-retry-btn")));
  cumple("y se le dice por qué", /Ya usaste tus 2 intentos/.test(await texto(r.page, "#practice-card-status")), await texto(r.page, "#practice-card-status"));
  igual("sin errores en la página", sinErroresPropios(r.errores), []);
  await r.ctx.close();

  r = await abrir(browser, "u-ana", CLASE, rondaYPartida({ max_intentos: 2 }, { status: "checkmate_loss", attempts: 1 }));
  await r.page.waitForSelector("#practice-retry-btn:not(.hidden)", { timeout: 15000 });
  await r.page.click("#practice-retry-btn");
  await r.page.waitForFunction(() => window.__updates.some((u) => u.tabla === "practice_games" && "attempts" in u.campos), null, { timeout: 5000 });
  igual("con intentos de sobra, reintentar suma uno", (await updatesDe(r.page, "practice_games")).filter((c) => "attempts" in c).pop().attempts, 2);
  igual("y ahora va en el último", await texto(r.page, "#practice-card-intentos"), " · Intento 2 de 2");
  await r.ctx.close();
}

async function pruebaAvisoDelMotor(browser) {
  console.log("\n=== El motor juega y la alumna se entera ===");
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, rondaYPartida({ max_intentos: null }, { moves: [], attempts: 1 }));
  await page.waitForSelector("#practice-card:not(.hidden)", { timeout: 15000 });
  await page.evaluate(() => {
    window.__avisos = [];
    const original = TurnAlert.botJugo;
    TurnAlert.botJugo = (san) => { window.__avisos.push(san); original(san); };
    PracticeEngine.responder = async () => ({ uci: "e7e5" });
    PracticeEngine.evaluate = async () => null;
  });
  cumple("antes de jugar no dice nada", !(await seVe(page, "#practice-card-ultima")));
  await page.waitForFunction(() => practiceBoard && practiceBoard.interactive !== false, null, { timeout: 5000 }).catch(() => {});
  await page.evaluate(() => practiceBoard.jugar({ from: "e2", to: "e4" }));
  await page.waitForFunction(() => (window.__avisos || []).length > 0, null, { timeout: 5000 });
  igual("suena el aviso con la jugada", await page.evaluate(() => window.__avisos), ["e5"]);
  cumple("y queda escrita encima del tablero", await seVe(page, "#practice-card-ultima"));
  igual("con lo que jugó", await texto(page, "#practice-card-ultima"), "🔔 El motor jugó e5. Te toca.");

  igual("el sonido arranca encendido", await page.getAttribute("#practice-sonido-btn", "aria-pressed"), "true");
  await page.click("#practice-sonido-btn");
  igual("se apaga", await page.getAttribute("#practice-sonido-btn", "aria-pressed"), "false");
  igual("y se recuerda en el aparato", await page.evaluate(() => localStorage.getItem("aviso_bot_sonido")), "no");
  igual("el botón lo dice", await texto(page, "#practice-sonido-btn"), "🔕 Sonido cuando juega el motor: apagado");

  await page.evaluate(() => practiceBoard.jugar({ from: "g1", to: "f3" }));
  await page.waitForFunction(() => !document.getElementById("practice-card-ultima").checkVisibility()
    || /e5/.test(document.getElementById("practice-card-ultima").textContent) === false, null, { timeout: 5000 });
  cumple("al jugar ella, el aviso viejo no queda", !/e5/.test(await texto(page, "#practice-card-ultima")), await texto(page, "#practice-card-ultima"));
  igual("sin errores en la página", sinErroresPropios(errores), []);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaLlevarPractica(browser);
    await pruebaPartidasDelAlumno(browser);
    await pruebaElegirIntentos(browser);
    await pruebaAlumnaIntentos(browser);
    await pruebaAvisoDelMotor(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron." : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
