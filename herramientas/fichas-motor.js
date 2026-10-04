/* Comprueba con Stockfish lo que PROMETE cada ficha de estudio (el campo
 * `promete` de js/fichas-estudio.js): "mate", "gana" o "tablas".
 *
 * Una ficha que dice «esto es tablas» o «el blanco gana» y no lo es enseña
 * mal, y en pantalla se ve igual de bien. chess.js comprueba que la posición
 * sea legal y que la línea exista (herramientas/verificar-fichas.js, en cada
 * CI); el resultado lo tiene que decir un motor. Así se armaron las posiciones
 * de táctica y de finales que no salen de Lichess.
 *
 * NO se llama verificar-*.js a propósito: el CI no tiene Stockfish, y un
 * verificador que no puede correr falla siempre. Se corre a mano al agregar o
 * cambiar una ficha que trae `promete`:
 *
 *     apt install stockfish            (o STOCKFISH=/ruta/al/binario)
 *     node herramientas/fichas-motor.js
 *     node herramientas/fichas-motor.js molino lucena     (solo esas)
 *
 * Qué se le pide a cada promesa, siempre desde el bando que mueve en la
 * posición de la ficha:
 *   mate    el motor encuentra mate, y la línea de la ficha llega al mate en
 *           a lo sumo las mismas jugadas que él;
 *   gana    la evaluación es de al menos +3 (o mate), y sigue siéndolo
 *           después de la primera jugada de la línea (la jugada de la ficha
 *           no tira la ventaja, aunque el motor prefiera otra);
 *   tablas  la evaluación está entre −0,5 y +0,5, y la línea no se la regala
 *           a nadie.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Motor } = require("./lib/motor-uci.js");
const { FICHAS } = require(path.join(__dirname, "..", "js", "fichas-estudio.js"));
const { LINEAS } = require(path.join(__dirname, "..", "js", "aperturas-lineas.js"));
const CJS = require("chess.js");
const Chess = CJS.Chess || CJS;

const PROF = +process.env.PROF || 20;
const GANA = 300, TABLAS = 50;
const ruta = process.env.STOCKFISH || "/usr/games/stockfish";
if (!fs.existsSync(ruta)) {
  console.error(`No está Stockfish en ${ruta}. Instálalo (apt install stockfish) o indica STOCKFISH=/ruta.`);
  process.exit(2);
}

const PorId = new Map(LINEAS.map((L) => [L.id, L]));
function posicion(F) {
  const g = new Chess();
  if (F.fen) g.load(F.fen);
  else (F.jugadas || PorId.get(F.lineaId).jugadas).forEach((san) => g.move(san, { sloppy: true }));
  return { fen: g.fen(), linea: F.fen ? (F.linea || []) : [] };
}
const texto = (r) => (r.mate !== null ? "mate en " + Math.abs(r.mate) + (r.mate < 0 ? " en contra" : "") : (r.score / 100).toFixed(2));

(async () => {
  const pedidas = process.argv.slice(2);
  const lista = FICHAS.filter((F) => F.promete && (!pedidas.length || pedidas.includes(F.id)));
  const m = new Motor(ruta);
  let fallos = 0;
  for (const F of lista) {
    const { fen, linea } = posicion(F);
    const [r] = await m.analizar(fen, 1, PROF);
    let problema = null;
    if (F.promete === "mate") {
      if (r.mate === null || r.mate < 0) problema = `el motor no ve mate (${texto(r)})`;
      else if (linea.length && Math.ceil(linea.length / 2) > r.mate) problema = `la línea da mate en ${Math.ceil(linea.length / 2)} y el motor lo da en ${r.mate}: la línea no es forzada`;
    } else if (F.promete === "gana") {
      if (!(r.mate > 0 || r.score >= GANA)) problema = `el motor no ve que gane (${texto(r)})`;
      else if (linea.length) {
        const g = new Chess(fen);
        g.move(linea[0], { sloppy: true });
        const [d] = await m.analizar(g.fen(), 1, PROF);   // ahora mueve el rival: tiene que estar perdido
        if (!(d.mate < 0 || (d.mate === null && d.score <= -GANA))) problema = `después de ${linea[0]} ya no gana (${texto(d)} para el rival)`;
      }
    } else if (F.promete === "tablas") {
      if (r.mate !== null || Math.abs(r.score) > TABLAS) problema = `el motor no ve tablas (${texto(r)})`;
      else if (linea.length) {
        const g = new Chess(fen);
        linea.forEach((san) => g.move(san, { sloppy: true }));
        if (!g.game_over()) {
          const [d] = await m.analizar(g.fen(), 1, PROF);
          if (d.mate !== null || Math.abs(d.score) > TABLAS) problema = `al terminar la línea ya no son tablas (${texto(d)})`;
        }
      }
    }
    if (problema) { fallos += 1; console.log(`  ✗ [${F.id}] promete ${F.promete}: ${problema}`); }
    else console.log(`  ✓ [${F.id}] ${F.promete} (${texto(r)})`);
  }
  m.cerrar();
  console.log(fallos ? `\n✗ ${fallos} problema(s).` : `\n✓ ${lista.length === 1 ? "La promesa, confirmada" : "Las " + lista.length + " promesas, confirmadas"} por Stockfish (profundidad ${PROF}).`);
  process.exit(fallos ? 1 : 0);
})();
