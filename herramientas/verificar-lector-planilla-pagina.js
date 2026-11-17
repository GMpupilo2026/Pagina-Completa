/* El Lector de planilla (lector-planilla.html, js/lector-planilla.js) arma la
 * partida por COLUMNAS, con el lector del Centroamericano
 * (js/planilla-reconstruir.js: hojasDeLaFoto + reconstruir en su hilo), y no
 * por filas de toda la foto.
 *
 * Por qué existe: el 17/11 una planilla real de la Federación (columnas 1-20,
 * 21-40, 41-60) salió con 111 jugadas y 109 «adivinadas» sin sentido
 * («1. a3 Cc6 2. d3 Tb8»): leer por filas pone la jugada 1 al lado de la 21 y
 * la 41, y cambiar cada texto por la jugada legal más parecida lo tapa todo con
 * jugadas legales. La página se veía perfecta. Ver «El Lector de planilla lee
 * por columnas» en docs/decisiones/juegos-y-torneos.md.
 *
 * Lo que se prueba:
 *   - sin navegador: con una planilla de tres columnas, el orden por filas da
 *     basura (lo que pasó) y hojasDeLaFoto da las celdas tal cual;
 *   - en la página, con un doble de ocr-scoresheet que contesta lo que
 *     devolvería Google Vision de una foto (herramientas/lib/planilla-sintetica.js
 *     con lo escrito en planillas de verdad, herramientas/lib/planillas-reales.js):
 *     la foto va una vez con el token, salen las jugadas de reconstruir(), con
 *     sus marcas (* corregida, ? dudosa) escritas y dichas al lector de pantalla,
 *     sin ningún «≈»; el PGN las trae; una planilla con basura al final queda
 *     «ilegible desde la jugada N», con lo escrito, sin inventar jugadas; guardar
 *     usa lo que dice el cuadro (y no guarda un PGN roto); una foto sin nada
 *     escrito lo dice; y el aviso de ilegible se lee en claro y en oscuro (AA).
 *     Deja las capturas lector-planilla-claro.png y -oscuro.png en la carpeta
 *     temporal del sistema, para mirar la pantalla.
 *
 * Uso:  node herramientas/verificar-todo.js lector-planilla-pagina
 */
"use strict";
const os = require("os");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const { Chess } = require("chess.js");
const { clienteFalso, BASE } = require("./lib/doble-entreno");
const { instalarAvisos } = require("./lib/avisos-prueba");
const { palabrasDePlanillas } = require("./lib/planilla-sintetica.js");
const REALES = require("./lib/planillas-reales.js");

const RAIZ = path.join(__dirname, "..");
const PO = require(path.join(RAIZ, "js/planilla-ocr.js"));
const R = require(path.join(RAIZ, "js/planilla-reconstruir.js"));

let fallos = 0;
const ok = (c, m, detalle) => {
  if (c) console.log("  ✓ " + m);
  else { fallos += 1; console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 600) : "")); }
};
const igual = (m, a, b) => { const ja = JSON.stringify(a), jb = JSON.stringify(b); ok(ja === jb, m, "esperaba " + jb + ", salió " + ja); };

// Una planilla de la Federación con las jugadas en tres columnas (1-20, 21-40, 41-54): lo escrito en la
// de la mesa 5 (en inglés hasta la 40, en español después, con «Kg4» por «Ng4»).
const TRES_COLUMNAS = REALES.mesa5.una;
// Una planilla manchada desde la media jugada 30: lo de ahí no se parece a ninguna jugada.
const BASURA = ["~", "zz", "q#", "Kx", "77", "~~", "w", "p0", "##", "y", "~", "Q?"];
const CORTADA = REALES.mesa11.blancas.slice(0, 30).concat(BASURA);
// Una imagen de verdad (1×1 PNG): planilla-ocr.js la achica en un <canvas> antes de mandarla.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

function esperado(palabras) {
  const { hojas, metodo } = R.hojasDeLaFoto(palabras);
  const r = R.reconstruir(Chess, hojas);
  return { hojas, metodo, r };
}

