/* ===== Las partidas del libro, en «Ganar con poco» (curso y libro) =====
 *
 * El curso y el libro «Ganar con poco» traen, en su capítulo 7, las dieciocho
 * partidas que el dueño eligió del libro *Ventajas microscópicas* de Héctor
 * Leyva Paneque (con su permiso): Andersson–Potkin, Petrosian–Botvinnik,
 * Capablanca–Yates… Lo que sale de ese libro son las JUGADAS (los hechos de la
 * partida); los comentarios son propios y los momentos clave los elige el
 * motor, no el libro.
 *
 *   - herramientas/datos/ganar-con-poco-partidas.pgn: las partidas, una por
 *     una, comprobadas con chess.js (la jugada 12 de Karpov–Krámnik no viene
 *     escrita en el texto, va en un diagrama: 12.Axe4 h6 es la ÚNICA pareja de
 *     jugadas que deja legal el resto de la partida, y así se completó).
 *   - herramientas/cursos/ganar-con-poco-partidas.json: lo escrito a mano de
 *     cada partida (título, tema, resumen, ideas, lo que deja, comentarios por
 *     jugada y la pregunta de cada momento clave).
 *
 * Con eso escribe:
 *   - el campo `partidas` de cursos/protegido/data/ganar-con-poco.json, que lee
 *     el visor de partidas (js/curso-partidas.js): cada jugada con su FEN y su
 *     comentario, y los momentos clave para adivinar la jugada;
 *   - material/ganar-con-poco/partidas.js, lo que usa el libro.
 *
 * Un momento clave solo vale si el motor lo confirma: la jugada de la partida
 * es la mejor a profundidad 16 y la segunda queda al menos
 * 50 centipeones (medio peón) peor. Si el JSON pide un momento que no cumple, no se
 * escribe nada (así no se le pide al alumno «encuentra la jugada» donde había
 * dos igual de buenas).
 *
 * Cómo se corre (Stockfish: apt install stockfish):
 *
 *   STOCKFISH=/usr/games/stockfish node herramientas/ganar-con-poco-partidas.js --analizar
 *   node herramientas/ganar-con-poco-partidas.js --candidatos 4   # los momentos que sirven en la partida 4
 *   node herramientas/ganar-con-poco-partidas.js                  # escribe los datos
 *
 * Va DESPUÉS de curso-posiciones.js, que reescribe el archivo de datos entero.
 * El análisis queda en herramientas/.cache-ganar-con-poco-partidas.json.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { Chess } = require("chess.js");

const RAIZ = path.join(__dirname, "..");
const PGN = path.join(__dirname, "datos", "ganar-con-poco-partidas.pgn");
const TEXTO = path.join(__dirname, "cursos", "ganar-con-poco-partidas.json");
const CACHE = path.join(__dirname, ".cache-ganar-con-poco-partidas.json");
const DATOS = path.join(RAIZ, "cursos", "protegido", "data", "ganar-con-poco.json");
const LIBRO = path.join(RAIZ, "material", "ganar-con-poco", "partidas.js");
const MOTOR = process.env.STOCKFISH || "/usr/games/stockfish";
const PROFUNDIDAD = 16;
const MARGEN = 50;

const ES = { K: "R", Q: "D", R: "T", B: "A", N: "C" };
const esSan = (san) => san.replace(/^([KQRBN])/, (m, p) => ES[p]).replace(/=([QRBN])/, (m, p) => "=" + ES[p]);

/* ---------- leer las partidas ---------- */
function leerPartidas() {
  const crudo = fs.readFileSync(PGN, "utf8").trim().split(/\n\s*\n(?=\[)/);
  return crudo.map((bloque, i) => {
    const g = new Chess();
    if (!g.load_pgn(bloque)) throw new Error(`La partida ${i + 1} del PGN no carga.`);
    const h = g.header();
    const jugadas = g.history({ verbose: true });
    const r = new Chess();
    const moves = jugadas.map((m, k) => {
      r.move(m);
      return {
        n: Math.floor(k / 2) + 1, color: m.color, san: m.san,
        uci: m.from + m.to + (m.promotion || ""), fen: r.fen(), nag: "", comentario: "", gap: false,
      };
    });
    return { n: i + 1, h, moves };
  });
}

/* ---------- el análisis ---------- */
async function analizar(partidas) {
  const { Motor } = require("./lib/motor-uci");
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE, "utf8")); } catch (e) {}
  const pendientes = [];
  partidas.forEach((p) => {
    let fen = new Chess().fen();
    p.moves.forEach((m, k) => {
      const clave = fen;
      if (!cache[clave]) pendientes.push(clave);
      fen = m.fen;
    });
  });
  const unicos = [...new Set(pendientes)];
  let hechos = 0;
  const motores = Array.from({ length: Math.max(1, os.cpus().length) }, () => new Motor(MOTOR));
  await Promise.all(motores.map(async (motor) => {
    while (unicos.length) {
      const fen = unicos.shift();
      const top = await motor.analizar(fen, 2, PROFUNDIDAD);
      cache[fen] = top.map((t) => ({ uci: t.uci, score: t.score }));
      if (++hechos % 50 === 0) {
        fs.writeFileSync(CACHE, JSON.stringify(cache));
        process.stderr.write(`${hechos}… `);
      }
    }
    motor.cerrar();
  }));
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  return cache;
}

