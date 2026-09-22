/* ===== Verificador del banco del Evaluador de precisión posicional =====
 *
 * No es un banco de táctica, así que no hay una "solución" que un motor
 * pueda confirmar como sí la hay en el diagnóstico o en 4×4. Lo único que SÍ
 * se puede comprobar con chess.js, y es justo lo que sostiene la premisa de
 * todo el entrenamiento —"acá no hay táctica inmediata, hay que pensar el
 * plan"—, es que NINGUNA jugada legal de la posición dé jaque mate de
 * inmediato. Si una posición tuviera un mate en una jugada, "elegir el plan a
 * largo plazo" dejaría de tener sentido: lo correcto sería dar el mate.
 *
 * Además comprueba, igual que el examen de arbitraje y el diagnóstico de
 * nivel:
 *
 *   - ids repetidos, áreas desconocidas, dificultad fuera de 1-3;
 *   - la FEN carga, es legal, y el turno declarado coincide con el de la FEN;
 *   - la posición no está ya en jaque (eso también delataría una urgencia
 *     táctica, no un plan a repensar con calma);
 *   - cuatro opciones, sin vacíos ni repetidas, con una respuesta correcta
 *     que apunta a una de ellas;
 *   - que ninguna opción se delate por el largo: la correcta no puede ser
 *     mucho más extensa que las demás, o se acierta sin saber ajedrez;
 *   - que `explica` y `fuente` estén escritos, y que `fuente` diga con todas
 *     las letras que la posición es ilustrativa —nunca atribuida a una
 *     partida real sin haberla verificado, que es justo el error que este
 *     repositorio ya cometió una vez con una «Lucena» que no era Lucena—;
 *   - que las ocho áreas del criterio (js/precision-posicional-criterio.js)
 *     tengan al menos una posición cada una, y al revés: que el banco no
 *     sortee ninguna área que el criterio no describa.
 *
 * No necesita navegador ni red (chess.js no es parte del sitio, se instala
 * aparte):
 *
 *     npm install chess.js@0.10.3
 *     node herramientas/verificar-precision-posicional.js
 *
 * Sale con código 1 si algo falla, así que sirve igual desde un hook.
 */
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");

let Chess;
try {
  ({ Chess } = require("chess.js"));
} catch (e) {
  console.error("Falta chess.js: npm install chess.js@0.10.3 (o NODE_PATH a donde esté).");
  process.exit(2);
}

global.window = {};
eval(fs.readFileSync(path.join(RAIZ, "js/precision-posicional-items.js"), "utf8"));
eval(fs.readFileSync(path.join(RAIZ, "js/precision-posicional-criterio.js"), "utf8"));
const ITEMS = global.window.PRECISION_POSICIONAL_ITEMS;
const PRUEBA = global.window.PrecisionPosicionalPrueba;
const CRITERIO = global.window.PrecisionPosicionalCriterio;

const fallos = [];
const mal = (id, msg) => fallos.push(`${id}: ${msg}`);

const areasValidas = CRITERIO.AREAS.map((a) => a.id);
const vistos = {};

