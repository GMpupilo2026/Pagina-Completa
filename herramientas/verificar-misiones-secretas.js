#!/usr/bin/env node
/* Misiones secretas y Volcanes: las reglas, sin navegador.

   Misiones (js/misiones-secretas.js):
     · el catálogo tiene las MISMAS misiones que reparte la base
       (repartir_misiones() en la última migración que la define): una misión
       que la base reparte y la página no conoce se ve como «—» y nunca se
       puede ganar, sin ningún error;
     · ninguna está cumplida en la posición de salida (se ganaría en la
       primera jugada);
     · cada una se cumple en una posición donde debe y no en otra donde no.
   Volcanes (Variantes.Volcanes en js/variantes-engines.js):
     · el primero hace erupción en la jugada 10 y se anuncia 4 antes;
     · la pieza del volcán se pierde, un rey en el volcán pierde, y un rey
       que el volcán deja atacado después de su propia jugada también;
     · al quemarse una torre se pierde ese enroque (si no, chess.js dejaría
       enrocar con una torre que ya no está);
     · la jugada escrita pasa por el volcán igual que la tocada.
   Ver «Misiones secretas» y «Volcanes» en docs/decisiones/juegos-y-torneos.md. */
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");

const RAIZ = path.join(__dirname, "..");
global.window = {};
global.Chess = Chess;
require(path.join(RAIZ, "js/variantes-engines.js"));
require(path.join(RAIZ, "js/misiones-secretas.js"));
const { MisionesSecretas, Variantes } = global.window;

let fallos = 0;
function ok(cond, msg, detalle) {
  if (cond) console.log("  ✓ " + msg);
  else { fallos += 1; console.log("  ✗ " + msg + (detalle !== undefined ? "  →  " + JSON.stringify(detalle) : "")); }
}

console.log("=== Misiones secretas ===");
const migraciones = fs.readdirSync(path.join(RAIZ, "supabase/migraciones")).filter((f) => f.endsWith(".sql")).sort();
let sql = null;
for (const f of migraciones) {
  const s = fs.readFileSync(path.join(RAIZ, "supabase/migraciones", f), "utf8");
  if (/function public\.repartir_misiones/.test(s)) sql = s;
}
ok(!!sql, "hay una migración que define repartir_misiones()");
const enLaBase = sql ? [...(sql.match(/unnest\(array\[([^\]]+)\]\)/) || [, ""])[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]) : [];
const enLaPagina = MisionesSecretas.CATALOGO.map((m) => m.id);
ok(enLaBase.length >= 2, "la base reparte al menos dos misiones distintas (" + enLaBase.length + ")");
ok(JSON.stringify(enLaBase.slice().sort()) === JSON.stringify(enLaPagina.slice().sort()),
  "la base y la página conocen las mismas misiones", { base: enLaBase, pagina: enLaPagina });

const salida = new Chess();
for (const m of MisionesSecretas.CATALOGO) {
  ok(!MisionesSecretas.cumple(m.id, salida, "w") && !MisionesSecretas.cumple(m.id, salida, "b"),
    "«" + m.titulo + "» no está cumplida en la posición de salida");
}

