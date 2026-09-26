/* ===== Ítems de tablero del diagnóstico, sacados de la base de Lichess =====
 *
 * Arma los ítems de "resolver en el diagrama" del diagnóstico a partir de la
 * base abierta de ejercicios de Lichess (licencia CC0), que el profesor tiene
 * importada en la tabla "Ejercicios Lichess" de Supabase. Esa base es la que
 * resuelve el problema de medir: cada ejercicio trae un rating medido con
 * cientos de miles de intentos reales, así que la dificultad de la pregunta no
 * la pone nadie a ojo.
 *
 * Ninguna posición se inventa y ninguna se cree a ciegas: cada candidata pasa
 * por Stockfish y solo entra si
 *   - la jugada de la solución es la mejor del motor, y
 *   - es la ÚNICA buena: si gana, la segunda mejor no gana (≤ +1,5); si salva,
 *     la segunda pierde por 2,5 peones o más. Si no, la pregunta tendría dos
 *     respuestas correctas y el ítem mediría suerte.
 *
 * Cada posición sale de dos maneras posibles:
 *   - "jugada": se contesta moviendo en el tablero (sin opciones que ayuden:
 *     no se puede acertar por descarte);
 *   - "opcion_tablero": cuatro jugadas escritas, una sola buena. Las otras
 *     tres NO son de relleno: son las que tientan —jaques, capturas, la misma
 *     pieza que la solución, la segunda idea del motor— y cada una falla por
 *     algo concreto que el motor encuentra y que la explicación cuenta
 *     («tras Dxh7+?, …Rxh7 y se pierde la dama»).
 *
 * La dificultad (`elo`, en la misma escala que el Elo) sale del rating de
 * Lichess: rating − 400 para los de mover y − 550 para los de opción (ver con
 * cuatro jugadas escritas es más fácil que encontrar la jugada entre todas).
 * Es un punto de partida: herramientas/diagnostico-calibrar.js lo corrige con
 * las respuestas reales en cuanto hay diagnósticos rendidos.
 *
 * Cómo se corre (se necesita Stockfish instalado y los candidatos exportados):
 *
 *   1. Exportar candidatos desde Supabase con la consulta de CONSULTA (abajo)
 *      a un JSON: [[area, banda, id, fen, moves, rating, themes], …]
 *   2. STOCKFISH=/usr/games/stockfish node herramientas/diagnostico-lichess.js candidatos.json
 *
 * El análisis del motor se guarda en un caché (herramientas/.cache-lichess.json,
 * fuera del repositorio) para no repetirlo; la salida reemplaza el bloque entre
 * las marcas LICHESS-INICIO / LICHESS-FIN de js/diagnostico-items.js. Ese bloque
 * NO se edita a mano: se vuelve a correr este script.
 *
 * CONSULTA (una por grupo de áreas; el filtro de calidad es el mismo):
 *   select "PuzzleId", "FEN", "Moves", "Rating", "Themes" from "Ejercicios Lichess"
 *   where split_part("FEN",' ',2)='b'          -- tras la jugada del rival, juegan las blancas
 *     and "Popularity">=85 and "NbPlays">=1500 and "RatingDeviation"<=80
 *   … y el tema de cada área (TEMAS_AREA en este archivo), ordenado por md5(id).
 */
const fs = require("fs");
const path = require("path");
const { Motor: MotorUci } = require("./lib/motor-uci");
const { Chess } = require("chess.js");

const RAIZ = path.join(__dirname, "..");
const BANCO = path.join(RAIZ, "js/diagnostico-items.js");
const CACHE = path.join(__dirname, ".cache-lichess.json");
const MOTOR = process.env.STOCKFISH || "/usr/games/stockfish";
const PROFUNDIDAD = 18;

/* Cuántos ítems nuevos por área y escalón, y cuántos de ellos van como opción.
   El diagnóstico pide como mucho 3 de un mismo casillero: con 6 hay variedad
   para que repetir la prueba no repita las preguntas. Del más difícil se
   toman más, porque es el que menos ítems viejos tiene y el que más pide la
   prueba. */
const POR_CASILLERO = { 1: 6, 2: 6, 3: 6, 4: 6, 5: 10 };
const DE_OPCION = 2;

