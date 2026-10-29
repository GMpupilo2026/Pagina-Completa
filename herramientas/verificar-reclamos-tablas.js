/* js/reclamos-tablas.js, el cálculo de «Reclamos de tablas desde el PGN»,
   sin navegador. Lo que comprueba, con partidas armadas para cada regla:

   - la triple repetición (art. 9.2): en qué jugada, en cuáles apareció antes
     y quién podía reclamar;
   - «la misma posición» del 9.2.2: la captura al paso cuenta solo si se puede
     hacer (chess.js marca la casilla aunque nadie pueda capturar), pero si se
     puede, la posición es otra; y los enroques perdidos también la cambian;
   - las 50 jugadas (art. 9.3), por una jugada de diferencia;
   - las tablas sin reclamo del 9.6: cinco veces y 75 jugadas;
   - «¿Procedía el reclamo?» en la jugada justa, la de antes y la de después;
   - el PGN en algebraica española, varias partidas en un archivo y uno que no
     se puede leer.

   Ver «Reclamos de tablas desde el PGN» en docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-reclamos-tablas.js                        */
"use strict";
const R = require("../js/reclamos-tablas.js");
const { Chess } = require("chess.js");

let fallos = 0;
function igual(nombre, hallado, esperado) {
    const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
    if (a === b) console.log("  ✓ " + nombre);
    else { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
}
const rep = (a) => a.repeticiones.map((r) => r.jugada.rotulo + " " + r.jugada.san);

console.log("\n=== Triple repetición (art. 9.2) ===");
let a = R.analizar("1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8");
igual("la posición de salida, por tercera vez con 4… Ng8", rep(a), ["4… Ng8"]);
igual("apareció al empezar, después de 2… Ng8 y de 4… Ng8",
    a.repeticiones[0].apariciones.map((x) => x.ply === 0 ? "al empezar" : x.rotulo + " " + x.san), ["al empezar", "2… Ng8", "4… Ng8"]);
igual("podían reclamar las negras (antes de jugarla) y las blancas (en su turno)",
    a.repeticiones[0].podian.map((p) => p.color), ["b", "w"]);
igual("una partida sin repetir no marca nada", rep(R.analizar("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6")), []);

console.log("\n=== «La misma posición» (art. 9.2.2) ===");
// Tras 1. e4, chess.js deja la casilla e3 de captura al paso aunque nadie pueda capturar.
a = R.analizar("1. e4 Nf6 2. Nf3 Ng8 3. Ng1 Nf6 4. Nf3 Ng8 5. Ng1");
igual("una captura al paso que nadie puede hacer no cambia la posición: tercera vez con 5. Ng1", rep(a), ["5. Ng1"]);
{
    // Contada con el FEN tal cual (la casilla e3 incluida), salían solo dos.
    const j = new Chess(); const vistas = {};
    ["e4", "Nf6", "Nf3", "Ng8", "Ng1", "Nf6", "Nf3", "Ng8", "Ng1"].forEach((m) => { j.move(m); const k = j.fen().split(" ").slice(0, 4).join(" "); vistas[k] = (vistas[k] || 0) + 1; });
    igual("(con el FEN crudo de chess.js no llegaba a tres: por eso se normaliza)", Math.max(...Object.values(vistas)), 2);
}
// Tras 2… d5 las blancas SÍ pueden capturar al paso (exd6): esa posición es otra.
a = R.analizar("1. e4 Nf6 2. e5 d5 3. Nf3 Nc6 4. Ng1 Nb8 5. Nf3 Nc6 6. Ng1 Nb8");
igual("si la captura al paso se puede hacer, la posición es distinta: ninguna llega a tres", rep(a), []);
// Las torres van y vuelven: el tablero es el de salida, pero ya sin enroque corto.
a = R.analizar("1. Nf3 Nf6 2. Rg1 Rg8 3. Rh1 Rh8 4. Ng1 Ng8 5. Nf3 Nf6 6. Ng1 Ng8 7. Nf3 Nf6 8. Ng1 Ng8");
{
    const r = a.repeticiones.find((x) => x.jugada.rotulo === "8…");
    igual("sin los enroques no es la posición de salida: la de 8… Ng8 cuenta 4…, 6… y 8…, nunca «al empezar»",
        [r && r.apariciones.map((x) => x.ply === 0 ? "al empezar" : x.rotulo), a.repeticiones.some((x) => x.apariciones.some((y) => y.ply === 0))],
        [["4…", "6…", "8…"], false]);
}

console.log("\n=== 50 jugadas (art. 9.3) ===");
const final50 = '[SetUp "1"]\n[FEN "8/8/8/4k3/8/8/8/R3K3 w - - 96 60"]\n\n60. Ra2 Kd5 61. Ra1 Ke5 62. Ra2';
a = R.analizar(final50);
igual("se completan con 61… Ke5", a.cincuenta && a.cincuenta.jugada.rotulo + " " + a.cincuenta.jugada.san, "61… Ke5");
igual("una partida con peones que avanzan no llega", R.analizar("1. e4 e5 2. Nf3 Nc6").cincuenta, null);
igual("lo más largo sin peón ni captura, en una partida corta", R.analizar("1. e4 e5 2. Nf3 Nc6 3. Ng1 Nb8").rachaMax.jugadas, 2);

console.log("\n=== Tablas sin reclamo (art. 9.6) ===");
a = R.analizar("1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 5. Nf3 Nf6 6. Ng1 Ng8 7. Nf3 Nf6 8. Ng1 Ng8");
igual("la misma posición cinco veces: con 8… Ng8", a.cincoVeces && a.cincoVeces.jugada.rotulo, "8…");
igual("con cuatro todavía no", R.analizar("1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 5. Nf3 Nf6 6. Ng1 Ng8").cincoVeces, null);
a = R.analizar('[SetUp "1"]\n[FEN "8/8/8/4k3/8/8/8/R3K3 w - - 147 90"]\n\n90. Ra2 Kd5 91. Ra1');
igual("75 jugadas de cada uno: con 91… (la 150.ª a medias)", a.setentaYCinco && a.setentaYCinco.jugada.rotulo, "91.");
igual("con 74 y media todavía no", R.analizar('[SetUp "1"]\n[FEN "8/8/8/4k3/8/8/8/R3K3 w - - 147 90"]\n\n90. Ra2 Kd5').setentaYCinco, null);
// La 150.ª da mate: el 9.6.2 dice que entonces vale el mate.
a = R.analizar('[SetUp "1"]\n[FEN "k7/8/1K6/8/8/8/8/7R w - - 149 100"]\n\n100. Rh8#');
igual("si la jugada que completa las 75 da mate, no son tablas", a.setentaYCinco, null);

console.log("\n=== ¿Procedía el reclamo? ===");
a = R.analizar("1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8");
const v = (t, n, c) => { const r = R.revisarReclamo(a, t, n, c); return [r.procede, (r.motivo.match(/art\. [\d.]+/) || [""])[0]]; };
igual("las negras en la 4, anotando 4… Ng8: sí (9.2.1.1)", v("repeticion", 4, "b"), [true, "art. 9.2.1.1"]);
igual("las blancas en la 5, apenas apareció: sí (9.2.1.2)", v("repeticion", 5, "w"), [true, "art. 9.2.1.2"]);
igual("las blancas en la 4: todavía no (dos veces)", v("repeticion", 4, "w"), [false, "art. 9.2"]);
igual("una jugada que la partida no tiene se dice", R.revisarReclamo(a, "repeticion", 40, "w").procede, false);
a = R.analizar(final50);
igual("50 jugadas: las negras en la 61, anotando 61… Ke5: sí (9.3.1)", v("cincuenta", 61, "b"), [true, "art. 9.3.1"]);
igual("50 jugadas: las blancas en la 62, ya completas: sí (9.3.2)", v("cincuenta", 62, "w"), [true, "art. 9.3.2"]);
igual("50 jugadas: las blancas en la 61, a una de completarse: no", v("cincuenta", 61, "w"), [false, "art. 9.3"]);

console.log("\n=== Lo que llega pegado ===");
const es = R.analizar("1. e4 e5 2. Cf3 Cc6 3. Ab5 a6 4. Axc6 dxc6 5. 0-0 Ag4 6. h3 Ah5 7. Te1 Dd6 8. d4 0-0-0 9. Cbd2 Rb8 1-0");
igual("en algebraica española, con 0-0 y 0-0-0, se lee entera",
    [es.error || null, es.espanola, es.jugadas.length, es.jugadas[es.jugadas.length - 1].san], [null, true, 18, "Kb8"]);
igual("en inglesa no se toca", R.analizar("1. e4 e5 2. Nf3 Nc6").espanola, false);
igual("una jugada que no es legal da el error, no un resultado", typeof R.analizar("1. e4 e5 2. Ke3 Nc6").error, "string");
igual("vacío, también", typeof R.analizar("   ").error, "string");
const dos = '[Event "Uno"]\n[White "A"]\n[Black "B"]\n\n1. e4 e5 *\n\n[Event "Dos"]\n[White "C"]\n[Black "D"]\n\n1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 *';
igual("un archivo con dos partidas se separa, y se puede elegir la segunda",
    [R.partidas(dos).length, rep(R.analizar(dos, 0)), rep(R.analizar(dos, 1)), R.analizar(dos, 1).etiquetas.White], [2, [], ["4… Ng8"], "C"]);
igual("un comentario con una «C» mayúscula no se traduce", R.normalizarJugadas("1. e4 {Ciudad} e5 2. Cf3").texto.includes("{Ciudad}"), true);

console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
process.exit(fallos ? 1 : 0);
