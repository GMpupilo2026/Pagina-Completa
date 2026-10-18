/* ===== Partidas de KingBase para las aperturas que no llegaban al mínimo =====
 *
 * Con las partidas del repositorio y las de torneos transmitidos en Lichess
 * (herramientas/estilo-aperturas-bajar.js) quedaban siete aperturas de
 * «Aperturas y celadas» sin medir —la holandesa, la Leningrado, el gambito
 * Evans, la Benoni moderna, la Stonewall, el gambito Budapest y la
 * Ponziani—: en los torneos de élite casi no se juegan, y no se recomienda lo
 * que no se midió. Este script las busca en KingBase 2017 (partidas de
 * jugadores de 2000 o más, ordenadas por código ECO), tal como está en la
 * colección pública `rozim/ChessData` de GitHub.
 *
 *   - Solo las aperturas que HOY no llegan al mínimo de su variante (las que
 *     herramientas/estilo-aperturas-medir.js deja sin medir o mide por su
 *     familia): las demás ya tienen sus partidas, y sumarle KingBase a todas
 *     cambiaría la medida de cada una sin necesidad.
 *   - Una partida entra si llega a la posición PROPIA de una de esas
 *     aperturas (la misma de la medición), también por transposición. Esa
 *     posición tiene k medias jugadas hechas, y se llega a ella en la media
 *     jugada k (con las mismas jugadas en otro orden): se mira solo ahí, así
 *     que de cada partida se juegan k medias jugadas, y las 40 de la que
 *     entra. Antes, sin chess.js —que en la versión 0.10.3 es lento para leer
 *     SAN—, se descartan las que no tienen las jugadas de esa posición entre
 *     sus primeras k. Mirando hasta la media jugada 30, como la medición, la
 *     primera corrida llevaba 45 minutos sin terminar (casi todas las
 *     partidas de D00-D29 tienen d4, e3 y d5 en algún momento). Llegar de
 *     nuevo con una pieza que va y vuelve también cuenta en la medición; acá
 *     se pierden esas pocas.
 *   - Hasta TOPE partidas por apertura, en el orden del archivo, y ninguna
 *     que ya esté (en este archivo o en el de torneos).
 *   - Como en el de torneos: de cada partida solo sus primeras 40 medias
 *     jugadas, en UCI, sin nombres ni comentarios; desde la posición inicial
 *     y con 24 medias jugadas o más.
 *
 * Cómo se corre (los archivos de KingBase se bajan aparte, son grandes):
 *
 *   git clone --depth 1 --filter=blob:none --no-checkout https://github.com/rozim/chessdata
 *   git -C chessdata checkout HEAD -- Kingbase/KingBase2017-A80-A99.pgn …
 *   node herramientas/estilo-aperturas-kingbase.js chessdata/Kingbase/*.pgn
 *   node herramientas/estilo-aperturas-medir.js
 *
 * Los archivos que hacen falta: A40-A79 (Benoni, Budapest), A80-A99 (holandesa
 * y Leningrado), C20-C59 (Evans, Ponziani) y D00-D29 (Stonewall).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");
const Medir = require("./estilo-aperturas-medir.js");

const SALIDA = path.join(__dirname, "datos/estilo-aperturas-kingbase.txt");
const TORNEOS = path.join(__dirname, "datos/estilo-aperturas-partidas.txt");
const TOPE = 300;
const PLIES = 40, MIN_PLIES = 24;
const INICIAL = new Chess().fen();

const limpiar = (san) => san.replace(/[+#!?]+$/, "");

/* Las jugadas de una partida en SAN, sin números ni comentarios. */
function sanes(pgn) {
  if (/\[(SetUp|FEN) /.test(pgn) && !/\[FEN "rnbqkbnr\/pppppppp\/8\/8\/8\/8\/PPPPPPPP\/RNBQKBNR w KQkq - 0 1"\]/.test(pgn)) return null;
  const cuerpo = pgn.replace(/\[[^\]]*\]\s*/g, "").replace(/\{[^}]*\}/g, " ").replace(/\([^()]*\)/g, " ")
    .replace(/\$\d+/g, " ").replace(/\d+\.(\.\.)?/g, " ").replace(/(1-0|0-1|1\/2-1\/2|\*)\s*$/, " ");
  return cuerpo.split(/\s+/).filter(Boolean).map(limpiar);
}

