/* Si la jugada del rival no llega por Realtime, la partida se entera igual
   (js/sala-juego.js, SalaJuego.suscribir). Ver «Realtime perdía jugadas» en
   docs/decisiones/juegos-y-torneos.md.

   El 3/10, en un torneo, el rival jugaba y al otro no le llegaba la jugada: su
   reloj seguía corriendo y nada decía que algo andaba mal. La causa era una
   política de la base, pero cualquier aviso perdido de Realtime deja la misma
   pantalla. Ahora la página vuelve a leer la sala al volver a la pestaña, si el
   canal se cae, y cada 15 s mientras la partida sigue.

   Con el doble de verificar-juegos-accesible.js, que no avisa NADA por
   Realtime: lo único que puede traer la jugada es el respaldo.
   - Ana (blancas) jugó e4 y espera; Bruno juega e5 «en la base».
   - Al volver a la pestaña, el tablero muestra e5 y le dice que le toca.
   - Una lectura sin cambios no vuelve a avisar nada.
   - El respaldo existe en el código: cada 15 s y al caerse el canal.

   Uso:  node herramientas/verificar-sala-respaldo.js        (con el sitio en el 8777) */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const J = require("./verificar-juegos-accesible.js");

let fallos = 0;
function ok(nombre, condicion, detalle) {
  if (condicion) { console.log("  ✓ " + nombre); return; }
  fallos++;
  console.log("  ✗ " + nombre + (detalle !== undefined ? "\n      salió: " + JSON.stringify(detalle) : ""));
}

const TRAS_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
const TRAS_E5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2";

async function prueba(browser) {
  console.log("\n=== El rival juega y Realtime no avisa ===");
  const sala = Object.assign(J.sala("r1", "estandar", TRAS_E4), { moves: ["e4"], updated_at: "2026-10-03T19:00:00Z" });
  const { ctx, page, errores } = await J.abrir(browser, "/estandar.html?room=r1", { tablas: { game_rooms: [sala], profiles: J.PERFILES } }, "u-ana", false);
  ok("Ana espera la jugada de Bruno", /Esperando la jugada de Bruno/.test(await page.textContent("#status-banner")), await page.textContent("#status-banner"));

  // Bruno juega e5: cambia la base, sin ningún aviso de Realtime.
  // Fila nueva, no la misma modificada: el doble entrega sus objetos tal cual, y la
  // página guarda el suyo como `room` — cambiarlo en el lugar le cambiaría la sala.
  await page.evaluate((f) => {
    const t = window.__tablas.game_rooms;
    t[0] = Object.assign({}, t[0], { fen: f, moves: ["e4", "e5"], updated_at: "2026-10-03T19:00:05Z" });
  }, TRAS_E5);
  // Ana vuelve a la pestaña.
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForFunction(() => /Es tu turno/.test(document.getElementById("status-banner").textContent), null, { timeout: 5000 }).catch(() => {});
  ok("al volver a la pestaña, le toca", /Es tu turno/.test(await page.textContent("#status-banner")), await page.textContent("#status-banner"));
  ok("y el tablero muestra e5", await page.evaluate(() => !!(board.game.get("e5") && board.game.get("e5").color === "b")));

  // Una lectura sin cambios no vuelve a avisar.
  const consultasAntes = await page.evaluate(() => window.__consultas.length);
  await page.evaluate(() => { window.__avisos = 0; const f = board.loadFen.bind(board); board.loadFen = (x) => { window.__avisos++; f(x); }; });
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForFunction((n) => window.__consultas.length > n, consultasAntes, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(200);
  ok("vuelve a leer la sala", (await page.evaluate(() => window.__consultas.length)) > consultasAntes);
  ok("pero sin cambios no repinta la posición", (await page.evaluate(() => window.__avisos)) === 0, await page.evaluate(() => window.__avisos));
  ok("sin errores de la página", errores.length === 0, errores);
  await ctx.close();

  const codigo = fs.readFileSync(path.join(__dirname, "..", "js", "sala-juego.js"), "utf8");
  ok("relee cada 15 s mientras la partida sigue", /RESPALDO_MS\s*=\s*15000/.test(codigo) && /setInterval\(\(\) => \{ if \(enJuego\) revisar\(\); \}, RESPALDO_MS\)/.test(codigo));
  ok("y si el canal se cae", /CHANNEL_ERROR[\s\S]{0,80}TIMED_OUT[\s\S]{0,80}CLOSED[\s\S]{0,40}revisar\(\)/.test(codigo));
}

(async () => {
  const browser = await chromium.launch({ executablePath: J.CHROME });
  try { await prueba(browser); } finally { await browser.close(); }
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron." : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
