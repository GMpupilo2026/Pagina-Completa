/* Comprueba el banco de la ficha de Memoria (entreno/data/memoria.json), sin
 * navegador:
 *   - hay posiciones para cada cantidad de piezas que ofrece la página (de
 *     `min` a `max`), y cada una tiene EXACTAMENTE esa cantidad;
 *   - cada posición es legal para chess.js y salió del banco de Lichess
 *     (entreno/data/temas.json): la del ejercicio o una de su solución. Una
 *     posición inventada o escrita a mano no pasa;
 *   - los ids no se repiten, ni la misma colocación de piezas dos veces;
 *   - el archivo es lo que arma hoy herramientas/memoria-generar.js (nadie lo
 *     editó a mano);
 *   - la corrección de la página (TiposReglas.compararFoto) da cero errores
 *     con la posición entera y cuenta bien lo que falta, sobra o cambió.
 *
 * Uso:  node herramientas/verificar-memoria.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");
const R = require("../js/tipos-reglas.js");
const { generar } = require("./memoria-generar.js");

const RAIZ = path.resolve(__dirname, "..");
const DATOS = JSON.parse(fs.readFileSync(path.join(RAIZ, "entreno/data/memoria.json"), "utf8"));
const TEMAS = JSON.parse(fs.readFileSync(path.join(RAIZ, "entreno/data/temas.json"), "utf8"));

let fallos = 0;
function ok(nombre, cond, detalle) {
  if (cond) { console.log("  ✓ " + nombre); return; }
  fallos += 1;
  console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : ""));
}

// Todas las posiciones reales del banco de Lichess: la de cada ejercicio y las de su solución.
const reales = new Set();
Object.values(TEMAS.puzzles).forEach((pz) => {
  const g = new Chess(pz.fen);
  reales.add(pz.fen);
  for (const s of pz.solution) { if (!g.move(s, { sloppy: true })) break; reales.add(g.fen()); }
});

console.log("\n=== El banco ===");
ok("ofrece de 3 a 32 piezas", DATOS.min === 3 && DATOS.max === 32, DATOS.min + "–" + DATOS.max);
const ids = new Set(), colocaciones = new Set();
const malas = [];
let total = 0;
for (let n = DATOS.min; n <= DATOS.max; n++) {
  const l = DATOS.porPiezas[n] || [];
  if (l.length < 10) malas.push(n + " piezas: solo " + l.length + " posiciones");
  l.forEach((x) => {
    total++;
    const colocacion = x.fen.split(" ")[0];
    const cuantas = colocacion.replace(/[^a-zA-Z]/g, "").length;
    if (cuantas !== n) malas.push(x.id + ": tiene " + cuantas + " piezas y está en " + n);
    if (!new Chess().validate_fen(x.fen).valid) malas.push(x.id + ": FEN no válida");
    if (!reales.has(x.fen)) malas.push(x.id + ": no es una posición del banco de Lichess");
    if (ids.has(x.id)) malas.push(x.id + ": id repetido");
    if (colocaciones.has(colocacion)) malas.push(x.id + ": la misma posición otra vez");
    ids.add(x.id); colocaciones.add(colocacion);
  });
}
ok(total + " posiciones: cada una con sus piezas, legal, real y sin repetir", !malas.length, malas.slice(0, 8).join("\n      "));
ok("memoria.json es lo que arma memoria-generar.js", JSON.stringify(generar()) === JSON.stringify(DATOS),
  "volver a correr: node herramientas/memoria-generar.js");

console.log("\n=== La corrección ===");
{
  const x = DATOS.porPiezas[8][0];
  const entero = {};
  R.tablero(x.fen).forEach((p, i) => { if (p) entero[R.sq(i)] = p.c + p.t; });
  const r = R.compararFoto(x.fen, entero);
  ok("la posición entera: 8 de 8 y cero errores", r.aciertos === 8 && r.total === 8 && r.errores === 0, JSON.stringify(r));
  ok("perfecta son tres estrellas", R.estrellasFoto(r.errores, r.total) === 3);
  const casi = Object.assign({}, entero);
  const [s1, s2] = Object.keys(casi);
  delete casi[s1];
  casi[s2] = casi[s2] === "wq" ? "wr" : "wq";
  const libre = ["a1", "h8", "d4", "e5", "a8", "h1"].find((s) => !entero[s]);
  casi[libre] = "bn";
  const r2 = R.compararFoto(x.fen, casi);
  ok("una que falta, una cambiada y una de más", r2.faltan.join() === s1 && r2.cambiadas.join() === s2 && r2.sobran.join() === libre && r2.errores === 3, JSON.stringify(r2));
}

console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron." : "\n✓ Todo bien.");
process.exit(fallos ? 1 : 0);