function pruebaSinNavegador() {
  console.log("\n=== Una planilla de tres columnas: por filas no, por columnas sí ===");
  const palabras = palabrasDePlanillas([TRES_COLUMNAS], { giro: 3 });
  const viejo = PO.leerTokens(Chess, PO.reconstructMoveTokens(palabras));
  ok(viejo.adivinadas.length > viejo.jugadas.length / 3,
    "leída por filas (como antes), más de un tercio de las jugadas salen «adivinadas» (" + viejo.adivinadas.length + " de " + viejo.jugadas.length + ")");
  const { hojas, metodo, r } = esperado(palabras);
  igual("hojasDeLaFoto encuentra los números impresos y da UNA planilla", [metodo, hojas.length], ["numeros", 1]);
  igual("con lo escrito en cada celda, en orden (1, 21 y 41 no se mezclan)", hojas[0], TRES_COLUMNAS);
  ok(r.ilegibleDesde === null && r.jugadas.length >= TRES_COLUMNAS.length - 2,
    "y reconstruir arma la partida entera (" + r.jugadas.length + " medias jugadas de " + TRES_COLUMNAS.length + " celdas)");
  igual("que empieza como está escrita", r.jugadas.slice(0, 8).map((j) => j.san), ["e4", "c6", "d4", "d5", "e5", "c5", "c3", "Nc6"]);
}

async function abrir(browser, palabras, local) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1200, height: 900 } });
  if (local) await ctx.addInitScript((l) => { for (const k in l) localStorage.setItem(k, l[k]); }, local);
  // El doble de supabase-client.js no trae SUPABASE_URL: la función se llama en el mismo sitio y se contesta abajo.
  await ctx.addInitScript((u) => { window.SUPABASE_URL = u; }, BASE + "/doble-supabase");
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript",
    body: clienteFalso({ profiles: [{ id: "u-ana", full_name: "Ana Prueba", role: "profesor", is_admin: true }], saved_games: [] }) }));
  await ctx.route(/supabase\.co|sentry|googletagmanager|cloudflareinsights|fonts\.g/, (r) => r.abort());
  const pedidos = [];
  await ctx.route("**/functions/v1/ocr-scoresheet", (route) => {
    pedidos.push({ auth: route.request().headers().authorization, cuerpo: JSON.parse(route.request().postData() || "{}") });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ words: palabras }) });
  });
  const page = await ctx.newPage();
  await instalarAvisos(page);
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(BASE + "/lector-planilla.html", { waitUntil: "load" });
  await page.waitForFunction(() => document.getElementById("app").checkVisibility());
  return { ctx, page, pedidos, errores };
}

async function leer(page) {
  await page.setInputFiles("#sheet-input-file", { name: "planilla.png", mimeType: "image/png", buffer: PNG });
  await page.click("#read-btn");
}

const seVe = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.checkVisibility(); }, sel);

// El contraste del texto contra el fondo que tiene de verdad detrás (WCAG).
const contraste = (page, sel) => page.evaluate((s) => {
  const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number);
  const fondo = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length === 3 || c[3] > 0) return c; } return [255, 255, 255]; };
  const lum = (c) => { const [r, g, b] = c.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const el = document.querySelector(s), a = lum(rgb(getComputedStyle(el).color)), b = lum(fondo(el));
  return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
}, sel);

