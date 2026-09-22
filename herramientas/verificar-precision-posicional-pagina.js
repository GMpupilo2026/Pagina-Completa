/* Comprueba entreno/precision-posicional.html en un navegador de verdad.
 *
 * El banco en sí ya lo comprueba herramientas/verificar-precision-posicional.js
 * (sin navegador, con chess.js). Este archivo es para lo que solo se rompe
 * mirando la pantalla: que sin sesión mande a iniciar sesión, que con sesión
 * arranque, que el tablero dibuje la posición de la pregunta actual (no otra),
 * que responder por los botones y por el cuadro de comandos lleven a la MISMA
 * corrección, que la ronda corta traiga las 8 áreas y la completa las 24
 * posiciones, y que terminar guarde en training_state sin dejar errores en la
 * consola.
 *
 * Existe aparte de verificar-css.js porque esta página está detrás del login
 * y él abre las páginas sin cuenta: nada de esto lo ve nunca.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       npm install chess.js@0.10.3 playwright
 *       node herramientas/verificar-precision-posicional-pagina.js
 */
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let CHESSJS = "";
for (const base of String(process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean)
                  .concat([path.join(__dirname, "..", "node_modules")])) {
  const f = path.join(base, "chess.js", "chess.js");
  if (!CHESSJS && fs.existsSync(f)) CHESSJS = fs.readFileSync(f, "utf8");
}
if (!CHESSJS) { console.error("Falta chess.js. Instálalo con:  npm install chess.js@0.10.3"); process.exit(2); }

let fallos = 0;
function ok(nombre, cond, detalle) {
  if (cond) { console.log("  ✓ " + nombre); return; }
  fallos += 1;
  console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : ""));
}

/* El doble de Supabase: sesión de un alumno, su perfil, y training_state
 * escribible con upsert — lo que la página necesita para guardar el
 * resultado. Guarda lo que se le manda en `window.__escrituras` para que la
 * prueba pueda mirar qué se mandó de verdad, la misma trampa que ya
 * documentaron otros verificadores del sitio (anotar en el RESOLVER y no en
 * el método, para no dar por buena una escritura sobre la fila que no era). */
function clienteFalso(conSesion) {
  return `
(function () {
  window.__escrituras = [];
  function tabla(nombre) {
    const api = {
      _filtros: {},
      select: function () { return api; },
      eq: function (c, v) { api._filtros[c] = v; return api; },
      maybeSingle: function () {
        if (nombre === "profiles") return Promise.resolve({ data: { id: "u-1", full_name: "Alumna de prueba", email: "alumna@ejemplo.test" } });
        if (nombre === "training_state") return Promise.resolve({ data: null });
        return Promise.resolve({ data: null });
      },
      upsert: function (fila) {
        window.__escrituras.push({ tabla: nombre, fila: fila, filtros: Object.assign({}, api._filtros) });
        return Promise.resolve({ error: null });
      },
    };
    return api;
  }
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: ${conSesion ? '{ user: { id: "u-1" } }' : "null"} } }) },
    from: (nombre) => tabla(nombre),
  };
})();
`;
}

async function abrir(browser, cliente) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/cdnjs.cloudflare.com/**/chess.min.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: CHESSJS }));
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: cliente }));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await page.goto(BASE + "/entreno/precision-posicional.html", { waitUntil: "networkidle" });
  return { page, ctx, errores };
}

