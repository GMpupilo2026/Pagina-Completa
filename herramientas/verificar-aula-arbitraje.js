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
require(path.join(__dirname, "..", "js", "aula-arbitraje", "contenido-revistas.js")); // suma los números 2 en adelante a C
require(path.join(__dirname, "..", "js", "aula-arbitraje", "contenido-practica.js")); // y el Taller del árbitro
const fs = require("fs");
// Cuántas revistas hay: una carpeta noNN por número en herramientas/revistas-arbitraje.
const REVISTAS = fs.readdirSync(path.join(__dirname, "revistas-arbitraje")).filter((d) => /^no\d\d$/.test(d)).length;
const MP = require(path.join(__dirname, "lib", "mate-posible.js"));
const TT = require(path.join(__dirname, "..", "js", "aula-arbitraje", "torneo-texto.js"));
const AD = require(path.join(__dirname, "..", "js", "aula-arbitraje", "desempates.js"));
const NT = require(path.join(__dirname, "..", "js", "normas-titulo.js"));
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
igual("las colecciones son los " + REVISTAS + " números de la revista, en orden, y el taller", C.colecciones.map((c) => c.id), Array.from({ length: REVISTAS }, (_, i) => "revista-" + (i + 1)).concat(["taller"]));
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

console.log("\n=== Diagramas: posiciones legales y resultados probados ===");
const ES_A_EN = { R: "K", D: "Q", T: "R", A: "B", C: "N" };
const serieEn = (serie) => String(serie).replace(/\d+\.(\.\.)?/g, " ").split(/\s+/).filter(Boolean).map((x) => x.replace(/^[RDTAC]/, (c) => ES_A_EN[c]));
const conFen = C.preguntas.filter((p) => p.fen).map((p) => [p.ficha + ": " + p.texto.slice(0, 50), p]).concat(C.casos.filter((c) => c.fen).map((c) => ["caso " + c.id, c]));
igual("hay diagramas (preguntas y casos)", conFen.length >= 35, true);
const malos = [];
conFen.forEach(([n, x]) => {
    const l = MP.legal(x.fen);
    if (l) { malos.push(n + ": " + l); return; }
    if (x.mate) { const r = MP.comprobarSerie(x.fen, serieEn(x.mate.serie), x.mate.bando); if (!r.ok) malos.push(n + ": " + r.motivo); }
    if (x.sinMate) { const r = MP.sinMate(x.fen, x.sinMate); if (!r.probado) malos.push(n + ": no se pudo probar que no hay mate (" + r.motivo + ")"); }
});
igual("cada posición es legal, cada serie termina en mate y cada «sin mate» está probado", malos, []);
const sinEnganche = C.diagramas.preguntas.filter((d) => C.preguntas.filter((p) => p.ficha === d.ficha && p.texto.indexOf(d.texto) === 0).length !== 1).map((d) => d.texto)
    .concat(C.diagramas.casos.filter((d) => !C.casos.some((c) => c.id === d.caso)).map((d) => d.caso));
igual("cada diagrama agregado a una revista encuentra exactamente su pregunta o caso", sinEnganche, []);

console.log("\n=== Casos de repetición, con chess.js ===");
C.casos.filter((c) => c.secuencia).forEach((c) => {
    const a = R.analizar('[SetUp "1"]\n[FEN "' + c.secuencia.fen + '"]\n\n' + c.secuencia.jugadas);
    igual(c.id + ": la secuencia es legal y la triple repetición es la que dice el caso", a.error ? a.error : a.repeticiones.length > 0, c.secuencia.triple);
});

console.log("\n=== Casos de desempate (motor de Pareo Integral) ===");
C.casos.filter((c) => c.tipo === "desempate").forEach((c) => {
    const r = TT.leer(c.torneo.texto, { sistema: c.torneo.sistema, puntos: c.torneo.puntos });
    if (r.errores.length) { igual(c.id + ": la tabla se lee", r.errores, []); return; }
    igual(c.id + ": la tabla de vuelta a texto es la misma", TT.escribir(r.t, r.nombres).split("\n").map((l) => l.replace(/\s+/g, " ")), c.torneo.texto.split("\n").map((l) => l.trim().replace(/\s+/g, " ")));
    const g = AD.grupoEmpatado(r.t);
    const d = g && AD.desempatar(r.t, g.ids, c.bases);
    igual(c.id + ": hay empate y las bases lo rompen del todo", !!d && d.orden.every((p) => p.length === 1), true);
    igual(c.id + ": un suizo no usa Koya, ni un todos contra todos el Buchholz", c.bases.some((b) => (c.torneo.sistema === "todos" && /^(BH|FB|AOB)/.test(b)) || (c.torneo.sistema !== "todos" && b === "KS")), false);
});
{
    const c = C.casos.find((x) => x.id === "des-de-suizo");
    const r = TT.leer(c.torneo.texto, { sistema: "suizo" });
    const g = AD.grupoEmpatado(r.t);
    igual("DE en un suizo (art. 6.3): Gamboa queda solo arriba y los otros dos no se separan", AD.encuentroDirecto(r.t, g.ids).map((p) => p.map((id) => r.nombres[id]).sort().join("=")), ["Gamboa", "Alvarado=Jiménez"]);
}
igual("el lector de tablas avisa si dos jugadores no dicen lo mismo", TT.leer("A | 2000 | 2b1\nB | 1900 | 1n½").errores.length > 0, true);

