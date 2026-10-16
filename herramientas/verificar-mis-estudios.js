#!/usr/bin/env node
/* Comprueba «Mis estudios» (entreno/mis-estudios.html, js/mis-estudios.js y
 * js/estudio-pgn.js).
 *
 * Primero el árbol de jugadas en Node, con chess.js: leer un PGN con
 * variantes, comentarios, signos y flechas, y escribirlo de vuelta igual; una
 * jugada ilegal corta su línea y se avisa; varias partidas son varios
 * capítulos; promover y borrar.
 *
 * Después la página en un navegador, con un Supabase de mentira que FILTRA en
 * el resolver y anota lo que se escribe: la lista, abrir un estudio, jugar con
 * clics y escribiendo, una variante, el signo y el comentario, que se guarde
 * solo (y qué se guarda), llevar la línea al repertorio, importar PGN, el
 * estudio hecho con el repertorio y la vista del profe, de solo lectura. Al
 * final, el motor de verdad (Stockfish 19 lite) ve un mate en uno.
 *
 * Los permisos de verdad los pone la RLS (ver «Mis estudios» en
 * docs/decisiones/entrenamiento.md); acá se mira la pantalla.
 *
 *   python3 -m http.server 8777    (desde la raíz del sitio)
 *   node herramientas/verificar-mis-estudios.js
 */
const { chromium } = require("./lib/playwright-con-sesion");
const { contestarAvisos } = require("./lib/avisos-prueba.js");
const E = require("../js/estudio-pgn.js");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function igual(n, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log(`  ✗ ${n}\n      esperaba: ${b}\n      salió:    ${a}`); fallos++; }
  else console.log(`  ✓ ${n}`);
}

function pruebaArbol() {
  console.log("\n=== El árbol de jugadas (js/estudio-pgn.js) ===");
  const pgn = `[Event "Prueba"]
[White "Ana"]
[Black "Beto"]

{ Antes de empezar } 1. e4 { [%csl Ge4][%cal Gd2d4] El centro } c5!? (1... e5 2. Nf3 (2. Bc4 Nf6) Nc6) 2. Nf3?! d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 1-0

1. d4 d5 2. c4 Qxh8 3. e4 *`;
  const ps = E.leer(pgn);
  igual("dos partidas, dos capítulos", ps.length, 2);
  const p = ps[0];
  igual("las etiquetas", [p.etiquetas.White, p.etiquetas.Black, p.resultado], ["Ana", "Beto", "1-0"]);
  igual("la línea principal, en SAN de chess.js", E.lineaPrincipal(p.raiz).map((n) => n.san).join(" "), "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6");
  const e4 = p.raiz.hijos[0];
  igual("el comentario y las marcas de Lichess", [e4.comentario, e4.casillas, e4.flechas], ["El centro", ["Ge4"], ["Gd2d4"]]);
  igual("el comentario de antes de la primera jugada", p.raiz.comentario, "Antes de empezar");
  igual("los signos pegados a la jugada", [e4.hijos[0].nags, e4.hijos[0].hijos[0].nags], [[5], [6]]);
  igual("la variante sale del padre, con su variante adentro", [e4.hijos.map((h) => h.san), e4.hijos[1].hijos[0].hijos.map((h) => h.san)], [["c5", "e5"], ["Nc6"]]);
  const nf3 = e4.hijos[1].hijos[0];
  igual("la variante anidada (2. Ac4 en lugar de 2. Cf3)", e4.hijos[1].hijos.map((h) => h.san), ["Nf3", "Bc4"]);
  igual("ida y vuelta: escribir y volver a leer da lo mismo", E.escribir(E.leer(E.escribir(p))[0]), E.escribir(p));
  igual("una jugada ilegal corta la línea y se avisa", [E.lineaPrincipal(ps[1].raiz).map((n) => n.san), ps[1].avisos.length], [["d4", "d5", "c4"], 1]);
  const conFen = E.leer('[FEN "6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 1"]\n1... h6 2. Ra8+ Kh7 *')[0];
  igual("arranca en el FEN, con las negras", [conFen.raiz.ply, E.lineaPrincipal(conFen.raiz).map((n) => n.san)], [1, ["h6", "Ra8+", "Kh7"]]);
  igual("y lo escribe con su FEN y su «1...»", /\[FEN "6k1\/5ppp\/8\/8\/8\/8\/5PPP\/R5K1 b - - 0 1"\][\s\S]*1\.\.\. h6 2\. Ra8\+ Kh7 \*/.test(E.escribir(conFen)), true);
  // Jugar lo que ya estaba no duplica; promover y hacer principal.
  igual("jugar una jugada que ya estaba no la duplica", [E.jugar(p.raiz, "e4") === e4, p.raiz.hijos.length], [true, 1]);
  const bc4 = nf3.padre.hijos[1];
  E.hacerPrincipal(bc4);
  igual("hacer principal sube toda la rama", E.lineaPrincipal(p.raiz).slice(0, 3).map((n) => n.san), ["e4", "e5", "Bc4"]);
  E.promover(e4.hijos[1]);
  igual("subir una variante la pone delante de su hermana", e4.hijos.map((h) => h.san), ["e5", "c5"].reverse());
  E.borrarDesde(e4.hijos[1]);
  igual("borrar desde una jugada se lleva su rama", e4.hijos.map((h) => h.san), ["c5"]);
  igual("un comentario con llaves no rompe el PGN", E.leer(E.escribir(Object.assign(E.vacio(), { raiz: Object.assign(E.vacio().raiz, { comentario: "a {b} c" }) })))[0].raiz.comentario, "a b c");
  const lin = E.agregarLinea(E.vacio().raiz, ["e2e4", "e7e5", "g1f3"]);
  igual("una línea del motor (UCI) entra como jugadas", E.camino(lin).map((n) => n.san), ["e4", "e5", "Nf3"]);
}

