/* Las medidas de la prueba de estilo: qué tiene de «atacar», de «abrir» y de
 * «cambiar» cada una de las dos jugadas de una pregunta.
 *
 * Una pregunta de estilo pone dos jugadas que Stockfish valora casi igual y
 * que son de carácter opuesto. Ese «carácter opuesto» no se pone a ojo: lo
 * miden estas funciones, solo con chess.js, para que el generador
 * (herramientas/estilo-generar.js) elija con ellas, el verificador
 * (herramientas/verificar-estilo.js) las vuelva a calcular en el CI, que no
 * tiene motor, y el navegador mida con ellas el estilo en las partidas del
 * alumno (js/estilo-partidas.js) y el de cada apertura en las partidas de
 * maestros (herramientas/estilo-aperturas-medir.js). Una sola copia para las
 * cuatro cosas. Los tres ejes:
 *
 *   ataque      presión sobre el rey rival: cuántos ataques caen en su zona
 *               (su casilla, las de alrededor y dos filas hacia adelante),
 *               contada justo después de la jugada.
 *   estructura  cuán abierto queda el juego: columnas abiertas (1) y
 *               semiabiertas (0,5), menos los peones bloqueados de frente
 *               (1 por par), contada tras la jugada y la respuesta del motor.
 *   cambios     cuánto material de piezas (sin peones: C y A 3, T 5, D 9,
 *               de los dos bandos) sale del tablero en las cuatro primeras
 *               medias jugadas de la línea del motor; y `propone`, si es la
 *               jugada misma la que cambia (captura una pieza, o el rival
 *               captura en la respuesta la pieza que movió).
 */
(function () {
"use strict";

const VALOR = { n: 3, b: 3, r: 5, q: 9 };
const COL = "abcdefgh";

/* El tablero como mapa casilla → {type, color}, sin depender de la versión
 * de chess.js: se lee del FEN. */
function tablero(fen) {
  const mapa = {};
  const filas = fen.split(" ")[0].split("/");
  filas.forEach((fila, i) => {
    let c = 0;
    for (const ch of fila) {
      if (/\d/.test(ch)) { c += +ch; continue; }
      const color = ch === ch.toUpperCase() ? "w" : "b";
      mapa[COL[c] + (8 - i)] = { type: ch.toLowerCase(), color };
      c++;
    }
  });
  return mapa;
}

const casilla = (c, f) => (c >= 0 && c < 8 && f >= 1 && f <= 8 ? COL[c] + f : null);
const coord = (sq) => [COL.indexOf(sq[0]), +sq[1]];

/* Las casillas que ataca la pieza de `sq` (rayos cortados por la primera pieza). */
function ataquesDe(mapa, sq) {
  const p = mapa[sq];
  const [c, f] = coord(sq);
  const out = [];
  const salto = (dc, df) => { const s = casilla(c + dc, f + df); if (s) out.push(s); };
  const rayo = (dc, df) => {
    let cc = c + dc, ff = f + df, s;
    while ((s = casilla(cc, ff))) { out.push(s); if (mapa[s]) break; cc += dc; ff += df; }
  };
  if (p.type === "p") { const d = p.color === "w" ? 1 : -1; salto(-1, d); salto(1, d); }
  if (p.type === "n") [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]].forEach(([a, b]) => salto(a, b));
  if (p.type === "k") for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (a || b) salto(a, b);
  if (p.type === "b" || p.type === "q") [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([a, b]) => rayo(a, b));
  if (p.type === "r" || p.type === "q") [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, b]) => rayo(a, b));
  return out;
}

/* La zona del rey de `color`: su casilla, las de alrededor y dos filas hacia
 * el rival en sus tres columnas. */
