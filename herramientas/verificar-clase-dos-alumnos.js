/* Dos alumnos juegan en el tablero de la clase: uno con blancas y otro con
   negras (sesion.html). Ver «Dos alumnos juegan en el tablero de la clase» en
   docs/decisiones/clase-en-vivo.md.

   Lo que se rompe acá no da ningún error: el segundo alumno ve el tablero
   quieto aunque le toque, o puede mover las piezas del otro, o el rival se
   queda colgado cuando el profe cambia el control. Se comprueba lo que la
   página MANDA y lo que se VE:

   El profe
   - con el control de un solo color, el renglón de quien lo tiene ofrece
     «Contra: …» con los demás conectados; elegir a uno manda SOLO rival_id;
   - el renglón del rival dice con qué color juega y contra quién, y su 🎮
     está apretado; «Quitar control» le quita solo el lado a él;
   - pasar el control a «ambos colores» se lleva al rival (manda rival_id null).

   El rival (Beto, con negras)
   - con el turno de las blancas, el tablero no se mueve y se le dice contra
     quién juega y que espere;
   - cuando Ana juega, le toca: el tablero se mueve y lo que manda es su
     jugada; después puede deshacer SOLO la suya.

   Quien tiene el control (Ana, con blancas)
   - lee que juega contra Beto.

   Que cada uno mueva solo su color, y que solo el profe cambie quién juega,
   lo hace cumplir la base (protect_game_state_teacher_columns, migración
   clase_dos_alumnos_juegan).

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-dos-alumnos.js
*/
const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");

const { abrir, CHROME } = R;
const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };
const INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const TRAS_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
const BETO = { id: "u-beto", role: "alumno", is_admin: false, es_coordinador: false, es_supervisor: false,
               full_name: "Beto Mora", email: "beto@x.cr", grupo: null };

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
const sinErroresPropios = (errores) => errores.filter((e) => !/stockfish|Worker|wasm/i.test(e));

function estado(extra) {
  return Object.assign({ id: 7, owner_id: "u-profe", fen: INICIAL, moves: [], start_fen: null, last_move: null,
    arrows: [], circles: [], active_player_id: "u-ana", active_player_color: "w", rival_id: null,
    vista: null, comentarios: {}, updated_by: "u-profe", updated_at: new Date().toISOString() }, extra || {});
}
const semilla = (extra) => ({ game_state: [estado(extra)], profiles: [R.PROFE, R.ALUMNA, BETO] });
// El renglón de un alumno en la lista del profe, por el nombre que muestra.
const renglon = (nombre) => `#students-list li:has(span.truncate[title="${nombre}"])`;