const YO = "00000000-0000-4000-8000-0000000000a1";
const PROFE = "00000000-0000-4000-8000-0000000000b1";
const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const ID3 = "33333333-3333-4333-8333-333333333333";
const MATE = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";
const FILAS = [
  { id: ID1, alumno_id: YO, titulo: "Mi Siciliana", descripcion: "Lo que juego con negras", compartido: true, n_capitulos: 2,
    capitulos: [{ titulo: "Najdorf", orientacion: "w", pgn: '[Result "*"]\n\n*\n' }, { titulo: "Mate del pasillo", orientacion: "w", pgn: '[FEN "' + MATE + '"]\n[SetUp "1"]\n\n*\n' }],
    created_at: "2026-10-01T15:00:00Z", updated_at: "2026-10-03T15:00:00Z" },
  { id: ID2, alumno_id: YO, titulo: "Finales", descripcion: null, compartido: false, n_capitulos: 1,
    capitulos: [{ titulo: "Lucena", orientacion: "w", pgn: "*" }], created_at: "2026-09-20T15:00:00Z", updated_at: "2026-09-20T15:00:00Z" },
  { id: ID3, alumno_id: "otra", titulo: "De otra", descripcion: null, compartido: true, n_capitulos: 1,
    capitulos: [], created_at: "2026-09-20T15:00:00Z", updated_at: "2026-09-20T15:00:00Z" },
];
const REPERTORIO = [
  { alumno_id: YO, color: "w", nombre: "Italiana", jugadas: ["e4", "e5", "Nf3", "Nc6", "Bc4"] },
  { alumno_id: YO, color: "w", nombre: "Contra la Siciliana", jugadas: ["e4", "c5", "Nf3"] },
  { alumno_id: YO, color: "b", nombre: "Eslava", jugadas: ["d4", "d5", "c4", "c6"] },
];

