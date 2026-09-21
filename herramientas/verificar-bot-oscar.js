#!/usr/bin/env node
/* Comprueba el bot de Oscar: que elija lo mismo que una búsqueda COMPLETA y
 * que no vuelva a costar lo que costaba.
 *
 *   npm install chess.js@0.10.3
 *   node herramientas/verificar-bot-oscar.js
 *
 * No necesita navegador, ni red, ni el sitio servido.
 *
 * Existe porque todo lo que se rompe en `js/bot-oscar.js` se rompe CALLADO:
 * el bot siempre devuelve una jugada legal, así que una poda mal escrita, un
 * orden que se cuela delante de la mejor jugada o un adaptador al que se le
 * olvidó `valorJugada` no dan ningún error — el bot sigue jugando, solo que
 * peor o más lento, y de eso se entera quien está jugando contra él.
 *
 * Lo que mira, y por qué cada cosa:
 *
 *  1. Que la jugada que elige sea una de las que elegiría un minimax PURO
 *     —sin poda, sin recortar ramas, sin atajos— a la misma profundidad. Es
 *     la única forma de comprobar que alfa-beta y el atajo del último nivel
 *     devuelven el mismo número y no uno parecido.
 *  2. Que el orden de las jugadas no cambie la respuesta: se corre el mismo
 *     caso con `valorJugada` y sin ella (el camino de repuesto, el de los
 *     adaptadores que no la tengan) y tiene que salir lo mismo.
 *  3. Que encuentre el mate, y que prefiera el más CORTO: sin eso el bot
 *     puede dar vueltas con el mate en la mano.
 *  4. Que el evaluador sea simétrico — la misma posición con los colores
 *     cambiados tiene que valer lo mismo con el signo al revés—. Es lo que
 *     caza una tabla de posición mal reflejada, que en pantalla no se ve.
 *  5. Que ninguna jugada sea ilegal, en los cuatro niveles.
 *  6. Que no se pase del presupuesto de tiempo: es tiempo del hilo principal,
 *     o sea la pantalla congelada.
 *  7. Que el COSTO no se vuelva a disparar. Es la comprobación rara, y es la
 *     que de verdad hace falta: ordenar las jugadas clonando la posición de
 *     todas —que es como estaba escrito— funciona perfecto y cuesta diez
 *     veces más. Nada lo delata salvo contar los clones.
 *  8. Que los cinco adaptadores de bot.html ofrezcan `valorJugada`. Al que se
 *     le olvide vuelve solo al camino lento sin decir nada.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");
let Chess;
try {
  ({ Chess } = require(path.join(RAIZ, "node_modules/chess.js")));
} catch (e) {
  console.error("Falta chess.js. Corre:  npm install chess.js@0.10.3");
  process.exit(1);
}

let fallos = 0;
const ok = (msg) => console.log("  ok    " + msg);
const falla = (msg) => { fallos++; console.log("  FALLA " + msg); };
const comprobar = (cond, msg) => (cond ? ok(msg) : falla(msg));

/* ---------- El evaluador y el adaptador, sacados de bot.html ----------
   Por marcas y no por número de línea: el archivo se edita y los números se
   mueven. Y de bot.html y no de una copia: comprobar una copia del evaluador
   no comprobaría nada. */
const HTML = fs.readFileSync(path.join(RAIZ, "bot.html"), "utf8");
function tramo(desde, hasta) {
  const a = HTML.indexOf(desde);
  const b = HTML.indexOf(hasta, a);
  if (a < 0 || b < 0) { console.error(`No encuentro "${desde}" en bot.html`); process.exit(1); }
  return HTML.slice(a, b);
}
const FUENTE_EVAL = tramo("const VALOR = {", "const MODALIDADES = {") + "\n" + tramo("function materialDeTablero(", "function adaptadorCrazyhouse(");
const evaluador = new Function("Chess", FUENTE_EVAL + "\nreturn { adaptadorChess, materialDeTablero, TODAS_LAS_CASILLAS };")(Chess);

/* ---------- El bot ---------- */
function cargarBot(profundidadFija) {
  let src = fs.readFileSync(path.join(RAIZ, "js/bot-oscar.js"), "utf8");
  if (profundidadFija) {
    // Con presupuesto de tiempo, la profundidad depende de lo rápida que sea
    // la máquina y la prueba diría cosas distintas en cada computadora.
    src = src
      .replace(/const PRESUPUESTO_MS = \{[^}]*\};/, "const PRESUPUESTO_MS = { 3: 600000, 4: 600000 };")
      .replace(/const PROFUNDIDAD_MAXIMA = \{[^}]*\};/, `const PROFUNDIDAD_MAXIMA = { 3: ${profundidadFija}, 4: ${profundidadFija} };`);
  }
  const win = {};
  new Function("window", src)(win);
  return win.BotOscar;
}

