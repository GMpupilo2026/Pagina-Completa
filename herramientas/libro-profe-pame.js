#!/usr/bin/env node
/* ===== El libro del bot de la profe Pame («Juega contra mí») =====
 *
 * «Juega contra mí» (tablero.html, js/chess-bot.js) juega como el profe
 * Oscar: un libro con las posiciones de sus partidas y, fuera del libro,
 * Stockfish calibrado a su Elo. Quien es de CCDR POCOCI juega contra la profe
 * Pame (lo decide js/avatar-profe-oscar.js), con SU libro y SU Elo, que salen
 * de sus partidas en Lichess (usuario pame17) con este script:
 *
 *   node herramientas/libro-profe-pame.js "G:/Libros/lichess_pame17_2026-11-11.pgn"
 *
 * Arma lo mismo que tiene el profe Oscar, en el mismo formato, para que
 * chess-bot.js no tenga que saber de quién es el libro:
 *
 *   data/pame-book.json             { hash: [uci1, peso1, uci2, peso2, …] }
 *   data/pame-book-provenance.json  { games: [[color, rival, W|L|D, fecha,
 *                                    su Elo, Elo rival, ritmo], …],
 *                                    moves: { hash: [partida de cada jugada] } }
 *   js/pame-book.js                 window.PAME_ELO_CALIB (la mediana de su
 *                                    Elo reciente por ritmo)
 *
 * - El hash es el FNV-1a-64 de la FEN sin los contadores, y la FEN es la de
 *   chess.js 0.10.3, la misma que calcula la página (con la casilla al paso
 *   siempre que un peón avanzó dos).
 * - peso = round(veces × (0,5 + puntaje medio) × 10): la frecuencia manda y lo
 *   que le dio puntos pesa un poco más que lo que le hizo perder. Mismo orden
 *   de magnitud que el libro del profe Oscar (frecuencia·resultado·10).
 * - Solo ajedrez normal desde la posición inicial ([Variant "Standard"] y sin
 *   [FEN]): las partidas «From Position» son finales de práctica.
 * - Hasta MAX_PLY medias jugadas por partida; entra una jugada que hizo
 *   MIN_JUGADA veces o más en esa posición. Una que hizo una sola vez en bala
 *   de un minuto es un dedo que se resbaló, no su repertorio.
 * - La procedencia apunta, para cada jugada, a la partida MÁS RECIENTE en que
 *   la hizo. Los rivales son usuarios públicos de Lichess, como en la del
 *   profe Oscar. El PGN NO va al repositorio.
 *
 * Ver «El bot de la profe Pame» en docs/decisiones/juegos-y-torneos.md.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");
const { estampar } = require("./lib/sello");

const USUARIO = "pame17";
const MAX_PLY = 40;
const MIN_JUGADA = 2;
const RAIZ = path.join(__dirname, "..");

function fnv1a64Hex(str) {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n, mask = (1n << 64n) - 1n;
  for (let i = 0; i < str.length; i++) { h ^= BigInt(str.charCodeAt(i) & 0xff); h = (h * prime) & mask; }
  return h.toString(16).padStart(16, "0");
}
const hashDe = (fen) => fnv1a64Hex(fen.split(" ").slice(0, 4).join(" "));

// El ritmo, con la cuenta de Lichess: base + 40 × incremento, en segundos.
function ritmo(tc) {
  const m = /^(\d+)\+(\d+)$/.exec(tc || "");
  if (!m) return "other";
  const t = Number(m[1]) + 40 * Number(m[2]);
  return t < 30 ? "hyperbullet" : t < 180 ? "bullet" : t < 480 ? "blitz" : t < 1500 ? "rapid" : "other";
}

function partidas(texto) {
  const out = [];
  for (const bloque of texto.split(/\n(?=\[Event )/)) {
    const cab = {};
    for (const m of bloque.matchAll(/^\[(\w+) "([^"]*)"\]/gm)) cab[m[1]] = m[2];
    const jugadas = bloque.replace(/^\[.*\]$/gm, "")
      .replace(/\{[^}]*\}/g, " ").replace(/\([^()]*\)/g, " ").replace(/\$\d+/g, " ")
      .replace(/\d+\.(\.\.)?/g, " ").replace(/(1-0|0-1|1\/2-1\/2|\*)\s*$/, " ")
      .split(/\s+/).filter(Boolean);
    out.push({ cab, jugadas });
  }
  return out;
}

const mediana = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

function main() {
  const archivo = process.argv[2];
  if (!archivo) { console.error("Uso: node herramientas/libro-profe-pame.js <partidas.pgn>"); process.exit(2); }
  const todas = partidas(fs.readFileSync(archivo, "utf8"));
  // Lichess las exporta de la más nueva a la más vieja: se recorren al revés
  // para que la procedencia de cada jugada quede en la más reciente.
  todas.reverse();

  const games = [];
  const cuenta = new Map();   // hash -> Map(uci -> { veces, puntos, partida })
  const elos = {};            // ritmo -> [{fecha, elo}]
  let rotas = 0;
  for (const { cab, jugadas } of todas) {
    const color = cab.White === USUARIO ? "w" : cab.Black === USUARIO ? "b" : null;
    if (!color) continue;
    const suElo = Number(color === "w" ? cab.WhiteElo : cab.BlackElo);
    const elRival = color === "w" ? cab.BlackElo : cab.WhiteElo;
    const r = ritmo(cab.TimeControl);
    if (Number.isFinite(suElo) && suElo > 0 && /rated/i.test(cab.Event || "")) (elos[r] = elos[r] || []).push({ fecha: cab.UTCDate || cab.Date, elo: suElo });
    if ((cab.Variant && cab.Variant !== "Standard") || cab.FEN) continue;

    const res = cab.Result === "1/2-1/2" ? "D" : cab.Result === (color === "w" ? "1-0" : "0-1") ? "W" : cab.Result === "*" ? "?" : "L";
    const puntos = { W: 1, D: 0.5, L: 0, "?": 0.5 }[res];
    const gidx = games.length;
    games.push([color, color === "w" ? cab.Black : cab.White, res, cab.UTCDate || cab.Date, String(suElo || "?"), elRival || "?", r]);

    const juego = new Chess();
    for (let i = 0; i < Math.min(MAX_PLY, jugadas.length); i++) {
      const antes = hashDe(juego.fen());
      const m = juego.move(jugadas[i], { sloppy: true });
      if (!m) { rotas += 1; break; }
      if (m.color !== color) continue;
      const uci = m.from + m.to + (m.promotion || "");
      if (!cuenta.has(antes)) cuenta.set(antes, new Map());
      const c = cuenta.get(antes);
      const e = c.get(uci) || { veces: 0, puntos: 0, partida: gidx };
      e.veces += 1; e.puntos += puntos; e.partida = gidx;
      c.set(uci, e);
    }
  }

  const libro = {}, moves = {}, usadas = new Set();
  for (const [hash, jugadas] of [...cuenta].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const filas = [...jugadas]
      .filter(([, e]) => e.veces >= MIN_JUGADA)
      .map(([uci, e]) => [uci, Math.round(e.veces * (0.5 + e.puntos / e.veces) * 10), e.partida])
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    if (!filas.length) continue;
    libro[hash] = filas.flatMap(([uci, peso]) => [uci, peso]);
    moves[hash] = filas.map(([, , g]) => g);
    filas.forEach(([, , g]) => usadas.add(g));
  }
  // Solo quedan las partidas que alguna jugada del libro cita, renumeradas.
  const nuevo = new Map([...usadas].sort((a, b) => a - b).map((g, i) => [g, i]));
  for (const h of Object.keys(moves)) moves[h] = moves[h].map((g) => nuevo.get(g));
  const gamesUsadas = [...nuevo.keys()].map((g) => games[g]);

  const calib = {};
  for (const [r, xs] of Object.entries(elos)) {
    const recientes = xs.sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, 200).map((x) => x.elo);
    calib[r] = { recent_median_elo: mediana(recientes), n_games: xs.length };
  }

  fs.writeFileSync(path.join(RAIZ, "data", "pame-book.json"), JSON.stringify(libro));
  fs.writeFileSync(path.join(RAIZ, "data", "pame-book-provenance.json"), JSON.stringify({ games: gamesUsadas, moves }));
  const js = `// Lo genera herramientas/libro-profe-pame.js con las partidas de la profe Pame
// en Lichess (pame17). No se edita a mano.
//
// El Elo con que juega el bot de la profe Pame en «Difícil» (js/chess-bot.js),
// como window.OSCAR_ELO_CALIB en js/oscar-book.js: la mediana de sus últimas
// 200 partidas con puntos de cada ritmo. El libro en sí está en
// data/pame-book.json y lo baja chess-bot.js cuando al bot le toca mover.

window.PAME_ELO_CALIB = ${JSON.stringify(calib, null, 2)};
`;
  fs.writeFileSync(path.join(RAIZ, "js", "pame-book.js"), estampar(js, "js/pame-book.js"));
  console.log(`${games.length} partidas de ajedrez normal (${rotas} cortadas por una jugada ilegal), ${Object.keys(libro).length} posiciones, `
    + `${gamesUsadas.length} partidas citadas. Elo: ${JSON.stringify(calib)}`);
}

main();

/*! rev bfb5bbb0d2d82f9f */
