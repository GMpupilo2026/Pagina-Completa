/* ===== El banco de «Finales contra la máquina» =====
 *
 * Arma entreno/data/finales.json, las posiciones de entreno/finales.html: los
 * finales de libro (Lucena, Philidor, Vancura, dama contra peón…) que el
 * alumno juega contra Stockfish a máxima fuerza, con una meta: GANAR (dar
 * mate) o SALVAR (hacer tablas).
 *
 * Las posiciones son las de los libros, escritas acá a mano, y por eso
 * ninguna se cree a ciegas («las posiciones no se inventan nunca»):
 *   - chess.js: la FEN carga y es legal (el bando que NO mueve no puede estar
 *     en jaque: con eso Stockfish se cuelga sin avisar).
 *   - Stockfish, a profundidad PROFUNDIDAD y desde el lado del alumno: una
 *     posición para ganar tiene que dar mate o +4 como mínimo, y una para
 *     salvar tiene que dar 0,5 o menos en valor absoluto. La evaluación queda
 *     escrita en el banco (`motor`) y verificar-finales.js la vuelve a exigir.
 *   - Cuando empieza la máquina (la posición es del otro bando), la cuenta es
 *     la misma: la evaluación es con la mejor jugada de la máquina adentro.
 *
 * Los finales básicos de mate (dama, torre, dos alfiles, alfil y caballo) no
 * están acá: son «Con lo justo», en Tipos de entrenamiento, con la distancia
 * al mate exacta. Rey y peón contra rey tampoco: es «Rey y peón».
 *
 * Cómo se corre (Stockfish instalado: apt install stockfish):
 *
 *   node herramientas/finales-generar.js
 *
 * entreno/data/finales.json NO se edita a mano.
 * Después: node herramientas/verificar-todo.js finales finales-pagina
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");
const { Motor } = require("./lib/motor-uci");

const RAIZ = path.join(__dirname, "..");
const SALIDA = path.join(RAIZ, "entreno/data/finales.json");
const PROFUNDIDAD = 26;
const GANA_DESDE = 400;   // centipeones, desde el lado del alumno
const TABLAS_HASTA = 50;

/* Cuántas jugadas PROPIAS hay que aguantar en un final para salvar, si antes
   no llega una tabla por reglamento. Al final de esas jugadas el motor mira la
   posición: si ya se perdió, no cuenta. */
const AGUANTAR = 25;

/* El orden es el de la página: de lo más directo a lo más fino. `alumno` es el
   bando con que juega el alumno; si la FEN es del otro, empieza la máquina. */