async function pruebaProfe(browser) {
  console.log("\n=== El profe pone a Ana (blancas) contra Beto (negras) ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, semilla());
  await page.evaluate(() => { window.__entraAlumno(); window.__entraOtroAlumno(); });
  await page.waitForSelector(renglon("Ana Rojas") + " select[aria-label^='Quién juega con negras']", { timeout: 10000 });
  igual("ofrece a los demás conectados como rival", await page.evaluate((sel) =>
    [...document.querySelector(sel).options].map((o) => o.textContent), renglon("Ana Rojas") + " select[aria-label^='Quién juega']"),
    ["Contra: tú (el profe)", "Contra: Beto Mora"]);

  await page.evaluate(() => { window.__updates.length = 0; });
  await page.selectOption(renglon("Ana Rojas") + " select[aria-label^='Quién juega']", "u-beto");
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state" && "rival_id" in u.campos), null, { timeout: 5000 });
  igual("manda solo el rival", await page.evaluate(() => window.__updates.filter((u) => u.tabla === "game_state").pop().campos), { rival_id: "u-beto" });
  await page.waitForFunction((sel) => !!document.querySelector(sel), renglon("Beto Mora") + " button[aria-pressed='true']", { timeout: 5000 });
  cumple("el renglón de Beto dice con qué color y contra quién", (await page.textContent(renglon("Beto Mora"))).includes("⚫ Juega con negras contra Ana Rojas"),
    await page.textContent(renglon("Beto Mora")));
  cumple("y su 🎮 está apretado", await seVe(page, renglon("Beto Mora") + " button[aria-pressed='true']"));
  cumple("el profe lo lee en la franja", /Ana Rojas juega con blancas y Beto Mora con negras/.test(await page.textContent("#status-banner")),
    await page.textContent("#status-banner"));

  // Pasar a «ambos colores» se lleva al rival.
  await page.evaluate(() => { window.__updates.length = 0; });
  await page.selectOption(renglon("Ana Rojas") + " select[aria-label^='Con qué color']", "both");
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state"), null, { timeout: 5000 });
  igual("con ambos colores, el rival se va", await page.evaluate(() => window.__updates.filter((u) => u.tabla === "game_state").pop().campos),
    { active_player_id: "u-ana", active_player_color: "both", rival_id: null });
  cumple("y ya no hay a quién elegir", !(await page.$(renglon("Ana Rojas") + " select[aria-label^='Quién juega']")));
  igual("sin errores en la página", sinErroresPropios(errores), []);
  await ctx.close();

  console.log("\n=== «Quitar control» en el renglón del rival le quita solo su lado ===");
  const r = await abrir(browser, "u-profe", CLASE, semilla({ rival_id: "u-beto" }));
  await r.page.evaluate(() => { window.__entraAlumno(); window.__entraOtroAlumno(); });
  await r.page.waitForSelector(renglon("Beto Mora") + " button[aria-label^='Quitarle el control a Beto Mora (']", { timeout: 10000 });
  await r.page.evaluate(() => { window.__updates.length = 0; });
  await r.page.click(renglon("Beto Mora") + " button[aria-label^='Quitarle el control a Beto Mora (']");
  await r.page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state"), null, { timeout: 5000 });
  igual("manda solo el rival en null", await r.page.evaluate(() => window.__updates.filter((u) => u.tabla === "game_state").pop().campos), { rival_id: null });
  cumple("Ana sigue con el control", await seVe(r.page, renglon("Ana Rojas") + " button[aria-pressed='true']"));
  await r.ctx.close();
}

async function pruebaRival(browser) {
  console.log("\n=== Beto juega con negras ===");
  const { page, ctx, errores } = await abrir(browser, "u-beto", CLASE, semilla({ rival_id: "u-beto" }));
  await page.evaluate(() => window.__entraAlumno());
  await page.waitForFunction(() => /contra Ana Rojas/.test(document.getElementById("status-banner").textContent), null, { timeout: 10000 });
  igual("con el turno de blancas, espera", await page.textContent("#status-banner"), "Juegas con negras contra Ana Rojas. Espera su jugada.");
  igual("y el tablero no se mueve", await page.evaluate(() => board.interactive), false);
  cumple("no puede deshacer la jugada de nadie", !(await seVe(page, "#undo-move-btn")));

  // Ana juega e4: le toca a Beto.
  await page.evaluate((f) => window.__cambioEnBase("game_state", f), estado({ rival_id: "u-beto", fen: TRAS_E4, moves: ["e4"], last_move: "e4" }));
  await page.waitForFunction(() => board.interactive === true, null, { timeout: 5000 });
  igual("cuando Ana juega, le toca", await page.textContent("#status-banner"), "Juegas con negras contra Ana Rojas. Te toca mover.");
  cumple("no puede deshacer la de Ana", !(await seVe(page, "#undo-move-btn")));

  await page.evaluate(() => { window.__updates.length = 0; });
  await page.evaluate(() => board.jugar({ from: "e7", to: "e5" }));
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state" && Array.isArray(u.campos.moves)), null, { timeout: 5000 });
  igual("lo que manda es su jugada", await page.evaluate(() => window.__updates.filter((u) => u.tabla === "game_state").pop().campos.moves), ["e4", "e5"]);
  igual("después ya no mueve", await page.evaluate(() => board.interactive), false);
  cumple("y puede deshacer la suya", await seVe(page, "#undo-move-btn"));
  igual("sin errores en la página", sinErroresPropios(errores), []);
  await ctx.close();
}

async function pruebaControl(browser) {
  console.log("\n=== Ana, con blancas, sabe contra quién juega ===");
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, semilla({ rival_id: "u-beto" }));
  await page.evaluate(() => window.__entraOtroAlumno());
  await page.waitForFunction(() => /contra Beto Mora/.test(document.getElementById("status-banner").textContent), null, { timeout: 10000 });
  igual("lo dice", await page.textContent("#status-banner"), "Juegas con blancas contra Beto Mora. Te toca mover.");
  igual("y mueve", await page.evaluate(() => board.interactive), true);
  igual("sin errores en la página", sinErroresPropios(errores), []);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaProfe(browser);
    await pruebaRival(browser);
    await pruebaControl(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron." : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
