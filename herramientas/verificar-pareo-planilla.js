/* «📷 Planilla» en cada mesa de Pareo Integral: la partida, de la foto de las
 * planillas a PGN (js/pareo/planilla.js, con el lector del Centroamericano:
 * js/planilla-ocr.js, js/planilla-reconstruir.js y su hilo).
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - el PGN sale con los nombres, la ronda y el resultado de la MESA (no de
 *     la planilla); lo que no es una partida jugada (+/−) queda «*»;
 *   - el PGN no lleva las marcas de «dudosa» (se publica), pero el cuadro sí
 *     las dice, con lo escrito, y dice desde dónde la planilla es ilegible;
 *   - nada se guarda solo: lo leído se abre en «Partida (PGN)» y se guarda al
 *     tocar «Guardar la partida», pasando por la misma revisión de chess.js;
 *   - la foto va a ocr-scoresheet con el token de la sesión; sin sesión no se
 *     manda nada y lo dice;
 *   - una mesa que ya tiene partida pregunta antes de leer.
 *
 * Google Vision no se llama: un doble de ocr-scoresheet contesta lo que
 * devolvería de dos planillas de verdad (herramientas/lib/planillas-reales.js,
 * armadas en una foto por herramientas/lib/planilla-sintetica.js).
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-planilla.js
 */
const path = require("path");
const { chromium } = require("playwright");
const { Chess } = require("chess.js");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const PL = require(path.join(RAIZ, "js/pareo/planilla.js"));
const PP = require(path.join(RAIZ, "js/pareo/partida.js"));
const R = require(path.join(RAIZ, "js/planilla-reconstruir.js"));
const X = require(path.join(RAIZ, "js/pareo/textos.js"));
const REALES = require("./lib/planillas-reales.js");
const { palabrasDePlanillas } = require("./lib/planilla-sintetica.js");
const P = require("./lib/pareo-pruebas");

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 500) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));
const igual = (m, a, b) => { const ja = JSON.stringify(a), jb = JSON.stringify(b); ok(ja === jb, m, ja === jb ? "" : "esperaba " + jb + ", salió " + ja); };
const tx = (k, v) => X.t("es", k, v);
const formulario = 'dialog[data-avisos="formulario"][open]';
const confirmar = 'dialog[data-avisos="confirmar"][open]';

// Las dos planillas de verdad de la mesa 11, y una cortada con basura al final.
const HOJAS = [REALES.mesa11.blancas, REALES.mesa11.negras];
const BASURA = ["~", "zz", "q#", "Kx", "77", "~~", "w", "p0", "##", "y", "~", "Q?"];
const CORTADA = [REALES.mesa11.blancas.slice(0, 30).concat(BASURA), REALES.mesa11.negras.slice(0, 30).concat(BASURA)];

