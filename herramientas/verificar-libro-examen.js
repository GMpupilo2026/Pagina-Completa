/* Verifica el banco del libro «Ponte a prueba» (js/libro-examen-items.js) y su
 * paso a los exámenes de la plataforma (fuente «libro» de js/examen-banco.js).
 *
 * Lo que comprueba, porque nada de esto da error si se rompe —el libro se
 * imprime igual y el examen se ve igual—:
 *   - seis pruebas de 30, sin posiciones repetidas, y ninguna que ya esté en
 *     el diagnóstico (el mismo ejercicio en las dos pruebas mediría memoria);
 *   - cada FEN es legal, juegan las blancas y la última jugada marcada lleva a
 *     esa posición;
 *   - las cuatro opciones de la jugada son legales, distintas, y la solución
 *     guardada es la opción marcada como buena;
 *   - los puntos: la buena vale 5 en las dos preguntas y ninguna otra llega a
 *     5 (si no, habría dos respuestas correctas);
 *   - cada prueba trae 5 de cada grupo, para que sirva sola;
 *   - el examen de la plataforma: la clave barajada sigue apuntando a la
 *     jugada buena, y lo que ve el alumno no trae la respuesta;
 *   - la versión accesible cuenta las 180 posiciones.
 *
 *   node herramientas/verificar-libro-examen.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");

const RAIZ = path.join(__dirname, "..");
const fallos = [];
const ok = (cond, msg) => { if (!cond) fallos.push(msg); };

const win = {};
const cargar = (f) => new Function("window", fs.readFileSync(path.join(RAIZ, f), "utf8"))(win);
cargar("js/plan-entrenamiento.js");
cargar("js/diagnostico-items.js");
cargar("js/arbitraje-items.js");
cargar("js/aperturas-lineas.js");
cargar("js/libro-examen-items.js");
cargar("js/examen-banco.js");

const LIBRO = win.LIBRO_EXAMEN;
const ITEMS = win.LIBRO_EXAMEN_ITEMS;
const INGLES = { R: "K", D: "Q", T: "R", A: "B", C: "N" };
const aIngles = (san) => san.replace(/^[RDTAC]/, (c) => INGLES[c]).replace(/=([DTAC])/, (_, c) => "=" + INGLES[c]);

/* ---------- la forma ---------- */
ok(ITEMS.length === 180, `esperaba 180 posiciones y hay ${ITEMS.length}`);
ok(LIBRO.PRUEBAS === 6, `esperaba 6 pruebas y dice ${LIBRO.PRUEBAS}`);
for (let p = 1; p <= LIBRO.PRUEBAS; p++) {
  const delas = ITEMS.filter((i) => i.prueba === p);
  ok(delas.length === 30, `la prueba ${p} tiene ${delas.length} posiciones`);
  const grupos = {};
  delas.forEach((i) => { grupos[i.grupo] = (grupos[i.grupo] || 0) + 1; });
  ok(Object.values(grupos).length === 6 && Object.values(grupos).every((n) => n === 5),
    `la prueba ${p} no trae 5 de cada grupo: ${JSON.stringify(grupos)}`);
}
ok(ITEMS.every((it, i) => it.n === i + 1), "la numeración de las posiciones no va de 1 a 180 en orden");
ok(new Set(ITEMS.map((i) => i.id)).size === ITEMS.length, "hay posiciones repetidas");
const delDiagnostico = new Set((win.DIAGNOSTICO_ITEMS || []).map((i) => i.lichess).filter(Boolean));
const repetidas = ITEMS.filter((i) => delDiagnostico.has(i.lichess));
ok(!repetidas.length, `estas posiciones ya están en el diagnóstico: ${repetidas.map((i) => i.lichess).join(", ")}`);

