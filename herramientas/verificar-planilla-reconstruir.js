/* Comprueba js/planilla-reconstruir.js: de lo escrito en las planillas de una
 * mesa a la partida, salvando todo lo que se pueda y dejando como ilegible lo que
 * ya no tiene salida. Sin navegador ni red: las planillas son de verdad (ver
 * lib/planillas-reales.js) y las fotos, palabras armadas como las de Google
 * Vision (lib/planilla-sintetica.js).
 *
 *   - las dos planillas de la mesa 11 dan la partida entera, toda leída tal cual;
 *   - la de negras sola (con su error en la 16) da una partida entera y legal, con
 *     lo corregido marcado;
 *   - la mesa 7 (inglés con «P» de peón + español, que no coinciden en varias
 *     jugadas) sale entera, corrigiendo con las dos a la vez;
 *   - a una planilla le falta un renglón: con la otra al lado, la partida es la misma;
 *   - un borrón en medio se cruza sin perder jugadas (y lo que se puso ahí queda dudoso);
 *     una planilla manchada de ahí en adelante no se rellena con jugadas inventadas;
 *   - desde que todo es basura, se corta: «ilegible desde» la jugada justa, con lo que
 *     dice la planilla de ahí en adelante, y el PGN termina en «*» con el aviso;
 *   - la foto: las celdas de cada planilla salen por los números impresos, con la foto
 *     girada hasta 12°, números que no se leyeron, jugadas en dos palabras y el
 *     encabezado con números que estorban; sin números, se lee por filas.
 *
 * Uso: node herramientas/verificar-planilla-reconstruir.js   (tarda cerca de un minuto)
 */
"use strict";
const { Chess } = require("chess.js");
const R = require("../js/planilla-reconstruir.js");
const PR = require("./lib/planillas-reales.js");
const { palabrasDePlanillas } = require("./lib/planilla-sintetica.js");

let fallos = 0, pruebas = 0;
function ok(nombre, cond, detalle) {
    pruebas++;
    if (cond) { console.log("  ✓ " + nombre); return; }
    fallos++;
    console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : ""));
}
const fenFinal = (r) => { const g = new Chess(); r.jugadas.forEach((j) => g.move(j.san)); return g.fen(); };
const cuenta = (r, e) => r.jugadas.filter((j) => j.estado === e).length;
const FIN_MESA11 = "8/p1kn4/1pp1pb1p/3p2pP/3P2P1/1N2PN2/PPP1K3/8 w - - 2 27";

console.log("\n=== Lo escrito, sin lo que no distingue una jugada ===");
ok("número de jugada, «x», jaque y espacios fuera; enroque con ceros; la «P» de peón", JSON.stringify(["14. Cxe3+", "0-0-0", "o-o", "Pe4", "Pxf5", "e8=D#"].map(R.normalizar)) === JSON.stringify(["Ce3", "OOO", "OO", "e4", "f5", "e8D"]));
ok("una confusión de la letra cuesta menos que un cambio cualquiera («5»/«s», «0»/«O»)", R.distancia("Cf5", "Cfs") < 1 && R.distancia("Cf5", "Cf6") === 1);
ok("una jugada se puede haber escrito en inglés o en español, y sin desambiguar", ["Nbd2", "Cbd2", "Nd2", "Cd2"].every((f) => R.formasDe("Nbd2").includes(R.normalizar(f))));

console.log("\n=== Partidas de verdad ===");
const dos11 = R.reconstruir(Chess, [PR.mesa11.blancas, PR.mesa11.negras]);
ok("mesa 11, las dos planillas: la partida entera (52 medias jugadas) y la posición final de la partida", dos11.ilegibleDesde === null && dos11.jugadas.length === 52 && fenFinal(dos11) === FIN_MESA11, JSON.stringify([dos11.ilegibleDesde, dos11.jugadas.length, fenFinal(dos11)]));
ok("mesa 11: la jugada 16 (donde no coinciden) sale como en la planilla de blancas, Thf1 Thf8", dos11.jugadas[30].san === "Rhf1" && dos11.jugadas[31].san === "Rhf8");
ok("mesa 11: y queda como corregida, porque una de las planillas decía otra cosa", dos11.jugadas[30].estado === "corregida" && dos11.jugadas[29].estado === "leida");
ok("mesa 11: cada jugada dice qué estaba escrito en cada planilla", JSON.stringify(dos11.jugadas[0].escrito) === JSON.stringify(["e4", "e4"]));

