/* Terminar y eliminar un torneo (torneo.html). Ver «Terminar y eliminar un
   torneo» en docs/decisiones/juegos-y-torneos.md.

   Lo que se rompe acá no da ningún error: un torneo cortado a la mitad que
   corona a quien iba primero y lo mete al salón de la fama como si lo hubiera
   ganado, o un «eliminado» que deja las partidas de su ronda jugándose solas.
   Con el doble de verificar-torneo-rondas.js, que GUARDA lo que se escribe y
   filtra update y delete en el resolver, como la base:

   - quien organiza ve «Organizar el torneo»; una alumna, no;
   - cancelar el diálogo no cambia nada;
   - terminar a la mitad cierra el torneo con quien iba primero, SIN campeón
     ni salón de la fama, y lo dice así;
   - eliminar borra el torneo y las partidas que seguían en juego (no las
     terminadas), y vuelve a la lista de torneos.

   Quién puede terminar o eliminar lo decide la base (tournaments_update y
   tournaments_delete: quien lo creó o administración).

   Uso:  node herramientas/verificar-torneo-terminar.js        (con el sitio en el 8777) */
const { chromium } = require("playwright");
const T = require("./verificar-torneo-rondas.js");

let fallos = 0;
function ok(nombre, condicion, detalle) {
  if (condicion) { console.log("  ✓ " + nombre); return; }
  fallos++;
  console.log("  ✗ " + nombre + (detalle !== undefined ? "\n      salió: " + JSON.stringify(detalle) : ""));
}
const seVe = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!(el && el.checkVisibility()); }, sel);
const [ANA, BRUNO, CARLA, DIEGO] = T.JUGADORES;

// Un suizo de 3 rondas cortado en la 2: Ana le ganó a Bruno y Carla empató con
// Diego; en la ronda 2, una partida terminada y otra en juego.
function datos() {
  const d = T.datosBase({ status: "in_progress", total_rounds: 3, current_round: 2 }, [
    { id: "r1", tournament_id: "t1", round_number: 1, status: "finished" },
    { id: "r2", tournament_id: "t1", round_number: 2, status: "in_progress" },
  ]);
  d.tournament_pairings = [
    { id: "p1", tournament_id: "t1", round_id: "r1", board_number: 1, white_id: ANA.id, black_id: BRUNO.id, is_bye: false, result: "white", game_room_id: "g1", finished_at: "2026-10-03T15:00:00Z" },
    { id: "p2", tournament_id: "t1", round_id: "r1", board_number: 2, white_id: CARLA.id, black_id: DIEGO.id, is_bye: false, result: "draw", game_room_id: "g2", finished_at: "2026-10-03T15:00:00Z" },
    { id: "p3", tournament_id: "t1", round_id: "r2", board_number: 1, white_id: ANA.id, black_id: CARLA.id, is_bye: false, result: null, game_room_id: "g3" },
    { id: "p4", tournament_id: "t1", round_id: "r2", board_number: 2, white_id: DIEGO.id, black_id: BRUNO.id, is_bye: false, result: null, game_room_id: "g4" },
  ];
  d.game_rooms = [
    { id: "g1", status: "finished", variant: "estandar", white_id: ANA.id, black_id: BRUNO.id, fen: "8/8/8/8/8/8/8/8 w - - 0 1", moves: [] },
    { id: "g2", status: "finished", variant: "estandar", white_id: CARLA.id, black_id: DIEGO.id, fen: "8/8/8/8/8/8/8/8 w - - 0 1", moves: [] },
    { id: "g3", status: "playing", variant: "estandar", white_id: ANA.id, black_id: CARLA.id, fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", moves: [] },
    { id: "g4", status: "finished", variant: "estandar", white_id: DIEGO.id, black_id: BRUNO.id, fen: "8/8/8/8/8/8/8/8 w - - 0 1", moves: [] },
  ];
  return d;
}

async function abrirComo(browser, usuarioId) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.addInitScript(T.doble(datos(), usuarioId));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(T.BASE + "/torneo.html?id=t1");
  await page.waitForTimeout(1500);
  return { ctx, page, errores };
}

const escrituras = (page, tabla, op) => page.evaluate(([t, o]) => window.__escrituras.filter((e) => e.tabla === t && e.op === o), [tabla, op]);