/* Dificultad en escala Elo a partir del rating de Lichess. */
const DESCUENTO = { jugada: 400, opcion_tablero: 550 };
/* Escalones: los mismos cortes que usa DiagnosticoPrueba (ESCALON_ELO). */
function escalon(elo) {
  return elo < 1100 ? 1 : elo < 1400 ? 2 : elo < 1700 ? 3 : elo < 2000 ? 4 : 5;
}

const PREFIJO = { reglas: "reg", material: "mat", apertura: "ap", tactica: "tac", mate: "mate", finales: "fin", estrategia: "est", calculo: "cal", maestria: "mae" };

/* ---------- motor: herramientas/lib/motor-uci.js ---------- */

/* ---------- notación en castellano ---------- */
const LETRA = { K: "R", Q: "D", R: "T", B: "A", N: "C" };
function sanEs(san) {
  return san.replace(/^[KQRBN]/, (c) => LETRA[c]).replace(/=([QRBN])/, (_, c) => "=" + LETRA[c]);
}
function uciAMov(uci) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined };
}
function jugar(fen, uci) {
  const g = new Chess(fen);
  const m = g.move(uciAMov(uci));
  return m ? { fen: g.fen(), san: m.san, mov: m } : null;
}
function lineaEs(fen, ucis, max) {
  const g = new Chess(fen);
  let num = +fen.split(" ")[5];
  const partes = [];
  for (let i = 0; i < Math.min(ucis.length, max); i++) {
    const blancas = g.turn() === "w";
    const m = g.move(uciAMov(ucis[i]));
    if (!m) break;
    if (blancas) partes.push(`${num}.${sanEs(m.san)}`);
    else { partes.push(i === 0 ? `${num}…${sanEs(m.san)}` : sanEs(m.san)); num += 1; }
  }
  return partes.join(" ");
}
function valor(v) {
  if (v >= 90000) return `mate en ${100000 - v}`;
  if (v <= -90000) return `recibe mate en ${100000 + v}`;
  const p = (v / 100).toFixed(1).replace(".", ",");
  return v > 0 ? `+${p}` : p;
}

/* ---------- por qué gana: el motivo según los temas de Lichess ---------- */
const MOTIVOS = [
  ["smotheredMate", "Es un mate de la coz: el rey queda encerrado por sus propias piezas."],
  ["backRankMate", "El golpe va a la última fila, donde el rey no tiene salida."],
  ["doubleCheck", "Es un jaque doble: el rey tiene que moverse y no alcanza a tapar nada."],
  ["discoveredAttack", "Es un ataque a la descubierta: al moverse una pieza, se destapa otra."],
  ["fork", "Es una horquilla: una pieza ataca dos objetivos a la vez."],
  ["skewer", "Es una enfilada: la pieza de adelante se va y cae la de atrás."],
  ["pin", "Todo gira en torno a una clavada: la pieza clavada no puede defender."],
  ["deflection", "Es una desviación: se aleja al defensor de lo que defendía."],
  ["attraction", "Es una atracción: se arrastra a una pieza (a menudo el rey) a una casilla fatal."],
  ["interference", "Es una interferencia: una pieza se mete entre la defensora y lo que defiende."],
  ["clearance", "Es un despeje: la pieza se aparta para abrirle la línea o la casilla a otra."],
  ["xRayAttack", "Hay un rayo X: la pieza actúa a través de otra que está en medio."],
  ["intermezzo", "Hay una jugada intermedia: antes de lo obvio, algo más fuerte."],
  ["capturingDefender", "Se captura al defensor y lo que defendía queda colgado."],
  ["trappedPiece", "Una pieza rival queda atrapada, sin casilla adonde ir."],
  ["hangingPiece", "Hay algo sin defender, y hay que verlo antes que el rival."],
  ["zugzwang", "Es un zugzwang: al rival le toca mover y cualquier jugada lo empeora."],
  ["quietMove", "La clave es una jugada tranquila: sin jaque ni captura, pero sin defensa."],
  ["defensiveMove", "Es una jugada defensiva precisa: la única que sostiene la posición."],
  ["advancedPawn", "El peón avanzado decide: hay que empujarlo o aprovecharlo a tiempo."],
  ["promotion", "Todo pasa por la coronación."],
  ["sacrifice", "Hay un sacrificio: se entrega material para ganar más."],
  ["mateIn2", "Es mate en dos: la primera jugada no deja defensa."],
  ["mateIn3", "Fuerza el mate: la primera jugada no deja defensa."],
];
function motivo(temas) {
  const t = temas.split(" ");
  const m = MOTIVOS.find(([k]) => t.includes(k));
  return m ? m[1] : "";
}

