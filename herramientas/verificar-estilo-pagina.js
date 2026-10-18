/* Comprueba entreno/estilo.html (la prueba de estilo) en un navegador de verdad.
 *
 * La medición la comprueba herramientas/verificar-estilo-perfil.js sin
 * navegador; acá va lo que solo se rompe mirando la pantalla:
 *
 *   1. Sin sesión, al login.
 *   2. Con sesión: la prueba arranca, el tablero dibuja la posición, «Siguiente»
 *      no deja pasar sin la jugada Y la seguridad, y una persona que contesta
 *      siempre lo mismo termina entre 32 y 47 posiciones (30 y los dos
 *      controles, y hasta 15 más).
 *   3. «Cómo juegas» no se manda sin el ritmo y el estudio; con ellos, sale el
 *      resultado: los tres ejes con su etiqueta y su margen escrito, y las tres
 *      recomendaciones con su porqué y su enlace a Aperturas y celadas.
 *   4. Lo que se guarda en estilo_pruebas: a nombre del alumno de la sesión,
 *      con todas las respuestas (las dos de control marcadas), el contexto y
 *      la recomendación que se mostró; la hora NO la manda el navegador.
 *   5. Con usuarios de Lichess: baja sus partidas y las revisa con el motor
 *      mientras contesta (motor y Lichess de mentira), y los momentos hallados
 *      se guardan con la prueba.
 *   6. Contestando por el cuadro de comandos (Modo Adaptado): «A muy seguro»
 *      anota y pasa a la siguiente.
 *   7. Informes, «Sus aperturas»: el profe ve el estilo de su alumno y lo que
 *      se le recomendó.
 *
 * Uso:  python3 -m http.server 8777 && node herramientas/verificar-estilo-pagina.js
 */
const fs = require("fs");
const { chromium } = require("./lib/playwright-con-sesion");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function ok(nombre, cond, detalle) {
  if (cond) { console.log("  ✓ " + nombre); return; }
  fallos += 1;
  console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : ""));
}

/* El doble de Supabase. Los filtros se anotan en el RESOLVER, y filtra de
 * verdad: estilo_pruebas devuelve solo las filas del alumno pedido. */
function clienteFalso(o) {
  return `
(function () {
  var O = ${JSON.stringify(o)};
  window.__escrituras = [];
  window.__pruebas = O.pruebas || [];
  function tabla(nombre) {
    var f = {};
    var api = {
      select: function () { return api; },
      eq: function (c, v) { f[c] = v; return api; },
      order: function () { return api; },
      range: function () { return api; },
      in: function () { return api; },
      maybeSingle: function () { return api.then(function (r) { return { data: (r.data || [])[0] || null, error: r.error }; }); },
      single: function () { return api.maybeSingle(); },
      insert: function (fila) {
        window.__escrituras.push({ tabla: nombre, fila: fila });
        var guardada = Object.assign({ id: "p-nueva", created_at: "2026-10-17T20:00:00Z" }, fila);
        if (nombre === "estilo_pruebas") window.__pruebas.unshift(guardada);
        var r = { data: [guardada], error: null };
        return { select: function () { return { maybeSingle: function () { return Promise.resolve({ data: guardada, error: null }); } }; }, then: function (ok) { return Promise.resolve(r).then(ok); } };
      },
      upsert: function (fila) { window.__escrituras.push({ tabla: nombre, fila: fila }); return Promise.resolve({ error: null }); },
      update: function () { return api; },
      then: function (ok, mal) {
        var data = [];
        if (nombre === "profiles") data = [{ id: f.id || O.yo, full_name: "Alumna de prueba", role: O.rol || "alumno", is_admin: false }];
        if (nombre === "analisis_partidas_alumno" && O.cuentas && f.alumno_id === O.alumno) data = [O.cuentas];
        if (nombre === "estilo_pruebas") data = window.__pruebas.filter(function (p) { return p.alumno_id === f.alumno_id; });
        return Promise.resolve({ data: data, error: null }).then(ok, mal);
      },
    };
    return api;
  }
  window.sb = {
    auth: {
      getSession: function () { return Promise.resolve({ data: { session: O.yo ? { user: { id: O.yo }, access_token: "x" } : null } }); },
      getUser: function () { return Promise.resolve({ data: { user: O.yo ? { id: O.yo } : null } }); },
      onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; },
    },
    from: tabla,
    rpc: function () { return Promise.resolve({ data: null, error: null }); },
    channel: function () { var c = { on: function () { return c; }, subscribe: function () { return c; } }; return c; },
    removeChannel: function () {},
  };
})();
`;
}

