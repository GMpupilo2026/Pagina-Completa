/* Una posición contada en palabras: "Rey blanco en e4; peones blancos en d3, e4".
 *
 * Vive acá y no dentro de un generador porque lo usan dos: el material de
 * estudio de los cursos (herramientas/curso-material.js) y el libro del
 * diagnóstico (herramientas/diagnostico-libro.js). Es lo único que hace que la
 * versión accesible de un cuadernillo sirva de algo — sin esto, quien usa lector
 * de pantalla llega a un diagrama y no hay nada que leer.
 *
 * Una segunda copia se iría separando de la primera a la primera corrección, que
 * es la misma razón por la que lib/tablero-svg.js está acá y no duplicado.
 */
const NOMBRE_PIEZA = { k: "rey", q: "dama", r: "torre", b: "alfil", n: "caballo", p: "peón" };
const ORDEN = ["k", "q", "r", "b", "n", "p"];

/* @returns { blancas, negras, turno } — cada lado ya escrito como texto corrido. */
function describir(fen) {
  const filas = fen.split(" ")[0].split("/");
  const blancas = {}, negras = {};
  filas.forEach((fila, r) => {
    let c = 0;
    for (const ch of fila) {
      if (/\d/.test(ch)) { c += +ch; continue; }
      const casilla = "abcdefgh"[c] + (8 - r);
      const donde = ch === ch.toUpperCase() ? blancas : negras;
      const tipo = ch.toLowerCase();
      (donde[tipo] = donde[tipo] || []).push(casilla);
      c += 1;
    }
  });
  const lado = (mapa) => ORDEN.filter((t) => mapa[t]).map((t) => {
    const cs = mapa[t].sort();
    const nombre = NOMBRE_PIEZA[t] + (cs.length > 1 ? (t === "p" ? "es" : "s") : "");
    return nombre + " en " + cs.join(", ");
  }).join("; ");
  const turno = fen.split(" ")[1] === "b" ? "Juegan las negras." : "Juegan las blancas.";
  return { blancas: lado(blancas), negras: lado(negras), turno };
}

module.exports = { describir, NOMBRE_PIEZA };
