/* Las preguntas de «quién le apunta a quién» y de la partida que entiende el
   recuadro de comandos (js/comandos-tablero.js): «qué ataca e4», «quién ataca
   e4», «quién defiende e4», «última jugada» e «historial».

   Son lo que un tablero dice de un vistazo —esa pieza está colgando, ese
   caballo está clavado— y que quien no ve no tiene cómo saber casilla por
   casilla. Una respuesta equivocada acá no da ningún error: se oye segura y
   es falsa. Por eso se comprueba contra posiciones de verdad (chess.js), sin
   navegador: la geometría no depende de la página.

   Uso: node herramientas/verificar-preguntas-tablero.js */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { Chess } = require("chess.js");

const ctx = { window: {}, console };
ctx.window.window = ctx.window;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "comandos-tablero.js"), "utf8"), ctx);
const CT = ctx.window.ComandosTablero;

let fallos = 0;
function igual(nombre, hallado, esperado) {
  if (hallado !== esperado) { console.log("  ✗ " + nombre + "\n      esperaba: " + esperado + "\n      salió:    " + hallado); fallos++; }
  else console.log("  ✓ " + nombre);
}
const pregunta = (juego, t) => { const r = CT.interpretar(t, { juego: () => juego }); return r.manejado ? r.respuesta : "(no la entendió)"; };

// La española: 1.e4 e5 2.Cf3 Cc6 3.Ab5.
const g = new Chess();
["e4", "e5", "Nf3", "Nc6", "Bb5"].forEach((m) => g.move(m));

console.log("\nQuién le apunta a quién");
igual("qué ataca el alfil de b5", pregunta(g, "qué ataca b5"), "alfil blanco en b5 ataca a caballo negro en c6.");
igual("el caballo de c6: uno lo ataca, dos lo defienden (y el verbo concuerda)", pregunta(g, "quién ataca c6"),
  "caballo negro en c6: La ataca alfil blanco en b5. La defienden peón negro en b7, peón negro en d7.");
igual("«quién defiende» dice primero los defensores", pregunta(g, "quien defiende e5"),
  "peón negro en e5: La defiende caballo negro en c6. La ataca caballo blanco en f3.");
igual("una pieza sin atacantes", pregunta(g, "quién ataca f7"), "peón negro en f7: Nadie la ataca. La defiende rey negro en e8.");
igual("una casilla vacía: quién le apunta de cada lado", pregunta(g, "quién ataca d4"),
  "d4 está vacía. Las blancas le apuntan con caballo blanco en f3. Las negras le apuntan con caballo negro en c6, peón negro en e5.");
// La torre de h1 ve hasta el rey (f1 y g1 se vaciaron) y se corta en su peón de h2.
igual("las piezas cortan la línea (la torre no atraviesa su propio peón)", pregunta(g, "qué ataca h1"),
  "torre blanca en h1 no ataca ninguna pieza rival; y defiende a rey blanco en e1, peón blanco en h2.");
igual("el peón ataca en diagonal, no hacia adelante", pregunta(new Chess("4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1"), "qué ataca e4"),
  "peón blanco en e4 ataca a peón negro en d5.");
// Una pieza clavada igual DEFIENDE: no es una jugada legal, es geometría.
// El caballo de d2 está clavado por el alfil de a5 contra el rey: no puede
// moverse, pero igual cuida el peón de f3.
igual("una pieza clavada sigue defendiendo", pregunta(new Chess("4k3/8/8/b7/8/5P2/3N4/4K3 w - - 0 1"), "quién defiende f3"),
  "peón blanco en f3: La defiende caballo blanco en d2. Nadie la ataca.");

console.log("\nTodas las jugadas, sin mirar el tablero");
const inicio = new Chess();
const todas = pregunta(inicio, "mis jugadas");
igual("«mis jugadas» cuenta las veinte de la salida", /^Tienes 20 jugadas\. /.test(todas) ? "sí" : todas, "sí");
igual("agrupadas por pieza", /caballo blanco en g1: f3, h3/.test(todas) ? "sí" : todas, "sí");
igual("con el jaque y la captura dichos",
  pregunta(new Chess("4k3/8/8/8/8/8/3q4/R3K3 w Q - 0 1"), "mis jugadas").includes("d2 capturando"), true);

console.log("\nLa partida");
igual("última jugada", pregunta(g, "última jugada"), "La última jugada fue de las blancas: Bb5.");
igual("historial numerado", pregunta(g, "historial"), "5 jugadas. 1: e4, e5; 2: Nf3, Nc6; 3: Bb5.");
igual("un ejercicio que arranca en la posición lo dice",
  pregunta(new Chess("4k3/8/8/8/8/8/8/4K2R w K - 0 1"), "última jugada"),
  "Todavía no hay jugadas: la partida (o el ejercicio) empieza en esta posición.");
// Con niebla no se contesta: la jugada del rival no se ve (la página decide).
const niebla = Object.assign(new Chess(g.fen()), { oculta: () => false, miColor: "w" });
igual("con niebla, «última jugada» no se contesta acá", pregunta(niebla, "última jugada"), "(no la entendió)");

console.log("\nLa posición, dicha de varias formas");
const dichaPos = (t) => { const r = CT.interpretar(t, { juego: () => g }); return r.manejado ? r.tipo : "(no la entendió)"; };
igual("«cómo está la posición»", dichaPos("¿Cómo está la posición?"), "posicion");
igual("«describe la posición»", dichaPos("describe la posición"), "posicion");

console.log("\nQue no se coma jugadas ni letras");
igual("«Axb5» sigue siendo una jugada", pregunta(g, "Axb5"), "(no la entendió)");
igual("«d» sola no es pregunta (es una letra de opción)", pregunta(g, "d"), "(no la entendió)");

console.log(fallos ? `\n${fallos} fallo(s)` : "\nLas preguntas de ataque y de la partida contestan lo que hay.");
process.exit(fallos ? 1 : 0);