function leerCache() {
  try { return JSON.parse(fs.readFileSync(CACHE, "utf8")); } catch (e) {
    throw new Error("Falta el análisis: corre primero con --analizar (hace falta Stockfish).");
  }
}

/* La evaluación desde las blancas, en centipeones (el mate cuenta como 100000). */
const desdeBlancas = (score, fen) => (fen.split(" ")[1] === "w" ? score : -score);

/* Lo que dice el motor de la jugada `k` (0 = la primera) de una partida. */
function juicio(p, k, cache) {
  const fen = k === 0 ? new Chess().fen() : p.moves[k - 1].fen;
  const top = cache[fen];
  if (!top || !top.length) return null;
  const jugada = p.moves[k];
  const mejor = top[0], segunda = top[1];
  return {
    ply: k + 1, fen, jugada,
    esLaMejor: mejor.uci === jugada.uci,
    margen: segunda ? mejor.score - segunda.score : Infinity,
    eval: desdeBlancas(mejor.score, fen),
    segunda: segunda ? segunda.uci : null,
  };
}

function valor(cp) {
  if (Math.abs(cp) >= 90000) return cp > 0 ? "mate para las blancas" : "mate para las negras";
  const v = (cp / 100).toFixed(1).replace(".", ",");
  return cp > 0 ? "+" + v : v;
}

/* El momento clave tiene que ser jugada del bando que gana, la mejor, y con
   margen sobre la segunda. */
function sirveDeClave(p, j) {
  const gana = p.h.Result === "1-0" ? "w" : p.h.Result === "0-1" ? "b" : null;
  return j && j.jugada.color === gana && j.esLaMejor && j.margen >= MARGEN;
}