ITEMS.forEach((it, n) => {
  const id = it.id || `(ítem ${n + 1} sin id)`;
  if (!it.id) fallos.push(`${id}: no tiene id`);
  else if (vistos[it.id]) mal(id, "id repetido");
  else vistos[it.id] = true;

  if (areasValidas.indexOf(it.area) === -1) mal(id, `área desconocida: ${it.area}`);
  if ([1, 2, 3].indexOf(it.dificultad) === -1) mal(id, `dificultad fuera de 1-3: ${it.dificultad}`);
  if (!it.enunciado || !it.enunciado.trim()) mal(id, "no tiene enunciado");
  if (!it.explica || !it.explica.trim()) mal(id, "no explica la respuesta");
  if (!it.fuente || !it.fuente.trim()) {
    mal(id, "no tiene `fuente`");
  } else if (!/^Posición ilustrativa/.test(it.fuente)) {
    mal(id, `\`fuente\` no dice que la posición es ilustrativa (no se atribuye a ninguna partida real): "${it.fuente}"`);
  }

  /* ---------- la posición ---------- */
  const chess = new Chess();
  const cargo = chess.load(it.fen);
  if (!cargo) {
    mal(id, `FEN ilegal: ${it.fen}`);
  } else {
    const turnoEsperado = it.turno === "blancas" ? "w" : it.turno === "negras" ? "b" : null;
    if (!turnoEsperado) mal(id, `\`turno\` no es "blancas" ni "negras": ${it.turno}`);
    else if (chess.turn() !== turnoEsperado) mal(id, `\`turno\` dice ${it.turno} pero la FEN tiene mover a ${chess.turn() === "w" ? "las blancas" : "las negras"}`);
    if (chess.in_check()) mal(id, "la posición ya está en jaque: eso es urgencia táctica, no un plan para pensar con calma");

    /* Ninguna jugada legal puede dar jaque mate: si la hubiera, "elegir el
       plan correcto" dejaría de ser la pregunta — la jugada correcta sería
       dar el mate. */
    chess.moves({ verbose: true }).forEach((m) => {
      const c2 = new Chess(it.fen);
      c2.move(m.san);
      if (c2.in_checkmate()) mal(id, `tiene un mate en una jugada disponible (${m.san}): contradice la premisa de "sin táctica inmediata"`);
    });
  }

  /* ---------- las opciones ---------- */
  const ops = it.opciones || [];
  if (ops.length !== 4) mal(id, `tiene ${ops.length} opciones y deberían ser 4`);
  if (typeof it.correcta !== "number" || it.correcta < 0 || it.correcta >= ops.length) {
    mal(id, "`correcta` no apunta a ninguna opción");
  }
  const limpias = ops.map((o) => String(o).trim().toLowerCase());
  limpias.forEach((o, k) => {
    if (!o) mal(id, `la opción ${k + 1} está vacía`);
    if (limpias.indexOf(o) !== k) mal(id, `la opción ${k + 1} repite otra`);
  });

  /* Ninguna opción puede delatarse por el largo (la misma regla que el
     diagnóstico y el examen de arbitraje, con un margen algo más ancho: acá
     las cuatro opciones son planes reales escritos a mano, no una frase corta
     de tablero — una diferencia de unos pocos caracteres entre "empujar el
     peón" y "reubicar el caballo hacia c5" no delata nada). */
  if (ops.length === 4 && typeof it.correcta === "number" && ops[it.correcta]) {
    const largos = ops.map((o) => String(o).length);
    const otrasMasLarga = Math.max.apply(null, largos.filter((_, k) => k !== it.correcta));
    const ventaja = largos[it.correcta] - otrasMasLarga;
    if (ventaja >= 12) mal(id, `la respuesta correcta es ${ventaja} caracteres más larga que cualquier otra: se puede acertar por el largo`);
  }
});

/* ---------- que cada área del criterio tenga con qué, y al revés ---------- */
areasValidas.forEach((area) => {
  const hay = ITEMS.filter((i) => i.area === area).length;
  if (!hay) fallos.push(`el criterio describe el área "${area}" y el banco no tiene ni una posición de ella`);
});
const areasDelBanco = new Set(ITEMS.map((i) => i.area));
areasDelBanco.forEach((area) => {
  if (areasValidas.indexOf(area) === -1) fallos.push(`hay posiciones del área "${area}", que el criterio no describe`);
});

/* ---------- que armar() sirva de verdad ---------- */
const completa = PRUEBA.armar();
if (completa.length !== ITEMS.length) fallos.push(`armar() sin argumentos debería devolver el banco entero (${ITEMS.length}) y devolvió ${completa.length}`);
const corta = PRUEBA.armar(1);
if (corta.length !== areasValidas.length) fallos.push(`armar(1) debería devolver una posición por área (${areasValidas.length}) y devolvió ${corta.length}`);
const idsCorta = new Set(corta.map((i) => i.area));
if (idsCorta.size !== areasValidas.length) fallos.push("armar(1) no trajo las ocho áreas");

/* ---------- resultado ---------- */
const porArea = {};
ITEMS.forEach((i) => { porArea[i.area] = (porArea[i.area] || 0) + 1; });
console.log(`Banco: ${ITEMS.length} posiciones · ${JSON.stringify(porArea)}`);
if (fallos.length) {
  console.log(`\n${fallos.length} problemas:\n- ` + fallos.join("\n- "));
  process.exit(1);
}
console.log("\nTodo en orden.");
