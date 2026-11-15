/* Aula de Arbitraje: el contenido y los cálculos, sin navegador.

   Comprueba js/aula-arbitraje/contenido.js con js/aula-arbitraje/ajuste.js y
   js/reclamos-tablas.js (chess.js):
   - cada pregunta y cada caso cuelgan de una ficha que existe, y «correcta»
     es una de sus opciones;
   - la solución óptima de cada caso con «calculo» sale del método
     proporcional (art. 7.1) con la sanción del art. 7.5.5, y las jugadas que
     quedan son las que dice «esperadoJugadas»;
   - cada ejercicio de repeticiones es legal y da lo que dice «esperado»: si
     hay triple repetición válida y cuántas veces aparece la misma «foto»;
   - el Koya de un cuadro conocido (el de la revista actualizada).
   Ver «Aula de Arbitraje» en docs/decisiones/juegos-y-torneos.md. */
"use strict";
const path = require("path");
const C = require(path.join(__dirname, "..", "js", "aula-arbitraje", "contenido.js"));
require(path.join(__dirname, "..", "js", "aula-arbitraje", "contenido-revistas.js")); // suma los números 2-18 a C
const A = require(path.join(__dirname, "..", "js", "aula-arbitraje", "ajuste.js"));
global.Chess = require("chess.js").Chess;
const R = require(path.join(__dirname, "..", "js", "reclamos-tablas.js"));

let fallos = 0;
function igual(nombre, real, esperado) {
    const ok = JSON.stringify(real) === JSON.stringify(esperado);
    if (!ok) fallos++;
    console.log((ok ? "  ok  " : "  MAL ") + nombre + (ok ? "" : "\n        esperado: " + JSON.stringify(esperado) + "\n        real:     " + JSON.stringify(real)));
}

console.log("\n=== Fichas, preguntas y casos ===");
const fichas = new Set(C.fichas.map((f) => f.id));
const colecciones = new Set(C.colecciones.map((c) => c.id));
igual("cada ficha está en una colección que existe", C.fichas.filter((f) => !colecciones.has(f.coleccion)).map((f) => f.id), []);
igual("cada pregunta es de una ficha que existe", C.preguntas.filter((p) => !fichas.has(p.ficha)).map((p) => p.texto), []);
igual("«correcta» es una de las opciones", C.preguntas.filter((p) => !(p.correcta >= 0 && p.correcta < p.opciones.length)).map((p) => p.texto), []);
igual("cada caso es de una ficha que existe", C.casos.filter((c) => !fichas.has(c.ficha)).map((c) => c.id), []);
igual("los ids de las fichas no se repiten", C.fichas.length, new Set(C.fichas.map((f) => f.id)).size);
igual("las colecciones son los 18 números de la revista, en orden", C.colecciones.map((c) => c.id), Array.from({ length: 18 }, (_, i) => "revista-" + (i + 1)));
igual("en cada caso con decisión, «correcta» es una de sus opciones", C.casos.filter((c) => c.decision && !(c.decision.correcta >= 0 && c.decision.correcta < c.decision.opciones.length)).map((c) => c.id), []);
igual("ningún contenido trae HTML activo (script, on…, iframe)", C.fichas.filter((f) => /<script|\son\w+\s*=|javascript:|<iframe/i.test(f.contenido)).map((f) => f.id), []);
igual("los ids de los casos no se repiten", C.casos.length, new Set(C.casos.map((c) => c.id)).size);
igual("cada caso con reloj trae al menos una solución óptima con tiempos que se leen",
    C.casos.filter((c) => c.ritmo && !(c.soluciones || []).some((s) => s.valor === "optima" && A.leerTiempo(s.w) != null && A.leerTiempo(s.b) != null)).map((c) => c.id), []);