/* Partidas de Lichess de mentira: la misma apertura tres veces, con la
 * alumna de blancas. */
const PGN = [1, 2, 3].map((i) => `[Event "Rated blitz game"]
[Site "https://lichess.org/abc${i}"]
[White "alumna1"]
[Black "rival${i}"]
[Result "1-0"]
[UTCDate "2026.09.0${i}"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Na5 10. Bc2 c5 11. d4 Qc7 12. Nbd2 cxd4 13. cxd4 Nc6 14. Nb3 a5 15. Be3 a4 16. Nbd2 Bd7 17. Rc1 Qb7 18. Qe2 Rfe8 1-0
`).join("\n");

async function abrir(browser, ruta, cliente, extra) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: cliente }));
  await ctx.route("**/lichess.org/api/games/user/**", (r) => r.fulfill({ status: 200, contentType: "application/x-chess-pgn", body: PGN }));
  if (extra && extra.adaptado) await ctx.addInitScript(() => { try { localStorage.setItem("oscarBlindMode_v1", "1"); } catch (e) {} });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push("console: " + m.text()); });
  if (extra && extra.motor) {
    // El motor de mentira: todas las jugadas legales con la misma
    // evaluación (así la de la partida siempre está entre las buenas). Lo
    // que se mide es que la página lo llame y guarde lo que halla, no el motor.
    await page.addInitScript(() => {
      window.__llamadasMotor = 0;
      const poner = () => {
        if (!window.EstiloPartidas) return setTimeout(poner, 20);
        window.EstiloPartidas.evaluarConSharedEngine = (fen) => {
          window.__llamadasMotor++;
          const c = new Chess(fen);
          const ms = c.moves({ verbose: true });
          return Promise.resolve(ms.map((m) => {
            const u = m.from + m.to + (m.promotion || "");
            const g = new Chess(fen); g.move(m);
            const r = g.moves({ verbose: true })[0];
            return { uci: u, score: 10, pv: [u].concat(r ? [r.from + r.to + (r.promotion || "")] : []) };
          }));
        };
      };
      poner();
    });
  }
  await page.goto(BASE + ruta, { waitUntil: "domcontentloaded" });
  return { page, ctx, errores };
}

/* Contesta la prueba entera con los botones; devuelve cuántas posiciones vio. */
async function contestarTodo(page) {
  let n = 0;
  for (let i = 0; i < 60; i++) {
    if (await page.locator("#contexto-view:not(.hidden)").count()) break;
    await page.click('#q-options button[data-eleccion="a"]');
    await page.click('#q-seguridad button[data-seguridad="3"]');
    await page.click("#next-btn");
    n++;
  }
  return n;
}

async function llenarContexto(page) {
  await page.check('input[name="ritmo"][value="rapidas"]');
  await page.check('input[name="estudio"][value="medio"]');
  await page.fill("#ctx-elo", "1500");
  await page.selectOption("#ctx-blancas", "espanola-cerrada");
}

