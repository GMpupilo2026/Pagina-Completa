/* ===== Verificador del banco de preguntas del examen de arbitraje =====
 *
 * Comprueba lo que una pregunta no puede tener mal sin que el examen deje de
 * medir el conocimiento del reglamento:
 *
 *   - ids repetidos (el sorteo los trataría como dos preguntas distintas);
 *   - áreas y escalones (`peso` 1 a 5) fuera de los que el examen conoce;
 *   - preguntas sin cuatro opciones, sin respuesta correcta o con opciones
 *     repetidas;
 *   - preguntas sin `fuente`: un árbitro no discute de memoria, cita el
 *     artículo, así que cada respuesta tiene que decir de dónde sale;
 *   - el largo de las opciones: si la correcta es siempre la más larga, se
 *     acierta sin saber el reglamento (pasó en el diagnóstico de jugadores);
 *   - que el banco alcance para la cuota de ArbitrajePrueba.FORMA en todas las
 *     áreas y todos los escalones, y que el examen salga con sus 40 preguntas
 *     y sus 120 puntos.
 *
 * No necesita nada instalado:
 *
 *     node herramientas/verificar-arbitraje.js
 *
 * Sale con código 1 si algo falla, así que sirve igual desde un hook.
 */
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");

global.window = {};
eval(fs.readFileSync(path.join(RAIZ, "js/arbitraje-items.js"), "utf8"));
eval(fs.readFileSync(path.join(RAIZ, "js/arbitraje-nivel.js"), "utf8"));
const ITEMS = global.window.ARBITRAJE_ITEMS;
const PRUEBA = global.window.ArbitrajePrueba;
const NIVEL = global.window.ArbitrajeNivel;

const fallos = [];
const mal = (id, msg) => fallos.push(`${id}: ${msg}`);

/* ---------- forma de cada pregunta ---------- */
const vistos = {};
const areasValidas = NIVEL.AREAS.map((a) => a.id);

ITEMS.forEach((i, n) => {
  const id = i.id || `(pregunta ${n + 1} sin id)`;
  if (!i.id) fallos.push(`${id}: no tiene id`);
  else if (vistos[i.id]) mal(id, "id repetido");
  else vistos[i.id] = true;

  if (areasValidas.indexOf(i.area) === -1) mal(id, `área desconocida: ${i.area}`);
  if (PRUEBA.PESOS.indexOf(i.peso) === -1) mal(id, `escalón fuera de 1-5: ${i.peso}`);
  if (!i.enunciado || !i.enunciado.trim()) mal(id, "no tiene enunciado");
  if (!i.explica || !i.explica.trim()) mal(id, "no explica la respuesta");
  if (!i.fuente || !i.fuente.trim()) mal(id, "no cita el artículo del Handbook en `fuente`");

  const ops = i.opciones || [];
  if (ops.length !== 4) mal(id, `tiene ${ops.length} opciones y deberían ser 4`);
  if (typeof i.correcta !== "number" || i.correcta < 0 || i.correcta >= ops.length) {
    mal(id, "la respuesta correcta no apunta a ninguna opción");
  }
  const limpias = ops.map((o) => String(o).trim().toLowerCase());
  limpias.forEach((o, k) => {
    if (!o) mal(id, `la opción ${k + 1} está vacía`);
    if (limpias.indexOf(o) !== k) mal(id, `la opción ${k + 1} repite otra`);
  });

  /* Ninguna opción puede delatarse por el largo. */
  if (ops.length === 4 && typeof i.correcta === "number" && ops[i.correcta]) {
    const largos = ops.map((o) => String(o).length);
    const falsaMasLarga = Math.max.apply(null, largos.filter((_, k) => k !== i.correcta));
    const ventaja = largos[i.correcta] - falsaMasLarga;
    if (ventaja >= 3) mal(id, `la respuesta correcta es ${ventaja} caracteres más larga que cualquier otra: se acierta por el largo`);
  }
});

/* ---------- que el banco alcance para armar el examen ---------- */
PRUEBA.AREAS.forEach((area) => {
  PRUEBA.PESOS.forEach((peso) => {
    const hay = ITEMS.filter((i) => i.area === area && i.peso === peso).length;
    const falta = PRUEBA.FORMA[peso];
    if (hay < falta) fallos.push(`${area}: hacen falta ${falta} preguntas de escalón ${peso} y hay ${hay}`);
  });
});
PRUEBA.AREAS.forEach((area) => {
  if (areasValidas.indexOf(area) === -1) fallos.push(`el examen sortea un área que el criterio no conoce: ${area}`);
});
NIVEL.AREAS.forEach((a) => {
  if (PRUEBA.AREAS.indexOf(a.id) === -1) fallos.push(`el criterio describe un área que el examen nunca sortea: ${a.id}`);
});

const examen = PRUEBA.armar([], 1);
if (examen.length !== PRUEBA.TOTAL) fallos.push(`el examen salió con ${examen.length} preguntas y deberían ser ${PRUEBA.TOTAL}`);
const puntos = examen.reduce((s, i) => s + i.peso, 0);
if (puntos !== PRUEBA.PUNTOS) fallos.push(`el examen vale ${puntos} puntos y deberían ser ${PRUEBA.PUNTOS}`);

/* Dos exámenes seguidos tienen que traer preguntas distintas: si el banco
 * fuera del tamaño justo, el sorteo sería siempre el mismo examen. */
const a = PRUEBA.armar([], 1).map((i) => i.id).join(",");
const b = PRUEBA.armar([], 2).map((i) => i.id).join(",");
if (a === b) fallos.push("dos exámenes con semillas distintas traen exactamente las mismas preguntas");

/* ---------- resultado ---------- */
const porArea = {};
ITEMS.forEach((i) => { porArea[i.area] = (porArea[i.area] || 0) + 1; });
console.log(`Banco: ${ITEMS.length} preguntas · ${JSON.stringify(porArea)}`);
console.log(`Examen: ${PRUEBA.TOTAL} preguntas, ${PRUEBA.PUNTOS} puntos`);
if (fallos.length) {
  console.log(`\n${fallos.length} problemas:\n- ` + fallos.join("\n- "));
  process.exit(1);
}
console.log("\nTodo en orden.");
