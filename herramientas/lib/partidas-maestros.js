/* Las partidas de maestros que ya están en el repositorio, leídas una sola
 * vez para todo lo que las usa: las casi 2000 de «Una clase al día», las 33
 * de «Cambiar o no cambiar» y las 18 de «Ganar con poco».
 *
 * Las usan el banco de la prueba de estilo (herramientas/estilo-generar.js)
 * y el carácter de cada apertura (herramientas/estilo-aperturas-medir.js),
 * y sus verificadores. Las jugadas de una partida son hechos; ningún
 * comentario de los cursos sale de acá.
 *
 * La misma partida está en varias lecciones de «Una clase al día» con otro
 * id: se queda la primera (contadas dos veces, pesarían doble).
 *
 *   leer(Chess) → [{ fuente, id, blancas, negras, evento, inicial, sans, vetadas }]
 *     `vetadas`: las medias jugadas que el curso pregunta o dibuja, con dos de
 *     margen (una posición de ahí la reconocería quien hizo el curso).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const RAIZ = path.join(__dirname, "..", "..");
const DATOS = path.join(RAIZ, "herramientas", "datos");
const huella = (s) => crypto.createHash("md5").update(s).digest("hex");

function leer(Chess) {
  const out = [];
  const dir = path.join(RAIZ, "cursos/protegido/data/una-clase-al-dia");
  for (const f of fs.readdirSync(dir).sort()) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const p of Object.values(d.partidas || {})) {
      if (p.fragmento || !p.moves || p.moves.some((m) => m.gap)) continue;
      const vetadas = new Set();
      for (const x of [...(p.diagramas || []), ...(p.claves || []).map((k) => k.ply)])
        for (let k = x - 2; k <= x + 2; k++) vetadas.add(k);
      out.push({
        fuente: "una-clase-al-dia", id: p.id, blancas: p.blancas, negras: p.negras, evento: p.evento,
        inicial: p.start_fen, sans: p.moves.map((m) => m.san), vetadas,
      });
    }
  }
  const cnc = JSON.parse(fs.readFileSync(path.join(DATOS, "cambiar-o-no-cambiar-partidas.json"), "utf8"));
  for (const p of cnc.partidas) {
    out.push({
      fuente: "cambiar-o-no-cambiar", id: p.id, blancas: p.blancas, negras: p.negras,
      evento: [p.lugar, p.anio].filter(Boolean).join(", "),
      inicial: p.fen_inicial || new Chess().fen(), sans: p.jugadas, vetadas: new Set(),
    });
  }
  const pgn = fs.readFileSync(path.join(DATOS, "ganar-con-poco-partidas.pgn"), "utf8");
  pgn.split(/\n(?=\[Event )/).forEach((txt, i) => {
    const c = new Chess();
    if (!c.load_pgn(txt)) return;
    const tag = (t) => ((new RegExp("\\[" + t + ' "([^"]*)"').exec(txt) || [])[1] || "");
    const sans = c.history();
    out.push({
      fuente: "ganar-con-poco", id: "gcp-" + (i + 1), blancas: tag("White"), negras: tag("Black"),
      evento: [tag("Event"), tag("Date").slice(0, 4)].filter(Boolean).join(", "),
      inicial: tag("FEN") || new Chess().fen(), sans, vetadas: new Set(),
    });
  });
  /* La misma partida está en más de una lección: se queda la primera. */
  const vistas = new Set();
  return out.filter((p) => {
    const k = huella(p.inicial + " " + p.sans.slice(0, 40).join(" "));
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
}

module.exports = { leer, huella };
