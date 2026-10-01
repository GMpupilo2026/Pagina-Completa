#!/usr/bin/env node
/* Que los alumnos vean en su tablero lo que el profesor está MIRANDO.

   Cuando el profesor se devuelve a una jugada anterior o recorre una variante,
   la partida no cambia (sigue en game_state.moves). Antes eso quedaba solo en
   su pantalla: el profe explicaba una posición y los alumnos miraban otra, y
   para enseñarles una variante tenía que jugarla de nuevo en vivo. No da
   ningún error: cada tablero simplemente muestra otra cosa.

   Se comprueba, en un navegador de verdad y contra el doble de
   verificar-clase-registrada.js:

   - que el profesor guarde en game_state.vista lo que mira al usar ◀ ⏮ ⏭,
     al crear una variante y al jugar en ella, y null al volver al final;
   - que ◀ y ▶ dentro de una variante se queden en ELLA (antes ◀ saltaba a la
     línea principal y la variante había que ir a buscarla a la lista);
   - que el alumno vea en su tablero (las casillas, no el DOM de la clase) la
     posición que manda la vista, con el aviso escrito de qué es, y que vuelva
     a la partida cuando la vista es null;
   - que un alumno con el control no mueva mientras el profe muestra otra
     posición.

   Que un alumno no pueda cambiar la vista lo pone la base (el trigger
   protect_game_state_teacher_columns), comprobado impersonando roles en SQL.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-vista.js
*/
const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");

const { abrir, CHROME } = R;
const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };
const PARTIDA = ["e4", "e5", "Nf3", "Nc6"];
function fila(extra) {
  return Object.assign({
    id: 7, owner_id: "u-profe", fen: null, moves: PARTIDA.slice(), start_fen: null, last_move: "Nc6",
    arrows: [], circles: [], active_player_id: null, active_player_color: "both",
    shown_curso: null, shown_leccion: null, vista: null, updated_by: "u-profe",
    updated_at: new Date().toISOString(),
  }, extra || {});
}

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

// La última vista que la página mandó a game_state (undefined si no mandó ninguna).
const ultimaVista = (page) => page.evaluate(() => {
  const u = window.__updates.filter((x) => x.tabla === "game_state" && "vista" in x.campos);
  const v = u.length ? u[u.length - 1].campos.vista : undefined;
  return v === undefined ? "sin mandar" : v && { path: v.path, conPadre: v.parent !== null, root: v.root };
});
// Lo que dice la casilla, como lo lee el lector de pantalla: es lo que se pinta.
const casilla = (page, sq) => page.getAttribute('#chessboard [data-square="' + sq + '"]', "aria-label");
const seVe = (page, id) => page.evaluate((i) => {
  const el = document.getElementById(i);
  return !!(el && el.checkVisibility());
}, id);

