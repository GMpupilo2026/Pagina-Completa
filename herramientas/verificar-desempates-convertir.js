/* js/desempates-convertir.js: de lo que lee chess-results (la ficha de cada
 * jugador, ronda por ronda) al torneo que entiende js/pareo/desempates.js.
 *
 * Lo que hay que comprobar: que el torneo armado reproduzca el puntaje
 * oficial de cada jugador (la comparación de advertencias, que es la única
 * red de seguridad contra una ronda mal leída), que un bye, una
 * incomparecencia y una partida normal terminen en la categoría correcta
 * (se nota en el Buchholz y el Sonneborn-Berger, que tratan cada una
 * distinto), y que una persona con el puntaje oficial mal puesto, o con un
 * rival que no se pudo leer, SÍ se avise, para que nunca se muestre una
 * clasificación recalculada sin decir que algo no cuadra.
 *
 * No necesita navegador ni red.   node herramientas/verificar-desempates-convertir.js */
"use strict";
const path = require("path");
const raiz = path.join(__dirname, "..");
const D = require(path.join(raiz, "js/pareo/desempates.js"));
const C = require(path.join(raiz, "js/desempates-convertir.js"));

let fallos = 0;
const mal = (m) => { console.log("  ✗ " + m); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
  else console.log("  ✓ " + nombre);
}

// Cinco jugadores, tres rondas, impar a propósito para que el bye tenga
// sentido: cada ronda empareja a todos exactamente una vez (comprobado a
// mano abajo, en los puntajes oficiales de cada uno).
//   R1: 1-2 (gana 1), 3-4 (tablas), bye: 5
//   R2: bye: 1, 2-3 (gana 2), 4-5 (tablas)
//   R3: 1-3 (incomparecencia de 3: gana 1), 2-4 (tablas), bye: 5
const p = (ronda, rivalSnr, rivalNombre, color, puntos, extra) => Object.assign({ ronda, rivalSnr, rivalNombre, bye: false, incomparecencia: null, color, puntos }, extra || {});
const bye = (ronda, puntos) => p(ronda, 0, "bye", null, puntos, { bye: true });
const datos = {
  titulo: "Prueba",
  jugadores: [
    { snr: 1, nombre: "Uno, Ana", elo: 1600, puntos: 3, partidas: [p(1, 2, "Dos, Beto", "w", 1), bye(2, 1), p(3, 3, "Tres, Cata", "w", 1, { incomparecencia: "gana" })] },
    { snr: 2, nombre: "Dos, Beto", elo: 1400, puntos: 1.5, partidas: [p(1, 1, "Uno, Ana", "b", 0), p(2, 3, "Tres, Cata", "w", 1), p(3, 4, "Cuatro, Dina", "w", 0.5)] },
    { snr: 3, nombre: "Tres, Cata", elo: 1500, puntos: 0.5, partidas: [p(1, 4, "Cuatro, Dina", "b", 0.5), p(2, 2, "Dos, Beto", "b", 0), p(3, 1, "Uno, Ana", "b", 0, { incomparecencia: "pierde" })] },
    { snr: 4, nombre: "Cuatro, Dina", elo: 1300, puntos: 1.5, partidas: [p(1, 3, "Tres, Cata", "w", 0.5), bye(2, 1) /* se corrige abajo: en R2 juega con 5 */, p(3, 2, "Dos, Beto", "b", 0.5)] },
    { snr: 5, nombre: "Cinco, Eva", elo: 1200, puntos: 2.5, partidas: [bye(1, 1), p(2, 4, "Cuatro, Dina", "b", 0.5), bye(3, 1)] },
  ],
};
// Cuatro (p4) en realidad juega la ronda 2 contra Cinco (p5), no tiene bye.
datos.jugadores[3].partidas[1] = p(2, 5, "Cinco, Eva", "w", 0.5);

console.log("=== Se arma un torneo que PareoDesempates entiende ===");
const { t, nombres, advertencias, posibleTodos } = C.convertir(datos);
igual("5 jugadores, 3 rondas", [t.jugadores.length, t.rondas.length], [5, 3]);
igual("los nombres quedan en su propio mapa, por id", [nombres.p1, nombres.p2], ["Uno, Ana", "Dos, Beto"]);