/* ---------- análisis de una candidata ---------- */
async function analizar(motor, c) {
  const [area, , id, fenInicial, moves, rating, temas] = c;
  const ucis = moves.split(" ");
  const previa = jugar(fenInicial, ucis[0]);
  if (!previa) return { id, descarte: "la jugada del rival no es legal" };
  const fen = previa.fen;
  const sol = ucis[1];
  if (sol[4] && sol[4] !== "q") return { id, descarte: "coronación que no es dama" };
  const top = await motor.analizar(fen, 3, PROFUNDIDAD);
  if (!top.length) return { id, descarte: "sin análisis" };
  if (top[0].uci !== sol) return { id, descarte: `el motor prefiere ${top[0].uci}` };
  const v1 = top[0].score;
  const v2 = top.length > 1 ? top[1].score : -100000;
  const gana = v1 >= 300;
  const esMate = top[0].mate !== null && top[0].mate > 0;
  const mate2 = top[1] && top[1].mate !== null && top[1].mate > 0 ? top[1].mate : null;
  if (esMate) {
    /* «Mate en dos» admite que otra jugada dé mate en tres; «fuerza el mate»
       no admite ninguna otra que dé mate. */
    if (top[0].mate === 2 ? mate2 !== null && mate2 <= 2 : mate2 !== null) return { id, descarte: "otra jugada también da mate" };
  } else {
    if (!gana && v1 < -100) return { id, descarte: "la solución no salva" };
    if (gana && v2 > 150) return { id, descarte: `la segunda también gana (${valor(v2)})` };
    if (!gana && v2 > v1 - 250) return { id, descarte: "la segunda también salva" };
  }

  /* Distractores: las jugadas que un jugador de verdad consideraría. */
  const g = new Chess(fen);
  const legales = g.moves({ verbose: true });
  const solMov = legales.find((m) => m.from + m.to + (m.promotion || "") === sol);
  const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const tentacion = (m) => {
    let t = 0;
    if (m.san.includes("+")) t += 4;
    if (m.captured) t += 2 + VAL[m.captured];
    if (m.piece === solMov.piece) t += 2;
    if (m.to === solMov.to) t += 3;
    if (m.from === solMov.from) t += 1;
    if (m.promotion) t += 3;
    return t;
  };
  const ordenadas = legales
    .filter((m) => m.from + m.to + (m.promotion || "") !== sol && (!m.promotion || m.promotion === "q"))
    .map((m) => ({ m, t: tentacion(m) }))
    .sort((a, b) => b.t - a.t);
  const aProbar = [];
  top.slice(1).forEach((x) => { const m = legales.find((l) => l.from + l.to + (l.promotion || "") === x.uci); if (m) aProbar.push(m); });
  ordenadas.forEach(({ m }) => { if (aProbar.length < 9 && !aProbar.includes(m)) aProbar.push(m); });
  const distractores = [];
  for (const m of aProbar) {
    const uci = m.from + m.to + (m.promotion || "");
    const [r] = await motor.analizar(fen, 1, 14, [uci]);
    if (!r) continue;
    const ok = esMate ? !(r.mate !== null && r.mate > 0) :
      gana ? r.score <= 150 : r.score <= v1 - 250;
    if (!ok) continue;
    distractores.push({ uci, san: m.san, score: r.score, refuta: r.pv.slice(1, 4), t: tentacion(m) });
  }
  return {
    id, area, rating, temas, fen, ultima: previa.san, sol, solSan: solMov.san, linea: ucis.slice(1),
    v1, v2, segunda: top[1] ? top[1].uci : null, gana, esMate, mateEn: esMate ? top[0].mate : null,
    distractores,
  };
}