async function pruebaProfesor(browser) {
  console.log("\n=== El profesor navega y crea variantes: la vista viaja ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila()] });
  await page.waitForFunction(() => document.querySelectorAll("#move-list button").length === 4, null, { timeout: 10000 });

  await page.click("#move-nav-prev");
  igual("◀ manda la jugada anterior", await ultimaVista(page), { path: ["e4", "e5", "Nf3"], conPadre: false, root: 3 });
  igual("y el profe ve que la clase ve lo mismo", /la clase ve lo mismo/.test(await page.textContent("#history-controls")), true);

  // Una variante desde ahí: 2… Cf6 3. Ac4.
  await page.evaluate(() => board.jugar({ from: "g8", to: "f6" }));
  await page.waitForFunction(() => window.__inserts.filter((i) => i.tabla === "variant_nodes").length === 1, null, { timeout: 5000 });
  await page.waitForTimeout(200);
  igual("la jugada de la variante también viaja", await ultimaVista(page),
    { path: ["e4", "e5", "Nf3", "Nf6"], conPadre: true, root: 3 });
  await page.evaluate(() => board.jugar({ from: "f1", to: "c4" }));
  await page.waitForFunction(() => window.__inserts.filter((i) => i.tabla === "variant_nodes").length === 2, null, { timeout: 5000 });
  await page.waitForTimeout(200);
  igual("y la siguiente, encadenada", await ultimaVista(page),
    { path: ["e4", "e5", "Nf3", "Nf6", "Bc4"], conPadre: true, root: 3 });
  igual("la partida no se tocó", await page.evaluate(() => board.moves()), PARTIDA);

  await page.click("#move-nav-prev");
  igual("◀ dentro de la variante se queda en ella", await ultimaVista(page),
    { path: ["e4", "e5", "Nf3", "Nf6"], conPadre: true, root: 3 });
  await page.click("#move-nav-next");
  igual("▶ sigue por la variante", await ultimaVista(page),
    { path: ["e4", "e5", "Nf3", "Nf6", "Bc4"], conPadre: true, root: 3 });
  await page.click("#move-nav-prev");
  await page.click("#move-nav-prev");
  igual("◀ desde la primera de la variante vuelve a la línea principal", await ultimaVista(page),
    { path: ["e4", "e5", "Nf3"], conPadre: false, root: 3 });
  await page.click("#move-nav-first");
  igual("⏮ manda la posición de salida", await ultimaVista(page), { path: [], conPadre: false, root: 0 });
  await page.click("#move-nav-last");
  igual("⏭ vuelve a la partida: vista null", await ultimaVista(page), null);

  const antes = await page.evaluate(() => window.__updates.length);
  await page.click("#move-nav-last");
  igual("no repite lo que ya mandó", await page.evaluate(() => window.__updates.length), antes);

  // Jugar en vivo también es mirar la partida.
  await page.click("#move-nav-prev");
  await page.click("#history-live-btn");
  igual("«Volver al final» manda null", await ultimaVista(page), null);
  await page.evaluate(() => board.jugar({ from: "f1", to: "b5" }));
  await page.waitForTimeout(200);
  igual("la jugada en vivo lleva vista null", await page.evaluate(() => {
    const u = window.__updates.filter((x) => x.tabla === "game_state" && x.campos.moves);
    return u.length ? u[u.length - 1].campos.vista : "sin mandar";
  }), null);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaAlumna(browser) {
  console.log("\n=== La alumna ve en su tablero lo que mira el profe ===");
  const vista = { path: ["e4", "e5", "Nf3", "Nf6"], parent: "n1", root: 3 };
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, { game_state: [fila({ vista })] });
  await page.waitForFunction(() => !!document.querySelector('#chessboard [data-square="f6"]'), null, { timeout: 10000 });
  igual("al entrar ya ve la variante: caballo en f6", /caballo negro/.test(await casilla(page, "f6")), true);
  igual("y no el de la partida en c6", /vacía/.test(await casilla(page, "c6")), true);
  igual("con el aviso escrito", await seVe(page, "vista-profe"), true);
  igual("que dice cuál es", /variante: 2… Cf6\./.test(await page.textContent("#vista-profe")), true);
  igual("el turno es el de lo que ve", await page.textContent("#turn-indicator"), "Turno: Blancas");

  // El profe baja por la variante.
  await page.evaluate((v) => window.__cambioEnBase("game_state", v),
    fila({ vista: { path: ["e4", "e5", "Nf3", "Nf6", "Bc4"], parent: "n2", root: 3 } }));
  igual("sigue la variante: alfil en c4", /alfil blanco/.test(await casilla(page, "c4")), true);
  igual("el aviso la nombra entera", /variante: 2… Cf6 3\. Ac4\./.test(await page.textContent("#vista-profe")), true);

  // El profe se devuelve en la partida.
  await page.evaluate((v) => window.__cambioEnBase("game_state", v), fila({ vista: { path: ["e4", "e5"], parent: null, root: 2 } }));
  igual("jugada anterior: sin caballo en f3", /vacía/.test(await casilla(page, "f3")), true);
  igual("y lo dice", /jugada anterior: 1… e5\./.test(await page.textContent("#vista-profe")), true);

  // Con el control, no mueve mientras el profe muestra otra cosa.
  await page.evaluate((v) => window.__cambioEnBase("game_state", v),
    fila({ vista: { path: ["e4", "e5"], parent: null, root: 2 }, active_player_id: "u-ana" }));
  igual("con el control y el profe mostrando otra: no mueve", await page.evaluate(() => board.interactive), false);
  igual("y se le explica", /cuando vuelva a la partida, vas a poder mover/.test(await page.textContent("#status-banner")), true);

  // El profe vuelve al final.
  await page.evaluate((v) => window.__cambioEnBase("game_state", v), fila({ vista: null, active_player_id: "u-ana" }));
  igual("vuelve a la partida: caballo en c6", /caballo negro/.test(await casilla(page, "c6")), true);
  igual("sin aviso", await seVe(page, "vista-profe"), false);
  igual("y ahora sí mueve", await page.evaluate(() => board.interactive), true);
  igual("la alumna nunca escribió la vista", await page.evaluate(() =>
    window.__updates.some((x) => x.tabla === "game_state" && "vista" in x.campos && x.campos.vista !== null)), false);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

(async () => {
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
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: los alumnos ven lo que mira el profe.");
  process.exit(fallos ? 1 : 0);
})();
