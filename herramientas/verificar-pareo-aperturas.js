/* «Torneos en Pareo Integral»: qué apertura se jugó en cada partida
 * (js/pareo/aperturas.js).
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - cada secuencia de la lista son jugadas legales, escritas como las
 *     escribe chess.js (una mal escrita no reconoce a nadie y no avisa);
 *   - ninguna secuencia se repite, y cada familia tiene su nombre general (la
 *     que es solo su comienzo), salvo «Otras aperturas»;
 *   - se elige la secuencia MÁS LARGA (la Najdorf, no la Siciliana), y lo que
 *     no está en la lista queda en su familia o en «Otras aperturas»;
 *   - la apertura sale de las jugadas, no del encabezado del PGN; se leen las
 *     letras en español (C, A, T, D, R) y un PGN cortado a la mitad;
 *   - las cuentas: cómo le fue a cada color, sin las partidas sin resultado.
 *
 * Uso:  node herramientas/verificar-pareo-aperturas.js
 */
const path = require("path");
const { Chess } = require("chess.js");
const A = require(path.join(__dirname, "../js/pareo/aperturas.js"));

let fallos = 0;
const ok = (c, m, detalle) => {
  if (c) console.log("  ✓ " + m);
  else { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; }
};
const igual = (m, a, b) => ok(JSON.stringify(a) === JSON.stringify(b), m, "esperaba " + JSON.stringify(b) + ", salió " + JSON.stringify(a));

console.log("\n=== La lista ===");
const malas = [];
for (const [familia, nombre, jugadas] of A.LISTA) {
  const g = new Chess();
  for (const j of jugadas.split(" ")) {
    const m = g.move(j);
    if (!m) { malas.push(nombre + ": «" + j + "» no es legal en " + jugadas); break; }
    if (m.san !== j) { malas.push(nombre + ": «" + j + "» chess.js la escribe «" + m.san + "»"); break; }
  }
  if (!familia || !nombre) malas.push("sin familia o sin nombre: " + jugadas);
}
ok(!malas.length, A.LISTA.length + " secuencias, todas legales y escritas como chess.js", malas.join(" | "));
const vistas = new Map();
for (const [, nombre, jugadas] of A.LISTA) vistas.set(jugadas, (vistas.get(jugadas) || []).concat(nombre));
const repetidas = [...vistas].filter(([, v]) => v.length > 1);
ok(!repetidas.length, "ninguna secuencia se repite", JSON.stringify(repetidas));
const familias = [...new Set(A.LISTA.map(([f]) => f))];
const sinGeneral = familias.filter((f) => f !== "Otras aperturas" && !A.LISTA.some(([ff, n]) => ff === f && n === f));
ok(!sinGeneral.length, "cada familia tiene su nombre general", sinGeneral.join(", "));
ok(A.LISTA.length >= 80, "la lista es amplia (" + A.LISTA.length + " secuencias)");

console.log("\n=== Reconocer ===");
const r = (s) => A.reconocer(s.split(" "));
igual("la secuencia más larga: Najdorf, no «Siciliana»", r("e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5").nombre, "Siciliana Najdorf");
igual("y su familia", r("e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6").familia, "Defensa Siciliana");
igual("lo que no está en la lista queda en su familia", [r("e4 c5 b3").familia, r("e4 c5 b3").nombre], ["Defensa Siciliana", "Defensa Siciliana"]);
igual("una partida que empieza raro: «Otras aperturas»", r("a3 e5").familia, "Otras aperturas");
igual("el jaque se compara sin el «+»", r("d4 Nf6 c4 e6 Nf3 Bb4").nombre, "Defensa Bogoindia");
igual("el mismo nombre por dos caminos (Semieslava)", [r("d4 d5 c4 c6 Nf3 Nf6 Nc3 e6").nombre, r("d4 d5 c4 e6 Nc3 Nf6 Nf3 c6").nombre], ["Defensa Semieslava", "Defensa Semieslava"]);
igual("sin jugadas: «Otras aperturas»", A.reconocer([]).familia, "Otras aperturas");

console.log("\n=== Del PGN ===");
const pgnEs = '[Event "PRUEBA"]\n[Opening "Defensa Francesa"]\n\n1. e4 e5 2. Cf3 Cc6 3. Ab5 a6 4. Aa4 Cf6 5. O-O Ae7 {la cerrada} 6. Te1 1-0';
igual("con letras en español y sin hacerle caso al encabezado", A.deTexto(pgnEs, Chess).nombre, "Española cerrada");
igual("un PGN cortado a la mitad de una jugada", A.deTexto("1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. N", Chess).nombre, "Defensa India de rey");
igual("una jugada ilegal corta ahí (lo de antes vale)", A.deTexto("1. e4 c5 2. Nf3 Ke5", Chess).nombre, "Defensa Siciliana");
ok(A.deTexto("", Chess) === null && A.deTexto("hola", Chess) === null, "sin jugadas, nada");

console.log("\n=== Las cuentas ===");
const P = (s, res) => ({ jugadas: s.split(" "), r: res });
const c = A.contar([P("e4 c5", "1-0"), P("e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6", "0-1"), P("e4 c5 c3", "="), P("d4 d5 c4", "1-0"), P("e4 c5", null), P("e4 c5", "+-")]);
igual("por familia, de la más jugada a la menos, con cómo le fue a cada color", c.map((f) => [f.familia, f.n, f.blancas, f.tablas, f.negras]),
  [["Defensa Siciliana", 3, 1, 1, 1], ["Gambito de dama", 1, 1, 0, 0]]);
igual("con los nombres de adentro", c[0].nombres.map((x) => x.nombre + " " + x.n), ["Defensa Siciliana 1", "Siciliana Alapin 1", "Siciliana Najdorf 1"]);
ok(c.reduce((a, f) => a + f.n, 0) === 4, "las partidas sin resultado o ganadas sin jugar no cuentan");
igual("los resultados como los anota una mesa", ["1-0", "0-1", "=", "½-½", "1/2-1/2", "+-", ""].map(A.ganador), ["blancas", "negras", "tablas", "tablas", "tablas", null, null]);

console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