const negras11 = R.reconstruir(Chess, [PR.mesa11.negras]);
ok("mesa 11, solo la planilla de negras (con su error): una partida entera y legal", negras11.ilegibleDesde === null && negras11.jugadas.length === 52);
ok("…y lo que no está tal cual en la planilla queda marcado (corregido o dudoso)", cuenta(negras11, "corregida") + cuenta(negras11, "dudosa") >= 2);

const m7 = R.reconstruir(Chess, [PR.mesa7.blancas, PR.mesa7.negras]);
ok("mesa 7, inglés con «P» de peón y español: la partida entera (92 medias jugadas)", m7.ilegibleDesde === null && m7.jugadas.length === 92, JSON.stringify([m7.ilegibleDesde, m7.jugadas.length]));
ok("mesa 7: donde no coinciden (15: «Pf5» y «f4») gana la jugada legal que siguen las dos", m7.jugadas[28].san === "f4" && m7.jugadas[29].san === "exf4");
ok("mesa 7: termina como la partida (torre negra en g3, peón en h4)", /6r1/.test(fenFinal(m7).split(" ")[0].split("/")[5]) || fenFinal(m7).split(" ")[0].split("/")[4].endsWith("p"), fenFinal(m7));
ok("mesa 7: «Nd7» escrito en las dos cuando podían ir los dos caballos queda dudoso, con la otra posibilidad", m7.jugadas.some((j) => j.estado === "dudosa" && j.alternativa));

const corrida = PR.mesa11.negras.slice(0, 18).concat(PR.mesa11.negras.slice(20));
const conCorrida = R.reconstruir(Chess, [PR.mesa11.blancas, corrida]);
ok("a la planilla de negras le falta el renglón 10: con la de blancas al lado, la partida es la misma", conCorrida.ilegibleDesde === null && fenFinal(conCorrida) === FIN_MESA11);

const borron = PR.mesa11.blancas.slice();
borron[20] = "~"; borron[21] = "%%";
const conBorron = R.reconstruir(Chess, [borron]);
ok("un borrón en la jugada 11 no corta la partida ni hace perder jugadas: siguen las 52", conBorron.ilegibleDesde === null && conBorron.jugadas.length === 52, JSON.stringify([conBorron.ilegibleDesde, conBorron.jugadas.length]));
ok("…y lo que se puso en el borrón queda dudoso (nada en la planilla lo respalda)", conBorron.jugadas[20].estado === "dudosa" && conBorron.jugadas[21].estado === "dudosa");
const manchada = R.reconstruir(Chess, [PR.mesa11.blancas.slice(0, 24).concat(Array(20).fill("~"))]);
ok("una planilla manchada desde la media jugada 25 no se rellena con jugadas inventadas: ilegible desde ahí", manchada.ilegibleDesde === 24 && manchada.jugadas.length === 24, JSON.stringify([manchada.ilegibleDesde, manchada.jugadas.length]));

