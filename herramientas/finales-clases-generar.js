/* ===== Las posiciones de las clases, en «Finales contra la máquina» =====
 *
 * Arma entreno/data/finales-clases.json: las posiciones que el profe ARMÓ en
 * las clases de ADAES (finales y medio juego; no las partidas completas), para
 * que el alumno las juegue contra Stockfish desde su casa en entreno/finales.html
 * (?banco=clases), y para mandarlas de tarea una por una.
 *
 * La fuente es herramientas/datos/posiciones-clases/<fecha>.json, sacada de las
 * transcripciones de las clases (ver «Las posiciones de las clases, para
 * practicarlas contra el motor» en docs/decisiones/accesibilidad.md). Como la
 * posición sale de lo que Whisper oyó, no se cree a ciegas:
 *   - chess.js: la FEN carga, hay un rey por bando y el que no juega no está
 *     en jaque (con eso Stockfish se cuelga sin avisar).
 *   - Stockfish, a profundidad PROFUNDIDAD y desde el lado que juega (que es
 *     el alumno: en estas posiciones empieza siempre él): «ganar» tiene que
 *     dar mate o +1,5 como mínimo; «tablas», 1 o menos en valor absoluto.
 *     Son umbrales más bajos que los de los finales de libro (+4 y 0,5,
 *     herramientas/finales-generar.js) a propósito: son las posiciones como el
 *     profe las enseñó, no las elegidas para el banco. La evaluación queda
 *     escrita en el banco (`motor`) y verificar-finales.js la vuelve a exigir.
 *   - Las de «jugar» (medio juego sin un resultado que comprobar) no entran:
 *     la página juzga solo ganar o salvar. Quedan en el PGN de Archivos.
 *
 * Cómo se corre (Stockfish instalado):  node herramientas/finales-clases-generar.js
 * entreno/data/finales-clases.json NO se edita a mano.
 * Después: node herramientas/verificar-todo.js finales finales-pagina; y
 * python3 herramientas/metas-indice.py (los recortes de Tareas).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");
const { Motor } = require("./lib/motor-uci");

const RAIZ = path.join(__dirname, "..");
const FUENTE = path.join(__dirname, "datos", "posiciones-clases");
const SALIDA = path.join(RAIZ, "entreno/data/finales-clases.json");
const PROFUNDIDAD = 22;
const GANA_DESDE = 150;
const TABLAS_HASTA = 100;
const AGUANTAR = 25;

function limpio(t) { return String(t || "").replace(/\s+/g, " ").trim(); }

(async () => {
  const motor = new Motor();
  const finales = [];
  let fallas = 0;
  for (const archivo of fs.readdirSync(FUENTE).filter((f) => f.endsWith(".json")).sort()) {
    const obj = JSON.parse(fs.readFileSync(path.join(FUENTE, archivo), "utf8"));
    const [, mm, dd] = obj.fecha.split("-");
    let n = 0;
    for (const p of obj.posiciones || []) {
      if (p.objetivo !== "ganar" && p.objetivo !== "tablas") continue;
      n += 1;
      const id = "clase-" + mm + dd + "-" + n;
      const g = new Chess();
      const tablero = String(p.fen || "").split(" ")[0];
      const otro = new Chess(String(p.fen).replace(/ [wb] /, (m) => (m === " w " ? " b " : " w ")).replace(/ [a-h][36] /, " - "));
      if (!g.load(p.fen) || (tablero.match(/K/g) || []).length !== 1 || (tablero.match(/k/g) || []).length !== 1 || otro.in_check() || g.game_over()) {
        console.error("✗ " + id + ": la posición no vale");
        fallas += 1;
        continue;
      }
      const [a] = await motor.analizar(p.fen, 1, PROFUNDIDAD);
      const cp = a ? a.score : null;
      const ok = cp != null && (p.objetivo === "ganar" ? cp >= GANA_DESDE : Math.abs(cp) <= TABLAS_HASTA);
      if (!ok) { console.error("✗ " + id + " «" + p.titulo + "»: " + p.objetivo + " y el motor da " + cp); fallas += 1; continue; }
      const motorDijo = a.mate != null ? { mate: a.mate } : { cp };
      finales.push({
        id, titulo: dd + "/" + mm + " · " + limpio(p.titulo), meta: p.objetivo, alumno: g.turn(), fen: g.fen(),
        idea: limpio(p.nota) || null, pista: null, motor: motorDijo, clase: { fecha: obj.fecha, seg: p.seg != null ? Math.floor(+p.seg) : null },
      });
      console.error("✓ " + id + " «" + p.titulo + "»: " + p.objetivo + " (" + JSON.stringify(motorDijo) + ")");
    }
  }
  motor.cerrar();
  if (fallas) { console.error("\n" + fallas + " posición(es) no pasan: no se escribe el banco."); process.exit(1); }
  fs.writeFileSync(SALIDA, JSON.stringify({ aguantar: AGUANTAR, profundidad: PROFUNDIDAD, ganaDesde: GANA_DESDE, tablasHasta: TABLAS_HASTA, finales }, null, 1) + "\n");
  console.error(path.relative(RAIZ, SALIDA) + ": " + finales.length + " posiciones.");
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