function main() {
  const archivos = process.argv.slice(2);
  if (!archivos.length) { console.error("Uso: node herramientas/estilo-aperturas-kingbase.js <archivos .pgn de KingBase>"); process.exit(2); }

  // Las que hoy no llegan: sin medir, o medidas por su familia.
  const medidas = new Map(Medir.medir().map((m) => [m.id, m]));
  const objetivos = Medir.propias().filter(({ linea }) => {
    const m = medidas.get(linea.id);
    return !m || !m.n || m.base !== "variante";
  }).map(({ linea, propia, pos }) => {
    const define = linea.jugadas.slice(0, propia + 1).map(limpiar);
    return { id: linea.id, pos, k: define.length, blancas: define.filter((_, i) => i % 2 === 0), negras: define.filter((_, i) => i % 2 === 1) };
  });
  if (!objetivos.length) { console.log("Todas las aperturas llegan al mínimo: no hace falta KingBase."); return; }
  console.log("Se buscan: " + objetivos.map((o) => o.id).join(", "));

  const vistas = new Set();
  const lineas = [];
  for (const f of [TORNEOS, SALIDA]) {
    if (fs.existsSync(f)) for (const l of fs.readFileSync(f, "utf8").split("\n").filter(Boolean)) vistas.add(l);
  }
  if (fs.existsSync(SALIDA)) lineas.push(...fs.readFileSync(SALIDA, "utf8").split("\n").filter(Boolean));
  const cuenta = Object.fromEntries(objetivos.map((o) => [o.id, 0]));
  const K = Math.max(...objetivos.map((o) => o.k));
  // Lo que ya había en el archivo cuenta para el tope.
  for (const l of lineas) {
    const c = new Chess();
    const enPly = [];
    for (const u of l.split(" ").slice(0, K)) { if (!c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })) break; enPly.push(Medir.clavePos(c.fen())); }
    for (const o of objetivos) if (enPly[o.k - 1] === o.pos) cuenta[o.id]++;
  }

  for (const archivo of archivos) {
    const texto = fs.readFileSync(archivo, "utf8");
    let nuevas = 0;
    for (const pgn of texto.split(/\n\n(?=\[Event )/)) {
      const s = sanes(pgn);
      if (!s || s.length < MIN_PLIES) continue;
      const posibles = objetivos.filter((o) => {
        if (cuenta[o.id] >= TOPE) return false;
        const b = new Set(s.slice(0, o.k).filter((_, i) => i % 2 === 0));
        const n = new Set(s.slice(0, o.k).filter((_, i) => i % 2 === 1));
        return o.blancas.every((x) => b.has(x)) && o.negras.every((x) => n.has(x));
      });
      if (!posibles.length) continue;
      // Primero, solo hasta la media jugada de la posición propia.
      const c = new Chess(INICIAL);
      const hasta = Math.max(...posibles.map((o) => o.k));
      const enPly = [];
      for (let i = 0; i < hasta; i++) {
        if (!c.move(s[i], { sloppy: true })) break;
        enPly.push(Medir.clavePos(c.fen()));
      }
      const llega = posibles.filter((o) => enPly[o.k - 1] === o.pos);
      if (!llega.length) continue;
      // La que entra, entera hasta la 40.
      const g = new Chess(INICIAL);
      const ucis = [];
      for (let i = 0; i < Math.min(PLIES, s.length); i++) {
        const m = g.move(s[i], { sloppy: true });
        if (!m) break;
        ucis.push(m.from + m.to + (m.promotion || ""));
      }
      if (ucis.length < MIN_PLIES) continue;
      const l = ucis.join(" ");
      if (vistas.has(l)) continue;
      vistas.add(l);
      lineas.push(l);
      llega.forEach((o) => cuenta[o.id]++);
      nuevas++;
    }
    console.log(path.basename(archivo) + ": +" + nuevas + "  " + JSON.stringify(cuenta));
    fs.writeFileSync(SALIDA, lineas.join("\n") + "\n");   // lo que va, por si se corta
  }
  fs.writeFileSync(SALIDA, lineas.join("\n") + "\n");
  console.log("Listo: " + lineas.length + " partidas en " + path.relative(path.join(__dirname, ".."), SALIDA)
    + ". Ahora: node herramientas/estilo-aperturas-medir.js");
}

main();