/* ---------- escribir ---------- */
function escribir(partidas, cache) {
  const texto = JSON.parse(fs.readFileSync(TEXTO, "utf8"));
  const fallos = [];
  const salida = {};
  const libro = [];
  partidas.forEach((p) => {
    const t = texto.partidas.find((x) => x.n === p.n);
    if (!t) { fallos.push(`La partida ${p.n} no tiene su texto en ${path.basename(TEXTO)}.`); return; }
    const moves = p.moves.map((m) => Object.assign({}, m));
    Object.keys(t.comentarios || {}).forEach((ply) => {
      const m = moves[+ply - 1];
      if (!m) { fallos.push(`Partida ${p.n}: el comentario de la media jugada ${ply} no tiene jugada.`); return; }
      m.comentario = t.comentarios[ply];
    });
    const claves = (t.claves || []).map((c) => {
      const j = juicio(p, c.ply - 1, cache);
      if (!sirveDeClave(p, j)) {
        fallos.push(`Partida ${p.n}: la media jugada ${c.ply} (${j ? esSan(j.jugada.san) : "?"}) no es un momento clave: el motor no la confirma como la única buena.`);
        return null;
      }
      return {
        ply: c.ply, pregunta: c.pregunta, pista: c.pista,
        explicacion: `${c.explicacion} Stockfish 16 a profundidad ${PROFUNDIDAD}: ${esSan(j.jugada.san)} es la mejor (${valor(j.eval)}) y la segunda queda ${(j.margen / 100).toFixed(1).replace(".", ",")} peor.`,
        alternativas: [],
      };
    }).filter(Boolean);
    const id = `gp-p${p.n}`;
    salida[id] = {
      id, titulo: t.titulo, blancas: p.h.White, negras: p.h.Black, evento: t.evento,
      resultado: p.h.Result, tema: t.tema, start_fen: new Chess().fen(), orientacion: p.h.Result === "0-1" ? "b" : "w",
      moves, claves, resumen: t.resumen, ideas: t.ideas, lecciones: t.lecciones,
      teoria: "", apertura: p.h.Opening, apertura_nombre: p.h.Opening, explicacion: "", posiciones: [], quiz: [],
    };
    libro.push({
      n: p.n, id, titulo: t.titulo, tema: t.tema, blancas: p.h.White, negras: p.h.Black, evento: t.evento,
      resultado: p.h.Result, apertura: p.h.Opening, resumen: t.resumen, ideas: t.ideas, lecciones: t.lecciones,
      jugadas: moves.map((m) => m.san),
      comentarios: t.comentarios || {},
      claves: claves.map((c) => ({ ply: c.ply, fen: (c.ply === 1 ? new Chess().fen() : moves[c.ply - 2].fen),
        juegan: moves[c.ply - 1].color,
        jugada: `${moves[c.ply - 1].n}${moves[c.ply - 1].color === "w" ? "." : "…"}${esSan(moves[c.ply - 1].san)}`, pregunta: c.pregunta, explicacion: c.explicacion })),
    });
  });
  if (fallos.length) { fallos.forEach((f) => console.error("✗ " + f)); process.exit(1); }

  const datos = JSON.parse(fs.readFileSync(DATOS, "utf8"));
  datos.partidas = salida;
  fs.writeFileSync(DATOS, JSON.stringify(datos, null, 1) + "\n");

  fs.mkdirSync(path.dirname(LIBRO), { recursive: true });
  fs.writeFileSync(LIBRO, `/* ===== Las partidas del libro, en «Ganar con poco» =====
 *
 * GENERADO por herramientas/ganar-con-poco-partidas.js — no se edita a mano.
 * Las jugadas, del PGN comprobado con chess.js; los comentarios, propios; los
 * momentos clave, confirmados con Stockfish. Lo usa el libro
 * (herramientas/ganar-con-poco-pdf.js).
 */
window.GANAR_CON_POCO_PARTIDAS = ${JSON.stringify(libro, null, 1)};
`);
  console.log(`${partidas.length} partidas · ${Object.values(salida).reduce((s, p) => s + p.claves.length, 0)} momentos clave · ${Object.values(salida).reduce((s, p) => s + p.moves.filter((m) => m.comentario).length, 0)} jugadas comentadas`);
}

async function main() {
  const partidas = leerPartidas();
  if (process.argv.includes("--analizar")) {
    await analizar(partidas);
    console.log("Análisis listo.");
    return;
  }
  const cache = leerCache();
  const i = process.argv.indexOf("--candidatos");
  if (i >= 0) {
    const cuales = process.argv[i + 1] ? [+process.argv[i + 1]] : partidas.map((p) => p.n);
    cuales.forEach((n) => {
      const p = partidas[n - 1];
      console.log(`\n== ${n}. ${p.h.White} – ${p.h.Black} (${p.h.Result})`);
      const curva = [];
      p.moves.forEach((m, k) => {
        const j = juicio(p, k, cache);
        if (k % 10 === 9) curva.push(`${m.n}:${j ? valor(j.eval) : "?"}`);
        if (sirveDeClave(p, j)) console.log(`  ply ${k + 1}: ${m.n}${m.color === "w" ? "." : "…"}${esSan(m.san)}  ${valor(j.eval)}  margen ${(j.margen / 100).toFixed(1)}  (segunda ${j.segunda})`);
      });
      console.log("  curva: " + curva.join(" "));
    });
    return;
  }
  escribir(partidas, cache);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { leerPartidas, juicio, sirveDeClave, PROFUNDIDAD, MARGEN };
