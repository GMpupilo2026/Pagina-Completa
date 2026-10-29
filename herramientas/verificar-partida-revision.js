#!/usr/bin/env node
/* La revisión de una partida terminada (supabase/functions/partida-fin/
   revision.ts): la Edge Function rehace las jugadas con chess.js y anota en
   partidas_revision la que no cuadra. Ver «La partida terminada se revisa
   con chess.js» en docs/decisiones/juegos-y-torneos.md.

   Se prueba la MISMA función que corre la Edge Function (no una copia), con
   el chess.js del resto del sitio:
     - partidas reales de la base que terminaron bien no se acusan;
     - una jugada ilegal, jugadas que no llevan a la posición final, un
       resultado contra el mate y un ganador en un ahogado, sí;
     - una sala vieja, sin posición inicial guardada, que arrancó de otra
       posición, no se acusa: no se sabe de dónde salió.

   Sin navegador:
       node herramientas/verificar-partida-revision.js
*/
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { Chess } = require("chess.js");

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre);
}

async function cargar() {
  const ruta = path.join(__dirname, "..", "supabase", "functions", "partida-fin", "revision.ts");
  // Es un .ts sin nada de TypeScript: Node lo importa tal cual (el mismo
  // truco que verificar-puntos-robo.js con calculo.ts).
  return import("data:text/javascript," + encodeURIComponent(fs.readFileSync(ruta, "utf8")));
}

const INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
// Una partida real de la base (Estándar, ganaron las negras con mate).
const MATE_NEGRAS = {
  jugadas: ["d4", "d5", "Nc3", "Nf6", "Nf3", "Nc6", "e3", "Bf5", "Bb5", "e6", "O-O", "Bd6", "Qd2", "O-O", "Bxc6", "bxc6", "Ne5", "Ng4", "Nxc6", "Qh4", "g3", "Qxh2#"],
  fenFinal: "r4rk1/p1p2ppp/2Nbp3/3p1b2/3P2n1/2N1P1P1/PPPQ1P1q/R1B2RK1 w - - 0 12",
};
// Otra real: terminó por abandono (sin mate en el tablero).
const ABANDONO = {
  jugadas: ["e4", "e5", "Nf3", "Nc6", "Nc3", "Bc5", "d3", "Nf6", "Qd2", "d6", "Ng5", "O-O", "Be2", "Qe7", "Nh3"],
  fenFinal: "r1b2rk1/ppp1qppp/2np1n2/2b1p3/4P3/2NP3N/PPPQBPPP/R1B1K2R b KQ - 5 8",
};

async function main() {
  const { revisarPartida } = await cargar();
  // Lo que se le dice al profe vive en la página (js/partida-revision.js).
  const caja = { window: {} };
  vm.createContext(caja);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "partida-revision.js"), "utf8"), caja);
  const { MOTIVOS, texto } = caja.window.PartidaRevision;
  const revisar = (o) => revisarPartida(Chess, o);

  console.log("=== Lo que terminó bien no se acusa ===");
  igual("mate de las negras, ganan las negras", revisar({ fenInicial: INICIAL, ...MATE_NEGRAS, resultado: "black" }), null);
  igual("abandono: gana cualquiera", revisar({ fenInicial: INICIAL, ...ABANDONO, resultado: "white" }), null);
  igual("abandono: o tablas de común acuerdo", revisar({ fenInicial: INICIAL, ...ABANDONO, resultado: "draw" }), null);
  igual("sala vieja (sin posición inicial) que arrancó de la de siempre", revisar({ fenInicial: null, ...MATE_NEGRAS, resultado: "black" }), null);
  // Un final de práctica real de la base: arrancó de otra posición.
  igual("sala vieja que arrancó de otra posición: no se sabe, no se acusa",
    revisar({ fenInicial: null, jugadas: ["Kc6", "Kf4"], fenFinal: "8/8/2K1p3/4P3/5k2/8/8/8 w - - 2 2", resultado: "black" }), null);
  const desde = "7k/8/5K2/8/8/8/8/6Q1 w - - 0 1";
  igual("una sala que arrancó de su propia posición, guardada", revisar({ fenInicial: desde, jugadas: ["Qg7#"], fenFinal: "7k/6Q1/5K2/8/8/8/8/8 b - - 1 1", resultado: "white" }), null);

  console.log("\n=== Lo que no cuadra, sí ===");
  const ilegal = MATE_NEGRAS.jugadas.slice(0, 10).concat(["Qxh7"]);
  igual("una jugada ilegal: dice cuál y en qué número",
    revisar({ fenInicial: INICIAL, jugadas: ilegal, fenFinal: MATE_NEGRAS.fenFinal, resultado: "black" }),
    { motivo: "jugada_ilegal", jugada: 11, detalle: "Qxh7" });
  igual("jugadas legales que no llevan a la posición guardada",
    revisar({ fenInicial: INICIAL, jugadas: ABANDONO.jugadas, fenFinal: MATE_NEGRAS.fenFinal, resultado: "white" }).motivo,
    "posicion_distinta");
  igual("una partida sin jugadas con un tablero de mate escrito a mano",
    revisar({ fenInicial: INICIAL, jugadas: [], fenFinal: MATE_NEGRAS.fenFinal, resultado: "black" }).motivo,
    "posicion_distinta");
  igual("el mate es de las negras y gana el blanco",
    revisar({ fenInicial: INICIAL, ...MATE_NEGRAS, resultado: "white" }).motivo, "resultado_contra_el_mate");
  igual("el mate termina en tablas",
    revisar({ fenInicial: INICIAL, ...MATE_NEGRAS, resultado: "draw" }).motivo, "resultado_contra_el_mate");
  // Rey negro en h8, rey blanco en f6, dama a g6: ahogado (lo dice chess.js).
  const ahogado = { fenInicial: desde, jugadas: ["Qg6"], fenFinal: "7k/8/5KQ1/8/8/8/8/8 b - - 1 1" };
  igual("la posición de prueba es ahogado de verdad", new Chess(ahogado.fenFinal).in_stalemate(), true);
  igual("un ahogado con ganador", revisar({ ...ahogado, resultado: "white" }).motivo, "resultado_contra_el_ahogado");
  igual("el mismo ahogado en tablas está bien", revisar({ ...ahogado, resultado: "draw" }), null);

  console.log("\n=== Cada motivo se dice en palabras (js/partida-revision.js) ===");
  // Los motivos que revision.ts puede devolver, leídos de su código: uno
  // nuevo sin su texto en la página salta acá.
  const fuente = fs.readFileSync(path.join(__dirname, "..", "supabase", "functions", "partida-fin", "revision.ts"), "utf8");
  const motivos = [...new Set([...fuente.matchAll(/motivo: "([a-z_]+)"/g)].map((m) => m[1]))];
  igual("revision.ts devuelve los cuatro motivos", motivos.sort(), ["jugada_ilegal", "posicion_distinta", "resultado_contra_el_ahogado", "resultado_contra_el_mate"]);
  for (const m of motivos) igual("«" + m + "» tiene su texto", typeof MOTIVOS[m] === "string" && MOTIVOS[m].length > 10, true);
  igual("la jugada ilegal dice cuál",
    texto({ motivo: "jugada_ilegal", jugada: 11, detalle: "Qxh7" }), "Una jugada ilegal (la número 11 de la lista: Qxh7).");

  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron." : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