function clienteFalso(yo, filas) {
  return `
(function () {
  window.__escrituras = []; window.__consultas = [];
  const TABLAS = { estudios: ${JSON.stringify(filas)}, repertorio: ${JSON.stringify(REPERTORIO)},
    profiles: [{ id: ${JSON.stringify(YO)}, full_name: "Ana Rojas" }] };
  let n = 0;
  function consulta(tabla) {
    const filtros = []; let accion = null, datos = null, unica = false, rango = null;
    const q = {
      select() { return q; },
      eq(c, v) { filtros.push([c, v]); return q; },
      order() { return q; }, limit() { return q; },
      range(a, z) { rango = [a, z]; return q; },
      insert(f) { accion = "insert"; datos = f; return q; },
      update(f) { accion = "update"; datos = f; return q; },
      delete() { accion = "delete"; return q; },
      maybeSingle() { unica = true; return q; }, single() { unica = true; return q; },
      then(res, rej) {
        // Los filtros se aplican EN EL RESOLVER: .update(x).eq(...) encadena.
        const datosDe = TABLAS[tabla] || [];
        let f = datosDe.filter((x) => filtros.every(([c, v]) => String(x[c]) === String(v)));
        window.__consultas.push({ tabla, accion, filtros: filtros.slice() });
        if (accion) {
          window.__escrituras.push({ tabla, accion, datos: JSON.parse(JSON.stringify(datos)), filtros: filtros.slice() });
          if (accion === "insert") {
            const nueva = Object.assign({ id: "44444444-4444-4444-8444-44444444444" + (n++), alumno_id: ${JSON.stringify(yo)}, compartido: false,
              created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, datos);
            if (tabla === "estudios") nueva.n_capitulos = (datos.capitulos || []).length;
            datosDe.unshift(nueva); f = [nueva];
          }
          if (accion === "update") f.forEach((x) => Object.assign(x, datos));
          if (accion === "delete") f.forEach((x) => datosDe.splice(datosDe.indexOf(x), 1));
        }
        if (rango) f = f.slice(rango[0], rango[1] + 1);
        return Promise.resolve({ data: unica ? (f[0] || null) : f, error: null }).then(res, rej);
      },
    };
    return q;
  }
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(yo)} }, access_token: "t" } } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from: (t) => consulta(t),
    rpc: () => consulta("rpc"),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
  };
})();`;
}

async function abrir(browser, ruta, yo, filas) {
  const ctx = await browser.newContext({ serviceWorkers: "block", acceptDownloads: true });
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(yo, filas) }));
  await ctx.addInitScript(contestarAvisos);
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push(m.text()); });
  await page.goto(BASE + ruta, { waitUntil: "networkidle" });
  return { page, ctx, errores };
}

const jugadas = (page) => page.evaluate(() => [...document.querySelectorAll("#arbol .jug")].map((b) => b.textContent));
const ultimaGuardada = (page) => page.evaluate(() => window.__escrituras.filter((e) => e.tabla === "estudios" && e.accion === "update").pop());
const visible = (page, sel) => page.evaluate((s) => { const n = document.querySelector(s); return !!n && n.checkVisibility(); }, sel);
async function esperarGuardado(page, cuantas) {
  await page.waitForFunction((c) => window.__escrituras.filter((e) => e.tabla === "estudios" && e.accion === "update").length >= c, cuantas, { timeout: 6000 }).catch(() => {});
}