console.log("\n=== Casos de normas (js/normas-titulo.js) ===");
C.casos.filter((c) => c.tipo === "norma").forEach((c) => {
    const partidas = c.rivales.map((l, i) => { const [nombre, titulo, fed, elo, res] = l.split("|"); const f = res === "+" || res === "-"; return { ronda: i + 1, puntos: res === "1" || res === "+" ? 1 : res === "½" ? 0.5 : 0, jugada: !f, rival: { nombre, titulo, fed, elo: Number(elo) || 0 } }; });
    const ev = NT.evaluar(Object.assign({}, c.jugador, { partidas }), { sistema: c.sistema, rondas: c.rivales.length });
    const real = {};
    Object.keys(c.esperado).forEach((t) => { const x = ev.titulos.find((y) => y.titulo === t); real[t] = x ? x.norma : "no se evalúa"; });
    igual(c.id + ": la norma sale como cuenta el caso", real, c.esperado);
    igual(c.id + ": los títulos que pide decidir se evalúan", c.titulos.every((t) => ev.titulos.some((y) => y.titulo === t)), true);
});

console.log("\n=== Las revistas: portada y PDF ===");
const raiz = path.join(__dirname, "..");
const faltan = [];
for (let n = 1; n <= REVISTAS; n++) {
    const nn = (n < 10 ? "0" : "") + n;
    if (!fs.existsSync(path.join(raiz, "descargas", "aula-arbitraje", "revista-" + nn + ".pdf"))) faltan.push("PDF " + nn);
    if (!fs.existsSync(path.join(raiz, "img", "aula-arbitraje", "portada-" + nn + ".jpg"))) faltan.push("portada " + nn);
}
igual("cada número tiene su PDF y su portada (herramientas/aula-portadas.js)", faltan, []);

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

console.log("\n=== Las ayudas de cálculo (js/aula-arbitraje/ayudas.js) ===");
const AY = require(path.join(__dirname, "..", "js", "aula-arbitraje", "ayudas.js"));
igual("la cuenta de un promedio, con paréntesis", AY.evaluar("(2188+2405+2444+2320+2135+2290+2354+2156+2171)/9").toFixed(4), "2273.6667");
igual("½ ¼ ¾, coma decimal, × ÷ y el signo menos tipográfico", ["9½ + 1,25", "2½", "3 × 4 ÷ 2", "10 − 2,5", "-3+5"].map((t) => AY.evaluar(t)), [10.75, 2.5, 6, 7.5, 2]);
igual("lo que no es una cuenta completa da null (sin eval: nada se ejecuta)", ["(1+2", "1/0", "abc", "", "2+", "alert(1)"].map((t) => AY.evaluar(t)), [null, null, null, null, null, null]);
igual("una lista de Elo se separa aunque la coma vaya pegada; 9,25 sigue siendo decimal", [AY.separarLista("2188,2405, 2444 2320;2135"), AY.separarLista("9,25 1,5")], [["2188", "2405", "2444", "2320", "2135"], ["9,25", "1,5"]]);
igual("el número se escribe con coma decimal", [AY.formato(2273.66667), AY.formato(2.5), AY.formato(2600)], ["2273,6667", "2,5", "2600"]);
igual("«2188» no es una cuenta; «2188+1» y «(2188)» sí", ["2188", "2188+1", "(2188)"].map((t) => AY.esCuenta(t)), [false, true, true]);
igual("cuentas con tiempos: h:mm:ss y m:ss a segundos, un número suelto son segundos, y de vuelta a h:mm:ss",
    ["1:12:40 - 0:05:00", "0:30 × 12", "1:10:00 × 9 ÷ 12", "1:30:00 + 40 × 30 - 0:36:00", "52:32 + 2:00"].map((t) => AY.formatoTiempo(AY.evaluarTiempo(t))), ["1:07:40", "0:06:00", "0:52:30", "1:14:00", "0:54:32"]);
igual("un campo de tiempo: la cuenta en milisegundos; un tiempo solo (sin cuenta) lo sigue leyendo leerTiempo", [AY.tiempoDeCuenta("0:52:32 + 2:00"), AY.tiempoDeCuenta("0:52:32"), AY.tiempoDeCuenta("0:01:00 - 0:05:00")], [3272000, null, null]);

console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron." : "\nTodo bien.");
process.exit(fallos ? 1 : 0);

/*! rev bfb5bbb0d2d82f9f */