function pruebaSinNavegador() {
  console.log("\n=== El PGN y lo que se dice en el cuadro ===");
  const r = R.reconstruir(Chess, HOJAS);
  const pgn = PL.pgn(Chess, r, { Event: "PRUEBA PLANILLA", Round: "2", White: "PRUEBA A", Black: "PRUEBA B", Result: "=" });
  ok(/\[White "PRUEBA A"\]/.test(pgn) && /\[Black "PRUEBA B"\]/.test(pgn) && /\[Round "2"\]/.test(pgn), "lleva los nombres y la ronda de la mesa", pgn.slice(0, 300));
  ok(/\[Result "1\/2-1\/2"\]/.test(pgn) && /1\/2-1\/2\s*$/.test(pgn), "el resultado de la mesa («=») va como 1/2-1/2, en la cabecera y al final");
  ok(!/dudosa|\*\s*\d|\?\s/.test(pgn.split("\n\n")[1]), "el PGN no lleva marcas de corregida ni dudosa");
  const leida = PP.leer(pgn, Chess);
  igual("y Pareo lo acepta tal cual, con las mismas jugadas", [leida.ok, leida.jugadas], [true, r.jugadas.map((j) => j.san)]);
  igual("una mesa ganada por ausencia (+/−) no es una partida: queda «*»", /\[Result "\*"\]/.test(PL.pgn(Chess, r, { Result: "+-" })), true);
  igual("y una mesa sin resultado, también", /\[Result "\*"\]/.test(PL.pgn(Chess, r, { Result: "" })), true);
  igual("las comillas de un nombre no rompen la cabecera", /\[White "PRUEBA C"\]/.test(PL.pgn(Chess, r, { White: 'PRUEBA "C"' })), true);

  const res = PL.resumen(r, tx);
  const n = r.jugadas.length, d = r.jugadas.filter((j) => j.estado === "dudosa").length;
  ok(res.texto.includes(n + " medias jugadas") && res.texto.includes(d + (d === 1 ? " dudosa" : " dudosas")), "el cuadro dice cuántas se leyeron y cuántas son dudosas", res.texto);
  // «1 dudosa», no «1 dudosas» (salió así con la primera planilla de verdad, 17/11)
  const uno = { jugadas: [{ san: "e4", estado: "leida" }, { san: "e5", estado: "corregida" }, { san: "Nf3", estado: "dudosa", escrito: ["Cf3"] }], ilegibleDesde: null };
  const t1 = PL.resumen(uno, tx).texto;
  ok(/3 medias jugadas \(1 tal cual, 1 corregida, 1 dudosa\)/.test(t1), "con uno de cada cosa, en singular", t1);
  const t0 = PL.resumen({ jugadas: [{ san: "e4", estado: "leida" }], ilegibleDesde: null }, tx).texto;
  ok(/1 media jugada \(1 tal cual, 0 corregidas, 0 dudosas\)/.test(t0), "y «1 media jugada», con el cero en plural", t0);

  console.log("\n=== La lectura para revisar («⬇ Lectura») ===");
  const pal = palabrasDePlanillas(HOJAS);
  const lec = PL.lectura([{ palabras: pal, metodo: "numeros", hojas: HOJAS }], r, { torneo: "PRUEBA", ronda: 1, mesa: 3 });
  igual("trae lo que leyó Vision de cada foto, tal cual (se puede volver a pasar a hojasDeLaFoto)", R.hojasDeLaFoto(lec.fotos[0].palabras).hojas.length, R.hojasDeLaFoto(pal).hojas.length);
  igual("la partida que salió, con cómo se leyó cada jugada", lec.partida.jugadas.map((j) => j.san), r.jugadas.map((j) => j.san));
  igual("y de qué torneo, ronda y mesa es", [lec.torneo, lec.ronda, lec.mesa], ["PRUEBA", 1, 3]);
  igual("sin partida (no salió ninguna jugada), igual trae lo leído", PL.lectura([{ palabras: pal, metodo: "filas", hojas: [] }], null).partida, null);
  ok(/Revísala con la planilla en la mano/.test(res.texto), "y pide revisarla antes de guardarla");
  if (d) ok(res.ayuda.startsWith("Dudosas") && /«/.test(res.ayuda), "las dudosas van una por una, con lo escrito", res.ayuda);

  const rc = R.reconstruir(Chess, CORTADA);
  ok(rc.ilegibleDesde !== null, "una planilla con basura al final se corta (no se inventa nada)");
  const pc = PL.pgn(Chess, rc, { Result: "1-0" });
  ok(/Desde\s+aquí\s+la\s+planilla\s+es\s+ilegible/.test(pc), "el PGN cortado lo dice en un comentario");
  ok(PP.leer(pc, Chess).ok, "y Pareo lo acepta (se puede completar a mano)");
  ok(/ilegible: complétala a mano/.test(PL.resumen(rc, tx).texto), "el cuadro dice desde qué jugada es ilegible");
  // Romper a propósito: un resultado sin jugadas no da nada.
  igual("una lectura sin ninguna jugada no da jugadas en el PGN", PL.pgn(Chess, { jugadas: [], ilegibleDesde: null }, {}).split("\n\n")[1].trim(), "*");
}

