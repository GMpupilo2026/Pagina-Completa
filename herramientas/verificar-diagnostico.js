/* ===== Verificador del banco de ítems del diagnóstico =====
 *
 * Comprueba lo que un ítem no puede tener mal sin que la prueba deje de medir:
 *
 *   - ids repetidos (el sorteo los trataría como dos preguntas distintas);
 *   - posiciones ilegales o soluciones que no son jugadas legales;
 *   - los mates en dos y en tres: que el mate sea forzado, en esa cantidad
 *     exacta de jugadas, y que la jugada marcada sea la única que lo consigue;
 *   - el largo de las opciones: si la respuesta correcta es siempre la más
 *     larga, se acierta la mitad de la prueba sin saber ajedrez (pasó: lo era
 *     en 91 de 96 ítems);
 *   - que el banco alcance para la cuota de DiagnosticoPrueba.FORMA en todas
 *     las áreas y todos los escalones de dificultad;
 *   - que cada ítem tenga su dificultad en puntos (`elo`) y que su escalón
 *     (`peso`) sea el que le toca a esa dificultad: el nivel se calcula con
 *     `elo`, y un `peso` desalineado armaría pruebas con otra forma;
 *   - las preguntas de opción cuyas opciones son jugadas: en las de
 *     `legalidad` (¿cuál es legal?), que la marcada sea la ÚNICA legal; en las
 *     de `ahogado` (¿cuál NO ahoga?), que las cuatro sean legales y solo la
 *     marcada no ahogue; en las
 *     de Lichess, que las cuatro sean jugadas legales de la posición.
 *
 * Cómo se corre (chess.js no es parte del sitio, se instala aparte):
 *
 *     npm install chess.js@0.10.3
 *     node herramientas/verificar-diagnostico.js
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
eval(fs.readFileSync(path.join(RAIZ, "js/plan-entrenamiento.js"), "utf8"));
eval(fs.readFileSync(path.join(RAIZ, "js/diagnostico-items.js"), "utf8"));
const PE = global.window.PlanEntrenamiento;
const ITEMS = global.window.DIAGNOSTICO_ITEMS;
const PRUEBA = global.window.DiagnosticoPrueba;

const fallos = [];
const mal = (id, msg) => fallos.push(`${id}: ${msg}`);

/* ---------- posiciones ---------- */
function posicionLegal(fen) {
  const g = new Chess();
  if (!g.load(fen)) return "la FEN no carga";
  const partes = fen.split(" ");
  partes[1] = partes[1] === "w" ? "b" : "w";
  const alReves = new Chess();
  if (alReves.load(partes.join(" ")) && alReves.in_check()) return "el bando que no mueve está en jaque";
  return null;
}

/* ---------- mates forzados ---------- */
function fuerzaMate(pos, restantes) {
  if (pos.in_checkmate()) return true;
  if (restantes <= 0) return false;
  const respuestas = pos.moves({ verbose: true });
  if (!respuestas.length) return false;              // ahogado: no sirve
  return respuestas.every((r) => {
    const t = new Chess(pos.fen());
    t.move(r);
    return t.moves({ verbose: true }).some((m) => {
      const u = new Chess(t.fen());
      u.move(m);
      return fuerzaMate(u, restantes - 1);
    });
  });
}
function clavesMate(fen, n) {
  const g = new Chess(fen);
  return g.moves({ verbose: true }).filter((m) => {
    const t = new Chess(fen);
    t.move(m);
    return fuerzaMate(t, n - 1);
  });
}
const CUANTAS = { una: 1, dos: 2, tres: 3 };
function mateProm(enunciado) {
  const m = /mate en (una|dos|tres)/i.exec(enunciado || "");
  return m ? CUANTAS[m[1].toLowerCase()] : null;
}

/* Las opciones van en notación castellana (R, D, T, A, C); chess.js la quiere en inglés. */
const LETRA = { R: "K", D: "Q", T: "R", A: "B", C: "N" };
function sanIngles(s) {
  return s.replace(/^[RDTAC]/, (c) => LETRA[c]).replace(/=([DTAC])/, (_, c) => "=" + LETRA[c]);
}