/* ---------- el ítem ---------- */
function efecto(score, esMate) {
  if (score <= -90000) return "y las blancas reciben mate";
  if (esMate && score >= 150) return "y el mate ya no existe";
  if (score <= -150) return "y las negras quedan mejor";
  if (score < 150) return "y la ventaja se esfuma";
  return "y se gana mucho menos";
}
function refutacion(fen, d, esMate) {
  const tras = jugar(fen, d.uci);
  const linea = lineaEs(tras.fen, d.refuta, 1);
  return `${sanEs(d.san)}? se contesta con ${linea} ${efecto(d.score, esMate)}`;
}
function pedido(a, tipo) {
  if (a.esMate && a.mateEn === 2) {
    return tipo === "jugada"
      ? "Juegan las blancas y dan mate en dos. ¿Cuál es la primera jugada? (Se responde con una sola jugada.)"
      : "Juegan las blancas. ¿Cuál de estas jugadas fuerza el mate en dos?";
  }
  if (a.esMate) {
    return tipo === "jugada"
      ? "Juegan las blancas y fuerzan el mate. ¿Cuál es la primera jugada? (Se responde con una sola jugada.)"
      : "Juegan las blancas. ¿Cuál de estas jugadas fuerza el mate?";
  }
  if (a.gana) {
    return tipo === "jugada"
      ? "Juegan las blancas. Encuentra la jugada que gana (se responde con una sola jugada)."
      : "Juegan las blancas. Solo una de estas jugadas gana: ¿cuál?";
  }
  return tipo === "jugada"
    ? "Juegan las blancas y están en apuros: encuentra la única jugada que no pierde."
    : "Juegan las blancas y están en apuros. Solo una de estas jugadas salva la partida: ¿cuál?";
}
function comoItem(a, tipo, n) {
  const elo = a.rating - DESCUENTO[tipo];
  const peso = escalon(elo);
  const enunciado = `Las negras acaban de jugar …${sanEs(a.ultima)}. ${pedido(a, tipo)}`;
  const linea = lineaEs(a.fen, a.linea, 5);
  const porque = motivo(a.temas);
  const prueba = `Ejercicio ${a.id} de la base abierta de Lichess (CC0), rating ${a.rating}. `
    + `Stockfish 16 a profundidad ${PROFUNDIDAD}: ${sanEs(a.solSan)} es la mejor (${valor(a.v1)}) y la segunda queda en ${valor(a.v2)}`;
  const base = {
    id: `${PREFIJO[a.area]}_lx_${a.id}${tipo === "opcion_tablero" ? "_op" : ""}`,
    area: a.area, peso, elo, eloBase: elo, tipo, lichess: a.id, rating: a.rating,
    enunciado, fen: a.fen,
  };
  if (tipo === "jugada") {
    const m = uciAMov(a.sol);
    return Object.assign(base, {
      solucion: m.promotion ? { from: m.from, to: m.to, promotion: m.promotion } : { from: m.from, to: m.to },
      explica: `${porque} La línea: ${linea}.`.trim(),
      prueba: prueba + ".",
    });
  }
  const tres = a.distractores.slice(0, 3);
  const opciones = [sanEs(a.solSan)].concat(tres.map((d) => sanEs(d.san)));
  return Object.assign(base, {
    opciones, correcta: 0,
    explica: `${porque} La línea: ${linea}. Las otras tientan, pero fallan: ${tres.map((d) => refutacion(a.fen, d, a.esMate)).join("; ")}.`,
    prueba: prueba + `; las otras tres opciones quedan en ${tres.map((d) => valor(d.score)).join(", ")} (profundidad 14).`,
  });
}
function elegirDistractores(a) {
  // Los más tentadores primero, sin dos que se escriban igual, y que la
  // correcta no se delate por el largo.
  const vistos = new Set();
  const solLargo = sanEs(a.solSan).length;
  a.distractores = a.distractores
    .sort((x, y) => y.t - x.t)
    .filter((d) => { const s = sanEs(d.san); if (vistos.has(s)) return false; vistos.add(s); return true; });
  const largos = a.distractores.slice(0, 3).map((d) => sanEs(d.san).length);
  return a.distractores.length >= 3 && solLargo - Math.max.apply(null, largos) < 3;
}