/* Cuenta cuántas veces el bot clona una posición (`probar`), que es lo caro. */
function contador() {
  const cuenta = { probar: 0 };
  const envolver = (ad, conOrden) => ({
    turno: ad.turno,
    jugadas: () => ad.jugadas(),
    probar: (j) => { cuenta.probar++; const d = ad.probar(j); return d ? envolver(d, conOrden) : null; },
    material: () => ad.material(),
    enJaque: () => ad.enJaque(),
    valorJugada: conOrden ? (j) => ad.valorJugada(j) : undefined,
  });
  return { cuenta, envolver };
}

const adaptador = (fen) => evaluador.adaptadorChess(new Chess(fen));

/* ---------- 1 y 2. Contra una búsqueda completa ---------- */
// Minimax puro: todas las jugadas, sin poda y sin recortar nada. Es lento a
// propósito — es la referencia, no el motor.
function minimaxCompleto(ad, profundidad, lado) {
  if (profundidad === 0) return lado * ad.material();
  const jugadas = ad.jugadas();
  if (!jugadas.length) return ad.enJaque() ? -(90000 + profundidad) : 0;
  let mejor = -Infinity;
  for (const j of jugadas) {
    const despues = ad.probar(j);
    if (!despues) continue;
    const v = -minimaxCompleto(despues, profundidad - 1, -lado);
    if (v > mejor) mejor = v;
  }
  return mejor === -Infinity ? lado * ad.material() : mejor;
}

function jugadasOptimas(fen, profundidad) {
  const ad = adaptador(fen);
  const lado = ad.turno() === "w" ? 1 : -1;
  const puntajes = ad.jugadas().map((j) => {
    const despues = ad.probar(j);
    return { san: j.san, v: despues ? -minimaxCompleto(despues, profundidad - 1, -lado) : -Infinity };
  });
  const tope = Math.max.apply(null, puntajes.map((p) => p.v));
  return puntajes.filter((p) => Math.abs(p.v - tope) < 1e-6).map((p) => p.san);
}

// Posiciones de pocas jugadas a propósito: la referencia sin poda no aguanta
// un mediojuego a tres jugadas, y acá lo que se comprueba es que los dos
// caminos den lo mismo, no que el bot sepa de aperturas.
const CASOS = [
  ["final de peones", "8/5pk1/6p1/8/1P6/5PKP/8/8 w - - 0 40", 3],
  ["torre contra rey", "8/8/8/4k3/8/8/4P3/R3K3 w Q - 0 1", 3],
  ["dama colgando", "4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1", 3],
  ["rey y dama", "8/8/8/3k4/8/8/3QK3/8 w - - 0 1", 3],
  ["mediojuego cerrado", "4rrk1/pp3ppp/2p5/8/8/2P5/PP3PPP/4RRK1 w - - 0 20", 3],
];

console.log("\n1. La jugada elegida contra una búsqueda COMPLETA (sin poda ni atajos)");
for (const [nombre, fen, prof] of CASOS) {
  const bot = cargarBot(prof);
  const optimas = jugadasOptimas(fen, prof);
  const elegidas = new Set();
  for (let i = 0; i < 10; i++) {
    const m = bot.jugar(adaptador(fen), 3);
    elegidas.add(m ? m.san : "(ninguna)");
  }
  const malas = [...elegidas].filter((s) => optimas.indexOf(s) === -1);
  comprobar(!malas.length, `${nombre}: eligió [${[...elegidas].join(",")}], óptimas [${optimas.join(",")}]`);
}

console.log("\n2. El camino de repuesto (un adaptador SIN valorJugada) da lo mismo");
for (const [nombre, fen, prof] of CASOS) {
  const bot = cargarBot(prof);
  const optimas = jugadasOptimas(fen, prof);
  const { envolver } = contador();
  const elegidas = new Set();
  for (let i = 0; i < 6; i++) {
    const m = bot.jugar(envolver(adaptador(fen), false), 3);
    elegidas.add(m ? m.san : "(ninguna)");
  }
  const malas = [...elegidas].filter((s) => optimas.indexOf(s) === -1);
  comprobar(!malas.length, `${nombre} sin orden barato: eligió [${[...elegidas].join(",")}]`);
}

