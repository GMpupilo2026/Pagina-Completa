#!/usr/bin/env node
/* Contra el bot: el reloj del alumno solo baja mientras le toca pensar a él,
   y el bot SIEMPRE contesta, aunque el motor se cuelgue.

   Lo que caza (nada de esto da error: el tablero solo se queda quieto, o el
   reloj baja de más):
   1. PracticeEngine.responder con un motor que no contesta nunca: tiene que
      jugar la de respaldo dentro del plazo, no esperar para siempre.
   2. Con un motor que contesta una jugada que no es legal: lo mismo.
   3. Con el motor de verdad: una jugada legal del motor (no de respaldo).
   4. En la práctica de la clase con reloj (sesion.html), el motor tarda 3 s
      en contestar: esos 3 s no se le descuentan al alumno.
   5. En la práctica de la clase, con el motor colgado: el bot juega igual y
      le vuelve a tocar al alumno.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-bot-siempre-contesta.js
*/
"use strict";

const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");

const { abrir, CHROME, BASE } = R;
const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };
const INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

async function pruebaResponder(browser) {
  console.log("\n=== PracticeEngine.responder: siempre una jugada, y con plazo ===");
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  // Una página cualquiera del sitio: el Worker del motor tiene que ser del mismo origen.
  await page.goto(BASE + "/robots.txt");
  for (const js of ["js/vendor/chess.js", "js/shared-engine.js", "js/practice-engine.js"]) {
    await page.addScriptTag({ url: BASE + "/" + js });
  }
  const FEN = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";

  const colgado = await page.evaluate(async (fen) => {
    const real = PracticeEngine.getMove;
    const listo = SharedEngine.listo;
    PracticeEngine.getMove = () => new Promise(() => {}); // no contesta nunca
    SharedEngine.listo = () => true;
    const t = performance.now();
    const r = await PracticeEngine.responder(fen, "1500");
    const ms = performance.now() - t;
    PracticeEngine.getMove = real;
    SharedEngine.listo = listo;
    const legal = !!r.uci && !!new Chess(fen).move({ from: r.uci.slice(0, 2), to: r.uci.slice(2, 4), promotion: r.uci[4] });
    return { legal, respaldo: r.respaldo, ms };
  }, FEN);
  igual("con el motor colgado, juega una legal de respaldo", [colgado.legal, colgado.respaldo], [true, true]);
  // 700 ms del nivel 1500 + 3500 de margen: un solo intento, no dos.
  igual("y no espera más que su plazo (" + Math.round(colgado.ms) + " ms)", colgado.ms < 5000, true);

  const ilegal = await page.evaluate(async (fen) => {
    const real = PracticeEngine.getMove;
    let pedidos = 0;
    PracticeEngine.getMove = async () => { pedidos += 1; return "e1e8"; };
    const r = await PracticeEngine.responder(fen, "1500");
    PracticeEngine.getMove = real;
    const legal = !!r.uci && !!new Chess(fen).move({ from: r.uci.slice(0, 2), to: r.uci.slice(2, 4), promotion: r.uci[4] });
    return { legal, respaldo: r.respaldo, pedidos };
  }, FEN);
  igual("con una jugada ilegal, la pide otra vez y después juega la de respaldo", ilegal, { legal: true, respaldo: true, pedidos: 2 });

  const deVerdad = await page.evaluate(async (fen) => {
    const r = await PracticeEngine.responder(fen, "1500");
    const legal = !!r.uci && !!new Chess(fen).move({ from: r.uci.slice(0, 2), to: r.uci.slice(2, 4), promotion: r.uci[4] });
    return { legal, respaldo: r.respaldo };
  }, FEN);
  igual("con el motor de verdad, una jugada legal del motor", deVerdad, { legal: true, respaldo: false });

  const sinJugadas = await page.evaluate(() => PracticeEngine.responder("k7/1Q6/1K6/8/8/8/8/8 b - - 0 1", "1500"));
  igual("sin jugadas legales (ya es mate), nada", sinJugadas, { uci: null, respaldo: false });
  await ctx.close();
}

const sesion = { id: "p1", fen: INICIAL, level: "1500", created_by: "u-profe", reloj_segundos: 180, incremento_segundos: 0,
  created_at: new Date().toISOString(), ended_at: null };
