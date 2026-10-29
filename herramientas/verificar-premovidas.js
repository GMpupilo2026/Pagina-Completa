#!/usr/bin/env node
/* Las pre-jugadas y lo que el canal rápido comprueba antes de pintar una jugada
   del rival, sin navegador. Ver «La jugada viaja por Broadcast, y las
   pre-jugadas» en docs/decisiones/juegos-y-torneos.md.

   - js/premovidas.js: los destinos de cada pieza en un tablero vacío (también
     las capturas del peón, los enroques y las piezas fundidas de Abrazos), y el
     controlador con un tablero de mentira: elegir, poner, quitar, jugarla
     cuando llega el turno y descartarla (y decirlo) si ya no es legal.
   - js/sala-juego.js: rehacerConChess acepta solo una jugada legal que da la
     posición avisada, y pensado() cuenta hasta el momento de mover salvo que se
     haya esperado más de medio segundo.
   - js/cartas-engine.js: toJSON y fromJSON copian las manos y el mazo. Antes
     el tablero compartía los arreglos con la sala y, al jugar, le cambiaba la
     sala a la página sin guardar nada.

   La parte en vivo (las salas con el canal rápido y las pre-jugadas, en todas
   las modalidades) la prueba verificar-partidas-simultaneas.js.

   Uso: node herramientas/verificar-premovidas.js   (con npm install: chess.js) */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { Chess } = require("chess.js");

let fallos = 0;
function ok(nombre, condicion, detalle) {
  if (condicion) { console.log("  ✓ " + nombre); return; }
  fallos++;
  console.log("  ✗ " + nombre + (detalle !== undefined ? "  →  " + JSON.stringify(detalle) : ""));
}

const caja = { window: {}, Chess, console, Math, Date, JSON, setInterval() {}, setTimeout, clearTimeout, document: { addEventListener() {}, getElementById: () => null } };
caja.window.RelojServidor = { ahora: () => Date.now() };
caja.RelojServidor = caja.window.RelojServidor;
vm.createContext(caja);
for (const f of ["premovidas.js", "sala-juego.js", "cartas-engine.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8"), caja);
}
const { Premovidas, SalaJuego } = caja.window;
const CartasChess = caja.window.CartasChess || caja.CartasChess;
const orden = (l) => l.slice().sort().join(",");

console.log("=== Los destinos de una pre-jugada ===");
ok("peón blanco en su fila: uno, dos y las dos capturas", orden(Premovidas.destinos(["p"], "w", "e2")) === "d3,e3,e4,f3");
ok("peón negro en el borde: uno y una captura", orden(Premovidas.destinos(["p"], "b", "a6")) === "a5,b5");
ok("caballo en la esquina", orden(Premovidas.destinos(["n"], "w", "a1")) === "b3,c2");
ok("rey en e1: los vecinos y los dos enroques", orden(Premovidas.destinos(["k"], "w", "e1")) === "c1,d1,d2,e2,f1,f2,g1");
ok("torre: las columnas y filas enteras, también donde hoy hay piezas", Premovidas.destinos(["r"], "w", "a1").length === 14);
ok("dama en d4: 27 casillas", Premovidas.destinos(["q"], "w", "d4").length === 27);
ok("Abrazos: una pieza fundida suma los destinos de cada una, sin repetir",
  orden(Premovidas.destinos(["n", "b"], "w", "a1")) === orden(["b3", "c2", "b2", "c3", "d4", "e5", "f6", "g7", "h8"]));