async function main() {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });

  console.log("\n=== Sin sesión ===");
  {
    const { page, ctx } = await abrir(browser, "/entreno/estilo.html", clienteFalso({ yo: null }));
    await page.waitForURL(/login\.html/, { timeout: 8000 }).catch(() => {});
    ok("sin sesión manda a login.html", /login\.html/.test(page.url()), page.url());
    await ctx.close();
  }

  console.log("\n=== La prueba entera, con los botones ===");
  {
    const { page, ctx, errores } = await abrir(browser, "/entreno/estilo.html", clienteFalso({ yo: "u-1", alumno: "u-1" }));
    await page.waitForSelector("#app:not(.hidden)", { timeout: 15000 });
    ok("sin cuentas en línea no ofrece sumar las partidas", !(await page.locator("#partidas-opcion").isVisible()));
    await page.click("#start-btn");
    await page.waitForSelector("#pregunta-view:not(.hidden)");
    const piezas = await page.$$eval("#q-board .example-sq", (c) => [c.length, c.filter((x) => x.querySelector("span")).length]);
    ok("el tablero dibuja 64 casillas con piezas", piezas[0] === 64 && piezas[1] > 4, JSON.stringify(piezas));
    ok("«Siguiente» empieza apagado", await page.isDisabled("#next-btn"));
    await page.click('#q-options button[data-eleccion="a"]');
    ok("con la jugada sola sigue apagado (falta la seguridad)", await page.isDisabled("#next-btn"));
    const marcadas = await page.$$eval("#q-board [data-square]", (c) => c.filter((x) => x.style.boxShadow).length);
    ok("la jugada elegida se marca en el tablero (salida y llegada)", marcadas === 2, "marcadas: " + marcadas);
    await page.click('#q-seguridad button[data-seguridad="2"]');
    ok("con la jugada y la seguridad se enciende", !(await page.isDisabled("#next-btn")));
    await page.click("#next-btn");
    ok("pasa a la posición 2", /^Posición 2/.test(await page.textContent("#q-counter")), await page.textContent("#q-counter"));
    const n = 1 + await contestarTodo(page);
    ok("termina entre 32 y 47 posiciones", n >= 32 && n <= 47, "vio " + n);

    await page.click("#ctx-btn");
    ok("sin ritmo ni estudio no se manda: dice qué falta", (await page.locator("#ctx-error").isVisible()) && /ritmo/.test(await page.textContent("#ctx-error")));
    await llenarContexto(page);
    await page.click("#ctx-btn");
    await page.waitForSelector("#resultado-view:not(.hidden)", { timeout: 10000 });
    const ejes = await page.$$eval("[data-estilo-perfil] [data-eje]", (f) => f.map((x) => [x.dataset.eje, x.dataset.etiqueta, x.textContent]));
    ok("el resultado trae los tres ejes", ejes.length === 3 && ["ataque", "estructura", "cambios"].every((e) => ejes.some((x) => x[0] === e)), JSON.stringify(ejes.map((x) => x[0])));
    ok("cada eje dice su margen escrito («entre X y Y %»)", ejes.every((x) => /entre \d+ y \d+ %/.test(x[2])));
    const grupos = await page.$$eval("[data-estilo-recomendacion] [data-grupo]", (f) => f.map((x) => [x.dataset.grupo, !!x.querySelector('a[href*="aperturas.html?linea="]'), x.querySelectorAll("li").length]));
    ok("recomienda con blancas, contra 1.e4 y contra 1.d4, con porqué y enlace", grupos.length === 3 && grupos.every((g) => g[1] && g[2] >= 2), JSON.stringify(grupos));

    await page.waitForFunction(() => window.__escrituras.some((e) => e.tabla === "estilo_pruebas"), null, { timeout: 5000 }).catch(() => {});
    const esc = await page.evaluate(() => window.__escrituras.filter((e) => e.tabla === "estilo_pruebas"));
    const fila = esc[0] && esc[0].fila;
    ok("guarda UNA prueba", esc.length === 1, JSON.stringify(esc).slice(0, 200));
    if (fila) {
      ok("a nombre del alumno de la sesión", fila.alumno_id === "u-1");
      ok("con todas las respuestas que dio", fila.respuestas.length === n, fila.respuestas.length + " de " + n);
      ok("con las dos de control marcadas", fila.respuestas.filter((r) => r.control).length === 2);
      ok("cada respuesta con su jugada, su seguridad y su tiempo", fila.respuestas.every((r) => /^[ab]$/.test(r.eleccion) && [1, 2, 3].includes(r.seguridad) && r.ms >= 0));
      ok("con el contexto", fila.contexto.ritmo === "rapidas" && fila.contexto.estudio === "medio" && fila.contexto.elo === 1500 && fila.contexto.actual.blancas === "espanola-cerrada", JSON.stringify(fila.contexto));
      ok("con la recomendación que se mostró", fila.recomendacion && fila.recomendacion.blancas && fila.recomendacion.e4 && fila.recomendacion.d4);
      ok("la hora no la manda el navegador", !("created_at" in fila));
      ok("sin partidas (no tenía cuentas)", fila.partidas === null);
    }
    ok("guardado: lo dice en pantalla", /guardado/.test(await page.textContent("#r-guardado")), await page.textContent("#r-guardado"));
    await page.click("#repeat-btn");
    ok("de vuelta en la portada, muestra «Tu última prueba»", await page.locator("#previo").isVisible());
    ok("sin errores en la consola", errores.length === 0, errores.join("\n      "));
    await ctx.close();
  }

  console.log("\n=== Con sus partidas de Lichess (motor de mentira) ===");
  {
    const { page, ctx, errores } = await abrir(browser, "/entreno/estilo.html",
      clienteFalso({ yo: "u-1", alumno: "u-1", cuentas: { lichess: "alumna1", chesscom: null, elo: { reciente: 1640 } } }), { motor: true });
    await page.waitForSelector("#app:not(.hidden)", { timeout: 15000 });
    ok("ofrece sumar sus partidas, nombrando la cuenta", (await page.locator("#partidas-opcion").isVisible()) && /alumna1/.test(await page.textContent("#partidas-cuentas")));
    await page.click("#start-btn");
    await page.waitForSelector("#pregunta-view:not(.hidden)");
    await contestarTodo(page);
    ok("pone su Elo en línea en «Cómo juegas»", (await page.inputValue("#ctx-elo")) === "1640");
    await llenarContexto(page);
    await page.click("#ctx-btn");
    await page.waitForSelector("#resultado-view:not(.hidden)", { timeout: 70000 });
    await page.waitForFunction(() => window.__escrituras.some((e) => e.tabla === "estilo_pruebas"), null, { timeout: 5000 }).catch(() => {});
    const llamadas = await page.evaluate(() => window.__llamadasMotor);
    ok("revisó sus partidas con el motor", llamadas > 0, "llamadas: " + llamadas + " · " + await page.textContent("#q-partidas"));
    const fila = await page.evaluate(() => (window.__escrituras.find((e) => e.tabla === "estilo_pruebas") || {}).fila);
    ok("guarda los momentos hallados ({eje, primero}), sin las partidas", fila && Array.isArray(fila.partidas) && fila.partidas.length > 0
      && fila.partidas.every((m) => ["ataque", "estructura", "cambios"].includes(m.eje) && typeof m.primero === "boolean" && Object.keys(m).length === 2),
      JSON.stringify(fila && fila.partidas));
    ok("sin errores en la consola (con partidas)", errores.length === 0, errores.join("\n      "));
    await ctx.close();
  }

  console.log("\n=== Contestando por escrito (Modo Adaptado) ===");
  {
    const { page, ctx, errores } = await abrir(browser, "/entreno/estilo.html", clienteFalso({ yo: "u-1", alumno: "u-1" }), { adaptado: true });
    await page.waitForSelector("#app:not(.hidden)", { timeout: 15000 });
    await page.click("#start-btn");
    await page.waitForSelector("#q-comandos .cc-input", { state: "visible", timeout: 8000 });
    const escribir = async (t) => {
      await page.fill("#q-comandos .cc-input", t);
      await page.press("#q-comandos .cc-input", "Enter");
      await page.waitForTimeout(300);
      return page.evaluate(() => { const m = Array.from(document.querySelectorAll("#q-comandos .cc-msg")).find((x) => x.checkVisibility()); return m ? m.textContent : ""; });
    };
    const antes = await page.textContent("#q-counter");
    const faltan = await escribir("siguiente");
    ok("«siguiente» sin contestar dice qué falta y no pasa", /falta/i.test(faltan) && (await page.textContent("#q-counter")) === antes, faltan);
    const dicho = await escribir("A muy seguro");
    ok("«A muy seguro» anota y pasa a la siguiente", /Anotado: jugada A, muy seguro/.test(dicho) && /^Posición 2/.test(await page.textContent("#q-counter")), dicho);
    const solo = await escribir("b");
    ok("de a una cosa: «b» pide la seguridad", /seguro/.test(solo) && /^Posición 2/.test(await page.textContent("#q-counter")), solo);
    await escribir("me da igual");
    ok("y «me da igual» la completa y pasa", /^Posición 3/.test(await page.textContent("#q-counter")));
    ok("sin errores en la consola (por escrito)", errores.length === 0, errores.join("\n      "));
    await ctx.close();
  }

  await browser.close();
  if (fallos) { console.log(`\n${fallos} comprobaciones fallaron.`); process.exit(1); }
  console.log("\nTodo en orden.");
}

main().catch((e) => { console.error(e); process.exit(2); });
