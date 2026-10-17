/* Comprueba el banco de la prueba de estilo (js/estilo-items.js).
 *
 * Sin navegador ni motor: el CI no tiene Stockfish. Las evaluaciones las
 * escribió herramientas/estilo-generar.js a profundidad 20; acá se exige que
 * digan lo que la prueba promete, y todo lo que se puede recalcular con
 * chess.js se recalcula. Lo que puede estar mal se rompe callado: la pregunta
 * se ve perfecta y mide otra cosa.
 *
 *  1. LA FORMA. 45 preguntas, 15 por eje, ids únicos, y en cada eje al menos
 *     5 con cada color al turno.
 *  2. UNA POSICIÓN INVENTADA. Cada una sale de su partida: se vuelve a jugar
 *     la partida desde el archivo del repositorio hasta su `ply` y tiene que
 *     dar el mismo FEN, sin venir de una captura ni de un jaque, sin estar en
 *     jaque, y (en «Una clase al día») lejos de lo que el curso pregunta o
 *     dibuja. Una partida, una pregunta.
 *  3. UNA JUGADA QUE NO EXISTE. Las dos jugadas y sus líneas se juegan con
 *     chess.js, y el SAN escrito es el de la jugada.
 *  4. UNA JUGADA MEJOR QUE LA OTRA. Las dos a 30 centipeones o menos de la
 *     mejor, y la posición sin decidir (±1,5): si no, la pregunta mide fuerza.
 *  5. UN POLO PUESTO A OJO. Las medidas de cada jugada se recalculan con
 *     herramientas/lib/estilo-medidas.js y tienen que dar las guardadas, y el
 *     polo de cada jugada tiene que ser el que dicen las medidas.
 *  6. EL ORDEN QUE DELATA. Si la jugada «a» fuera casi siempre la de atacar,
 *     abrir o cambiar, se elegiría por la posición en pantalla.
 *
 * Uso:  npm install && node herramientas/verificar-estilo.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");
const { Chess } = require(path.join(RAIZ, "node_modules", "chess.js"));
const M = require("./lib/estilo-medidas");
const Banco = require(path.join(RAIZ, "js", "estilo-items.js"));

const POR_EJE = 15, MIN_COLOR = 5, PAREJAS = 30, DECIDIDA = 150;
const fallas = [];
const falla = (id, msg) => fallas.push(id + ": " + msg);

/* Las partidas fuente, leídas por separado del generador. */
function partida(de, id) {
  if (de === "una-clase-al-dia") {
    const n = (/^ml(\d+)-/.exec(id) || [])[1];
    if (!n) return null;
    const f = path.join(RAIZ, "cursos/protegido/data/una-clase-al-dia", "l" + n.padStart(3, "0") + ".json");
    if (!fs.existsSync(f)) return null;
    const p = (JSON.parse(fs.readFileSync(f, "utf8")).partidas || {})[id];
    if (!p) return null;
    return {
      inicial: p.start_fen, sans: p.moves.map((m) => m.san),
      vetadas: [...(p.diagramas || []), ...(p.claves || []).map((k) => k.ply)],
    };
  }
  if (de === "cambiar-o-no-cambiar") {
    const d = JSON.parse(fs.readFileSync(path.join(__dirname, "datos/cambiar-o-no-cambiar-partidas.json"), "utf8"));
    const p = d.partidas.find((x) => x.id === id);
    return p && { inicial: p.fen_inicial || new Chess().fen(), sans: p.jugadas, vetadas: [] };
  }
  if (de === "ganar-con-poco") {
    const txt = fs.readFileSync(path.join(__dirname, "datos/ganar-con-poco-partidas.pgn"), "utf8").split(/\n(?=\[Event )/)[+id.replace("gcp-", "") - 1];
    if (!txt) return null;
    const c = new Chess();
    if (!c.load_pgn(txt)) return null;
    const fen = (/\[FEN "([^"]*)"/.exec(txt) || [])[1];
    return { inicial: fen || new Chess().fen(), sans: c.history(), vetadas: [] };
  }
  return null;
}

const items = Banco.ITEMS;
const ejes = Object.keys(M.POLOS);
if (JSON.stringify(Object.keys(Banco.EJES)) !== JSON.stringify(ejes)) falla("EJES", "no son los de estilo-medidas.js");
for (const eje of ejes) {
  if (JSON.stringify(Object.keys(Banco.EJES[eje].polos)) !== JSON.stringify(M.POLOS[eje]))
    falla("EJES", "los polos de «" + eje + "» no son los de estilo-medidas.js");
}

// 1. La forma.
if (items.length !== POR_EJE * ejes.length) falla("banco", items.length + " preguntas, se esperaban " + POR_EJE * ejes.length);
const ids = new Set(), partidas = new Set(), fens = new Set();
for (const eje of ejes) {
  const del = items.filter((x) => x.eje === eje);
  if (del.length !== POR_EJE) falla(eje, del.length + " preguntas, se esperaban " + POR_EJE);
  for (const color of ["w", "b"]) {
    const n = del.filter((x) => x.fen.split(" ")[1] === color).length;
    if (n < MIN_COLOR) falla(eje, "solo " + n + " con " + (color === "w" ? "blancas" : "negras") + " al turno");
  }
  // 6. El orden que delata.
  const primeroEsA = del.filter((x) => x.a.polo === M.POLOS[eje][0]).length;
  if (primeroEsA < 4 || primeroEsA > del.length - 4)
    falla(eje, "«" + M.POLOS[eje][0] + "» es la jugada «a» en " + primeroEsA + " de " + del.length + ": el orden lo delata");
}

for (const it of items) {
  const id = it.id;
  if (ids.has(id)) falla(id, "id repetido");
  ids.add(id);
  if (!ejes.includes(it.eje)) { falla(id, "eje desconocido " + it.eje); continue; }
  const tablero = it.fen.split(" ").slice(0, 2).join(" ");
  if (fens.has(tablero)) falla(id, "posición repetida");
  fens.add(tablero);
  const clave = it.fuente.de + "|" + it.fuente.partida;
  // La misma partida en dos lecciones lleva dos ids: se reconoce por quiénes
  // la jugaron (si el curso no los nombra, «Blancas»/«Negras», no se puede).
  const juego = it.fuente.blancas === "Blancas" ? clave : it.fuente.blancas + "|" + it.fuente.negras + "|" + it.fuente.evento;
  if (partidas.has(clave) || partidas.has(juego)) falla(id, "otra pregunta ya sale de " + clave);
  partidas.add(clave);
  partidas.add(juego);

  // 2. De su partida.
  const p = partida(it.fuente.de, it.fuente.partida);
  if (!p) { falla(id, "no se encuentra la partida " + clave); continue; }
  const c = new Chess(p.inicial);
  let ultima = null;
  for (let k = 0; k < it.fuente.ply; k++) {
    ultima = c.move(p.sans[k]);
    if (!ultima) break;
  }
  if (!ultima || c.fen() !== it.fen) falla(id, "el FEN no es el de " + clave + " tras " + it.fuente.ply + " medias jugadas");
  else {
    if (/[x+#]/.test(ultima.san)) falla(id, "la posición viene de " + ultima.san + ": hay una respuesta obligada");
    if (c.in_check()) falla(id, "el bando que mueve está en jaque");
    if (it.fuente.enLaPartida !== (p.sans[it.fuente.ply] || null)) falla(id, "«enLaPartida» no es la jugada que siguió");
  }
  if (p.vetadas.some((v) => Math.abs(v - it.fuente.ply) <= 2)) falla(id, "«Una clase al día» pregunta o dibuja esta posición");

  // 3. Las jugadas existen.
  for (const k of ["a", "b"]) {
    const j = it[k];
    const c2 = new Chess(it.fen);
    const m = c2.move({ from: j.uci.slice(0, 2), to: j.uci.slice(2, 4), promotion: j.uci[4] });
    if (!m) { falla(id, "la jugada " + k + " (" + j.uci + ") no es legal"); continue; }
    if (m.san !== j.san) falla(id, "el SAN de " + k + " dice " + j.san + " y es " + m.san);
    if (j.linea[0] !== j.uci) falla(id, "la línea de " + k + " no empieza con su jugada");
    try { M.jugarUci(Chess, it.fen, j.linea); } catch (e) { falla(id, "línea de " + k + ": " + e.message); }
  }
  if (it.a.uci === it.b.uci) falla(id, "las dos jugadas son la misma");

  // 4. Parejas para el motor.
  if (Math.abs(it.mejor) > DECIDIDA) falla(id, "la posición está decidida (" + it.mejor + ")");
  if (it.mejor < Math.max(it.a.eval, it.b.eval)) falla(id, "«mejor» vale menos que una de las dos jugadas");
  for (const k of ["a", "b"]) {
    if (it.mejor - it[k].eval > PAREJAS) falla(id, k + " queda a " + (it.mejor - it[k].eval) + " cp de la mejor");
    if (Math.abs(it[k].eval) > DECIDIDA) falla(id, k + " decide la partida (" + it[k].eval + ")");
  }

  // 5. Las medidas y el polo.
  let ma, mb;
  try { ma = M.medir(Chess, it.fen, it.a.linea); mb = M.medir(Chess, it.fen, it.b.linea); } catch (e) { continue; }
  if (JSON.stringify(ma) !== JSON.stringify(it.a.medidas)) falla(id, "las medidas de a no son las guardadas: " + JSON.stringify(ma));
  if (JSON.stringify(mb) !== JSON.stringify(it.b.medidas)) falla(id, "las medidas de b no son las guardadas: " + JSON.stringify(mb));
  const polo = M.poloDe(it.eje, ma, mb, M.tipoDeJugada(Chess, it.fen, it.a.uci), M.tipoDeJugada(Chess, it.fen, it.b.uci));
  if (!polo) falla(id, "las medidas no separan a las dos jugadas en «" + it.eje + "» (o las separan también en otro eje)");
  else {
    const [primero, segundo] = M.POLOS[it.eje];
    const esperado = polo === "a" ? [primero, segundo] : [segundo, primero];
    if (it.a.polo !== esperado[0] || it.b.polo !== esperado[1])
      falla(id, "los polos dicen " + it.a.polo + "/" + it.b.polo + " y las medidas " + esperado.join("/"));
  }
}

if (fallas.length) {
  console.error("✗ Prueba de estilo: " + fallas.length + " problema(s)\n  " + fallas.join("\n  "));
  process.exit(1);
}
console.log("✓ Prueba de estilo: " + items.length + " preguntas, " + POR_EJE + " por eje, comprobadas");