console.log("\n=== El controlador, con un tablero de mentira ===");
const juego = new Chess("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1");
const avisos = [];
const tablero = {
  interactive: true, myColor: "w", render() {},
  onPromotionNeeded: null,
};
const pre = Premovidas.crear(tablero, {
  pieza: (sq) => { const p = juego.get(sq); return p ? { tipos: [p.type], color: p.color } : null; },
  turnoPropio: () => juego.turn() === "w",
  jugar: (pm) => { const m = juego.move({ from: pm.from, to: pm.to, promotion: pm.promotion || "q" }); return m ? { ok: true, san: m.san } : null; },
  alCambiar: (pm) => avisos.push(pm),
});
ok("en el turno del rival se puede premover", pre.puede());
pre.clic("g1");
ok("tocar una pieza propia la elige", pre.elegida("g1"));
pre.clic("f3");
ok("tocar un destino pone la pre-jugada y avisa", pre.pm && pre.pm.from === "g1" && pre.pm.to === "f3" && avisos.length === 1);
ok("y se dice en el estado", /Pre-jugada lista: g1 a f3/.test(pre.texto()));
ok("no sale mientras no es el turno propio", pre.jugar() === null && pre.pm);
juego.move("e5");
const hecha = pre.jugar();
ok("al llegar el turno, sale sola", hecha && hecha.ok && hecha.san === "Nf3" && !pre.pm && juego.turn() === "b");
juego.move("Nc6");
juego.move("Bc4");
pre.clic("d1"); pre.clic("h5");
ok("tocar otra vez el tablero la quita", (() => { pre.clic("a1"); return !pre.pm; })());
// El peón captura en d5 (en un tablero vacío se puede), pero ahí no hay nada.
pre.clic("e4"); pre.clic("d5");
ok("una captura de peón también se prepara", pre.pm && pre.pm.to === "d5");
juego.move("h6");
const mala = pre.jugar();
ok("si ya no es legal, se descarta", mala && !mala.ok && !pre.pm);
ok("y se dice por qué", /La pre-jugada e4 a d5 no se pudo hacer: ya no era legal\./.test(pre.texto()));
tablero.interactive = false;
ok("con la partida terminada no se premueve", !pre.puede());

console.log("\n=== Lo que el canal rápido cree de un aviso ===");
const sala = { fen: new Chess().fen(), moves: [] };
const despues = (() => { const c = new Chess(); c.move("e4"); return c.fen(); })();
const bien = SalaJuego.rehacerConChess(sala, { san: "e4", despues });
ok("una jugada legal que da la posición avisada se pinta", bien && bien.fen === despues && bien.moves.join() === "e4");
ok("una jugada ilegal no", SalaJuego.rehacerConChess(sala, { san: "e5", despues }) === null);
ok("una jugada que no da la posición avisada, tampoco", SalaJuego.rehacerConChess(sala, { san: "d4", despues }) === null);
ok("un aviso sin jugada, tampoco", SalaJuego.rehacerConChess(sala, { despues }) === null);

console.log("\n=== El reloj de quien mueve ===");
const hace10 = new Date(Date.now() - 10000).toISOString();
const recien = Date.now() - 300;
ok("cuenta hasta el momento de mover si se guardó enseguida", Math.abs(SalaJuego.pensado({ clock_updated_at: hace10 }, recien) - 9.7) < 0.05);
ok("si se esperó más de medio segundo, cuenta hasta ahora", Math.abs(SalaJuego.pensado({ clock_updated_at: hace10 }, Date.now() - 2000) - 10) < 0.05);
ok("sin reloj en marcha, nada", SalaJuego.pensado({ clock_updated_at: null }, recien) === 0);

console.log("\n=== Cartas: cada estado es una copia propia ===");
const estado = CartasChess.Game.iniciar().toJSON();
const copia = JSON.stringify(estado);
const g = CartasChess.Game.fromJSON(estado);
const legal = g.legalMoves()[0];
g.move({ from: legal.from, to: legal.to });
ok("jugar no le cambia la mano ni el mazo al estado del que se cargó", JSON.stringify(estado) === copia);
const json = g.toJSON();
g.hands.w.push("robo");
ok("toJSON no comparte arreglos con el motor", json.hands.w.indexOf("robo") === -1 || json.hands.w.length !== g.hands.w.length);

console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron." : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