/* ---------- cada posición ---------- */
const ids = new Set(LIBRO.CATEGORIAS.map((c) => c.id));
ITEMS.forEach((it) => {
  const quien = `posición ${it.n} (${it.lichess})`;
  const g = new Chess();
  ok(g.load(it.fen), `${quien}: la FEN no es legal`);
  ok(it.fen.split(" ")[1] === "w", `${quien}: no juegan las blancas`);
  ok(Array.isArray(it.marca) && it.marca.length === 2 && it.fen.split(" ")[0] && g.get(it.marca[1]),
    `${quien}: la última jugada marcada no termina en una pieza`);
  ok(it.marca && g.get(it.marca[1]) && g.get(it.marca[1]).color === "b", `${quien}: la última jugada marcada no es de las negras`);

  const sans = it.jugada.opciones;
  ok(!sans.some((x) => x.includes("#")), `${quien}: una opción lleva # y delata la respuesta`);
  ok(sans.length === 4 && new Set(sans).size === 4, `${quien}: las opciones no son cuatro distintas`);
  const movs = sans.map((s) => new Chess(it.fen).move(aIngles(s)));
  ok(movs.every(Boolean), `${quien}: hay una opción que no es legal (${sans.join(", ")})`);
  const buena = movs[it.jugada.correcta];
  ok(buena && buena.from === it.solucion.from && buena.to === it.solucion.to,
    `${quien}: la opción buena no es la solución guardada`);

  [["jugada", it.jugada], ["evaluación", it.evaluacion]].forEach(([nombre, q]) => {
    ok(q.puntos[q.correcta] === 5, `${quien}: la ${nombre} buena no vale 5`);
    ok(q.puntos.filter((x) => x >= 5).length === 1, `${quien}: en la ${nombre} hay más de una respuesta de 5 puntos`);
    ok(q.puntos.every((x) => Number.isInteger(x) && x >= -1 && x <= 5), `${quien}: puntos fuera de −1..5 en la ${nombre}`);
  });
  ok(it.evaluacion.puntos.length === LIBRO.EVALUACION.length, `${quien}: la evaluación no tiene las ${LIBRO.EVALUACION.length} respuestas`);
  ok(it.peso >= 1 && it.peso <= 5, `${quien}: peso ${it.peso} fuera de 1..5`);
  ok(it.categorias.length >= 1 && it.categorias.every((c) => ids.has(c)), `${quien}: categorías raras ${it.categorias}`);
  ok(/Lichess/.test(it.comprobado) && /Stockfish/.test(it.comprobado), `${quien}: no dice cómo se comprobó`);
});

/* Cada categoría necesita posiciones de sobra para que su tabla diga algo. */
LIBRO.CATEGORIAS.forEach((c) => {
  const n = ITEMS.filter((i) => i.categorias.includes(c.id)).length;
  ok(n >= 12, `la categoría ${c.nombre} tiene solo ${n} posiciones`);
});

/* ---------- el examen de la plataforma ---------- */
const B = win.ExamenBanco;
const porId = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
let revisadas = 0, malClave = 0, filtradas = 0;
for (let s = 1; s <= 30; s++) {
  const ex = B.armar({ fuente: "libro", cantidad: 40, dificultad: { min: 1, max: 5 }, semilla: s });
  ex.forEach((e) => {
    revisadas++;
    const orig = porId[e.item_id];
    if (!orig || e.banco !== "libro" || e.tipo !== "opcion_tablero") { malClave++; return; }
    if (orig.jugada.opciones[orig.jugada.correcta] !== e.visible.opciones[Number(e.clave.correcta)]) malClave++;
    if (/"correcta"|"solucion"|"puntos"/.test(JSON.stringify(e.visible))) filtradas++;
  });
}
ok(revisadas === 30 * 40, `esperaba 1200 preguntas armadas y salieron ${revisadas}`);
ok(malClave === 0, `${malClave} claves del libro NO apuntan a la jugada buena después de barajar`);
ok(filtradas === 0, `${filtradas} preguntas del libro llevan la respuesta en lo que ve el alumno`);
ok(B.disponibles({ fuente: "libro" }) === 180, "sin filtros, el libro no ofrece sus 180 posiciones");
ok(B.disponibles({ fuente: "libro", prueba: "3" }) === 30, "la prueba 3 no ofrece sus 30 posiciones");
const deLa2 = B.armar({ fuente: "libro", prueba: "2", cantidad: 30, semilla: 5 });
ok(deLa2.length === 30 && deLa2.every((e) => porId[e.item_id].prueba === 2), "pedir la prueba 2 trajo posiciones de otra");

/* ---------- la versión accesible ---------- */
const acc = path.join(RAIZ, "material/ponte-a-prueba/ponte-a-prueba-accesible.html");
if (fs.existsSync(acc)) {
  const html = fs.readFileSync(acc, "utf8");
  const faltan = ITEMS.filter((i) => !html.includes(i.fen));
  ok(!faltan.length, `la versión accesible no tiene ${faltan.length} posiciones: hay que volver a correr libro-examen-pdf.js`);
  ok(!/<img|<svg/.test(html), "la versión accesible trae imágenes");
} else {
  fallos.push("falta material/ponte-a-prueba/ponte-a-prueba-accesible.html");
}
ok(fs.existsSync(path.join(RAIZ, "material/ponte-a-prueba/ponte-a-prueba.pdf")), "falta el PDF del libro");

if (fallos.length) {
  console.error("✗ Libro «Ponte a prueba»:\n  - " + fallos.join("\n  - "));
  process.exit(1);
}
console.log(`✓ Libro «Ponte a prueba»: ${ITEMS.length} posiciones en ${LIBRO.PRUEBAS} pruebas, ${revisadas} preguntas de examen con la clave bien.`);
