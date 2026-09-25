#!/usr/bin/env node
/**
 * Verifica el reloj de las partidas y la triple repetición.
 *
 *   npm install chess.js@0.10.3
 *   node herramientas/verificar-reloj-y-repeticion.js
 *
 * No necesita navegador, ni red, ni el sitio servido. Lo que se rompe acá no
 * da ningún error: un reloj que cuenta con la hora de la computadora miente
 * distinto en cada pantalla, y una repetición que no se detecta deja la
 * partida andando para siempre. Por eso se mira:
 *
 *   - que js/repeticion.js cuente de verdad (con chess.js y con Crazyhouse),
 *     incluida la captura al paso que no se puede hacer —chess.js la anota
 *     igual y sin recortarla se escaparían repeticiones de verdad—;
 *   - que ante lo que no entiende NO declare tablas;
 *   - que ninguna página de partida calcule el reloj con Date.now() a secas y
 *     que todas carguen js/reloj-servidor.js y lo arranquen;
 *   - que las tres páginas con ajedrez de reglas normales carguen la
 *     repetición y la usen al mover;
 *   - y que el desfase se mida contra la hora del servidor (con un rpc de
 *     mentira que contesta una hora corrida).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");

let fallos = 0;
function ok(cond, msg) {
  console.log((cond ? "  ✓ " : "  ✗ ") + msg);
  if (!cond) fallos++;
}

let Chess;
try { ({ Chess } = require(path.join(RAIZ, "node_modules", "chess.js"))); }
catch (e) { console.error("Falta chess.js: npm install chess.js@0.10.3"); process.exit(1); }

global.window = global;
global.Chess = Chess;
require(path.join(RAIZ, "js", "repeticion.js"));
require(path.join(RAIZ, "js", "crazyhouse-engine.js"));

const INICIO = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const conChess = (f) => new Chess(f);
function fenTras(jugadas) { const g = new Chess(); jugadas.forEach((j) => g.move(j)); return g.fen(); }

console.log("La triple repetición");
const vaiven = ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8"];
ok(Repeticion.veces(INICIO, vaiven, conChess, fenTras(vaiven)) === 3, "la posición inicial tres veces cuenta 3");
ok(!Repeticion.esTriple(INICIO, vaiven.slice(0, 7), conChess, fenTras(vaiven.slice(0, 7))), "una jugada antes todavía no es triple");
const alPaso = ["e4", "Nc6", "Nf3", "Nb8", "Ng1", "Nc6", "Nf3", "Nb8", "Ng1"];
ok(Repeticion.esTriple(INICIO, alPaso, conChess, fenTras(alPaso)),
  "la captura al paso que nadie puede hacer no separa las posiciones");
ok(Repeticion.veces(INICIO, vaiven, conChess, "8/8/8/8/8/8/8/K6k w - - 0 1") === 0,
  "si la reproducción no llega a la FEN guardada, no se declara nada");
ok(Repeticion.veces(INICIO, ["Zz9"], conChess) === 0, "una jugada que no entiende no declara tablas");
const partida = ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7"];
ok(Repeticion.veces(INICIO, partida, conChess, fenTras(partida)) === 1, "una partida normal no se repite");

const Zh = Crazyhouse;
const conZh = (f) => new Zh.Game(f);
const zh = ["e4", "d5", "exd5", "Qxd5", "Nc3", "Qd8", "Nb1", "Qd5", "Nc3", "Qd8", "Nb1", "Qd5"];
const g = new Zh.Game(); zh.forEach((j) => g.move(j));
ok(Repeticion.esTriple(Zh.START_FEN, zh, conZh, g.fen()), "Crazyhouse: la misma posición y la misma reserva tres veces");
const g2 = new Zh.Game(); const zh2 = ["e4", "d5", "exd5", "Qxd5", "Nc3", "Qd8"]; zh2.forEach((j) => g2.move(j));
zh2.push(g2.drop("p", "e5").san);
ok(Repeticion.veces(Zh.START_FEN, zh2, conZh, g2.fen()) === 1, "Crazyhouse: una pieza soltada (@e5) se reproduce");

console.log("\nLas páginas de partida");
const PAGINAS = ["estandar.html", "niebla.html", "crazyhouse.html", "cartas.html", "variante.html", "cuatro-jugadores.html"];
for (const p of PAGINAS) {
  const s = require("./lib/codigo-de-pagina").leer(p);
  ok(!/Date\.now\(\)\s*-\s*new Date\(room\.clock_updated_at\)/.test(s), p + ": el reloj no se calcula con la hora de la computadora");
  ok(s.includes('src="js/reloj-servidor.js"') && s.includes("RelojServidor.iniciar(sb)"), p + ": carga y arranca js/reloj-servidor.js");
}
for (const p of ["estandar.html", "niebla.html", "crazyhouse.html"]) {
  const s = require("./lib/codigo-de-pagina").leer(p);
  ok(s.includes('src="js/repeticion.js"') && /esTripleRepeticion\(newMoves, info\.fen\)/.test(s), p + ": al mover se mira la triple repetición");
  ok(s.includes("Tablas por triple repetición."), p + ": el final dice por qué fueron tablas");
}

console.log("\nEl desfase contra el servidor");
(async () => {
  global.document = { addEventListener() {}, visibilityState: "visible" };
  const intervalo = global.setInterval; global.setInterval = () => 0;
  require(path.join(RAIZ, "js", "reloj-servidor.js"));
  const ADELANTO = 7000; // el servidor va 7 s por delante de esta computadora
  const sb = { rpc: async (n) => (n === "hora_servidor_ms" ? { data: Date.now() + ADELANTO, error: null } : { data: null, error: { message: "no" } }) };
  await RelojServidor.iniciar(sb);
  ok(Math.abs(RelojServidor.desfase() - ADELANTO) < 200, "mide el desfase (" + Math.round(RelojServidor.desfase()) + " ms)");
  const hace = new Date(Date.now() + ADELANTO - 10000).toISOString();
  ok(Math.abs(RelojServidor.desde(hace) - 10) < 0.3, "cuenta los segundos con la hora del servidor");
  global.setInterval = intervalo;
  console.log(fallos ? "\n✗ " + fallos + " comprobaciones fallaron" : "\n✓ Todo en orden");
  process.exit(fallos ? 1 : 0);
})();
