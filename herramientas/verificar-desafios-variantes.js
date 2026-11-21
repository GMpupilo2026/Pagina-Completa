/* Las variantes de Desafíos (solution.lineas de entreno/data/desafios.json),
 * sin navegador.
 *
 * Las genera herramientas/desafios-variantes.js con un buscador; acá no se
 * vuelven a buscar (tarda minutos), se comprueba lo que la página da por
 * cierto al jugarlas:
 *   · cada variante empieza por la jugada que la nombra, y esa jugada es una
 *     de las aceptadas (solution.moves): la página la elige por ella;
 *   · todas sus jugadas son legales, una tras otra, en js/mini-chess.js (el
 *     mismo motor sin reyes de la página): si una no pasa, el rival se queda
 *     mudo a mitad del desafío;
 *   · termina en una jugada del alumno, o en una del rival después de la cual
 *     el alumno ya no tiene nada que hacer (mate, ahogado, o la recaptura que
 *     cierra la idea con el material ya ganado);
 *   · ninguna pasa de 15 medias jugadas (el tope del generador).
 * Y que el generador siga existiendo, porque el JSON dice que lo escribe él.
 *
 *   node herramientas/verificar-desafios-variantes.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const MiniChess = require("../js/mini-chess.js");

const RAIZ = path.join(__dirname, "..");
const datos = JSON.parse(fs.readFileSync(path.join(RAIZ, "entreno", "data", "desafios.json"), "utf8"));
let fallos = 0, variantes = 0, largas = 0;
const mal = (t) => { fallos++; console.log("✗ " + t); };

if (!fs.existsSync(path.join(__dirname, "desafios-variantes.js"))) mal("falta herramientas/desafios-variantes.js, que escribe las variantes");

for (const ch of datos.challenges) {
  const lineas = ch.solution.lineas;
  if (!lineas) continue;
  for (const [primera, linea] of Object.entries(lineas)) {
    variantes++;
    const nombre = `#${ch.n} (${primera})`;
    if (!ch.solution.moves.includes(primera)) mal(`${nombre}: la variante no empieza por una jugada aceptada`);
    if (!Array.isArray(linea) || linea[0] !== primera) { mal(`${nombre}: la variante no empieza por su jugada`); continue; }
    if (linea.length < 2) mal(`${nombre}: una variante de una sola jugada no se guarda`);
    if (linea.length > 15) mal(`${nombre}: ${linea.length} medias jugadas, más que el tope de 15`);
    const g = new MiniChess(ch.fen);
    let ok = true;
    for (const u of linea) {
      const m = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || "q" });
      if (!m || g.uci(m) !== u) { mal(`${nombre}: ${u} no es legal en ${g.fen()}`); ok = false; break; }
    }
    if (!ok) continue;
    if (linea.length > 1) largas++;
    // Termina en jugada del rival (largo par): solo si es una recaptura y
    // después no queda nada (lo deja así el generador) o el alumno no puede mover.
    if (linea.length % 2 === 0) {
      const sinJugadas = !Object.keys(g.board).some((sq) => g.board[sq].color === g.turn() && g.legalMoves(sq).length);
      const ultima = linea[linea.length - 1], antes = linea[linea.length - 2];
      if (!sinJugadas && ultima.slice(2, 4) !== antes.slice(2, 4)) mal(`${nombre}: termina en una jugada del rival que no es una recaptura`);
    }
  }
}

console.log(`${variantes} variantes revisadas (${largas} de más de una jugada).`);
if (!largas) mal("ningún desafío tiene variante: ¿se borraron de desafios.json?");
console.log(fallos ? `\n${fallos} comprobaciones fallaron.` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);

/*! rev bfb5bbb0d2d82f9f */
