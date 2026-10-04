/* Comprueba js/planilla-ocr.js, la lectura de una planilla escrita a mano que
 * comparten el Lector de planilla y «Anota tu partida» de «Tus propios
 * errores». Sin navegador ni red: lo que devuelve Google Vision se arma acá.
 *
 *   - reconstructMoveTokens(): el orden real de las jugadas sale de dónde está
 *     cada palabra en la foto (por filas, de izquierda a derecha), no del orden
 *     en que llegaron; sin números de jugada ni resultado;
 *   - tryParseMove(): lo que escribe una persona en una planilla de acá (R es
 *     el rey, la torre es T, enroque con ceros, la captura sin «x»);
 *   - forceMatchLegalMove(): lo mal leído se cambia por la jugada LEGAL más
 *     parecida, comparada también en español («Ac9» es el alfil, no la dama);
 *   - leerTokens(): todo junto, con cuáles se adivinaron.
 *
 * Uso: node herramientas/verificar-planilla-ocr.js
 */
"use strict";
const { Chess } = require("chess.js");
const P = require("../js/planilla-ocr.js");

let fallos = 0, pruebas = 0;
function ok(nombre, cond, detalle) {
  pruebas++;
  if (cond) { console.log("  ✓ " + nombre); return; }
  fallos++;
  console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : ""));
}

// Una planilla: una fila por número de jugada, blancas y negras al lado.
function palabras(filas, desorden) {
  const w = [];
  filas.forEach((f, i) => f.forEach((t, j) => w.push({ text: t, bbox: { x0: j * 100, y0: i * 40 + (j % 2), x1: j * 100 + 60, y1: i * 40 + 25 } })));
  return desorden ? w.reverse() : w;
}

console.log("\n=== reconstructMoveTokens(): el orden de la planilla ===");
{
  const t = P.reconstructMoveTokens(palabras([["1.", "e4", "e5"], ["2.", "Cf3", "Cc6"], ["3)", "Ab5", "a6"], ["1-0"]], true));
  ok("por filas y de izquierda a derecha, aunque lleguen al revés", t.join(" ") === "e4 e5 Cf3 Cc6 Ab5 a6", t.join(" "));
  ok("vacío no da nada", P.reconstructMoveTokens([]).length === 0 && P.reconstructMoveTokens(null).length === 0);
}

console.log("\n=== tryParseMove(): la notación de una planilla ===");
{
  const g = new Chess();
  const leidas = ["e4", "e5", "Cf3", "Cc6", "Ab5", "Cf6", "0-0", "Ae7", "Te1", "a6", "Aa4", "d6", "c3", "0-0"].map((x) => { const m = P.tryParseMove(g, x); return m ? m.san : null; });
  ok("en español, con enroque de ceros", leidas.join(" ") === "e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Be7 Re1 a6 Ba4 d6 c3 O-O", leidas.join(" "));
  const r = new Chess("4k3/8/8/8/8/8/8/R3K3 w - - 0 1");
  ok("R es el rey, no la torre", (P.tryParseMove(r, "Rf1") || {}).piece === "k");
  const x = new Chess();
  ["e4", "d5"].forEach((m) => x.move(m));
  ok("la captura sin «x» («ed5») se entiende", (P.tryParseMove(x, "ed5") || {}).san === "exd5");
}

console.log("\n=== forceMatchLegalMove(): lo mal leído ===");
{
  const g = new Chess();
  ["e4", "e5", "Nf3", "Nc6"].forEach((m) => g.move(m));
  ok("«Ac9» es el alfil a c4 (comparado en español), no otra cosa", P.forceMatchLegalMove(g, "Ac9") === "Bc4", P.forceMatchLegalMove(g, "Ac9"));
  ok("sin texto, no se fuerza nada", P.forceMatchLegalMove(g, "  ") === null);
  ok("sanEnEspanol: K Q R B N → R D T A C, también al coronar", P.sanEnEspanol("Kf1") === "Rf1" && P.sanEnEspanol("Qxe4+") === "Dxe4+" && P.sanEnEspanol("exd8=Q#") === "exd8=D#" && P.sanEnEspanol("e4") === "e4");
}

console.log("\n=== leerTokens(): la partida entera ===");
{
  const r = P.leerTokens(Chess, ["e4", "e5", "Cf3", "Cc6", "Ac9", "Cd4", "Cxe5", "Dg5"]);
  ok("lee todo y anota cuál adivinó (la media jugada 4)", r.jugadas.join(" ") === "e4 e5 Nf3 Nc6 Bc4 Nd4 Nxe5 Qg5" && JSON.stringify(r.adivinadas) === "[4]", JSON.stringify(r));
  const limpio = P.leerTokens(Chess, ["d4", "d5", "c4"]);
  ok("si todo se leyó tal cual, no hay adivinadas", limpio.adivinadas.length === 0 && limpio.jugadas.length === 3);
  ok("sin nada que leer, sin jugadas", P.leerTokens(Chess, []).jugadas.length === 0);
}

console.log(fallos ? `\n✗ ${fallos} de ${pruebas} comprobaciones fallaron.` : `\n✓ Las ${pruebas} comprobaciones pasaron.`);
process.exit(fallos ? 1 : 0);
