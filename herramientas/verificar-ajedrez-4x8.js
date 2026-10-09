#!/usr/bin/env node
/* Comprueba el Ajedrez 4×8 (ajedrez-4x8.html + js/ajedrez-4x8-motor.js).
 *
 * Las reglas son de un tablero que no es el de siempre, así que lo que se
 * rompe acá no da ningún error: una jugada de más o de menos se ve igual de
 * bien en la pantalla. Por eso se miden contra chess.js y no contra sí mismas.
 *
 * Dos partes:
 *   1. Sin navegador, las reglas. En un tablero de 8×8 con las columnas e–h
 *      vacías, las jugadas legales de chess.js que no salen de a–d son
 *      EXACTAMENTE las de este juego: una pieza que va de a–d a a–d no pasa por
 *      e–h, y sin nada allá nadie da jaque desde allá. Se juegan 400 partidas
 *      al azar y en cada posición se comparan las jugadas, el SAN, el jaque y
 *      el al paso. Además: la posición inicial, la triple repetición, el
 *      material insuficiente, la bandera contra un rey solo, y que la
 *      computadora da el mate en uno y no se deja dar uno.
 *   2. En un navegador de verdad: sin sesión manda al login; con sesión se
 *      juega escribiendo y tocando, la computadora contesta, el reloj baja solo
 *      para quien mueve, el tablero es una sola parada de tabulador con cuatro
 *      columnas y ocho filas, «Deshacer» devuelve la jugada propia y la de la
 *      computadora, y no hay errores en la consola.
 *
 * Uso:  node herramientas/verificar-ajedrez-4x8.js   [--sin-navegador]
 *       (el corredor levanta el sitio en el 8777; a mano:
 *        python3 -m http.server 8777 desde la raíz)
 */
"use strict";
const path = require("path");
const { Chess } = require("chess.js");
const A = require(path.join(__dirname, "..", "js", "ajedrez-4x8-motor.js"));

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + (a.length > 90 ? a.slice(0, 90) + "…" : a));
}
function cierto(nombre, cond, detalle) { igual(nombre + (detalle ? " (" + detalle + ")" : ""), !!cond, true); }