console.log("\n=== La solución óptima de cada caso sale del método proporcional ===");
C.casos.filter((c) => c.calculo).forEach((c) => {
    const k = c.calculo;
    const q = A.jugadasQueQuedan(k.quien, k.jugada);
    const r = A.calcularAjuste({ p1: k.p1, pj: k.pj, p2: k.p2, inc: k.inc, w: A.leerTiempo(c.reloj.w), b: A.leerTiempo(c.reloj.b), nw: k.nw, nb: k.nb, lw: q.lw, lb: q.lb, sancion: { lado: k.quien === "w" ? "b" : "w", min: k.sancion } });
    const opt = c.soluciones.find((s) => s.valor === "optima");
    const hor = c.soluciones.find((s) => /horario/i.test(s.nombre));
    const cerca = (ms, min) => Math.abs(ms - min * 60000) <= 1000;
    igual(c.id + ": tiempos óptimos (±1 s)", [cerca(A.leerTiempo(opt.w), r.w.final), cerca(A.leerTiempo(opt.b), r.b.final)], [true, true]);
    if (hor) igual(c.id + ": variante de horario (±1 s)", [cerca(A.leerTiempo(hor.w), r.w.horario), cerca(A.leerTiempo(hor.b), r.b.horario)], [true, true]);
    igual(c.id + ": jugadas que quedan y turno", [q.lw, q.lb, k.quien], [c.esperadoJugadas.jw, c.esperadoJugadas.jb, c.esperadoJugadas.turno]);
});

console.log("\n=== Repeticiones, con chess.js ===");
C.repeticiones.forEach((e) => {
    const a = R.analizar('[SetUp "1"]\n[FEN "' + e.fen + '"]\n\n' + e.jugadas);
    if (a.error) { fallos++; console.log("  MAL " + e.id + ": " + a.error); return; }
    const jugadas = e.jugadas.replace(/\d+\.(\.\.)?/g, " ").split(/\s+/).filter(Boolean).length;
    const fotos = {};
    a.posiciones.forEach((p) => { const f = p.fen.split(" ")[0]; fotos[f] = (fotos[f] || 0) + 1; });
    igual(e.id + ": todas las jugadas son legales", a.posiciones.length - 1, jugadas);
    igual(e.id + ": triple repetición y veces de la foto más repetida", [a.repeticiones.length > 0, Math.max.apply(null, Object.values(fotos))], [e.esperado.triple, e.esperado.fotos]);
});

console.log("\n=== Koya ===");
// El cuadro de la revista actualizada (10 jugadores, ficticio y verificado).
const h = 0.5;
const M = [
    [null, 1, 1, h, h, 0, h, 0, 1, 1], [0, null, h, h, h, h, h, 1, 1, 1], [0, h, null, h, 1, 1, 0, h, h, 1],
    [h, h, h, null, 0, h, h, 1, 1, h], [h, h, 0, 1, null, 0, h, h, 1, 1], [1, h, 0, h, 1, null, h, h, 0, h],
    [h, h, 1, h, h, h, null, h, h, 0], [1, 0, h, 0, h, h, h, null, 0, 1], [0, 0, h, 0, 0, 1, h, 1, null, h],
    [0, 0, 0, h, 0, h, 1, 0, h, null],
];
igual("puntos", A.puntos(M), [5.5, 5.5, 5, 5, 5, 4.5, 4.5, 4, 3.5, 2.5]);
igual("KS con límite 4½", M.map((_, i) => A.koya(M, i)), [3.5, 2.5, 3, 2.5, 2.5, 3.5, 3.5, 3, 2, 2]);
igual("KS con límite 4", M.map((_, i) => A.koya(M, i, 4)), [3.5, 3.5, 3.5, 3.5, 3, 4, 4, 3, 3, 2]);
igual("tiempo y lectura de ida y vuelta", [A.tiempo(A.leerTiempo("1:40:07")), A.leerTiempo("52:32"), A.leerTiempo("abc")], ["1:40:07", 3152000, null]);

console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron." : "\nTodo bien.");
process.exit(fallos ? 1 : 0);

/*! rev bfb5bbb0d2d82f9f */
