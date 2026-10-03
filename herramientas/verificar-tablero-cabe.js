/* Comprueba que el tablero de Habilidades (entreno/tipos.html) cabe en la
 * pantalla, con js/tablero-cabe.js, en pantallas de varios altos.
 *
 * Antes el tablero solo tenía un ancho máximo (420 px) y en una pantalla baja
 * se cortaba por abajo: se veía la fila 1 y no la 8. Se mide la pantalla de
 * verdad (getBoundingClientRect contra innerHeight), no la variable:
 *   - en una laptop baja, el tablero entero se ve SIN bajar;
 *   - en una pantalla alta queda de 420 px, como antes (no se achica de más);
 *   - en el celular de pie lo manda el ancho, como antes;
 *   - en una pantalla muy baja no baja de 260 px y, al bajar hasta él, entra
 *     entero debajo del encabezado fijo.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       node herramientas/verificar-tablero-cabe.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const DATOS = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "entreno/data/tipos.json"), "utf8"));

let fallos = 0;
function ok(nombre, cond, detalle) {
  if (cond) { console.log("  ✓ " + nombre); return; }
  fallos += 1;
  console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : ""));
}

const CLIENTE = `
(function () {
  function tabla() {
    const api = {};
    ["select", "limit", "eq", "neq", "in", "or", "order", "range", "gte", "lte", "is"].forEach((m) => { api[m] = () => api; });
    api.maybeSingle = api.single = () => Promise.resolve({ data: null, error: null });
    api.upsert = api.insert = () => Promise.resolve({ error: null });
    api.then = (res, rej) => Promise.resolve({ data: [], error: null }).then(res, rej);
    return api;
  }
  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: "u-1" }, access_token: "t" } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: () => tabla(),
    rpc: () => Promise.resolve({ data: null, error: null }),
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); } }),
    removeChannel: () => {},
  };
})();
`;

async function medir(browser, ancho, alto, hash) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: ancho, height: alto } });
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: CLIENTE }));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(BASE + "/entreno/tipos.html" + hash, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#vista-juego:not(.hidden) #tablero [data-square]", { timeout: 15000 });
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => {
    const t = document.getElementById("tablero").getBoundingClientRect();
    const col = document.getElementById("tablero").parentElement.getBoundingClientRect();
    return { arriba: t.top, abajo: t.bottom, lado: t.width, alto: window.innerHeight, col: col.width };
  });
  // Bajar hasta el tablero, como lo haría quien juega.
  const bajado = await page.evaluate(() => {
    const h = document.getElementById("header").getBoundingClientRect().height;
    const turno = document.getElementById("juego-turno");
    const objetivo = turno.getBoundingClientRect().top + window.scrollY - h;
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo({ top: objetivo, behavior: "instant" });
    const t = document.getElementById("tablero").getBoundingClientRect();
    return { arriba: t.top, abajo: t.bottom, h, alto: window.innerHeight, y: window.scrollY, objetivo, doc: document.documentElement.scrollHeight };
  });
  await page.screenshot({ path: `/tmp/tablero-cabe-${ancho}x${alto}.png` }).catch(() => {});
  await ctx.close();
  return { m, bajado, errores };
}

async function main() {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  const item = DATOS.amenaza.find((x) => x.nivel === 1) || DATOS.amenaza[0];
  const hash = "#amenaza/1/" + item.id;

  for (const [ancho, alto] of [[1366, 600], [1280, 650], [1440, 700]]) {
    console.log(`\n=== Laptop baja ${ancho} × ${alto} ===`);
    const { m, errores } = await medir(browser, ancho, alto, hash);
    ok("el tablero entero se ve sin bajar", m.abajo <= m.alto, JSON.stringify(m));
    ok("y no queda diminuto (≥ 260 px)", m.lado >= 259, JSON.stringify(m));
    ok("sin errores", !errores.length, errores.join(" | "));
  }

  console.log("\n=== Pantalla alta 1920 × 1080 ===");
  {
    const { m } = await medir(browser, 1920, 1080, hash);
    ok("queda de 420 px, como antes", Math.round(m.lado) === 420, JSON.stringify(m));
    ok("y se ve entero", m.abajo <= m.alto, JSON.stringify(m));
  }

  console.log("\n=== Celular de pie 390 × 844 ===");
  {
    const { m } = await medir(browser, 390, 844, hash);
    ok("lo manda el ancho, como antes", Math.abs(m.lado - Math.min(420, m.col)) <= 1, JSON.stringify(m));
  }

  console.log("\n=== Pantalla muy baja 1024 × 420 ===");
  {
    const { m, bajado } = await medir(browser, 1024, 420, hash);
    ok("no baja de 260 px", m.lado >= 259, JSON.stringify(m));
    ok("al bajar hasta él, entra entero debajo del encabezado", bajado.arriba >= bajado.h && bajado.abajo <= bajado.alto, JSON.stringify(bajado));
  }

  await browser.close();
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