// Un azar con semilla, para que una falla se pueda repetir.
function azarCon(semilla) {
  let s = semilla >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// La posición del motor como FEN de 8×8, con e–h vacías y sin enroque.
function fenDe(pos) {
  const filas = [];
  for (let r = 7; r >= 0; r--) {
    let fila = "", vacias = 0;
    for (let f = 0; f < 8; f++) {
      const p = f < 4 ? pos.b[r * 4 + f] : null;
      if (!p) { vacias++; continue; }
      if (vacias) { fila += vacias; vacias = 0; }
      fila += p.c === "w" ? p.t.toUpperCase() : p.t;
    }
    if (vacias) fila += vacias;
    filas.push(fila);
  }
  return filas.join("/") + " " + pos.turno + " - " + (pos.ap >= 0 ? A.nombre(pos.ap) : "-") + " " + pos.medias + " 1";
}
const sinJaque = (s) => s.replace(/[+#]$/, "");
const lista = (ms) => ms.map((m) => m.from + m.to + (m.promotion || "")).sort();

/* ------------------------------------------------------------ 1. las reglas */
function reglas() {
  console.log("\n— La posición inicial —");
  const g = new A.Partida();
  igual("blancas: torre, rey, dama y caballo en a1–d1", ["a1", "b1", "c1", "d1"].map((s) => g.get(s).type).join(""), "rkqn");
  igual("negras: lo mismo en a8–d8", ["a8", "b8", "c8", "d8"].map((s) => g.get(s).type + g.get(s).color).join(" "), "rb kb qb nb");
  igual("las columnas e–h no existen: contestan vacías", g.get("e2"), null);
  igual("las primeras jugadas: ocho de peón y Cc3", g.moves().sort(), ["Nc3", "a3", "a4", "b3", "b4", "c3", "c4", "d3", "d4"]);

  console.log("\n— 400 partidas al azar, posición por posición contra chess.js —");
  let posiciones = 0, distintas = 0, sanMal = 0, jaqueMal = 0, alPaso = 0, coronaciones = 0, mates = 0, primeraFalla = null;
  for (let semilla = 1; semilla <= 400; semilla++) {
    const azar = azarCon(semilla);
    const p = new A.Partida();
    for (let ply = 0; ply < 160 && !p.fin(); ply++) {
      const fen = fenDe(p.pos);
      const ch = new Chess(fen);
      const deChess = ch.moves({ verbose: true }).filter((m) => m.to[0] <= "d");
      const nuestras = p.moves({ verbose: true });
      posiciones++;
      if (JSON.stringify(lista(deChess)) !== JSON.stringify(lista(nuestras))) {
        distintas++;
        if (!primeraFalla) primeraFalla = { fen, chess: lista(deChess), motor: lista(nuestras) };
      } else {
        const sanChess = {};
        deChess.forEach((m) => { sanChess[m.from + m.to + (m.promotion || "")] = sinJaque(m.san); });
        if (nuestras.some((m) => sanChess[m.from + m.to + (m.promotion || "")] !== sinJaque(m.san))) sanMal++;
      }
      if (ch.in_check() !== p.in_check()) jaqueMal++;
      if (!nuestras.length) break;
      const m = nuestras[Math.floor(azar() * nuestras.length)];
      if (m.flags === "e") alPaso++;
      if (m.promotion) coronaciones++;
      p.move(m);
    }
    const fin = p.fin();
    if (fin && fin.motivo === "Jaque mate") mates++;
  }
  console.log("    (" + posiciones + " posiciones; " + alPaso + " capturas al paso, " + coronaciones + " coronaciones y " + mates + " mates por el camino)");
  igual("las jugadas legales son las mismas que las de chess.js", distintas, 0);
  if (primeraFalla) console.log("      la primera distinta: " + JSON.stringify(primeraFalla));
  igual("el SAN de cada jugada es el mismo (sin el + o #, que en 8×8 tiene escapatorias por e–h)", sanMal, 0);
  igual("el jaque es el mismo", jaqueMal, 0);
  cierto("por el camino hubo al paso, coronaciones y mates", alPaso > 0 && coronaciones > 0 && mates > 0);

  console.log("\n— Cómo termina una partida —");
  const rep = new A.Partida();
  ["Nc3", "Nc6", "Nd1", "Nd8", "Nc3", "Nc6", "Nd1", "Nd8"].forEach((s) => {
    const m = rep.moves({ verbose: true }).find((x) => x.san === s);
    rep.move(m);
  });
  igual("ir y volver con los caballos dos veces es triple repetición", rep.fin() && rep.fin().motivo, "Triple repetición");
  rep.undo();
  igual("y deshaciendo una jugada deja de serlo", rep.fin(), null);

  const sola = new A.Partida();
  sola.pos = { b: Array(32).fill(null), turno: "w", ap: -1, medias: 0 };
  sola.pos.b[A.indice("a1")] = { t: "k", c: "w" };
  sola.pos.b[A.indice("d8")] = { t: "k", c: "b" };
  sola.pos.b[A.indice("c3")] = { t: "n", c: "w" };
  igual("rey y caballo contra rey es material insuficiente", sola.fin() && sola.fin().motivo, "Material insuficiente");
  igual("si a las negras se les cae la bandera contra rey y caballo, pierden", sola.bandera("b").resultado, "1-0");
  igual("si se les cae a las blancas contra el rey solo, son tablas", sola.bandera("w").resultado, "½-½");

  console.log("\n— La computadora —");
  // Rey negro en a8, rey blanco en a6 y torre en d1: Td8 es mate.
  const mate = new A.Partida();
  mate.pos = { b: Array(32).fill(null), turno: "w", ap: -1, medias: 0 };
  mate.pos.b[A.indice("a8")] = { t: "k", c: "b" };
  mate.pos.b[A.indice("a6")] = { t: "k", c: "w" };
  mate.pos.b[A.indice("d1")] = { t: "r", c: "w" };
  const enChess = new Chess(fenDe(mate.pos));
  enChess.move("Rd8");
  cierto("en la posición de prueba, Td8 es mate también para chess.js", enChess.in_checkmate());
  [1, 2, 3].forEach((n) => igual("nivel " + n + ": da el mate en uno", mate.jugadaDeLaComputadora(n, azarCon(n)).san, "Rd8#"));
  // Con las negras: la torre blanca amenaza Td8#; el rey negro tiene b8, b7 y
  // a7 tapadas, así que la defensa es tapar la fila 8 o salir: la dama negra en
  // c4 cubre d8 por la diagonal… y el motor no puede dejar que lo maten.
  const defensa = new A.Partida();
  defensa.pos = { b: Array(32).fill(null), turno: "b", ap: -1, medias: 0 };
  defensa.pos.b[A.indice("a8")] = { t: "k", c: "b" };
  defensa.pos.b[A.indice("a6")] = { t: "k", c: "w" };
  defensa.pos.b[A.indice("d1")] = { t: "r", c: "w" };
  defensa.pos.b[A.indice("c3")] = { t: "q", c: "b" };
  [2, 3].forEach((n) => {
    const elegida = defensa.jugadaDeLaComputadora(n, azarCon(n));
    const tras = new Chess(fenDe(defensa.pos));
    tras.move({ from: elegida.from, to: elegida.to, promotion: elegida.promotion });
    const legalesChess = tras.moves({ verbose: true }).filter((m) => m.to[0] <= "d");
    const dejaMate = legalesChess.some((m) => { const c = new Chess(tras.fen()); c.move(m); return c.in_check() && !c.moves({ verbose: true }).some((x) => x.to[0] <= "d"); });
    cierto("nivel " + n + ": no se deja el mate en uno", !dejaMate, elegida.san);
  });
  // Una partida entera de la computadora contra sí misma termina y es legal.
  const sola2 = new A.Partida();
  let jugadas = 0;
  while (!sola2.fin() && jugadas < 300) { sola2.move(sola2.jugadaDeLaComputadora(2, azarCon(jugadas + 7))); jugadas++; }
  cierto("computadora contra computadora termina por las reglas", !!sola2.fin(), (sola2.fin() || {}).motivo + " en " + jugadas + " medias jugadas");
}

/* ------------------------------------------------------- 2. en el navegador */
const CON_SESION = `
(function () {
  window.sb = { auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "u-ana" } } } }),
                        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from: () => ({ select() { return this; }, eq() { return this; }, in() { return this; }, order() { return this; },
                   limit() { return this; }, upsert() { return this; }, insert() { return this; }, update() { return this; },
                   maybeSingle() { return Promise.resolve({ data: null, error: null }); },
                   single() { return Promise.resolve({ data: null, error: null }); },
                   then(r) { return Promise.resolve({ data: [], error: null }).then(r); } }),
    rpc: () => ({ then(r) { return Promise.resolve({ data: [], error: null }).then(r); } }),
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() {}, presenceState() { return {}; } }),
    removeChannel() {} };
})();
`;
const SIN_SESION = CON_SESION.replace('session: { user: { id: "u-ana" } }', "session: null");

async function abrir(browser, ruta, cliente) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: cliente || CON_SESION }));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push("console: " + m.text()); });
  await page.goto(BASE + ruta, { waitUntil: "networkidle" });
  return { page, ctx, errores };
}
const reloj = (page, c) => page.$eval("#reloj-" + c + " .reloj-t", (e) => e.textContent);
const planilla = (page) => page.$$eval("#planilla li", (ls) => ls.map((l) => l.textContent.replace(/\s+/g, " ").trim()).join(" "));