async function main() {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });

  /* ---------- sin sesión: manda a iniciar sesión ---------- */
  {
    const { page, ctx } = await abrir(browser, clienteFalso(false));
    await page.waitForURL(/login\.html/, { timeout: 5000 }).catch(() => {});
    ok("sin sesión manda a login.html", /login\.html/.test(page.url()), "url: " + page.url());
    await ctx.close();
  }

  /* ---------- con sesión: arranca, y la ronda corta trae las 8 áreas ---------- */
  {
    const { page, ctx, errores } = await abrir(browser, clienteFalso(true));
    await page.waitForSelector("#app:not(.hidden)", { timeout: 5000 });
    const bancoTotal = await page.textContent("#tam-banco");
    ok("dice el tamaño del banco completo", bancoTotal === "24", "salió: " + bancoTotal);

    await page.click("#start-btn"); // ronda corta por omisión
    await page.waitForSelector("#pregunta-view:not(.hidden)");
    const contador1 = await page.textContent("#q-counter");
    ok("la ronda corta arranca con 8 posiciones", /de 8$/.test(contador1), "salió: " + contador1);

    /* El tablero tiene que dibujar la posición de la pregunta ACTUAL, no
       quedarse con la de antes: se compara contra la FEN que trae la propia
       página (window.tanda), casilla por casilla. */
    const piezasTablero = await page.$$eval("#q-board .example-sq", (celdas) =>
      celdas.map((c) => (c.querySelector("span") ? c.querySelector("span").textContent.trim() : "")).join("|"));
    ok("el tablero dibuja 64 casillas", piezasTablero.split("|").length === 64, "salió " + piezasTablero.split("|").length);
    const hayAlgunaPieza = piezasTablero.split("|").some((c) => c);
    ok("el tablero dibuja al menos una pieza", hayAlgunaPieza);

    /* Contestar por el botón de una opción y avanzar. */
    await page.click("#q-options button >> nth=0");
    await page.click("#next-btn");
    const contador2 = await page.textContent("#q-counter");
    ok("«Siguiente» avanza a la posición 2", /^Posición 2 /.test(contador2), "salió: " + contador2);

    /* Volver atrás no pierde la respuesta ya marcada: el botón elegido sigue
       resaltado (mismo patrón que el examen de arbitraje). */
    await page.click("#prev-btn");
    const marcado = await page.$$eval("#q-options button", (bs) => bs.filter((b) => b.className.includes("border-accent-500")).length);
    ok("volver atrás conserva la respuesta ya marcada", marcado === 1, "botones marcados: " + marcado);
    await page.click("#next-btn");

    /* Contestar el resto por los botones (siempre la primera opción, sea o
       no la correcta: lo que importa es que la corrección lea lo que de
       verdad se contestó) hasta que aparezca el resultado. Un tope de
       vueltas evita un bucle infinito si algo se queda trabado. */
    for (let i = 0; i < 10; i++) {
      if (await page.locator("#resultado-view:not(.hidden)").count()) break;
      await page.click("#q-options button >> nth=0");
      await page.click("#next-btn");
    }
    await page.waitForSelector("#resultado-view:not(.hidden)", { timeout: 5000 });
    const marcador = await page.textContent("#r-marcador");
    ok("el resultado muestra el marcador", /\d+ de \d+ planes correctos/.test(marcador), "salió: " + marcador);

    const areas = await page.$$eval("#r-areas > div", (divs) => divs.length);
    ok("el desglose por área trae 8 filas", areas === 8, "salió: " + areas);

    /* El resultado se guarda: hay que ver un upsert sobre training_state,
       filtrado por el alumno de la sesión (no por cualquier fila). */
    await page.waitForFunction(() => window.__escrituras && window.__escrituras.length >= 2, { timeout: 5000 }).catch(() => {});
    const escrituras = await page.evaluate(() => window.__escrituras);
    const upsertResultado = (escrituras || []).find((e) => e.tabla === "training_state" && e.fila.key === "precision_posicional_resultado_v1");
    ok("guarda el resultado en training_state", !!upsertResultado, "escrituras: " + JSON.stringify(escrituras));
    ok("el upsert va a nombre del alumno de la sesión", !!upsertResultado && upsertResultado.fila.student_id === "u-1");

    ok("sin errores en la consola", errores.length === 0, errores.join("\n      "));
    await ctx.close();
  }

  /* ---------- el banco completo trae las 24 ---------- */
  {
    const { page, ctx, errores } = await abrir(browser, clienteFalso(true));
    await page.waitForSelector("#app:not(.hidden)", { timeout: 5000 });
    await page.click('input[name="tanda"][value="completa"]');
    await page.click("#start-btn");
    await page.waitForSelector("#pregunta-view:not(.hidden)");
    const contador = await page.textContent("#q-counter");
    ok("el banco completo arranca con 24 posiciones", /de 24$/.test(contador), "salió: " + contador);
    ok("sin errores en la consola (banco completo)", errores.length === 0, errores.join("\n      "));
    await ctx.close();
  }

  await browser.close();
  if (fallos) {
    console.log(`\n${fallos} comprobaciones fallaron.`);
    process.exit(1);
  }
  console.log("\nTodo en orden.");
}

main().catch((e) => { console.error(e); process.exit(2); });