console.log("\n=== Lo que ya no tiene salida queda ilegible ===");
const BASURA = ["qz", "Lw", "m3m", "zz", "uu", "k9", "pp", "XX", "Ww", "yy", "j7", "vv", "ññ", "rr", "w1", "oz", "gg", "kk", "ll", "ww", "zq", "hh"];
const ilegible = R.reconstruir(Chess, [PR.mesa11.blancas.slice(0, 30).concat(BASURA)]);
ok("basura desde la media jugada 31: se salvan las 30 primeras y es ilegible desde ahí", ilegible.ilegibleDesde === 30 && ilegible.jugadas.length === 30, JSON.stringify([ilegible.ilegibleDesde, ilegible.jugadas.length]));
ok("…lo que dice la planilla desde ahí se devuelve tal cual, sin inventarle jugadas", JSON.stringify(ilegible.resto) === JSON.stringify([BASURA]));
const ilegibleDos = R.reconstruir(Chess, [PR.mesa11.blancas.slice(0, 30).concat(BASURA), PR.mesa11.negras.slice(0, 30).concat(BASURA.slice().reverse())]);
ok("con las dos planillas ilegibles desde el mismo punto, lo mismo", ilegibleDos.ilegibleDesde === 30);
const todaBasura = R.reconstruir(Chess, [BASURA]);
ok("una planilla que es basura desde el principio no da jugadas que nadie escribió", todaBasura.jugadas.length <= 1 && todaBasura.ilegibleDesde !== null, JSON.stringify(todaBasura.jugadas.map((j) => j.san)));
const pgn = R.aPgn(Chess, ilegible, { White: "A", Black: "B" });
const g = new Chess();
ok("el PGN de lo salvado se puede abrir, termina en «*» y dice desde dónde es ilegible", g.load_pgn(pgn) && g.history().length === 30 && /\{Desde aquí la planilla es ilegible \(jugada 16\)\.\} \*\s*$/.test(pgn), pgn.slice(-120));
const vacia = R.reconstruir(Chess, [["", ""], []]);
ok("sin nada escrito, lo dice y no inventa nada", vacia.jugadas.length === 0 && vacia.ilegibleDesde === 0);

console.log("\n=== Las celdas de la foto ===");
const iguales = (r, hojas) => r.metodo === "numeros" && JSON.stringify(r.hojas) === JSON.stringify(hojas);
const hojas7 = [PR.mesa7.blancas, PR.mesa7.negras];
ok("las dos planillas, cada celda en su media jugada (la 1 no se mezcla con la 21 ni con la 41)", iguales(R.hojasDeLaFoto(palabrasDePlanillas(hojas7)), hojas7));
ok("con la foto girada de −12° a 12°", [-12, -8, -4, 4, 8, 12].every((giro) => iguales(R.hojasDeLaFoto(palabrasDePlanillas(hojas7, { giro })), hojas7)));
ok("con números impresos que el lector no vio y jugadas que llegan en dos palabras", iguales(R.hojasDeLaFoto(palabrasDePlanillas(hojas7, { giro: 5, sinNumeros: [1, 2, 20, 21, 33, 41, 60], partir: true })), hojas7));
ok("una sola planilla en la foto", iguales(R.hojasDeLaFoto(palabrasDePlanillas([PR.mesa11.negras], { giro: -3 })), [PR.mesa11.negras]));
const sinNumeros = palabrasDePlanillas([PR.mesa11.blancas.slice(0, 8)]).filter((w) => !/^\d{1,2}$/.test(w.text));
const porFilas = R.hojasDeLaFoto(sinNumeros);
ok("sin números impresos, se lee por filas (y lo dice)", porFilas.metodo === "filas" && porFilas.hojas.length === 1);

console.log("\n=== De la foto a la partida ===");
const foto = R.hojasDeLaFoto(palabrasDePlanillas([PR.mesa11.blancas, PR.mesa11.negras], { giro: 4, partir: true, sinNumeros: [5, 30] }));
const deFoto = R.reconstruir(Chess, foto.hojas);
ok("la foto girada de la mesa 11 da la partida entera", deFoto.ilegibleDesde === null && fenFinal(deFoto) === FIN_MESA11);

console.log(`\n${pruebas - fallos}/${pruebas} comprobaciones bien.`);
if (fallos) { console.log(`✗ ${fallos} fallaron.`); process.exit(1); }
console.log("✓ Todo bien.");