function js(v, ind) {
  const sp = " ".repeat(ind);
  if (Array.isArray(v)) return "[" + v.map((x) => js(x, ind)).join(", ") + "]";
  if (v && typeof v === "object") return "{ " + Object.keys(v).map((k) => `${k}: ${js(v[k], ind)}`).join(", ") + " }";
  if (typeof v === "string") return "'" + v.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
  return String(v);
}
function itemJs(it) {
  const cab = ["id", "area", "peso", "elo", "eloBase", "tipo", "lichess", "rating"];
  const l = ["  {", "    " + cab.map((k) => `${k}: ${js(it[k])}`).join(", ") + ","];
  Object.keys(it).filter((k) => !cab.includes(k)).forEach((k) => l.push(`    ${k}: ${js(it[k], 4)},`));
  l.push("  },");
  return l.join("\n");
}

async function main() {
  const entrada = process.argv[2];
  if (!entrada) { console.error("Uso: node herramientas/diagnostico-lichess.js candidatos.json"); process.exit(2); }
  const cand = JSON.parse(fs.readFileSync(entrada, "utf8"));
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE, "utf8")); } catch (e) {}
  // Un motor por procesador: cada uno toma la siguiente candidata pendiente.
  const pendientes = cand.filter((c) => !cache[c[2]]);
  let hechos = 0;
  const motores = Array.from({ length: Math.max(1, require("os").cpus().length) }, () => new MotorUci(MOTOR));
  await Promise.all(motores.map(async (motor) => {
    while (pendientes.length) {
      const c = pendientes.shift();
      cache[c[2]] = await analizar(motor, c);
      if (++hechos % 20 === 0) { fs.writeFileSync(CACHE, JSON.stringify(cache)); process.stderr.write(`${hechos}…`); }
    }
    motor.cerrar();
  }));
  fs.writeFileSync(CACHE, JSON.stringify(cache));

  /* Reparto: por área y escalón (el de la versión "jugada"), POR_CASILLERO
     ítems, de los que DE_OPCION salen como opción si tienen buenos distractores. */
  const usados = new Set();
  const items = [];
  const porCasillero = {};
  cand.forEach((c) => {
    const a = cache[c[2]];
    if (!a || a.descarte || usados.has(a.id)) return;
    const k = `${a.area}:${c[1]}`;
    porCasillero[k] = porCasillero[k] || [];
    porCasillero[k].push(a);
    usados.add(a.id);
  });
  Object.keys(porCasillero).sort().forEach((k) => {
    const lista = porCasillero[k].slice(0, POR_CASILLERO[k.split(":")[1]]);
    let opciones = 0;
    lista.forEach((a, n) => {
      const tipo = opciones < DE_OPCION && elegirDistractores(a) ? "opcion_tablero" : "jugada";
      if (tipo === "opcion_tablero") opciones += 1;
      items.push(comoItem(a, tipo, n));
    });
  });
  const orden = Object.keys(PREFIJO);
  items.sort((x, y) => orden.indexOf(x.area) - orden.indexOf(y.area) || x.peso - y.peso || (x.id < y.id ? -1 : 1));

  const texto = fs.readFileSync(BANCO, "utf8");
  const INI = "  /* LICHESS-INICIO", FIN = "  /* LICHESS-FIN */";
  const bloque = `${INI}: generado por herramientas/diagnostico-lichess.js — no se edita a mano. */\n`
    + items.map(itemJs).join("\n") + `\n${FIN}\n`;
  let nuevo;
  if (texto.includes(INI)) {
    nuevo = texto.slice(0, texto.indexOf(INI)) + bloque + texto.slice(texto.indexOf(FIN) + FIN.length + 1);
  } else {
    const cierre = texto.indexOf("\n];\n");
    nuevo = texto.slice(0, cierre + 1) + bloque + texto.slice(cierre + 1);
  }
  fs.writeFileSync(BANCO, nuevo);
  const cuenta = {};
  items.forEach((i) => { const k = `${i.area} ${i.peso}`; cuenta[k] = (cuenta[k] || 0) + 1; });
  const desc = Object.values(cache).filter((a) => a.descarte).length;
  console.log(`\n${items.length} ítems escritos (${items.filter((i) => i.tipo === "jugada").length} de mover, ${items.filter((i) => i.tipo !== "jugada").length} de opción). Descartadas por el motor: ${desc}.`);
  console.log(cuenta);
}
main();