function zonaDelRey(mapa, color) {
  const rey = Object.keys(mapa).find((s) => mapa[s].type === "k" && mapa[s].color === color);
  if (!rey) return [];
  const [c, f] = coord(rey);
  const d = color === "w" ? 1 : -1;
  const zona = new Set();
  for (let a = -1; a <= 1; a++) {
    for (let b = -1; b <= 1; b++) { const s = casilla(c + a, f + b); if (s) zona.add(s); }
    const s2 = casilla(c + a, f + 2 * d); if (s2) zona.add(s2);
  }
  return [...zona];
}

/* Cuántos ataques de `color` (sin contar su rey) caen en la zona del rey rival. */
function presionSobreElRey(fen, color) {
  const mapa = tablero(fen);
  const zona = new Set(zonaDelRey(mapa, color === "w" ? "b" : "w"));
  let n = 0;
  for (const sq of Object.keys(mapa)) {
    const p = mapa[sq];
    if (p.color !== color || p.type === "k") continue;
    for (const a of ataquesDe(mapa, sq)) if (zona.has(a)) n++;
  }
  return n;
}

/* Columnas abiertas + 0,5 por semiabierta − pares de peones bloqueados. */
function apertura(fen) {
  const mapa = tablero(fen);
  let v = 0;
  for (let c = 0; c < 8; c++) {
    let b = 0, n = 0;
    for (let f = 1; f <= 8; f++) {
      const p = mapa[COL[c] + f];
      if (p && p.type === "p") p.color === "w" ? b++ : n++;
    }
    if (!b && !n) v += 1;
    else if (!b || !n) v += 0.5;
  }
  for (const sq of Object.keys(mapa)) {
    const p = mapa[sq];
    if (p.type !== "p" || p.color !== "w") continue;
    const [c, f] = coord(sq);
    const delante = mapa[casilla(c, f + 1)];
    if (delante && delante.type === "p" && delante.color === "b") v -= 1;
  }
  return v;
}

/* Material de piezas (sin peones ni reyes) de los dos bandos. */
function piezas(fen) {
  const mapa = tablero(fen);
  return Object.values(mapa).reduce((s, p) => s + (VALOR[p.type] || 0), 0);
}

/* Juega una lista de jugadas UCI sobre un FEN con chess.js; devuelve los FEN
 * de cada paso (el primero es el de partida). Lanza si una no es legal. */
function jugarUci(Chess, fen, ucis) {
  const c = new Chess(fen);
  const fens = [c.fen()];
  for (const u of ucis) {
    const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    if (!m) throw new Error("Jugada ilegal " + u + " en " + c.fen());
    fens.push(c.fen());
  }
  return fens;
}

/* Las tres medidas de una jugada, con la línea del motor que la sigue
 * (`linea` empieza con la jugada misma). */
function medir(Chess, fen, linea) {
  const color = fen.split(" ")[1];
  const fens = jugarUci(Chess, fen, linea.slice(0, 4));
  const tras = fens[1];
  const tras2 = fens[Math.min(2, fens.length - 1)];
  const tras4 = fens[fens.length - 1];
  // Si la jugada misma propone el cambio: captura una pieza, o la pieza que
  // movió es capturada en la respuesta del motor (un cambio ofrecido).
  const pieza = (f, sq) => tablero(f)[sq];
  const destino = linea[0].slice(2, 4);
  const capturada = pieza(fen, destino);
  const ofrece = linea.length > 1 && linea[1].slice(2, 4) === destino;
  return {
    ataque: presionSobreElRey(tras, color) - presionSobreElRey(fen, color),
    estructura: apertura(tras2) - apertura(fen),
    cambios: piezas(fen) - piezas(tras4),
    propone: (capturada && capturada.type !== "p") || ofrece ? 1 : 0,
  };
}

/* Los umbrales de cada eje: `polo` es lo mínimo que tiene que separar a las
 * dos jugadas en su eje; `otros` lo máximo que pueden separarse en los demás
 * para que la pregunta mida UNA cosa. */