const FUENTE = [
  {
    id: "peon-pasado-lejano", titulo: "El peón pasado lejano", meta: "ganar", alumno: "w",
    fen: "8/5pk1/8/8/P7/8/5K2/8 w - - 0 1",
    idea: "Tu peón de a está lejos del rey negro: si corre, el rey rival tiene que ir a pararlo y deja solo a su peón.",
    pista: "Empuja el peón de a para llevarte al rey negro lejos, y con tu rey ve a comerte el peón de f.",
  },
  {
    id: "alfil-equivocado", titulo: "El alfil del color equivocado", meta: "tablas", alumno: "b",
    fen: "7k/8/5K2/7P/8/8/4B3/8 b - - 0 1",
    idea: "El peón de torre corona en h8, una casilla oscura, y tu rival tiene un alfil de casillas claras: no puede sacarte de la esquina.",
    pista: "No salgas de la esquina: ve y vuelve entre h8 y g8 (o h7). Cuidado con dejar que te encierren sin jugadas: también es tablas, por ahogado.",
  },
  {
    id: "dama-peon-central", titulo: "Dama contra peón en séptima", meta: "ganar", alumno: "w",
    fen: "K7/8/7Q/8/8/8/2kp4/8 w - - 0 1",
    idea: "La dama sola no alcanza: hay que obligar al rey negro a ponerse DELANTE de su peón, y en ese tiempo acercar tu rey.",
    pista: "Da jaques y clava el peón hasta que el rey negro tenga que ir a d1. Cada vez que lo haga, gana un tiempo para acercar tu rey.",
  },
  {
    id: "dama-peon-torre", titulo: "Dama contra peón de torre", meta: "tablas", alumno: "b",
    fen: "7K/8/8/8/8/5Q2/pk6/8 b - - 0 1",
    idea: "Con el peón de a en séptima y el rey blanco lejos, meterse en la esquina es la salvación: si la dama te encierra, queda ahogado.",
    pista: "Cuando te echen de delante del peón, ve a a1. Tomar el peón o encerrarte ahí es ahogado.",
  },
  {
    id: "dama-peon-alfil", titulo: "Dama contra peón de alfil", meta: "tablas", alumno: "b",
    fen: "K7/8/8/8/8/8/1kp5/3Q4 w - - 0 1",
    idea: "Con el peón de c también hay un truco de ahogado: si la dama se come el peón con tu rey en a1, no tienes jugadas.",
    pista: "Cuando te obliguen a salir de delante del peón, no vuelvas a c1 ni a d1: ve a a1. Si te toman el peón, es ahogado.",
  },
  {
    id: "torre-contra-peon", titulo: "Torre contra peón", meta: "ganar", alumno: "w",
    fen: "8/8/8/8/8/1k6/1p6/3K3R w - - 0 1",
    idea: "Tu rey está a tiempo: si llega a controlar la casilla de coronación, la torre se come el peón y queda torre contra rey.",
    pista: "Frena el peón con la torre en la columna b y acerca tu rey: cuando llegue, la torre se come el peón.",
  },
  {
    id: "philidor", titulo: "La posición de Philidor", meta: "tablas", alumno: "b",
    fen: "4k3/8/7r/3KP3/8/8/8/R7 b - - 0 1",
    idea: "La defensa clásica: el rey delante del peón y la torre en la sexta fila, cortando al rey blanco. Solo cuando el peón avance a la sexta, la torre va atrás a dar jaques.",
    pista: "Deja la torre en la sexta fila (b6, por ejemplo). Si el peón llega a e6, la torre baja a la primera fila y da jaques desde atrás.",
  },
  {
    id: "lucena", titulo: "La posición de Lucena", meta: "ganar", alumno: "w",
    fen: "3K4/3P1k2/8/8/8/8/7r/4R3 w - - 0 1",
    idea: "La ganada de libro de torre y peón: tu rey tiene que salir de delante del peón, y para que los jaques de la torre negra no lo molesten se «construye un puente» con la torre.",
    pista: "Pon la torre en la cuarta fila (Te4) y saca el rey. Cuando empiecen los jaques, el rey se acerca a la torre y la torre se interpone.",
  },
  {
    id: "vancura", titulo: "La posición de Vancura", meta: "tablas", alumno: "b",
    fen: "R7/6k1/P4r2/8/8/8/8/K7 b - - 0 1",
    idea: "Contra el peón de torre, tu torre ataca el peón DE COSTADO desde la sexta fila y tu rey se queda cerca de g7: la torre blanca queda atada a defenderlo.",
    pista: "Mantén la torre en la sexta fila atacando el peón. Si el rey blanco se acerca, dale jaques por detrás y vuelve a la sexta.",
  },
  {
    id: "torre-contra-alfil", titulo: "Torre contra alfil", meta: "tablas", alumno: "w",
    fen: "8/8/8/8/8/5k2/4r3/6BK b - - 0 1",
    idea: "Con torre contra alfil la defensa es la esquina del color CONTRARIO al del alfil: tu alfil va por las oscuras y tu rey está en h1, una casilla clara.",
    pista: "Quédate en h1 y g2 (o h2), y mueve el alfil sin despegarlo del rey. La esquina equivocada (a1 o h8) pierde.",
  },
];

function legal(fen) {
  const c = new Chess();
  if (!c.load(fen)) return "la FEN no carga en chess.js";
  const p = fen.split(" ");
  p[1] = p[1] === "w" ? "b" : "w";
  p[3] = "-";
  const otro = new Chess(p.join(" "));
  if (otro.in_check()) return "el bando que no mueve está en jaque";
  if (c.game_over()) return "la partida ya terminó";
  return null;
}

(async () => {
  const motor = new Motor();
  const salida = { aguantar: AGUANTAR, profundidad: PROFUNDIDAD, finales: [] };
  let malos = 0;
  for (const f of FUENTE) {
    const err = legal(f.fen);
    if (err) { console.log(`✗ ${f.id}: ${err}`); malos++; continue; }
    const [mejor] = await motor.analizar(f.fen, 1, PROFUNDIDAD);
    const mueve = f.fen.split(" ")[1];
    // score del lado que mueve → del lado del alumno
    const s = mueve === f.alumno ? mejor.score : -mejor.score;
    const mate = mejor.mate === null ? null : (mueve === f.alumno ? mejor.mate : -mejor.mate);
    const ok = f.meta === "ganar" ? (s >= GANA_DESDE) : (Math.abs(s) <= TABLAS_HASTA && mate === null);
    const texto = mate !== null ? `mate en ${mate}` : (s / 100).toFixed(2);
    console.log(`${ok ? "✓" : "✗"} ${f.id.padEnd(20)} ${f.meta.padEnd(6)} ${texto}`);
    if (!ok) { malos++; continue; }
    salida.finales.push(Object.assign({}, f, { motor: mate !== null ? { mate } : { cp: s } }));
  }
  motor.cerrar();
  if (malos) { console.log(`\n✗ ${malos} posición(es) no cumplen: no se escribe el banco.`); process.exit(1); }
  fs.writeFileSync(SALIDA, JSON.stringify(salida, null, 1) + "\n");
  console.log(`\n✓ ${salida.finales.length} finales en ${path.relative(RAIZ, SALIDA)}`);
  process.exit(0);
})();