console.log("=== El puntaje reconstruido coincide con el oficial: sin advertencias ===");
if (advertencias.length === 0) bien("nadie queda con el puntaje distinto al de chess-results");
else mal("hay advertencias donde no debería: " + JSON.stringify(advertencias));

console.log("=== El bye y la incomparecencia quedan en su categoría (se nota en Buchholz y Sonneborn-Berger) ===");
// Uno (p1) terminó con 3 puntos. Buchholz (art. 16.4, rival «ficticio» con
// tope): R1 jugada contra Dos (ajustado 1.5) → aporta 1.5. R2 bye entero:
// el rival ficticio es el menor entre el propio puntaje (3) y la mitad de
// las rondas (1.5) → aporta 1.5. R3 ganó por incomparecencia de Tres: el
// rival ficticio es el menor entre el propio puntaje (3) y el puntaje de
// Tres (0.5) → aporta 0.5. Total: 1.5 + 1.5 + 0.5 = 3.5.
const bh = D.calcular(t, "BH");
igual("Buchholz de Uno: 1.5 (Dos) + 1.5 (bye, tope mitad de las rondas) + 0.5 (incomparecencia, tope el puntaje de Tres) = 3.5",
  Math.round(bh.p1 * 100) / 100, 3.5);
const sb = D.calcular(t, "SB");
if (sb.p1 > 0) bien("Sonneborn-Berger de Uno es positivo (ganó partidas de verdad, no solo el bye)");
else mal("Sonneborn-Berger de Uno salió " + sb.p1);

console.log("=== Si el puntaje oficial no coincide, SE AVISA (nunca se calla) ===");
const roto = JSON.parse(JSON.stringify(datos));
roto.jugadores[0].puntos = 99; // el oficial de Uno, a propósito mal puesto
const otra = C.convertir(roto);
if (otra.advertencias.length === 1 && otra.advertencias[0].id === "p1" && otra.advertencias[0].oficial === 99) {
  bien("avisa que el puntaje de Uno (99) no coincide con el reconstruido (" + otra.advertencias[0].calculado + ")");
} else mal("no avisó del puntaje roto: " + JSON.stringify(otra.advertencias));

console.log("=== Sin rival (su ficha no se pudo leer en ninguno de los dos lados), la ronda no se inventa ===");
const dosJugadores = {
  titulo: "",
  jugadores: [
    { snr: 1, nombre: "Uno, Ana", elo: 1600, puntos: 0, partidas: [p(1, 2, "Dos, Beto", "w", 1)] },
    // A Dos no se le pudo leer la ficha: no está en la lista de jugadores,
    // así que nadie puede resolver esa ronda desde ningún lado.
  ],
};
const r3 = C.convertir(dosJugadores);
const r1 = r3.t.rondas[0];
if (r1.mesas.length === 0 && !r1.ausencias.p1) bien("la ronda 1 de Uno queda sin armar (ni mesa ni bye) en vez de adivinar un rival");
else mal("se armó algo para Uno con un rival que no existe: " + JSON.stringify(r1));

console.log("=== ¿Round robin? Se adivina por la cantidad de rondas, para que la pantalla lo proponga ===");
igual("5 jugadores y 3 rondas (menos que N-1=4): no round robin", posibleTodos, false);
const todosDatos = { titulo: "", jugadores: datos.jugadores.map((j) => ({ ...j, partidas: j.partidas.slice(0, 4) })) };
// Para la prueba solo importa la CANTIDAD de rondas contra la cantidad de
// jugadores, no que las rondas 4 existan de verdad en las partidas.
todosDatos.jugadores.forEach((j, i) => { j.partidas = datos.jugadores[i].partidas.concat([p(4, ((i + 1) % 5) + 1, "x", "w", 1)]); });
igual("5 jugadores y 4 rondas (N-1): parece round robin", C.convertir(todosDatos).posibleTodos, true);

console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
process.exit(fallos ? 1 : 0);