const UMBRAL = {
  ataque: { polo: 3, primero: 2, segundo: 0, otros: { estructura: 1, cambios: 0 } },
  estructura: { polo: 1.5, primero: 1, segundo: 0, otros: { ataque: 2, cambios: 3 } },
  cambios: { polo: 6, primero: 6, segundo: 0, otros: { ataque: 2, estructura: 1 } },
};
/* Además de separarse, cada jugada tiene que SER lo que dice su polo: la de
 * atacar suma al menos `primero` de presión y la de maniobrar no suma nada
 * (`segundo`); igual en los otros ejes. Sin esto, «atacar» podía ser una
 * jugada que solo se retiraba menos que la otra. */

/* Los nombres de los dos polos de cada eje, en el orden [mayor, menor] de su
 * medida: en «ataque» la que más presiona es «atacar». */
const POLOS = {
  ataque: ["atacar", "maniobrar"],
  estructura: ["abrir", "cerrar"],
  cambios: ["cambiar", "mantener"],
};

/* Qué clase de jugada es: si mueve un peón y si captura. */
function tipoDeJugada(Chess, fen, uci) {
  const c = new Chess(fen);
  const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  if (!m) throw new Error("Jugada ilegal " + uci + " en " + fen);
  return { peon: m.piece === "p", captura: !!m.captured };
}

/* Si dos jugadas hacen una pregunta del eje: devuelve qué jugada ("a" o "b")
 * es el primer polo (atacar, abrir, cambiar), o null. `ta` y `tb` son sus
 * tipoDeJugada(): en «estructura» la que abre tiene que ser una jugada de
 * peón o una captura (la ruptura la hace quien elige, no la respuesta del
 * rival) y la que cierra no puede capturar; en «cambios», la que cambia
 * propone el cambio ella misma (`propone`) y la que mantiene no captura. */
function poloDe(eje, ma, mb, ta, tb) {
  const u = UMBRAL[eje];
  const d = ma[eje] - mb[eje];
  if (Math.abs(d) < u.polo) return null;
  for (const [otro, max] of Object.entries(u.otros)) if (Math.abs(ma[otro] - mb[otro]) > max) return null;
  const [p, s, tp, ts] = d > 0 ? [ma, mb, ta, tb] : [mb, ma, tb, ta];
  if (p[eje] < u.primero || s[eje] > u.segundo) return null;
  if (eje === "estructura" && (!(tp.peon || tp.captura) || ts.captura)) return null;
  // La de cambiar propone el cambio ella misma; la de mantener no captura.
  if (eje === "cambios" && (!p.propone || ts.captura)) return null;
  return d > 0 ? "a" : "b";
}

/* La posición con los colores cambiados: el tablero dado vuelta de arriba
 * abajo, con las piezas de un color pasadas al otro y el turno del otro
 * bando. Es la misma posición para quien la mira: la prueba la usa de
 * control (la misma pregunta otra vez, sin que se note) para saber si la
 * persona contesta lo que prefiere o al azar. */
const espejoCasilla = (sq) => sq[0] + (9 - +sq[1]);
function espejoFen(fen) {
  const [tab, turno, enroques, ap, ...resto] = fen.split(" ");
  const cambiar = (ch) => (ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase());
  const filas = tab.split("/").reverse().map((f) => f.replace(/[a-zA-Z]/g, cambiar));
  const enr = enroques === "-" ? "-" : enroques.split("").map(cambiar).sort((x, y) => "KQkq".indexOf(x) - "KQkq".indexOf(y)).join("");
  return [filas.join("/"), turno === "w" ? "b" : "w", enr, ap === "-" ? "-" : espejoCasilla(ap), ...resto].join(" ");
}
const espejoUci = (u) => espejoCasilla(u.slice(0, 2)) + espejoCasilla(u.slice(2, 4)) + (u[4] || "");

const api = { tablero, ataquesDe, zonaDelRey, presionSobreElRey, apertura, piezas, jugarUci, medir, tipoDeJugada, UMBRAL, POLOS, poloDe, espejoFen, espejoUci };
if (typeof window !== "undefined") window.EstiloMedidas = api;
if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