// [misión, color, FEN donde se cumple, FEN donde no]
const CASOS = [
  ["caballo_avanzado", "w", "rnbqkb1r/pppppppp/3N4/8/8/8/PPPPPPPP/R1BQKBNR b KQkq - 0 1", "rnbqkb1r/pppppppp/N7/8/8/8/PPPPPPPP/R1BQKBNR b KQkq - 0 1"],
  ["caballo_avanzado", "b", "rnbqkb1r/pppppppp/8/8/8/4n3/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "rnbqkb1r/pppppppp/8/8/4n3/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"],
  ["torre_septima", "w", "4k3/R7/8/8/8/8/8/4K3 b - - 0 1", "4k3/8/R7/8/8/8/8/4K3 b - - 0 1"],
  ["torre_septima", "b", "4k3/8/8/8/8/8/r7/4K3 w - - 0 1", "4k3/8/8/8/8/r7/8/4K3 w - - 0 1"],
  ["sin_alfiles", "w", "rn1qk1nr/pppppppp/8/8/8/8/PPPPPPPP/RNBQK1NR b KQkq - 0 1", "rnbqk1nr/pppppppp/8/8/8/8/PPPPPPPP/RNBQK1NR b KQkq - 0 1"],
  ["cazar_dama", "w", "rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1", "rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR b KQkq - 0 1"],
  ["peon_sexta", "w", "rnbqkbnr/pp1ppppp/2P5/8/8/8/PP1PPPPP/RNBQKBNR b KQkq - 0 1", "rnbqkbnr/pp1ppppp/8/2P5/8/8/PP1PPPPP/RNBQKBNR b KQkq - 0 1"],
  ["peon_sexta", "b", "rnbqkbnr/pp1ppppp/8/8/8/2p5/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "rnbqkbnr/pp1ppppp/8/8/2p5/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"],
  ["torres_dobladas", "w", "4k3/8/8/8/8/8/4R3/4RK2 b - - 0 1", "4k3/8/8/8/8/8/4P3/R3RK2 b - - 0 1"],
  ["torres_dobladas", "w", "4k3/8/8/8/8/4R3/8/4RK2 b - - 0 1", "4k3/8/8/8/8/4R3/4N3/4RK2 b - - 0 1"],
  ["sin_caballos", "b", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/R1BQKB1R w KQkq - 0 1", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/R1BQKBNR w KQkq - 0 1"],
  ["rey_valiente", "w", "4k3/8/8/8/4K3/8/8/8 b - - 0 1", "4k3/8/8/8/8/4K3/8/8 b - - 0 1"],
  ["rey_valiente", "b", "8/8/8/4k3/8/8/8/4K3 w - - 0 1", "8/8/4k3/8/8/8/8/4K3 w - - 0 1"],
  ["centro", "w", "rnbqkbnr/ppp2ppp/8/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq - 0 1", "rnbqkbnr/ppp1pppp/8/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq - 0 1"],
  ["centro", "b", "rnbqkbnr/ppp2ppp/8/3pp3/8/8/PPP2PPP/RNBQKBNR w KQkq - 0 1", "rnbqkbnr/ppp2ppp/8/3pp3/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1"],
  ["ventaja_material", "w", "1nbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQk - 0 1", "rnbqkbnr/1ppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1"],
];
for (const [id, color, si, no] of CASOS) {
  const a = new Chess(si), b = new Chess(no);
  ok(a.fen().split(" ")[0] === si.split(" ")[0] && b.fen().split(" ")[0] === no.split(" ")[0], id + " (" + color + "): las posiciones de prueba se cargan");
  ok(MisionesSecretas.cumple(id, a, color), id + " (" + color + ") se cumple donde debe");
  ok(!MisionesSecretas.cumple(id, b, color), id + " (" + color + ") no se cumple donde no debe");
}
ok(!MisionesSecretas.cumple("no_existe", salida, "w"), "una misión desconocida no se da por cumplida");

console.log("\n=== Volcanes ===");
function jugar(volcanes, jugadas) {
  const e = Variantes.crear("volcanes");
  e.configurar({ volcanes });
  let r = null;
  for (const j of jugadas) {
    r = e.move({ from: j.slice(0, 2), to: j.slice(2, 4), promotion: j[4] });
    if (!r) throw new Error("jugada ilegal en la prueba: " + j);
  }
  return { e, r };
}
{
  const e = Variantes.crear("volcanes");
  e.configurar({ volcanes: ["e4", "d5"] });
  const p = e.proximo();
  ok(p && p.casilla === "e4" && p.faltan === 10 && !p.anunciado, "al empezar, el primer volcán es el de la lista y falta para anunciarlo", p);
  ok(!e.marca("e4"), "y todavía no se marca en el tablero");
}
{
  const { e, r } = jugar(["e4", "d5"], ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6"]);
  const p = e.proximo();
  ok(p.anunciado && p.faltan === 4, "a 4 jugadas de la erupción, el volcán se anuncia", p);
  const m = e.marca("e4");
  ok(m && m.emoji === "🌋" && m.cuenta === "4" && /dentro de 4 jugadas/.test(m.texto), "y la casilla lo dice escrito (no solo con color)", m);
  ok(!r.erupcion, "antes de la jugada 10 no hay erupción");
}
{
  const { e, r } = jugar(["e4", "d5"], ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6", "d2d3", "f8c5", "b1c3", "d7d6"]);
  ok(r.erupcion && r.erupcion.casilla === "e4" && r.erupcion.pieza && r.erupcion.pieza.type === "p", "en la jugada 10 hace erupción y se lleva la pieza", r.erupcion);
  ok(!e.game.get("e4"), "la casilla queda vacía");
  ok(/🌋e4×P$/.test(r.san), "la planilla lo anota («d6 🌋e4×P»)", r.san);
  ok(!r.gameOver, "y la partida sigue");
  ok(e.proximo().casilla === "d5" && e.proximo().faltan === 6, "el siguiente es el segundo de la lista, 6 jugadas después", e.proximo());
  ok(e.marca("e4") && e.marca("e4").emoji === "💥", "la casilla que hizo erupción queda marcada un momento");
}
{
  const { r } = jugar(["e1"], ["e2e4", "e7e5", "h2h3", "h7h6", "a2a3", "a7a6", "b2b3", "b7b6", "g2g3", "g7g6"]);
  ok(r.gameOver && r.result === "black" && r.erupcion.rey === "volcan", "un rey en el volcán: pierde su bando", r);
}
{
  const { r } = jugar(["d7"], ["e2e4", "e7e5", "f1b5", "h7h6", "h2h3", "h6h5", "a2a3", "g7g6", "b2b3", "g6g5"]);
  ok(r.gameOver && r.result === "white" && r.erupcion.rey === "expuesto", "el volcán le quita al rey negro su tapón justo después de su jugada: pierde", r);
}
{
  const { e } = jugar(["h1"], ["e2e4", "e7e5", "h2h3", "h7h6", "a2a3", "a7a6", "b2b3", "b7b6", "g2g3", "g7g6"]);
  ok(e.game.fen().split(" ")[2] === "Qkq", "al quemarse la torre de h1, las blancas pierden el enroque corto", e.game.fen());
}
{
  const e = Variantes.crear("volcanes");
  e.configurar({ volcanes: ["e4"] });
  for (const j of ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6", "d2d3", "f8c5", "b1c3"]) e.move({ from: j.slice(0, 2), to: j.slice(2) });
  const r = e.moveText("d6");
  ok(r && r.erupcion && r.erupcion.casilla === "e4" && !e.game.get("e4"), "la jugada escrita también hace erupción", r);
  ok(e.moveText("Rf9") === null, "y lo que no es jugada no mueve nada");
}
{
  const lista = Variantes.Volcanes.sorteo();
  ok(lista.length === 16 && new Set(lista).size === 16 && lista.every((s) => /^[a-h][3-6]$/.test(s)), "el sorteo da 16 casillas distintas del medio del tablero", lista);
}

console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