const partida = () => ({ id: "pg1", session_id: "p1", student_id: "u-ana", fen: INICIAL, moves: [], status: "playing", student_color: "w", attempts: 1, reloj_ms: 20000 });

async function pruebaRelojEnLaClase(browser) {
  console.log("\n=== La práctica con reloj: lo que piensa el motor no se descuenta ===");
  const r = await abrir(browser, "u-ana", CLASE, { practice_sessions: [sesion], practice_games: [partida()] });
  await r.page.waitForFunction(() => typeof practiceBoard !== "undefined" && practiceBoard && practiceBoard.interactive, null, { timeout: 10000 });
  // El motor tarda 3 s en contestar.
  await r.page.evaluate(() => {
    window.PracticeEngine = Object.assign({}, window.PracticeEngine, {
      preload() {},
      evaluate: async () => null,
      responder: () => new Promise((ok) => setTimeout(() => ok({ uci: "e7e5", respaldo: false }), 3000)),
    });
  });
  await r.page.evaluate(() => practiceBoard.jugar({ from: "e2", to: "e4" }));
  await r.page.waitForTimeout(1500);
  igual("mientras el motor piensa, el tablero no deja mover", await r.page.evaluate(() => practiceBoard.interactive), false);
  igual("y el reloj sigue en lo que tenía", /Tu reloj: 0:(20|19)/.test(await r.page.textContent("#practice-reloj-alumno")), true);
  await r.page.waitForFunction(() => practiceBoard.game.history().length === 2 && practiceBoard.interactive, null, { timeout: 8000 });
  await r.page.waitForTimeout(500);
  await r.page.evaluate(() => practiceBoard.jugar({ from: "g1", to: "f3" }));
  await r.page.waitForFunction(() => window.__updates.filter((u) => u.tabla === "practice_games" && "reloj_ms" in u.campos).length >= 2, null, { timeout: 5000 });
  const relojes = await r.page.evaluate(() => window.__updates.filter((u) => u.tabla === "practice_games" && "reloj_ms" in u.campos).map((u) => u.campos.reloj_ms));
  // Pensó ~0,5 s cada vez; si el reloj corriera mientras el motor piensa, le faltarían 3 s más.
  igual("a la segunda jugada solo se le descontó lo que pensó él (" + relojes.join(" → ") + " ms)",
    relojes[0] > 19000 && relojes[1] > relojes[0] - 2000, true);
  igual("sin errores en consola", r.errores, []);
  await r.ctx.close();
}

async function pruebaMotorColgadoEnLaClase(browser) {
  console.log("\n=== La práctica de la clase con el motor colgado: el bot juega igual ===");
  const r = await abrir(browser, "u-ana", CLASE, { practice_sessions: [sesion], practice_games: [partida()] });
  await r.page.waitForFunction(() => typeof practiceBoard !== "undefined" && practiceBoard && practiceBoard.interactive, null, { timeout: 10000 });
  await r.page.evaluate(() => {
    SharedEngine.listo = () => true;
    window.PracticeEngine = Object.assign({}, window.PracticeEngine, {
      preload() {},
      evaluate: async () => null,
      getMove: () => new Promise(() => {}), // no contesta nunca
    });
  });
  await r.page.evaluate(() => practiceBoard.jugar({ from: "e2", to: "e4" }));
  const jugo = await r.page.waitForFunction(() => practiceBoard.game.history().length === 2 && practiceBoard.interactive, null, { timeout: 9000 })
    .then(() => true, () => false);
  igual("el bot contestó y le vuelve a tocar al alumno", jugo, true);
  igual("se le dice que le toca", await r.page.textContent("#practice-card-status"), "Es tu turno.");
  igual("la jugada del bot quedó guardada", await r.page.evaluate(() =>
    (window.__updates.filter((u) => u.tabla === "practice_games" && u.campos.moves).pop() || { campos: {} }).campos.moves.length), 2);
  igual("sin errores en consola", r.errores, []);
  await r.ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaResponder(browser);
    await pruebaRelojEnLaClase(browser);
    await pruebaMotorColgadoEnLaClase(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: el bot siempre contesta y su tiempo no se le cobra al alumno.");
  process.exit(fallos ? 1 : 0);
})();