/* ---------- recorrido ---------- */
const vistos = {};
ITEMS.forEach((i) => {
  if (vistos[i.id]) mal(i.id, "id repetido");
  vistos[i.id] = true;

  if (i.fen) {
    const problema = posicionLegal(i.fen);
    if (problema) mal(i.id, problema);
  }

  if (i.tipo === "jugada") {
    const g = new Chess(i.fen);
    if (!g.move(Object.assign({ promotion: "q" }, i.solucion))) mal(i.id, "la jugada solución no es legal");
    (i.alternas || []).forEach((a) => {
      const t = new Chess(i.fen);
      if (!t.move(Object.assign({ promotion: "q" }, a))) mal(i.id, `la alterna ${a.from}-${a.to} no es legal`);
    });

    const n = mateProm(i.enunciado);
    if (n && n > 1) {
      for (let antes = 1; antes < n; antes++) {
        if (clavesMate(i.fen, antes).length) mal(i.id, `promete mate en ${n} pero ya hay mate en ${antes}`);
      }
      const claves = clavesMate(i.fen, n);
      const esperadas = [i.solucion].concat(i.alternas || []).map((s) => s.from + s.to).sort().join(",");
      const halladas = claves.map((m) => m.from + m.to).sort().join(",");
      if (halladas !== esperadas) mal(i.id, `fuerzan mate en ${n}: ${halladas || "ninguna"} (el ítem dice ${esperadas})`);
    }
  }

  if (typeof i.elo !== "number") mal(i.id, "le falta la dificultad en puntos (`elo`)");
  else if (PE.escalonDeElo(i.elo) !== i.peso) mal(i.id, `con elo ${i.elo} le toca el escalón ${PE.escalonDeElo(i.elo)} y dice ${i.peso}`);

  if (i.tipo === "opcion_tablero" && i.ahogado) {
    (i.opciones || []).forEach((o, n) => {
      const g = new Chess(i.fen);
      if (!g.move(sanIngles(o))) return mal(i.id, `«${o}» no es legal`);
      if (g.in_stalemate() === (n === i.correcta)) mal(i.id, `«${o}» ${n === i.correcta ? "ahoga y es la marcada" : "no ahoga y no es la marcada"}`);
    });
  }

  if (i.tipo === "opcion_tablero" && (i.legalidad || i.lichess)) {
    const legal = (i.opciones || []).map((o) => !!new Chess(i.fen).move(sanIngles(o)));
    if (i.legalidad) {
      legal.forEach((l, n) => { if (l !== (n === i.correcta)) mal(i.id, `«${i.opciones[n]}» ${l ? "es legal y no es la marcada" : "no es legal y es la marcada"}`); });
    } else {
      legal.forEach((l, n) => { if (!l) mal(i.id, `la opción «${i.opciones[n]}» no es una jugada legal`); });
    }
  }

  if (i.tipo === "opcion" || i.tipo === "opcion_tablero") {
    if (!Array.isArray(i.opciones) || i.opciones.length < 3) mal(i.id, "faltan opciones");
    else if (typeof i.correcta !== "number" || !i.opciones[i.correcta]) mal(i.id, "`correcta` fuera de rango");
    else {
      const largos = i.opciones.map((o) => o.length);
      const falsaMasLarga = Math.max.apply(null, largos.filter((_, n) => n !== i.correcta));
      const ventaja = largos[i.correcta] - falsaMasLarga;
      if (ventaja >= 3) mal(i.id, `la respuesta correcta es ${ventaja} caracteres más larga que cualquier otra: se acierta por el largo`);
    }
  }
});

/* ---------- que el banco alcance para armar la prueba ---------- */
PRUEBA.AREAS.forEach((area) => {
  [1, 2, 3, 4, 5].forEach((peso) => {
    const hay = ITEMS.filter((i) => i.area === area && i.peso === peso).length;
    const falta = PRUEBA.cuota(area, peso);
    if (hay < falta) fallos.push(`${area}: hacen falta ${falta} ítems de peso ${peso} y hay ${hay}`);
  });
});
const prueba = PRUEBA.armar([], 1);
if (prueba.length !== PRUEBA.TOTAL) fallos.push(`la prueba salió con ${prueba.length} ítems y deberían ser ${PRUEBA.TOTAL}`);
const puntos = prueba.reduce((s, i) => s + i.peso, 0);
if (puntos !== PRUEBA.PUNTOS) fallos.push(`la prueba vale ${puntos} puntos y deberían ser ${PRUEBA.PUNTOS}`);

/* ---------- resultado ---------- */
const porArea = {};
ITEMS.forEach((i) => { porArea[i.area] = (porArea[i.area] || 0) + 1; });
console.log(`Banco: ${ITEMS.length} ítems · ${JSON.stringify(porArea)}`);
console.log(`Prueba: ${PRUEBA.TOTAL} ítems, ${PRUEBA.PUNTOS} puntos`);
if (fallos.length) {
  console.log(`\n${fallos.length} problemas:\n- ` + fallos.join("\n- "));
  process.exit(1);
}
console.log("\nTodo en orden.");