/* ---------- 3. El mate, y el más corto ---------- */
console.log("\n3. Encuentra el mate, y prefiere el más corto");
{
  const bot = cargarBot(3);
  const m = bot.jugar(adaptador("6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1"), 3);
  comprobar(m && m.san === "Ra8#", `mate en 1 con la torre: esperaba Ra8#, jugó ${m ? m.san : "nada"}`);
}
{
  // Mate en 2 en escalera. Va a CUATRO de profundidad y no a tres, y la
  // razón conviene tenerla escrita: el último nivel de la búsqueda es una
  // evaluación estática —se mira el material de la posición que queda, no si
  // el rival se quedó sin jugadas—, así que un mate que cae justo en ese
  // último nivel se cuenta como "una posición con una torre de más" y no como
  // mate. O sea que el nivel 3 (tres jugadas) NO ve un mate en 2; el nivel 4,
  // que llega hasta seis, sí. Viene siendo así desde siempre y arreglarlo
  // costaría pedirle las jugadas legales a cada hoja, que es lo más caro que
  // hay acá. Se juega de verdad en vez de comparar contra una jugada escrita
  // a mano: hay dos caminos que matan igual de rápido y pedir uno concreto
  // sería pedir de más.
  const bot = cargarBot(4);
  const g = new Chess("7k/8/8/8/8/8/R7/1R5K w - - 0 1");
  let jugadasBlancas = 0;
  while (!g.game_over() && jugadasBlancas < 3) {
    const m = bot.jugar(evaluador.adaptadorChess(g), 3);
    if (!m) break;
    g.move({ from: m.from, to: m.to, promotion: m.promotion || "q" });
    jugadasBlancas++;
    if (g.game_over()) break;
    const respuestas = g.moves();
    g.move(respuestas[0]); // el rey negro no tiene nada mejor que hacer
  }
  comprobar(g.in_checkmate() && jugadasBlancas <= 2, `mate en 2 en escalera: ${g.in_checkmate() ? "mate" : "sin mate"} en ${jugadasBlancas} jugadas — ${g.history().join(" ")}`);
}
{
  // Mate en 1 disponible teniendo también material que comer: no puede
  // distraerse con la torre gratis.
  const bot = cargarBot(3);
  const m = bot.jugar(adaptador("6k1/5ppp/8/8/8/8/5PPP/R5KR w - - 0 1"), 3);
  comprobar(m && /#/.test(m.san), `con mate en 1 en la mano juega mate: ${m ? m.san : "nada"}`);
}
{
  // Y no se ahoga: con dama y rey contra rey solo, no puede dejar al negro
  // sin jugadas y sin jaque.
  const bot = cargarBot(3);
  const g = new Chess("7k/8/6Q1/8/8/8/8/6K1 w - - 0 1");
  const m = bot.jugar(evaluador.adaptadorChess(g), 3);
  if (m) g.move({ from: m.from, to: m.to, promotion: m.promotion || "q" });
  comprobar(!g.in_stalemate(), `no busca el ahogado con la partida ganada (jugó ${m ? m.san : "nada"})`);
}

/* ---------- 4. El evaluador es simétrico ---------- */
console.log("\n4. El evaluador cuenta igual para los dos colores");
// Da vuelta el tablero de arriba abajo y cambia los colores. Los enroques
// tienen que quedar en el orden KQkq: chess.js los valida con una expresión
// regular y con cualquier otro orden RECHAZA la FEN — y al rechazarla deja el
// tablero VACÍO en vez de tirar un error, así que la comprobación pasaría a
// comparar contra la nada. De ahí el control de abajo.
function espejo(fen) {
  const [tablero, turno, enroques, alpaso] = fen.split(" ");
  const cambiarCaja = (t) => t.replace(/[a-zA-Z]/g, (c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()));
  const filas = tablero.split("/").reverse().map(cambiarCaja);
  const e = enroques === "-" ? "-" : "KQkq".split("").filter((c) => cambiarCaja(enroques).indexOf(c) !== -1).join("") || "-";
  const p = alpaso === "-" ? "-" : alpaso[0] + String(9 - Number(alpaso[1]));
  return `${filas.join("/")} ${turno === "w" ? "b" : "w"} ${e} ${p} 0 1`;
}
{
  let peor = 0, mirados = 0, rotas = 0;
  for (let n = 0; n < 80; n++) {
    const g = new Chess();
    for (let k = 0; k < 1 + Math.floor(Math.random() * 60) && !g.game_over(); k++) {
      const ms = g.moves();
      g.move(ms[Math.floor(Math.random() * ms.length)]);
    }
    const reflejada = espejo(g.fen());
    const r = new Chess(reflejada);
    // Si la FEN del espejo no vuelve a salir igual, chess.js no la cargó: esa
    // muestra no dice nada y contarla sería dar por buena una comparación
    // contra un tablero vacío.
    if (r.fen().split(" ").slice(0, 4).join(" ") !== reflejada.split(" ").slice(0, 4).join(" ")) { rotas++; continue; }
    const a = evaluador.materialDeTablero((s) => g.get(s), evaluador.TODAS_LAS_CASILLAS);
    const b = evaluador.materialDeTablero((s) => r.get(s), evaluador.TODAS_LAS_CASILLAS);
    peor = Math.max(peor, Math.abs(a + b));
    mirados++;
  }
  comprobar(rotas === 0, `las ${mirados + rotas} FEN del espejo cargan (${rotas} no cargaron)`);
  comprobar(mirados >= 40 && peor < 1e-9, `${mirados} posiciones y su espejo: diferencia máxima ${peor.toExponential(2)}`);
}

/* ---------- 5. Ninguna jugada ilegal, en los cuatro niveles ---------- */
console.log("\n5. Todas las jugadas son legales, en los cuatro niveles");
{
  const bot = cargarBot();
  let ilegales = 0, jugadas = 0;
  for (const nivel of [1, 2, 3, 4]) {
    const g = new Chess();
    for (let n = 0; n < 24 && !g.game_over(); n++) {
      const m = bot.jugar(evaluador.adaptadorChess(g), nivel);
      if (!m) break;
      jugadas++;
      if (!g.move({ from: m.from, to: m.to, promotion: m.promotion || "q" })) ilegales++;
    }
  }
  comprobar(ilegales === 0, `${jugadas} jugadas jugadas, ${ilegales} ilegales`);
  // Sin jugadas legales tiene que devolver null, no reventar ni inventar algo.
  const ahogado = bot.jugar(adaptador("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"), 3);
  comprobar(ahogado === null, "sin jugadas legales devuelve null");
}

/* ---------- 6. El presupuesto de tiempo se respeta ---------- */
console.log("\n6. No se pasa del presupuesto (es tiempo del hilo principal)");
{
  const bot = cargarBot();
  // La posición más cargada que hay: muchas piezas y muchas jugadas.
  const fen = "r1bq1rk1/pp2ppbp/2np1np1/8/2BNP3/2N1B3/PPP2PPP/R2Q1RK1 w - - 0 9";
  for (const [nivel, tope] of [[3, 400], [4, 1200]]) {
    let peor = 0;
    for (let i = 0; i < 3; i++) {
      const t = Date.now();
      bot.jugar(adaptador(fen), nivel);
      peor = Math.max(peor, Date.now() - t);
    }
    // El margen es por la última rama, que no se corta a la mitad.
    comprobar(peor <= tope * 1.6, `nivel ${nivel}: ${peor} ms contra un presupuesto de ${tope} ms`);
  }
}

/* ---------- 7. El costo no se volvió a disparar ---------- */
console.log("\n7. Cuántas posiciones clona para decidir una jugada");
{
  // Los topes son holgados: el doble largo de lo medido al escribir esto
  // (543 / 744 / 717 clones). No están para afinar nada, están para que si
  // alguien vuelve a ordenar las jugadas clonándolas TODAS —que medía entre
  // 1.700 y 7.200 y funciona igual de bien— salte acá y no en la pantalla de
  // quien esté jugando.
  const CUPOS = [
    ["inicial", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", 1200],
    ["mediojuego", "r2q1rk1/pp1nbppp/2p1pn2/3p4/2PP4/2N1PN2/PPQ1BPPP/R1B2RK1 w - - 0 10", 1600],
    ["abierta", "r1bq1rk1/pp2ppbp/2np1np1/8/2BNP3/2N1B3/PPP2PPP/R2Q1RK1 w - - 0 9", 1600],
  ];
  const bot = cargarBot(3);
  for (const [nombre, fen, cupo] of CUPOS) {
    const { cuenta, envolver } = contador();
    bot.jugar(envolver(adaptador(fen), true), 3);
    comprobar(cuenta.probar <= cupo, `${nombre}: ${cuenta.probar} clones (tope ${cupo})`);
  }
}

/* ---------- 8. Los cinco adaptadores ofrecen valorJugada ---------- */
console.log("\n8. Los adaptadores de bot.html saben ordenar sin clonar");
{
  const nombres = HTML.match(/function adaptador\w+\(/g) || [];
  const conOrden = [];
  const sinOrden = [];
  for (const cabecera of nombres) {
    const nombre = cabecera.slice("function ".length, -1);
    const desde = HTML.indexOf(cabecera);
    const hasta = HTML.indexOf("\nfunction ", desde + 1);
    const cuerpo = HTML.slice(desde, hasta < 0 ? undefined : hasta);
    (cuerpo.indexOf("valorJugada:") !== -1 ? conOrden : sinOrden).push(nombre);
  }
  comprobar(nombres.length >= 5, `hay ${nombres.length} adaptadores en bot.html`);
  comprobar(sinOrden.length === 0, `todos traen valorJugada${sinOrden.length ? ` — les falta a: ${sinOrden.join(", ")}` : ` (${conOrden.join(", ")})`}`);
}

console.log(fallos ? `\n${fallos} comprobaciones fallaron\n` : "\nTodo bien.\n");
process.exit(fallos ? 1 : 0);