async function navegador() {
  const { chromium } = require("./lib/playwright-con-sesion");
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    console.log("\n— Sin sesión —");
    {
      const { page, ctx } = await abrir(browser, "/ajedrez-4x8.html", SIN_SESION);
      await page.waitForTimeout(400);
      cierto("manda a iniciar sesión", /login\.html/.test(page.url()), page.url());
      await ctx.close();
    }

    console.log("\n— Contra la computadora —");
    const { page, ctx, errores } = await abrir(browser, "/ajedrez-4x8.html");
    await page.waitForSelector("#app:not(.hidden)");
    const casillas = await page.$$eval("#board [data-square]", (cs) => cs.map((c) => c.dataset.square));
    igual("el tablero tiene 32 casillas, de a8 arriba a la izquierda a d1 abajo a la derecha", [casillas.length, casillas[0], casillas[31]], [32, "a8", "d1"]);
    const forma = await page.$eval("#board", (b) => { const r = b.getBoundingClientRect(); return Math.round(r.height / r.width * 10) / 10; });
    igual("el tablero es el doble de alto que de ancho", forma, 2);
    const visibles = await page.$$eval("#board [data-square]", (cs) => cs.filter((c) => c.checkVisibility()).length);
    igual("y las 32 casillas se ven", visibles, 32);
    igual("una sola parada de tabulador en el tablero", await page.$$eval("#board [data-square]", (cs) => cs.filter((c) => c.tabIndex === 0).length), 1);
    igual("la casilla dice qué tiene", await page.$eval('#board [data-square="b1"]', (c) => c.getAttribute("aria-label")), "bella 1, rey blanco");
    igual("el reloj arranca en 3:00 para los dos", [await reloj(page, "w"), await reloj(page, "b")], ["3:00", "3:00"]);

    // Ponemos la computadora en Fácil para que conteste rápido.
    await page.selectOption("#nivel", "1");
    await page.click("#btn-nueva");
    await page.click('#board [data-square="b2"]');
    const estadoB2 = await page.$eval('#board [data-square="b2"]', (c) => c.getAttribute("aria-label"));
    cierto("al tocar el peón queda elegido", /elegida/.test(estadoB2), estadoB2);
    await page.click('#board [data-square="b4"]');
    await page.waitForFunction(() => document.querySelectorAll("#planilla li").length && /1\.\s*b4\s+\S/.test(document.getElementById("planilla").textContent), null, { timeout: 5000 });
    const pl = await planilla(page);
    cierto("la jugada y la respuesta de la computadora van a la planilla", /^1\. b4 \S+/.test(pl), pl);
    await page.waitForTimeout(1300);
    const tw = await reloj(page, "w"), tb = await reloj(page, "b");
    cierto("le toca a las blancas: baja su reloj y el de la computadora no se movió casi", tw < "3:00" && tb >= "2:59", tw + " / " + tb);
    const aviso = await page.$eval("#aviso", (e) => e.textContent);
    cierto("el aviso dice de quién es el turno", /juegas t[uú]|blancas/i.test(aviso), aviso);

    console.log("\n— Escribiendo, en Modo Adaptado —");
    await page.evaluate(() => window.AdaptiveMode && AdaptiveMode.set(true));
    await page.waitForTimeout(100);
    const caja = page.locator(".cc-caja .cc-input");
    cierto("aparece el recuadro para escribir", await caja.evaluate((e) => e.checkVisibility()));
    const antes = (await page.$$eval("#planilla li", (ls) => ls.length));
    await caja.fill("Cc3");
    await caja.press("Enter");
    // En Modo Adaptado la planilla va en palabras («caballo césar 3»), como
    // toda jugada que se muestra en el sitio (ComandosTablero.jugadaParaMostrar).
    await page.waitForFunction((n) => /^2\. caballo c\S+ 3 \S/.test(document.querySelectorAll("#planilla li")[1]?.textContent || ""), antes, { timeout: 5000 });
    cierto("«Cc3» escrito se juega, y la computadora contesta", /2\. caballo c\S+ 3 \S/.test(await planilla(page)), await planilla(page));
    await caja.fill("posición");
    await caja.press("Enter");
    await page.waitForTimeout(150);
    const dicho = await page.$eval(".cc-caja .cc-msg", (e) => e.textContent);
    cierto("«posición» la dice en palabras", /Blancas: .*Negras: /.test(dicho), dicho.slice(0, 80));
    await caja.fill("reloj");
    await caja.press("Enter");
    await page.waitForTimeout(150);
    const dichoReloj = await page.$eval(".cc-caja .cc-msg", (e) => e.textContent);
    cierto("«reloj» dice el tiempo de los dos", /blancas.*negras/i.test(dichoReloj), dichoReloj);
    await caja.fill("e4");
    await caja.press("Enter");
    await page.waitForTimeout(150);
    const fuera = await page.$eval(".cc-caja .cc-msg", (e) => e.textContent);
    cierto("una jugada que no existe en este tablero no se hace, y se dice", /no/i.test(fuera) && (await page.$$eval("#planilla li", (ls) => ls.length)) === 2, fuera);

    console.log("\n— Deshacer —");
    const primera = await page.$eval("#planilla li", (li) => li.textContent);
    await page.click("#btn-deshacer");
    await page.waitForTimeout(700);
    igual("contra la computadora, deshace tu jugada y la de ella, y no vuelve a jugar sola",
      await page.$$eval("#planilla li", (ls) => ls.map((l) => l.textContent)), [primera]);

    console.log("\n— Con las flechas —");
    await page.evaluate(() => window.AdaptiveMode && AdaptiveMode.set(false));
    await page.focus('#board [data-square="a8"]');
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    igual("a la derecha no se pasa de la columna d", await page.evaluate(() => document.activeElement.dataset.square), "d8");
    await page.keyboard.press("PageDown");
    igual("y hacia abajo llega a la fila 1", await page.evaluate(() => document.activeElement.dataset.square), "d1");

    console.log("\n— Dos jugadores en el mismo aparato —");
    await page.selectOption("#modo", "2p");
    await page.click("#btn-nueva");
    // Con una partida a medias, «Nueva partida» pregunta antes (js/avisos.js,
    // nunca confirm()), y el botón dice lo que hace.
    const dialogo = page.locator('dialog[data-avisos="confirmar"]');
    cierto("con la partida a medias pregunta antes de tirarla", await dialogo.evaluate((d) => d.open));
    await dialogo.getByRole("button", { name: "Empezar otra" }).click();
    await page.click('#board [data-square="c2"]');
    await page.click('#board [data-square="c4"]');
    await page.waitForTimeout(400);
    igual("nadie contesta solo: le toca a las negras", await planilla(page), "1. c4");
    await page.click('#board [data-square="b7"]');
    await page.click('#board [data-square="b5"]');
    await page.click('#board [data-square="c4"]');
    await page.click('#board [data-square="b5"]');
    igual("y se juega por turnos", await planilla(page), "1. c4 b5 2. cxb5");

    igual("sin errores en la consola", errores, []);
    await ctx.close();
  } finally {
    await browser.close();
  }
}

(async () => {
  reglas();
  if (!process.argv.includes("--sin-navegador")) await navegador();
  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron." : "\n✓ Todo bien.");
  process.exit(fallos ? 1 : 0);
})();
