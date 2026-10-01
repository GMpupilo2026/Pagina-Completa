#!/usr/bin/env node
/* Los cuestionarios listos de la Academia (herramientas/cuestionarios-listos.js).

   Lo que se rompe callado en un banco así:
   - un cuestionario que no pasaría el armador (sin correcta, una opción vacía,
     un texto más largo de lo que admite): se sembraría igual, porque la base
     no lo revisa, y fallaría delante de la clase;
   - la correcta siempre en el mismo lugar: la clase aprende «es la A»;
   - una apertura nombrada por jugadas que no son legales (una letra mal
     pasada al español y la pregunta miente);
   - que falte un nivel o que un cuestionario quede corto.

   Usa la parte pura del armador (js/cuestionario-editor.js), la misma que
   valida lo que guarda un profe, y chess.js 0.10.3.

       node herramientas/verificar-cuestionarios-listos.js
*/
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");
const { LISTOS, cuestionarios, sql } = require("./cuestionarios-listos.js");

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + (a.length > 120 ? a.slice(0, 117) + "…" : a));
}

// La parte pura del armador, la misma que usa la página.
global.window = {};
global.Chess = Chess;
const src = fs.readFileSync(path.join(__dirname, "..", "js", "cuestionario-editor.js"), "utf8");
const i0 = src.indexOf("window.Cuestionario"), j0 = src.indexOf("})();", i0) + 5;
eval(src.slice(i0, j0));
const C = global.window.Cuestionario;

const todos = cuestionarios();

console.log("\n=== Cuántos y de qué nivel ===");
igual("30 cuestionarios", todos.length, 30);
igual("diez por nivel", C.NIVELES.map((n) => todos.filter((c) => c.nivel === n.id).length), [10, 10, 10]);
igual("ninguno con menos de 15 preguntas", todos.filter((c) => c.preguntas.length < 15).map((c) => c.titulo), []);
igual("los títulos no se repiten (la base tiene un índice único)", new Set(todos.map((c) => c.titulo)).size, todos.length);
igual("los títulos caben", todos.filter((c) => c.titulo.length > C.LARGO_TITULO).map((c) => c.titulo), []);

console.log("\n=== Cada uno pasa el armador tal cual ===");
const problemas = [];
todos.forEach((c) => C.problemas(c).forEach((p) => problemas.push(c.titulo + " — " + p)));
igual("sin problemas para el armador", problemas, []);
const recortadas = [];
todos.forEach((c) => c.preguntas.forEach((p) => {
  if (JSON.stringify(C.limpiar(p)) !== JSON.stringify(p)) recortadas.push(c.titulo + " — " + p.texto);
}));
igual("nada se recorta al guardarlo (textos y opciones dentro del largo)", recortadas, []);
const repetidas = [];
todos.forEach((c) => c.preguntas.forEach((p) => {
  const vistas = new Set(p.opciones.map((o) => o.toLowerCase()));
  if (vistas.size !== p.opciones.length) repetidas.push(c.titulo + " — " + p.texto);
}));
igual("ninguna pregunta repite una opción", repetidas, []);
const textos = todos.flatMap((c) => c.preguntas.map((p) => p.texto));
igual("ninguna pregunta está dos veces en el banco", textos.filter((t, i) => textos.indexOf(t) !== i), []);

console.log("\n=== La correcta no está siempre en el mismo lugar ===");
const cuenta = [0, 0, 0, 0];
todos.forEach((c) => c.preguntas.forEach((p) => { if (p.opciones.length === 4) cuenta[p.correcta] += 1; }));
const total = cuenta.reduce((a, b) => a + b, 0);
igual("cada letra es la correcta entre el 18 % y el 32 % de las veces", cuenta.every((n) => n / total >= 0.18 && n / total <= 0.32), true);
console.log("      (A, B, C, D: " + cuenta.join(", ") + ")");
igual("ningún cuestionario tiene la correcta siempre en la misma letra",
  todos.filter((c) => new Set(c.preguntas.map((p) => p.correcta)).size === 1).map((c) => c.titulo), []);

console.log("\n=== Las aperturas nombradas por jugadas son legales ===");
// De la notación en español a la de chess.js.
const AL_INGLES = { C: "N", A: "B", T: "R", D: "Q", R: "K" };
const ingles = (j) => j.replace(/^([CATDR])/, (m) => AL_INGLES[m]).replace(/=([CATD])$/, (m, l) => "=" + AL_INGLES[l]);
function jugar(secuencia) {
  const g = new Chess();
  const jugadas = secuencia.replace(/\d+\.(\.\.)?/g, " ").split(/\s+/).filter(Boolean);
  for (const j of jugadas) {
    if (!g.move(ingles(j))) return { g, mala: j };
  }
  return { g, mala: null };
}
const conJugadas = [];
todos.forEach((c) => c.preguntas.forEach((p) => {
  const m = p.texto.match(/1\.[^:,¿?]+/);
  if (m) conJugadas.push({ c: c.titulo, texto: p.texto, sec: m[0].trim() });
}));
igual("hay preguntas con jugadas para comprobar", conJugadas.length > 40, true);
const ilegales = conJugadas.map((x) => ({ x, r: jugar(x.sec) })).filter((y) => y.r.mala).map((y) => y.x.sec + " (" + y.r.mala + ")");
igual("todas se pueden jugar desde la posición inicial", ilegales, []);

// Lo que dicen dos de ellas, comprobado en el tablero.
{
  const { g } = jugar("1.e4 e5 2.Cf3 Cc6 3.Ac4 Cf6 4.Cg5 d5 5.exd5 Cxd5 6.Cxf7");
  // Le toca a las negras: se mira qué atacaría el caballo si le tocara mover.
  const fen = g.fen().replace(" b ", " w ");
  const g2 = new Chess(fen);
  // Las PIEZAS que ataca (el peón de e5 también, pero la pregunta pide dos piezas).
  const destinos = g2.moves({ square: "f7", verbose: true }).filter((m) => m.captured && m.captured !== "p").map((m) => m.to).sort();
  igual("6.Cxf7 ataca dos piezas: la dama de d8 y la torre de h8", destinos, ["d8", "h8"]);
}
{
  const { g } = jugar("1.d4 Cf6 2.c4 e6 3.Cc3 Ab4");
  const fen = g.fen();
  const g2 = new Chess(fen);
  igual("tras 3...Ab4 el caballo de c3 está clavado (no tiene jugadas)", g2.moves({ square: "c3" }).length, 0);
}
{
  // El rompimiento de a5-b5-c5 contra a7-b7-c7: con b6, uno de los peones corona.
  const g = new Chess("4k3/ppp5/8/PPP5/8/8/8/4K3 w - - 0 1");
  igual("con los peones de a5, b5 y c5, «b6» es una jugada legal", !!g.move("b6"), true);
}

console.log("\n=== Lo que se siembra ===");
const s = sql();
igual("el SQL borra los listos y siembra un nivel por sentencia", [(s.match(/delete from public\.cuestionarios where listo;/g) || []).length,
  (s.match(/insert into public\.cuestionarios/g) || []).length], [1, 3]);
igual("ningún texto rompe el entrecomillado del SQL (dos $q$ por título y dos por preguntas)", s.split("$q$").length - 1, 30 * 4);
igual("fuente con la correcta primero: tres o más opciones y a lo sumo cuatro",
  LISTOS.flatMap((c) => c.preguntas).filter((p) => p.otras.length < 1 || p.otras.length > 3).length, 0);

console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: los 30 cuestionarios listos.");
process.exit(fallos ? 1 : 0);