async function pruebaPagina(browser) {
  console.log("\n=== Una planilla de tres columnas, en la página ===");
  const palabras = palabrasDePlanillas([TRES_COLUMNAS], { giro: 3, partir: true });
  const e = esperado(palabras);
  const { ctx, page, pedidos, errores } = await abrir(browser, palabras);
  await leer(page);
  await page.waitForFunction(() => document.getElementById("result-section").checkVisibility(), null, { timeout: 90000 });
  igual("la foto fue una sola vez a ocr-scoresheet, con el token de la sesión", [pedidos.length, pedidos[0] && pedidos[0].auth], [1, "Bearer t"]);
  ok(pedidos[0] && pedidos[0].cuerpo.image_base64 && pedidos[0].cuerpo.image_base64.length > 20, "y lleva la foto");
  const n = e.r.jugadas.length, cuenta = (x) => e.r.jugadas.filter((j) => j.estado === x).length;
  const estado = await page.textContent("#process-status");
  ok(estado.includes("Listo: " + n + " medias jugadas"), "dice cuántas medias jugadas armó (las de reconstruir: " + n + ")", estado);
  const resumen = await page.textContent("#resumen");
  ok(resumen.includes(cuenta("leida") + " leídas tal cual") && resumen.includes(cuenta("corregida") + " corregidas (*)") && resumen.includes(cuenta("dudosa") + " dudosas (?)"),
    "y cuántas se leyeron tal cual, corregidas y dudosas", resumen);
  const lista = await page.$$eval("#move-list .lp-jugada", (l) => l.map((s) => ({ estado: s.dataset.estado, texto: s.firstChild.textContent, sr: (s.querySelector(".sr-only") || {}).textContent || "", title: s.title })));
  igual("la lista trae una entrada por media jugada, con el estado de reconstruir", lista.map((x) => x.estado), e.r.jugadas.map((j) => j.estado));
  const marcas = lista.map((x) => (/ \*$/.test(x.texto) ? "corregida" : / \?$/.test(x.texto) ? "dudosa" : "leida"));
  igual("cada una lleva su marca escrita (sin marca, * o ?)", marcas, e.r.jugadas.map((j) => j.estado));
  igual("en español (Cc6, no Nc6)", lista.slice(0, 8).map((x) => x.texto.replace(/ [*?]$/, "")), ["e4", "c6", "d4", "d5", "e5", "c5", "c3", "Cc6"]);
  const conMarca = lista.filter((x) => x.estado !== "leida");
  ok(conMarca.length > 0 && conMarca.every((x) => /\((corregida|dudosa)(; en la planilla: «.+»)?\)/.test(x.sr) && /en la planilla/.test(x.title)),
    "las corregidas y dudosas le dicen al lector de pantalla cómo se leyeron y qué estaba escrito (" + conMarca.length + ")", JSON.stringify(conMarca.slice(0, 3)));
  ok(!(await page.textContent("#process-section")).includes("≈"), "ya no hay ninguna jugada «adivinada» (≈)");
  ok(!(await seVe(page, "#ilegible")), "con la planilla entera, no hay aviso de ilegible");
  const pgn = await page.inputValue("#pgn-output");
  const g = new Chess();
  ok(g.load_pgn(pgn, { sloppy: true }), "el PGN del cuadro es válido", pgn.slice(0, 300));
  const piezas = g.fen().split(" ")[0].replace(/[^a-z]/gi, "").length;
  igual("el tablero muestra la posición final (sus " + piezas + " piezas)", await page.$$eval("#process-board button svg", (l) => l.length), piezas);
  igual("y trae las mismas jugadas", g.history(), e.r.jugadas.map((j) => j.san));
  ok(/\[Date "\d{4}\.\d{2}\.\d{2}"\]/.test(pgn), "con la fecha de hoy");
  if (cuenta("dudosa")) ok((pgn.match(/\{dudosa\}/g) || []).length === cuenta("dudosa"), "y las dudosas marcadas en el PGN");

  console.log("\n=== Guardar en Archivos usa lo que dice el cuadro ===");
  await page.click("#save-shared-btn");
  await page.waitForFunction(() => /Guardado en Archivos/.test(document.getElementById("save-status").textContent));
  const ins = await page.evaluate(() => window.__inserts.filter((x) => x.tabla === "saved_games").map((x) => x.rows));
  igual("se guardó una partida con sus medias jugadas y su posición final", [ins.length, ins[0] && ins[0].move_count, ins[0] && ins[0].fen_final], [1, n, g.fen()]);
  await page.fill("#pgn-output", "1. e4 e5 2. Re5 *");
  await page.click("#save-shared-btn");
  await page.waitForFunction(() => /El PGN tiene un error/.test(document.getElementById("save-status").textContent));
  igual("un PGN con una jugada ilegal no se guarda, y lo dice", await page.evaluate(() => window.__inserts.filter((x) => x.tabla === "saved_games").length), 1);
  await page.fill("#pgn-output", "1. e4 e5 2. Nf3 *");
  await page.click("#save-shared-btn");
  await page.waitForFunction(() => window.__inserts.filter((x) => x.tabla === "saved_games").length === 2);
  const corregida = await page.evaluate(() => window.__inserts.filter((x) => x.tabla === "saved_games")[1].rows);
  igual("lo corregido a mano se guarda con su posición, no con la de lo leído", corregida.move_count, 3);
  igual("sin errores en la página", errores, []);
  await ctx.close();

  console.log("\n=== Una planilla manchada desde la media jugada 30 ===");
  for (const tema of ["claro", "oscuro"]) {
    const pc = palabrasDePlanillas([CORTADA]);
    const ec = esperado(pc);
    const a = await abrir(browser, pc, tema === "oscuro" ? { theme: "dark" } : null);
    await leer(a.page);
    await a.page.waitForFunction(() => document.getElementById("result-section").checkVisibility(), null, { timeout: 90000 });
    if (tema === "claro") {
      ok(ec.r.ilegibleDesde !== null && ec.r.ilegibleDesde <= 30, "reconstruir corta antes de la basura (en la media jugada " + ec.r.ilegibleDesde + ")");
      const nl = await a.page.$$eval("#move-list .lp-jugada", (l) => l.length);
      igual("la lista llega solo hasta ahí: no se inventa nada", nl, ec.r.ilegibleDesde);
      ok(await seVe(a.page, "#ilegible"), "se ve el aviso de ilegible");
      const t = await a.page.textContent("#ilegible");
      const ply = ec.r.ilegibleDesde, quien = "jugada " + (Math.floor(ply / 2) + 1) + (ply % 2 ? " de las negras" : " de las blancas");
      ok(t.includes("Ilegible desde la " + quien), "dice desde qué jugada («" + quien + "»)", t);
      ok(t.includes("zz") && t.includes("q#"), "y lo que dice la planilla de ahí en adelante, tal cual", t);
      const pgn = await a.page.inputValue("#pgn-output");
      ok(/ilegible/.test(pgn) && /\*\s*$/.test(pgn) && /\[Result "\*"\]/.test(pgn), "el PGN lo dice en un comentario y termina en «*»", pgn.slice(-200));
    }
    await a.page.locator("#process-section").screenshot({ path: path.join(os.tmpdir(), "lector-planilla-" + tema + ".png") });
    const c = await contraste(a.page, "#ilegible p");
    ok(c >= 4.5, "el aviso de ilegible se lee en " + tema + " (contraste " + c + ", AA pide 4,5)");
    igual("sin errores en la página (" + tema + ")", a.errores, []);
    await a.ctx.close();
  }

  console.log("\n=== Una foto sin nada escrito ===");
  const v = await abrir(browser, []);
  await leer(v.page);
  await v.page.waitForFunction(() => (window.__avisos || []).some((t) => /No encontré nada escrito/.test(t)));
  ok(true, "lo dice en palabras");
  ok(!(await seVe(v.page, "#process-section")) && !(await seVe(v.page, "#result-section")), "y no muestra ninguna partida");
  ok(await v.page.isEnabled("#read-btn"), "se puede volver a intentar");
  await v.ctx.close();
}

(async () => {
  pruebaSinNavegador();
  const browser = await chromium.launch();
  try { await pruebaPagina(browser); } catch (e) { fallos += 1; console.log("  ✗ la prueba con navegador se cayó\n" + e.stack); }
  await browser.close();
  console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
  process.exit(fallos ? 1 : 0);
})();

/*! rev bfb5bbb0d2d82f9f */