function torneo() {
  const ids = ["a", "b", "c", "d"];
  const t = T.nuevo({ nombre: "PRUEBA PLANILLA", rondasTotales: 3, ritmo: "60 min + 30 s",
    jugadores: ids.map((id, k) => ({ id: "pl" + id, nombre: "PRUEBA " + id.toUpperCase(), elo: 1800 - k * 100 })) });
  t.rondas = [{ mesas: [{ b: "pla", n: "pld", r: "1-0" }, { b: "plb", n: "plc", r: "=", pgn: "1. e4 e5 1/2-1/2" }], ausencias: {} }];
  return t;
}
const sembrar = (t) => (page) => page.addInitScript((x) => {
  if (localStorage.getItem("pareo_lista_v1")) return;
  localStorage.setItem("pareo_lista_v1", JSON.stringify([{ id: "tp", nombre: x.nombre, actualizado: 1 }]));
  localStorage.setItem("pareo_torneo_v1_tp", JSON.stringify(x));
  localStorage.setItem("pareo_abierto_v1", "tp");
}, t);

// Una imagen de verdad (1×1 PNG): planilla-ocr.js la achica en un <canvas>.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function abrir(browser, conSesion, palabras) {
  const pedidos = [];
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", async (p) => {
    await sembrar(torneo())(p);
    if (conSesion) await p.addInitScript(() => { window.sb.auth = { getSession: async () => ({ data: { session: { access_token: "token-de-prueba", user: { id: "u1" } } } }) }; });
    await p.route("**/functions/v1/ocr-scoresheet", async (route) => {
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" }, body: "ok" });
      pedidos.push({ auth: route.request().headers().authorization, cuerpo: JSON.parse(route.request().postData() || "{}") });
      return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ words: palabras }) });
    });
  });
  await page.click('[data-ficha="rondas"]');
  await page.click("#pi-rondas-nav button >> nth=0");
  await page.waitForSelector('#pi-ronda [data-planilla="0"]');
  return { ctx, page, errores, pedidos };
}

async function subirFoto(page, sel) {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click(sel)]);
  await chooser.setFiles({ name: "planillas.png", mimeType: "image/png", buffer: PNG });
}

