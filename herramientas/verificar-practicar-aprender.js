/* Recorre, sin navegador, las posiciones escritas dentro de Practicar
 * (js/entreno-practicas.js, SETS) y de Aprender (js/aprender-lecciones.js,
 * LESSONS). Viven en el código y ningún verificador las miraba: así pasaron los
 * mates con otra solución que se arreglaron en #490, y no daban ningún error
 * (el alumno encontraba otro mate y la página le decía que no).
 *
 * Qué comprueba, con chess.js:
 *   - toda FEN es válida y toda jugada pedida es legal;
 *   - Practicar: en los mates y finales, la jugada da mate (la página acepta
 *     también cualquier otro mate). En las tácticas, la jugada cumple el
 *     motivo —la horquilla y el ataque doble atacan dos piezas que valen (rey,
 *     dama, torre, alfil o caballo); la clavada come una pieza clavada a su rey;
 *     el descubierto da jaque con OTRA pieza, con js/motivos-tacticos.js, el
 *     mismo módulo con el que la página acepta cualquier jugada que lo cumpla;
 *   - la posición es legal: el rey del que no juega no está en jaque (chess.js
 *     no lo mira);
 *   - Aprender: en «casillas», las marcadas son exactamente las legales de la
 *     pieza; en las jugadas, la de la solución es legal y hace lo que el texto
 *     dice (enroque, al paso, coronación, y en las tácticas, lo mismo que en
 *     Practicar, también única); en el quiz, el mate es mate y el ahogado,
 *     ahogado.
 *
 * Uso:  node herramientas/verificar-practicar-aprender.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");

const RAIZ = path.join(__dirname, "..");
let fallos = 0, revisados = 0;
function mal(donde, msg) { fallos += 1; console.log("  ✗ " + donde + ": " + msg); }

/* La lista tal cual está en la página: desde «const NOMBRE = [» hasta el «];»
   que la cierra al principio de una línea. */
function lista(archivo, nombre) {
  const src = fs.readFileSync(path.join(RAIZ, archivo), "utf8");
  const i = src.indexOf("const " + nombre + " = [");
  if (i < 0) throw new Error(archivo + ": no encontré " + nombre);
  const j = src.indexOf("\n];", i);
  return new Function("return " + src.slice(src.indexOf("[", i), j + 2))();
}

global.Chess = Chess;
const MT = require(path.join(RAIZ, "js/motivos-tacticos.js"));

/* La jugada guardada tiene que cumplir el motivo. Si hay otras que también lo
   cumplen, la página las acepta (js/motivos-tacticos.js): se cuentan, no fallan. */
let alternativas = 0;
function cumpleMotivo(donde, fen, motivo, from, to) {
  const g = new Chess(fen);
  const guardada = g.moves({ verbose: true }).find((m) => m.from === from && m.to === to);
  if (!MT.cumple(motivo, fen, guardada)) { mal(donde, `${from}-${to} no cumple «${motivo}»`); return; }
  alternativas += g.moves({ verbose: true }).filter((m) => !(m.from === from && m.to === to) && MT.cumple(motivo, fen, m)).length;
}
function jugar(fen, from, to, promotion) {
  const g = new Chess(fen);
  const m = g.move({ from, to, promotion: promotion || "q" });
  return { g, m };
}
function valida(donde, fen) {
  const v = new Chess().validate_fen(fen);
  if (!v.valid) { mal(donde, "FEN inválida: " + v.error); return false; }
  // chess.js no lo mira: el rey del que NO juega no puede estar en jaque.
  const partes = fen.split(" "); partes[1] = partes[1] === "w" ? "b" : "w"; partes[3] = "-";
  if (new Chess(partes.join(" ")).in_check()) { mal(donde, "posición ilegal: el rey del que no juega está en jaque"); return false; }
  return true;
}

/* ------------------------------------------------ Practicar */
console.log("=== Practicar (js/entreno-practicas.js) ===");
const SETS = lista("js/entreno-practicas.js", "SETS");
SETS.forEach((set) => set.rounds.forEach((r, i) => {
  const donde = `${set.id} #${i + 1}`;
  revisados++;
  if (!valida(donde, r.fen)) return;
  const { g, m } = jugar(r.fen, r.from, r.to, r.promotion);
  if (!m) { mal(donde, `${r.from}-${r.to} no es legal`); return; }
  if (set.cat === "mates" || set.cat === "finales") {
    if (!g.in_checkmate()) mal(donde, `${m.san} no da mate`);
  } else if (MT.MOTIVOS.includes(set.id)) {
    cumpleMotivo(donde, r.fen, set.id, r.from, r.to);
  } else mal(donde, `no sé qué comprobar en la categoría «${set.cat}»`);
}));

/* ------------------------------------------------ Aprender */
console.log("=== Aprender (js/aprender-lecciones.js) ===");
const LESSONS = lista("js/aprender-lecciones.js", "LESSONS");
LESSONS.forEach((l) => {
  const donde = l.id;
  revisados++;
  if (l.type === "quiz") {
    l.rounds.forEach((r, i) => {
      if (!valida(`${donde} #${i + 1}`, r.fen)) return;
      const g = new Chess(r.fen);
      const es = g.in_checkmate() ? "mate" : g.in_stalemate() ? "ahogado" : "ninguno";
      if (es !== r.answer) mal(`${donde} #${i + 1}`, `dice «${r.answer}» y es «${es}»`);
    });
    return;
  }
  if (!valida(donde, l.fen)) return;
  const g = new Chess(l.fen);
  if (l.type === "squares") {
    const p = g.get(l.square);
    if (!p) { mal(donde, `no hay pieza en ${l.square}`); return; }
    const partes = l.fen.split(" "); partes[1] = p.color; partes[3] = "-";
    const legales = new Chess(partes.join(" ")).moves({ square: l.square, verbose: true }).map((m) => m.to);
    const a = [...new Set(legales)].sort().join(","), b = [...l.targets].sort().join(",");
    if (a !== b) mal(donde, `marca ${b} y las legales son ${a}`);
    return;
  }
  if (l.type === "move") {
    if (l.anyLegalMove) {
      if (!g.in_check()) mal(donde, "dice que el rey está en jaque y no lo está");
      if (!g.moves().length) mal(donde, "no hay ninguna jugada legal");
      return;
    }
    const { m } = jugar(l.fen, l.solution.from, l.solution.to);
    if (!m) { mal(donde, `${l.solution.from}-${l.solution.to} no es legal`); return; }
    if (l.id === "reg_enroque" && !/k/.test(m.flags)) mal(donde, `${m.san} no es un enroque corto`);
    if (l.id === "reg_paso" && !/e/.test(m.flags)) mal(donde, `${m.san} no es una captura al paso`);
    if (l.id === "reg_coronacion" && !/p/.test(m.flags)) mal(donde, `${m.san} no corona`);
    // Las tácticas dicen su motivo (así la página acepta cualquier jugada que lo cumpla).
    if (l.cat === "tacticas" && !MT.MOTIVOS.includes(l.motivo)) mal(donde, `una lección de táctica sin motivo conocido: ${l.motivo}`);
    if (l.motivo) cumpleMotivo(donde, l.fen, l.motivo, l.solution.from, l.solution.to);
    return;
  }
  mal(donde, `tipo desconocido: ${l.type}`);
});

console.log(`\n${alternativas} jugadas más cumplen el motivo en algún ejercicio de táctica: la página también las acepta.`);
console.log(fallos ? `\n✗ ${fallos} problema(s) en ${revisados} ejercicios.` : `\n✓ Todo bien: ${revisados} ejercicios revisados.`);
process.exit(fallos ? 1 : 0);
