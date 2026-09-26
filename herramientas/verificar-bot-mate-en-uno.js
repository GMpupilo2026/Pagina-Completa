#!/usr/bin/env node
/* Comprueba que el bot contesta enseguida cuando le toca recibir mate en uno,
 * para que el alumno siempre pueda terminar la partida con el mate.
 *
 *   python3 -m http.server 8777    (desde la raíz del sitio)
 *   node herramientas/verificar-bot-mate-en-uno.js
 *
 * El problema que caza: Stockfish mira el reloj cada ~1000 nodos, y en una
 * posición en que le dan mate en uno recorre tan pocos que nunca lo mira —
 * sigue profundizando hasta 245 y el «go movetime» no lo para. En la
 * computadora tardaba 3 s en vez de 0,7; en un celular pasaba del timeout, el
 * motor «no respondía» y la partida quedaba congelada justo antes del mate.
 * Nada da error: el bot solo se queda pensando. Por eso se mide el tiempo.
 *
 * Mira, con el motor de Clases y cursos (js/practice-engine.js) y con el del
 * bot de Oscar (js/chess-bot.js):
 *  1. que en posiciones con mate en uno en contra devuelva una jugada legal
 *     y lo haga sin pasarse mucho de su tiempo;
 *  2. que jugadaDeRespaldo() —la que juega el bot si el motor no contesta—
 *     dé una jugada legal, y el mate si lo tiene.
 */
"use strict";

const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
const bien = (t) => console.log("  ✓ " + t);
const mal = (t) => { console.log("  ✗ " + t); fallos += 1; };

// Al bot le toca y todas (o la única) de sus jugadas dejan mate en uno.
const MATE_EN_CONTRA = {
  "una sola jugada (Rb8, Th8#)": "k7/8/1K6/8/8/8/8/7R b - - 0 1",
  "varias jugadas, todas pierden": "7k/6pp/8/8/8/8/1Q6/K5R1 b - - 0 1",
};
// Holgura sobre el tiempo de búsqueda: antes del arreglo pasaba de 2 s de más.
const HOLGURA_MS = 1500;

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    const page = await ctx.newPage();
    // Una página cualquiera del sitio: el Worker del motor tiene que ser del mismo origen.
    await page.goto(BASE + "/robots.txt");
    for (const js of ["js/vendor/chess.js", "js/shared-engine.js", "js/practice-engine.js", "js/chess-bot.js"]) {
      await page.addScriptTag({ url: BASE + "/" + js });
    }
    // Primer arranque del motor (el WASM) fuera de la medición.
    await page.evaluate(() => PracticeEngine.getMove("8/8/8/8/8/8/4k3/K7 w - - 0 1", "1500"));

    for (const [nombre, fen] of Object.entries(MATE_EN_CONTRA)) {
      for (const nivel of ["1500", "1800", "max"]) {
        const r = await page.evaluate(async ({ fen, nivel }) => {
          const t = performance.now();
          const uci = await PracticeEngine.getMove(fen, nivel);
          const ms = performance.now() - t;
          const g = new Chess(fen);
          const legal = !!uci && !!g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
          return { uci, ms, legal, movetime: PracticeEngine.LEVELS[nivel].movetime };
        }, { fen, nivel });
        if (!r.legal) mal(`práctica ${nivel}, ${nombre}: no devolvió una jugada legal (${r.uci})`);
        else if (r.ms > r.movetime + HOLGURA_MS) mal(`práctica ${nivel}, ${nombre}: tardó ${Math.round(r.ms)} ms (su tiempo es ${r.movetime})`);
        else bien(`práctica ${nivel}, ${nombre}: ${r.uci} en ${Math.round(r.ms)} ms`);
      }
      for (const dif of ["easy", "medium", "hard"]) {
        const r = await page.evaluate(async ({ fen, dif }) => {
          const g = new Chess(fen);
          const t = performance.now();
          const m = await OscarBot.getMove(g, dif);
          return { san: m && m.san, ms: performance.now() - t, legal: !!m && !!g.move(m.san) };
        }, { fen, dif });
        // El motor del bot de Oscar tiene de 350 a 1200 ms según la dificultad.
        if (!r.legal) mal(`bot de Oscar ${dif}, ${nombre}: no devolvió una jugada legal`);
        else if (r.ms > 1200 + HOLGURA_MS) mal(`bot de Oscar ${dif}, ${nombre}: tardó ${Math.round(r.ms)} ms`);
        else bien(`bot de Oscar ${dif}, ${nombre}: ${r.san} en ${Math.round(r.ms)} ms`);
      }
    }

    const respaldo = await page.evaluate(() => {
      const legal = (fen, uci) => !!uci && !!new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      const conMate = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1"; // Ta8#
      const sinJugadas = "k7/1Q6/1K6/8/8/8/8/8 b - - 0 1";   // ya es mate
      const deMate = [];
      for (let i = 0; i < 20; i++) deMate.push(PracticeEngine.jugadaDeRespaldo(conMate));
      return {
        legalMate: deMate.every((u) => legal(conMate, u)),
        siempreMate: deMate.every((u) => u === "a1a8"),
        sinJugadas: PracticeEngine.jugadaDeRespaldo(sinJugadas),
      };
    });
    if (respaldo.legalMate && respaldo.siempreMate) bien("jugadaDeRespaldo da el mate cuando lo hay");
    else mal("jugadaDeRespaldo no dio el mate: " + JSON.stringify(respaldo));
    if (respaldo.sinJugadas === null) bien("jugadaDeRespaldo sin jugadas legales devuelve null");
    else mal("jugadaDeRespaldo sin jugadas legales devolvió " + respaldo.sinJugadas);
    await ctx.close();
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} comprobación(es) fallaron.` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