async function pruebaAlumna(browser) {
  console.log("\n=== Mis estudios, los de la alumna ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/mis-estudios.html", YO, FILAS);
  await page.waitForSelector("#lista .ficha", { timeout: 10000 }).catch(() => {});
  const fichas = await page.evaluate(() => [...document.querySelectorAll("#lista .ficha")].map((b) => [b.querySelector(".nombre").textContent, b.querySelector(".detalle").textContent]));
  igual("pinta solo los suyos, con capítulos, fecha y quién lo ve", fichas,
    [["Mi Siciliana", "2 capítulos · cambiado el 3 oct 2026 · lo ve tu profe"], ["Finales", "1 capítulo · creado el 20 sept 2026 · solo tú"]]);
  igual("la lista no se baja los PGN", await page.evaluate(() => window.__consultas[0].filtros), [["alumno_id", "00000000-0000-4000-8000-0000000000a1"]]);

  // Abrir un estudio.
  await page.click("#lista .ficha");
  await page.waitForSelector("#vista-estudio:not(.hidden) #tablero .sq", { timeout: 5000 }).catch(() => {});
  igual("abre el estudio con su dirección", new URL(page.url()).search, "?id=" + ID1);
  igual("título y capítulos", [await page.textContent("#titulo-estudio"), await page.evaluate(() => [...document.querySelectorAll("#capitulos button")].map((b) => b.textContent))],
    ["Mi Siciliana", ["1. Najdorf", "2. Mate del pasillo"]]);
  igual("un tablero de 64 casillas", await page.evaluate(() => document.querySelectorAll("#tablero .sq").length), 64);

  // Jugar con clics: e2-e4.
  await page.click('#tablero [data-square="e2"]');
  await page.click('#tablero [data-square="e4"]');
  // Escribiendo, en la notación de acá.
  await page.fill("#escribir-jugada", "c5"); await page.press("#escribir-jugada", "Enter");
  await page.fill("#escribir-jugada", "Cf3"); await page.press("#escribir-jugada", "Enter");
  igual("las jugadas, en algebraica española", await jugadas(page), ["1. e4", "c5", "2. Cf3"]);
  await page.fill("#escribir-jugada", "Dxh8"); await page.press("#escribir-jugada", "Enter");
  igual("una jugada ilegal no entra, y lo dice", await page.textContent("#escribir-error"), "«Dxh8» no es una jugada legal en esta posición.");

  // Una variante: volver con la flecha y jugar otra.
  await page.click("#arbol");
  await page.keyboard.press("ArrowLeft");
  await page.fill("#escribir-jugada", "Cc3"); await page.press("#escribir-jugada", "Enter");
  igual("la otra jugada queda como variante", await page.evaluate(() => [...document.querySelectorAll("#arbol .variante .jug")].map((b) => b.textContent)), ["2. Cc3"]);
  // Signo y comentario a la jugada actual (2. Cc3).
  await page.click('#nags button[aria-label="Marcar como jugada interesante"]');
  await page.fill("#comentario", "La cerrada, para no estudiar tanta teoría");
  await page.dispatchEvent("#comentario", "change");
  igual("el signo se ve en la jugada y se dice", await page.evaluate(() => { const b = document.querySelector('#arbol .jug[aria-current="true"]'); return [b.textContent, b.getAttribute("aria-label")]; }),
    ["2. Cc3!?", "2. Cc3!? (jugada interesante)"]);
  await esperarGuardado(page, 1);
  await page.waitForFunction(() => document.getElementById("estado-guardado").textContent === "Guardado.", null, { timeout: 6000 }).catch(() => {});
  const g = await ultimaGuardada(page);
  igual("se guarda solo, por su id", g && g.filtros, [["id", ID1]]);
  igual("el capítulo va en PGN, con la variante, el signo y el comentario",
    g && g.datos.capitulos[0].pgn.split("\n\n")[1], "1. e4 c5 2. Nf3 (2. Nc3 $5 { La cerrada, para no estudiar tanta teoría }) *\n");
  igual("y el otro capítulo, tal cual", g && g.datos.capitulos[1], FILAS[0].capitulos[1]);
  igual("la barra dice que se guardó", await page.textContent("#estado-guardado"), "Guardado.");

  // Hacerla la principal.
  await page.click("#hacer-principal");
  await esperarGuardado(page, 2);
  igual("«Hacerla la principal» la sube", (await ultimaGuardada(page)).datos.capitulos[0].pgn.split("\n\n")[1].slice(0, 20), "1. e4 c5 2. Nc3 $5 {");

  // Llevar a mi repertorio, la línea hasta acá.
  await page.evaluate(() => window.__respuestas.push("Siciliana cerrada"));
  await page.click("#al-repertorio");
  await page.waitForFunction(() => window.__escrituras.some((e) => e.tabla === "repertorio"), null, { timeout: 5000 }).catch(() => {});
  igual("manda la línea al repertorio, con el color del tablero",
    await page.evaluate(() => (window.__escrituras.find((e) => e.tabla === "repertorio") || {}).datos), { color: "w", nombre: "Siciliana cerrada", jugadas: ["e4", "c5", "Nc3"] });

  // Marcas: una flecha y una casilla.
  await page.click("#modo-marcar");
  await page.click('#tablero [data-square="g1"]'); await page.click('#tablero [data-square="f3"]');
  await page.click('#tablero [data-square="d5"]'); await page.click('#tablero [data-square="d5"]');
  igual("las marcas se dibujan y se dicen", [await page.evaluate(() => document.querySelectorAll("#flechas line").length), await page.textContent("#marcas-texto")],
    [1, "Marcas: casilla d5 (verde), flecha de g1 a f3 (verde)."]);
  await esperarGuardado(page, 3);
  await page.waitForFunction(() => /csl/.test(JSON.stringify(window.__escrituras.filter((e) => e.accion === "update").pop())), null, { timeout: 6000 }).catch(() => {});
  igual("y van al PGN como las de Lichess", /\[%csl Gd5\] \[%cal Gg1f3\]/.test((await ultimaGuardada(page)).datos.capitulos[0].pgn), true);
  await page.click("#modo-marcar");

  // El otro capítulo empieza en su FEN y no va al repertorio.
  await page.click("#capitulos li:nth-child(2) button");
  igual("el capítulo del FEN arranca en su posición", await page.evaluate(() => [document.querySelector('#tablero [data-square="a1"]').getAttribute("aria-label"), document.querySelector('#tablero [data-square="e1"]').getAttribute("aria-label")]),
    ["a1, torre blanca", "e1"]);

  // El motor de verdad: mate en uno.
  await page.click("#motor-boton");
  await page.waitForFunction(() => /mate en 1/.test(document.getElementById("motor-eval").textContent), null, { timeout: 30000 }).catch(() => {});
  igual("el motor ve el mate en uno", (await page.textContent("#motor-eval")).split(" · ")[0], "Las blancas dan mate en 1");
  await page.waitForFunction(() => /Ta8#/.test(document.getElementById("motor-lineas").textContent), null, { timeout: 10000 }).catch(() => {});
  igual("y lo escribe en la notación de acá", /Ta8#/.test(await page.textContent("#motor-lineas")), true);
  await page.click("#motor-lineas li button");
  igual("la línea del motor entra como jugada", await jugadas(page), ["1. Ta8#"]);
  await page.click("#motor-boton");

  // «Buscar mejoras»: en vez del mate, 2. h3. El motor lo marca y deja el mate como variante.
  await page.click("#arbol .jug");
  await page.click("#borrar-desde");
  await page.fill("#escribir-jugada", "h3"); await page.press("#escribir-jugada", "Enter");
  await page.fill("#escribir-jugada", "h6"); await page.press("#escribir-jugada", "Enter");
  await page.click("#ir-inicio");
  await page.click("#revisar-boton");
  await page.waitForFunction(() => /^Listo/.test(document.getElementById("revisar-estado").textContent), null, { timeout: 60000 }).catch(() => {});
  igual("dice cuántas se pudieron mejorar", (await page.textContent("#revisar-estado")).split(":")[0], "Listo. Una jugada se pudo mejorar");
  igual("marca la jugada que pierde y deja la del motor como variante", await jugadas(page), ["1. h3??", "1. Ta8#", "1… h6"]);

  // Volver a la lista y borrar.
  await page.click("#volver-lista");
  await page.waitForSelector("#vista-lista:not(.hidden) .ficha", { timeout: 5000 }).catch(() => {});
  igual("vuelve a la lista", new URL(page.url()).search, "");
  igual("sin errores en la página", errores, []);
  await ctx.close();
}

async function pruebaCrear(browser) {
  console.log("\n=== Crear: importar PGN y desde el repertorio ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/mis-estudios.html", YO, FILAS.slice(0, 2));
  await page.waitForSelector("#lista .ficha", { timeout: 10000 }).catch(() => {});
  await page.click("#importar summary");
  await page.fill("#importar-pgn", "[Event \"Torneo\"]\n[White \"Ana\"]\n[Black \"Beto\"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0\n\n[White \"Ana\"]\n[Black \"Caro\"]\n\n1. d4 d5 *");
  await page.click("#importar-form button[type=submit]");
  await page.waitForFunction(() => window.__escrituras.some((e) => e.tabla === "estudios" && e.accion === "insert"), null, { timeout: 5000 }).catch(() => {});
  const ins = await page.evaluate(() => window.__escrituras.find((e) => e.tabla === "estudios" && e.accion === "insert").datos);
  igual("cada partida es un capítulo, con su nombre", [ins.titulo, ins.capitulos.map((c) => c.titulo)], ["Torneo", ["Ana – Beto", "Ana – Caro"]]);
  igual("el PGN se guarda normalizado", ins.capitulos[0].pgn.split("\n\n")[1], "1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0\n");
  await page.waitForSelector("#vista-estudio:not(.hidden)", { timeout: 5000 }).catch(() => {});
  igual("y lo abre", await page.textContent("#titulo-estudio"), "Torneo");

  await page.click("#volver-lista");
  await page.waitForSelector("#vista-lista:not(.hidden)", { timeout: 5000 }).catch(() => {});
  await page.click("#traer-repertorio");
  await page.waitForFunction(() => window.__escrituras.filter((e) => e.tabla === "estudios" && e.accion === "insert").length === 2, null, { timeout: 5000 }).catch(() => {});
  const rep = await page.evaluate(() => window.__escrituras.filter((e) => e.tabla === "estudios" && e.accion === "insert")[1].datos);
  igual("el repertorio: un capítulo por color", rep.capitulos.map((c) => [c.titulo, c.orientacion]), [["Con blancas", "w"], ["Con negras", "b"]]);
  igual("con el árbol de sus líneas y sus nombres", rep.capitulos[0].pgn.split("\n\n")[1],
    "1. e4 e5 (1... c5 2. Nf3 { Contra la Siciliana }) 2. Nf3 Nc6 3. Bc4 { Italiana } *\n");
  igual("pide solo su repertorio", await page.evaluate(() => window.__consultas.find((c) => c.tabla === "repertorio").filtros), [["alumno_id", YO]]);
  igual("sin errores en la página", errores, []);
  await ctx.close();
}

async function pruebaProfe(browser) {
  console.log("\n=== Los estudios de un alumno, vistos por su profe ===");
  // Lo que la RLS le daría: solo lo compartido.
  const compartidos = FILAS.filter((f) => f.compartido && f.alumno_id === YO);
  const { page, ctx, errores } = await abrir(browser, "/entreno/mis-estudios.html?alumno=" + YO, PROFE, compartidos);
  await page.waitForSelector("#lista .ficha", { timeout: 10000 }).catch(() => {});
  igual("dice de quién son", await page.textContent("#titulo-lista"), "Los estudios de Ana Rojas");
  igual("sin crear ni importar", [await visible(page, "#nuevo-estudio"), await visible(page, "#importar")], [false, false]);
  igual("pide los de ESE alumno", await page.evaluate((id) => window.__consultas.filter((c) => c.tabla === "estudios").every((c) => c.filtros.some(([k, v]) => k === "alumno_id" && v === id)), YO), true);
  await page.click("#lista .ficha");
  await page.waitForSelector("#vista-estudio:not(.hidden) #tablero .sq", { timeout: 5000 }).catch(() => {});
  igual("abre en solo lectura: sin editar, marcar ni borrar",
    await page.evaluate(() => ["#borrar-estudio", "#nuevo-capitulo", "#escribir-form", "#acciones-nodo", "#modo-marcar"].map((s) => document.querySelector(s).checkVisibility())), [false, false, false, false, false]);
  igual("pero se baja en PGN y se analiza", [await visible(page, "#bajar-pgn"), await visible(page, "#motor-boton")], [true, true]);
  await page.click('#tablero [data-square="e2"]'); await page.click('#tablero [data-square="e4"]');
  await page.waitForTimeout(1500);
  igual("tocar el tablero no cambia ni guarda nada", [await jugadas(page), await page.evaluate(() => window.__escrituras.length)], [[], 0]);
  igual("sin errores en la página", errores, []);
  await ctx.close();
}

(async () => {
  pruebaArbol();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaAlumna(browser);
    await pruebaCrear(browser);
    await pruebaProfe(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nMis estudios guarda y muestra lo que debe.");
  process.exit(fallos ? 1 : 0);
})();
