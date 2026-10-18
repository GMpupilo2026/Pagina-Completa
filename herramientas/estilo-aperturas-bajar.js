/* ===== Partidas de torneos para medir el carácter de cada apertura =====
 *
 * Las partidas de maestros que ya estaban en el repositorio (las de «Una
 * clase al día» y los dos libros) no alcanzan para medir el carácter de las
 * aperturas más jugadas en los clubes: hay 7 italianas y ningún sistema
 * Londres. Este script baja partidas de torneos de ritmo clásico transmitidos
 * en Lichess (su API pública de transmisiones) y guarda, de cada una, solo lo
 * que se mide: las primeras 40 medias jugadas.
 *
 *   - Solo torneos ya terminados con ritmo clásico según FIDE
 *     (`info.fideTC === "standard"`): en una partida rápida la apertura se
 *     juega distinto, y lo que se recomienda es para partidas de verdad.
 *   - Solo partidas que empiezan desde la posición inicial y llegan a la
 *     jugada 12 (24 medias jugadas): antes no hay nada que medir.
 *   - Sin repetir: la misma partida transmitida en dos torneos (o en dos
 *     rondas por un error de la transmisión) cuenta una vez.
 *   - Las jugadas de una partida son hechos, y de cada una se guardan solo
 *     sus primeras jugadas: ningún nombre ni comentario.
 *   - En UCI («e2e4») y no en SAN: chess.js 0.10.3, para leer una jugada en
 *     SAN, escribe en SAN todas las legales de la posición, y volver a jugar
 *     las 9000 partidas en el CI tardaba 3 minutos; en UCI, menos de uno.
 *
 * La salida es herramientas/datos/estilo-aperturas-partidas.txt (una partida
 * por línea, las jugadas en UCI separadas por espacios). Se corre a mano cuando se
 * quiera sumar torneos; después, node herramientas/estilo-aperturas-medir.js.
 *
 *   node herramientas/estilo-aperturas-bajar.js [cuántas partidas, 20000]
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");

const SALIDA = path.join(__dirname, "datos/estilo-aperturas-partidas.txt");
const OBJETIVO = +process.argv[2] || 20000;
const PLIES = 40, MIN_PLIES = 24;
const INICIAL = new Chess().fen();
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function pedir(url, texto) {
  for (let intento = 0; intento < 5; intento++) {
    const r = await fetch(url, { headers: { Accept: texto ? "application/x-chess-pgn" : "application/json" } });
    if (r.status === 429) { await esperar(61000); continue; }   // lo que pide Lichess
    if (!r.ok) throw new Error(url + " → " + r.status);
    return texto ? r.text() : r.json();
  }
  throw new Error(url + " → demasiados 429");
}

/* Las jugadas de una partida PGN, con chess.js: solo las que se pueden jugar. */
function jugadasDe(pgn) {
  if (/\[(SetUp|FEN) /.test(pgn) && !/\[FEN "rnbqkbnr\/pppppppp\/8\/8\/8\/8\/PPPPPPPP\/RNBQKBNR w KQkq - 0 1"\]/.test(pgn)) return null;
  const cuerpo = pgn.replace(/\[[^\]]*\]\s*/g, "").replace(/\{[^}]*\}/g, " ").replace(/\([^()]*\)/g, " ")
    .replace(/\$\d+/g, " ").replace(/\d+\.(\.\.)?/g, " ").replace(/(1-0|0-1|1\/2-1\/2|\*)\s*$/, " ");
  const c = new Chess();
  const out = [];
  for (const t of cuerpo.split(/\s+/).filter(Boolean)) {
    if (out.length >= PLIES) break;
    const m = c.move(t.replace(/[!?]+$/, ""), { sloppy: true });
    if (!m) break;
    out.push(m.from + m.to + (m.promotion || ""));
  }
  return out.length >= MIN_PLIES ? out : null;
}

async function main() {
  const vistas = new Set();
  const lineas = [];
  if (fs.existsSync(SALIDA)) for (const l of fs.readFileSync(SALIDA, "utf8").split("\n").filter(Boolean)) { vistas.add(l); lineas.push(l); }
  const torneosVistos = new Set();
  for (let pagina = 1; lineas.length < OBJETIVO && pagina <= 200; pagina++) {
    const d = await pedir("https://lichess.org/api/broadcast/top?page=" + pagina);
    const lista = (d.past && d.past.currentPageResults) || [];
    if (!lista.length) break;
    for (const b of lista) {
      const t = b.tour || {};
      if (torneosVistos.has(t.id) || !t.info || t.info.fideTC !== "standard") continue;
      torneosVistos.add(t.id);
      let pgn;
      try { pgn = await pedir("https://lichess.org/api/broadcast/" + t.id + ".pgn", true); } catch (e) { console.error("  " + t.name + ": " + e.message); continue; }
      let nuevas = 0;
      for (const p of pgn.split(/\n\n(?=\[Event )/)) {
        const j = jugadasDe(p);
        if (!j) continue;
        const l = j.join(" ");
        if (vistas.has(l)) continue;
        vistas.add(l); lineas.push(l); nuevas++;
      }
      console.log(lineas.length + "  +" + nuevas + "  " + t.name);
      fs.writeFileSync(SALIDA, lineas.join("\n") + "\n");
      if (lineas.length >= OBJETIVO) break;
      await esperar(1000);
    }
    if (!d.past.nextPage) break;
  }
  console.log("Listo: " + lineas.length + " partidas en " + path.relative(path.join(__dirname, ".."), SALIDA));
}

main().catch((e) => { console.error(e); process.exit(1); });
