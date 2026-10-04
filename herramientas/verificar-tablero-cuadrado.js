/* Comprueba que los tableros de 8×8 salgan CUADRADOS, con las ocho filas y
 * las ocho columnas del mismo tamaño, en el celular, la tableta y la
 * computadora.
 *
 * Se rompía callado: con `grid-template-rows: repeat(8, 1fr)` una fila no
 * puede ser más chica que lo que trae adentro, y las casillas heredaban el
 * interlineado de 1,5 del sitio. Con la pieza a 27 px el renglón medía 41 px
 * en una casilla de 38, así que en el celular las filas con piezas crecían y
 * el tablero salía estirado: 38×41 en Estudio y Aperturas, 310×332 en Repasar
 * clases, y la ficha impresa de Estudio de 232×268. Se veía «más o menos
 * bien» y nadie lo notaba. El arreglo es `minmax(0,1fr)` y `line-height:1` en
 * la casilla (ver «Estudio: una ficha por idea» en docs/decisiones/entrenamiento.md).
 *
 * Se mide la maqueta de verdad (gridTemplateRows ya resuelto y el rectángulo
 * del tablero), no la regla del CSS: un tablero que dibuja bien con otra
 * regla también pasa.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       node herramientas/verificar-tablero-cuadrado.js
 */
"use strict";
const fs = require("fs");
const { chromium } = require("./lib/playwright-con-sesion");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const FEN = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";

// Cada página y cómo se hace aparecer su tablero sin una partida de verdad.
const PAGINAS = [
  { ruta: "/entreno/estudio.html?ficha=espanola" },
  { ruta: "/entreno/estudio.html?ficha=oposicion" },
  { ruta: "/entreno/aperturas.html", abrir: () => empezar(AperturasLineas.LINEAS[0].id) },
  { ruta: "/repasar-clases.html", abrir: (fen) => {
      pintarTablero(fen);
      for (let e = document.getElementById("board"); e && e !== document.body; e = e.parentElement) {
        if (getComputedStyle(e).display === "none") e.style.display = "block";
        e.classList.remove("hidden"); e.hidden = false;
      }
    } },
  { ruta: "/entreno/finales.html" },
  { ruta: "/entreno/mates.html" },
  // Coordenadas es un tablero sin piezas, a propósito.
  { ruta: "/entreno/coordenadas.html", abrir: () => document.getElementById("start-btn").click(), sinPiezas: true },
];
const ANCHOS = [[360, 740], [390, 800], [768, 900], [1280, 900]];

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

// Los tableros visibles de la página: una cuadrícula con 64 hijos.
const MEDIR = () => [...document.querySelectorAll("*")].filter((e) =>
  e.children.length === 64 && getComputedStyle(e).display === "grid" && e.getClientRects().length && e.getBoundingClientRect().width > 60
).map((t) => {
  const cs = getComputedStyle(t);
  const filas = cs.gridTemplateRows.split(" ").map(parseFloat);
  const cols = cs.gridTemplateColumns.split(" ").map(parseFloat);
  const r = t.getBoundingClientRect();
  const rango = (a) => Math.max(...a) - Math.min(...a);
  return { id: t.id || String(t.className).slice(0, 20), ancho: r.width, alto: r.height,
    filas: rango(filas), cols: rango(cols), fila: filas[0], col: cols[0], conPiezas: t.querySelectorAll("span").length };
});

let fallos = 0;
function ok(nombre, cond, detalle) {
  if (cond) { console.log("  ✓ " + nombre); return; }
  fallos += 1;
  console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : ""));
}

(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
    for (const [ancho, alto] of ANCHOS) {
      console.log(`\n=== ${ancho} × ${alto} ===`);
      const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: ancho, height: alto } });
      await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
      await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
      await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
      await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: CLIENTE }));
      const page = await ctx.newPage();
      for (const P of PAGINAS) {
        await page.goto(BASE + P.ruta, { waitUntil: "networkidle", timeout: 30000 });
        await page.waitForTimeout(600);
        if (P.abrir) { await page.evaluate(P.abrir, FEN); await page.waitForTimeout(500); }
        const tableros = await page.evaluate(MEDIR);
        const malos = tableros.filter((t) => t.filas > 1 || t.cols > 1 || Math.abs(t.ancho - t.alto) > 2 || Math.abs(t.fila - t.col) > 1);
        ok(`${P.ruta}: cuadrado y con las filas parejas`,
          tableros.length > 0 && (P.sinPiezas || tableros.some((t) => t.conPiezas > 0)) && !malos.length,
          !tableros.length ? "no apareció ningún tablero" : !tableros.some((t) => t.conPiezas > 0) ? "el tablero salió sin piezas"
            : malos.map((t) => `${t.id}: ${t.ancho.toFixed(1)}×${t.alto.toFixed(1)}, casilla ${t.col.toFixed(1)}×${t.fila.toFixed(1)}, filas desparejas ${t.filas.toFixed(1)} px`).join("; "));
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n✗ ${fallos} problema(s).` : "\n✓ Todo bien.");
  process.exit(fallos ? 1 : 0);
})();