async function pruebaAlumna(browser) {
  console.log("\n=== Una alumna no organiza ===");
  const { ctx, page } = await abrirComo(browser, ANA.id);
  ok("no ve «Organizar el torneo»", !(await seVe(page, "#gestion-torneo")));
  await ctx.close();
}

async function pruebaTerminar(browser) {
  console.log("\n=== Terminar a la mitad ===");
  const { ctx, page, errores } = await abrirComo(browser, T.PROFE.id);
  ok("quien organiza ve «Organizar el torneo»", await seVe(page, "#gestion-torneo"));
  await page.evaluate(() => sessionStorage.removeItem("__doble"));

  await page.click("#terminar-torneo-btn");
  await page.waitForSelector("[data-avisos-aceptar]", { state: "visible", timeout: 5000 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  ok("cancelar no cambia nada", (await escrituras(page, "tournaments", "update")).length === 0);

  await page.click("#terminar-torneo-btn");
  await page.waitForSelector("[data-avisos-aceptar]", { state: "visible", timeout: 5000 });
  const aviso = await page.evaluate(() => document.querySelector("[data-avisos-aceptar]").closest("dialog, [role='dialog'], [role='alertdialog']").textContent);
  ok("el aviso dice que la partida en juego ya no cuenta", /1 partidas que siguen en juego|partidas que siguen en juego/.test(aviso), aviso);
  await page.click("[data-avisos-aceptar]");
  await page.waitForFunction(() => window.__T.tournaments[0].status === "finished", null, { timeout: 5000 }).catch(() => {});
  const t = await page.evaluate(() => window.__T.tournaments[0]);
  ok("queda terminado", t.status === "finished", t.status);
  ok("con quien iba primero", JSON.stringify(t.winner_ids) === JSON.stringify([ANA.id]), t.winner_ids);
  ok("sin entrar al salón de la fama", (await escrituras(page, "public_tournament_champions", "insert")).length === 0);
  await page.waitForFunction(() => document.getElementById("finished-early").checkVisibility(), null, { timeout: 5000 }).catch(() => {});
  const nota = await page.evaluate(() => document.getElementById("finished-early").textContent);
  ok("y lo dice: no hay campeón, iba primero Ana", /no hay campeón/.test(nota) && /Iba primero: Ana Rojas/.test(nota), nota);
  ok("no lo corona", !(await seVe(page, "#finished-title")));
  ok("ni ofrece el salón de la fama", !(await seVe(page, "#finished-fama")));
  ok("ya no ofrece terminarlo", !(await seVe(page, "#terminar-torneo-btn")));
  ok("sin errores de la página", errores.length === 0, errores);
  await ctx.close();
}

async function pruebaEliminar(browser) {
  console.log("\n=== Eliminar ===");
  const { ctx, page, errores } = await abrirComo(browser, T.PROFE.id);
  await page.evaluate(() => sessionStorage.removeItem("__doble"));
  await page.click("#eliminar-torneo-btn");
  await page.waitForSelector("[data-avisos-aceptar]", { state: "visible", timeout: 5000 });
  await Promise.all([
    page.waitForURL(/torneos\.html/, { timeout: 8000 }).catch(() => {}),
    page.click("[data-avisos-aceptar]"),
  ]);
  ok("vuelve a la lista de torneos", /torneos\.html/.test(page.url()), page.url());
  // La página nueva tiene su propio doble: lo escrito quedó guardado en sessionStorage.
  const g = await page.evaluate(() => { try { return JSON.parse(sessionStorage.getItem("__doble")); } catch (e) { return null; } });
  ok("el torneo se borró", g && g.T.tournaments.length === 0, g && g.T.tournaments);
  ok("la partida que seguía en juego, también", g && !g.T.game_rooms.some((r) => r.id === "g3"), g && g.T.game_rooms.map((r) => r.id));
  ok("las terminadas se quedan", g && ["g1", "g2", "g4"].every((id) => g.T.game_rooms.some((r) => r.id === id)), g && g.T.game_rooms.map((r) => r.id));
  ok("sin errores de la página", errores.length === 0, errores);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: T.CHROME });
  try {
    await pruebaAlumna(browser);
    await pruebaTerminar(browser);
    await pruebaEliminar(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron." : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