async function pruebaPagina(browser) {
  console.log("\n=== «📷 Planilla» en una mesa de Pareo ===");
  const { ctx, page, errores, pedidos } = await abrir(browser, true, palabrasDePlanillas(HOJAS, { giro: 2, partir: true }));
  const b = '#pi-ronda [data-planilla="0"]';
  ok(await P.vis(page, b), "cada mesa tiene «📷 Planilla», al lado de «Partida (PGN)»");
  ok(/Pasar a PGN la partida de la mesa/.test(await page.getAttribute(b, "aria-label")), "y dice en palabras qué hace (para el lector de pantalla)");
  await subirFoto(page, b);
  await page.waitForSelector(formulario, { timeout: 60000 });
  igual("la foto fue una sola vez a ocr-scoresheet, con el token de la sesión", [pedidos.length, pedidos[0] && pedidos[0].auth], [1, "Bearer token-de-prueba"]);
  ok(pedidos[0] && pedidos[0].cuerpo.image_base64 && pedidos[0].cuerpo.image_base64.length > 20, "y lleva la foto");
  const dialogoTxt = await page.textContent(formulario);
  ok(/Leída de la foto: \d+ medias jugadas/.test(dialogoTxt) && /Revísala con la planilla/.test(dialogoTxt), "se abre «Partida (PGN)» con lo leído y lo que conviene revisar", dialogoTxt.slice(0, 300));
  const valor = await page.inputValue(formulario + " textarea");
  ok(/\[White "PRUEBA A"\]/.test(valor) && /\[Black "PRUEBA D"\]/.test(valor) && /\[Result "1-0"\]/.test(valor) && /\[Event "PRUEBA PLANILLA"\]/.test(valor), "con el PGN armado: nombres, torneo y el resultado de la mesa", valor.slice(0, 300));
  igual("nada se guardó todavía", (await P.leerTodos(page))[0].rondas[0].mesas[0].pgn, undefined);
  await page.click(formulario + " [data-avisos-aceptar]");
  const [g] = await P.esperarGuardado(page, (l) => !!l[0].rondas[0].mesas[0].pgn);
  const esperada = R.reconstruir(Chess, HOJAS).jugadas.map((j) => j.san);
  igual("al guardarla, la mesa queda con la partida de las planillas", PP.leer(g.rondas[0].mesas[0].pgn, Chess).jugadas, esperada);
  ok(/✓/.test(await page.textContent('#pi-ronda [data-pgn="0"]')), "y «Partida (PGN)» dice que ya la tiene");
  ok(await P.vis(page, '#pi-ronda [data-lectura="0"]'), "la mesa leída tiene «⬇ Lectura»");
  ok(!(await page.$('#pi-ronda [data-lectura="1"]')), "y la que no se leyó, no");
  const [bajada] = await Promise.all([page.waitForEvent("download"), page.click('#pi-ronda [data-lectura="0"]')]);
  const json = JSON.parse(require("fs").readFileSync(await bajada.path(), "utf8"));
  ok(/\.json$/.test(bajada.suggestedFilename()) && json.fotos.length === 1 && json.fotos[0].palabras.length > 100 && json.partida.jugadas.length === esperada.length && json.mesa === 1 && json.ronda === 1,
    "baja un .json con lo que leyó Vision, la partida y la mesa", bajada.suggestedFilename() + " " + JSON.stringify(json).slice(0, 200));

  console.log("\n=== Una mesa que ya tiene partida pregunta antes ===");
  await page.click('#pi-ronda [data-planilla="1"]');
  await page.waitForSelector(confirmar);
  ok(/ya tiene su partida/.test(await page.textContent(confirmar)), "dice que ya tiene partida y que solo se reemplaza si se guarda");
  await page.click(confirmar + " [data-avisos-cancelar]");
  igual("al cancelar no se manda ninguna foto", pedidos.length, 1);
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();

  console.log("\n=== Sin sesión no se manda nada ===");
  const s = await abrir(browser, false, []);
  await subirFoto(s.page, '#pi-ronda [data-planilla="0"]');
  await s.page.waitForFunction(() => /No se pudo leer la planilla: para leer la planilla hacen falta internet y la sesión/.test(document.body.textContent));
  igual("no llamó al lector", s.pedidos.length, 0);
  ok(!(await s.page.$(formulario)), "y no abrió el cuadro");
  await s.ctx.close();

  console.log("\n=== Una foto sin nada escrito ===");
  const v = await abrir(browser, true, []);
  await subirFoto(v.page, '#pi-ronda [data-planilla="0"]');
  await v.page.waitForFunction(() => /no se encontró ninguna jugada escrita en la foto/.test(document.body.textContent));
  ok(true, "lo dice en palabras, sin abrir el cuadro");
  ok((await v.page.textContent('#pi-ronda [data-planilla="0"]')).includes("Planilla"), "y el botón vuelve a decir «📷 Planilla»");
  ok(await P.vis(v.page, '#pi-ronda [data-lectura="0"]'), "y deja bajar la lectura igual (la que sale mal es la que hay que ver)");
  await v.ctx.close();
}

(async () => {
  pruebaSinNavegador();
  const browser = await chromium.launch(require("fs").existsSync(CHROME) ? { executablePath: CHROME } : {});
  try { await pruebaPagina(browser); } catch (e) { mal("la prueba con navegador se cayó", e.stack); }
  await browser.close();
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();

/*! rev bfb5bbb0d2d82f9f */
