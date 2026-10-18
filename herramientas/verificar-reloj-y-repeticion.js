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
/* El texto del final en tablas vive en una sola copia (js/sala-juego.js) y lo
   usan las seis páginas de partida, también las que llevan la cuenta en la
   sala (ver «Todas las modalidades terminan en tablas» en
   docs/decisiones/juegos-y-torneos.md). */
{
  const sala = require("fs").readFileSync(require("path").join(__dirname, "..", "js", "sala-juego.js"), "utf8");
  ok(sala.includes("Tablas por triple repetición.") && sala.includes("Tablas por la regla de las 50 jugadas."), "js/sala-juego.js: textoTablas dice la repetición y las 50 jugadas");
  for (const p of ["cartas.html", "variante.html", "duelo.html"]) {
    const s = require("./lib/codigo-de-pagina").leer(p);
    ok(/SalaJuego\.textoTablas\(/.test(s), p + ": el final dice por qué fueron tablas (SalaJuego.textoTablas)");
  }
}
for (const p of ["estandar.html", "niebla.html", "crazyhouse.html"]) {
  const s = require("./lib/codigo-de-pagina").leer(p);
  ok(s.includes('src="js/repeticion.js"') && /esTripleRepeticion\(newMoves, info\.fen\)/.test(s), p + ": al mover se mira la triple repetición");
  ok(/SalaJuego\.textoTablas\(/.test(s), p + ": el final dice por qué fueron tablas (SalaJuego.textoTablas)");
}

console.log("\nLas prácticas que se juegan en la página (triple repetición y 50 jugadas, automáticas)");
{
  // Lo que hace el Bot de Oscar: el motor se vuelve a cargar desde la FEN en
  // cada jugada, y eso le borra a chess.js el historial.
  const motor = new Chess();
  const c = Repeticion.contador();
  c.anotar(motor);
  for (const j of vaiven) { motor.move(j); motor.load(motor.fen()); c.anotar(motor); }
  ok(!motor.in_threefold_repetition(), "recargado desde la FEN, chess.js solo no ve la repetición (por eso hace falta el contador)");
  ok(c.veces() === 3, "el contador la ve: la posición inicial tres veces");
  c.reiniciar(); c.anotar(motor);
  ok(c.veces() === 1, "al empezar otra partida el contador vuelve a cero");
  const c2 = Repeticion.contador(); const m2 = new Chess(); c2.anotar(m2);
  for (const j of alPaso) { m2.move(j); m2.load(m2.fen()); c2.anotar(m2); }
  ok(c2.veces() === 3, "el contador tampoco separa por una captura al paso que nadie puede hacer");
  ok(Repeticion.cincuentaJugadas("8/8/4k3/8/8/4K3/4R3/8 b - - 100 80"), "100 medias jugadas sin captura ni peón: 50 jugadas");
  ok(!Repeticion.cincuentaJugadas("8/8/4k3/8/8/4K3/4R3/8 b - - 99 80"), "99 medias jugadas todavía no");
  ok(!Repeticion.cincuentaJugadas("lo-que-sea"), "lo que no es una FEN no declara tablas");

  // Bot de Oscar: cada jugada (del alumno, del bot y la escrita a ciegas)
  // anota su posición antes de mirar si terminó.
  const bot = fs.readFileSync(path.join(RAIZ, "js", "bot.js"), "utf8");
  const html = fs.readFileSync(path.join(RAIZ, "bot.html"), "utf8");
  ok(html.indexOf('src="js/repeticion.js"') !== -1 && html.indexOf('src="js/repeticion.js"') < html.indexOf('src="js/bot.js"'),
    "bot.html carga js/repeticion.js antes que js/bot.js");
  const finales = bot.match(/^.*if \(revisarFinal\(\)\) return;$/gm) || [];
  const conAnotar = bot.match(/anotarPosicion\(\);\n\s*if \(revisarFinal\(\)\) return;/g) || [];
  ok(finales.length >= 4 && conAnotar.length === finales.length,
    "bot.js: las " + finales.length + " jugadas anotan la posición antes de revisar el final (" + conAnotar.length + ")");
  ok(/tablasPorReglamento\(\) \|\| d/.test(bot) && bot.includes("Tablas por triple repetición") && bot.includes("Tablas por la regla de las 50 jugadas"),
    "bot.js: el final mira la repetición y las 50 jugadas, y dice por qué");

  // «La clase juega» (la votación de la clase en vivo): se corre de verdad.
  const vm = require("vm");
  const ctx = { Chess, Repeticion, document: { getElementById: () => null }, sessionStorage: { getItem: () => null }, console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, "js", "clase-votacion.js"), "utf8")
    + "\n;globalThis.__t = { fin: finalDeLaPartida, poner: (p, b) => { partidaClase = p; board = b; } };", ctx);
  const tablero = (g) => ({ game: g, fen: () => g.fen() });
  const juego = new Chess();
  // El profe mostró el vaivén ANTES de empezar: eso no cuenta.
  vaiven.forEach((j) => juego.move(j));
  ctx.__t.poner({ fenInicial: juego.fen(), desde: juego.history().length, color: "w" }, tablero(juego));
  vaiven.slice(0, 4).forEach((j) => juego.move(j));
  ok(ctx.__t.fin() === null, "la clase juega: lo que el profe mostró antes de empezar no cuenta para la repetición");
  vaiven.slice(4).forEach((j) => juego.move(j));
  ok(ctx.__t.fin() === "Tablas por triple repetición.", "la clase juega: la tercera vez desde que empezó son tablas, solas");
  const cincuenta = new Chess("8/8/4k3/8/8/4K3/4R3/8 w - - 99 80");
  ctx.__t.poner({ fenInicial: cincuenta.fen(), desde: 0, color: "w" }, tablero(cincuenta));
  ok(ctx.__t.fin() === null, "la clase juega: a 99 medias jugadas todavía sigue");
  cincuenta.move("Ra2");
  ok(ctx.__t.fin() === "Tablas por la regla de las 50 jugadas.", "la clase juega: a las 50 jugadas son tablas, solas");
  const vieja = new Chess(); vaiven.forEach((j) => vieja.move(j));
  ctx.__t.poner({ color: "w" }, tablero(vieja));
  ok(ctx.__t.fin() === null, "la clase juega: una partida guardada sin fenInicial (de antes) no inventa tablas");

  // Habilidades: «Con lo justo» y «Rey y peón» se juegan contra la defensa.
  const tipos = fs.readFileSync(path.join(RAIZ, "js", "entreno-tipos.js"), "utf8");
  const conLoJusto = tipos.slice(tipos.indexOf('JUEGOS["con-lo-justo"]'), tipos.indexOf("function rutear()"));
  ok(/in_threefold_repetition\(\)/.test(conLoJusto) && /in_draw\(\)/.test(conLoJusto) && (conLoJusto.match(/tablasPorReglamento\(\)\) return/g) || []).length === 2,
    "Con lo justo: mira la repetición y las 50 jugadas después de cada jugada de los dos");
  const mas = fs.readFileSync(path.join(RAIZ, "js", "entreno-tipos-mas.js"), "utf8");
  const kpk = mas.slice(mas.indexOf("M.defensaKpk(Chess, bitsKpk, juego.fen())"), mas.indexOf("$(\"juego-enunciado\").textContent = item.nivel === 3"));
  ok(/in_threefold_repetition\(\)/.test(kpk) && /in_draw\(\)/.test(kpk), "Rey y peón: mira la repetición y las 50 jugadas después de la defensa");
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
