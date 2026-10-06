/* ===== El banco del libro «Ponte a prueba» =====
 *
 * Arma material/ponte-a-prueba/banco.js: las 180 posiciones del libro de examen de
 * Oscar Angulo Cubero, repartidas en seis pruebas de 30. El mismo banco sirve
 * para el libro impreso (herramientas/libro-examen-pdf.js) y para armar
 * exámenes en la plataforma (fuente «libro» de js/examen-banco.js).
 *
 * El MÉTODO del libro toma como referencia los exámenes de autoevaluación de
 * ajedrez (dos preguntas por posición —cómo queda y cuál es la jugada—, crédito
 * parcial y negativo, puntos que se suman por categoría y se pasan a una fuerza
 * en Elo). Las posiciones, los textos y las tablas son propios:
 *
 *   - Ninguna posición se inventa. Salen de la base abierta de ejercicios de
 *     Lichess (CC0), la tabla «Ejercicios Lichess» de Supabase, con los
 *     mismos filtros de calidad del diagnóstico. Las candidatas están en
 *     herramientas/datos/libro-examen-candidatas.txt.
 *   - Ninguna se cree a ciegas: pasan por el MISMO análisis de Stockfish que
 *     las del diagnóstico (analizar() de herramientas/diagnostico-lichess.js),
 *     que solo deja las que tienen UNA jugada buena y tres opciones que tientan
 *     y fallan por algo concreto.
 *   - Los puntos de cada opción no se ponen a ojo: salen de lo que dice el
 *     motor de la posición que deja cada una (PUNTOS_JUGADA, PUNTOS_EVALUACION).
 *   - La dificultad (`elo`) sale del rating de Lichess con el corrimiento que
 *     midió la calibración del diagnóstico para las preguntas de opción con
 *     tablero (−550 −160 = −710): Lichess cuenta unos cientos de puntos más
 *     que la fuerza de torneo.
 *   - Las seis pruebas se reparten parejas: cada una lleva 5 posiciones de
 *     cada grupo (apertura, táctica, ataque, cálculo, defensa, finales), una
 *     de cada tramo de dificultad, así que cualquiera de ellas sirve sola como
 *     examen corto y las seis juntas dan la fuerza por categoría.
 *
 * El banco vive en material/ponte-a-prueba/ y no en js/: trae las respuestas, y
 * así lo sirve el worker solo a quien puede bajar el material (administración,
 * quien lo compró o con quien se compartió desde admin.html#materiales).
 *
 * NO se edita material/ponte-a-prueba/banco.js a mano: se vuelve a correr esto.
 *
 * Cómo se corre (hace falta Stockfish: apt install stockfish):
 *
 *   STOCKFISH=/usr/games/stockfish node herramientas/libro-examen-generar.js
 *
 * El análisis queda en herramientas/.cache-libro-examen.json (fuera del
 * repositorio) para no repetirlo.
 *
 * LA CONSULTA de las candidatas (Supabase, proyecto AjedrezIntegral). Se
 * corrió en dos partes y se bajó con «capítulo|banda|id|FEN|jugadas|rating|
 * temas», un renglón por candidata:
 *
 *   with c as (
 *     select "PuzzleId" id, "FEN" fen, "Moves" mv, "Rating" r, "Themes" t,
 *       case
 *         when "Themes" ~ '\mendgame\M' then 'finales'
 *         when "Themes" ~ '\mopening\M' and "Themes" !~ '\mmate\M' then 'apertura'
 *         when "Themes" ~ '\m(mateIn2|mateIn3)\M' then 'ataque'
 *         when "Themes" ~ '\m(defensiveMove|equality)\M' then 'defensa'
 *         when "Themes" ~ '\m(veryLong|quietMove|intermezzo)\M' and "Themes" !~ '\mmate\M' then 'calculo'
 *         when "Themes" ~ '\m(fork|pin|skewer|discoveredAttack|deflection|attraction|doubleCheck|interference|capturingDefender|trappedPiece|xRayAttack|clearance)\M'
 *              and "Themes" !~ '\mmate\M' and "Themes" ~ '\m(short|long)\M' then 'tactica'
 *       end cap,
 *       width_bucket("Rating", array[1200,1500,1800,2100,2400,3300]) banda
 *     from "Ejercicios Lichess"
 *     where split_part("FEN",' ',2)='b' and "Popularity">=85 and "NbPlays">=1500
 *       and "RatingDeviation"<=80 and "Rating" between 1200 and 3299
 *   ), n as (select *, row_number() over (partition by cap, banda order by md5(id)) k from c)
 *   select … from n where k <= (case when banda=5 then 22 else 15 end)  -- 16/24 en la primera parte
 */
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { Chess } = require("chess.js");
const { Motor } = require("./lib/motor-uci");
const L = require("./diagnostico-lichess.js");

const RAIZ = path.join(__dirname, "..");
const CANDIDATAS = path.join(__dirname, "datos", "libro-examen-candidatas.txt");
const CACHE = path.join(__dirname, ".cache-libro-examen.json");
const SALIDA = path.join(RAIZ, "material", "ponte-a-prueba", "banco.js");
const MOTOR = process.env.STOCKFISH || "/usr/games/stockfish";

const PRUEBAS = 6;
const POR_GRUPO = PRUEBAS * 5;          // 30 de cada grupo: 5 por prueba
const POR_BANDA = PRUEBAS;              // 6 de cada tramo de dificultad
const GRUPOS = ["ape", "tac", "ata", "cal", "def", "fin"];
const NOMBRE_GRUPO = { ape: "apertura", tac: "táctica", ata: "ataque", cal: "cálculo", def: "defensa", fin: "finales" };

/* La dificultad en escala Elo: rating de Lichess menos el descuento de las
   preguntas de opción con tablero y el corrimiento que midió la calibración
   del diagnóstico (ver diagnostico-calibrar.js). */
const DESCUENTO_LICHESS = 710;
function escalon(elo) {
  return elo < 1100 ? 1 : elo < 1400 ? 2 : elo < 1700 ? 3 : elo < 2000 ? 4 : 5;
}

/* ---------- Parte 1: cómo queda la posición ----------
   Cuatro respuestas fijas, de más a menos. La buena sale de la evaluación de
   Stockfish tras la mejor jugada. Los cortes no son los de «gana / mejor /
   igual»: en un banco de ejercicios casi todas las posiciones ganan, y con
   esos cortes 154 de 180 tenían la misma respuesta —contestar siempre «ganan»
   sacaba casi todo—. Lo que de verdad distingue a quien lee la posición es
   ver si hay mate y cuánto material se gana, así que se corta ahí: mate,
   más de 4 peones, de 2 a 4, menos de 2.
   Cerca de un corte (a menos de MARGEN) la vecina vale 2 en vez de 1: ahí dos
   lecturas son razonables y castigarlas igual que un error sería medir mal. */
const EVALUACION = [
  "Las blancas dan mate a la fuerza.",
  "Las blancas ganan más que una pieza: más de 4 peones de ventaja.",
  "Las blancas ganan alrededor de una pieza: entre 2 y 4 peones de ventaja.",
  "Las blancas quedan apenas mejor, o igualadas: menos de 2 peones.",
];
/* Las mismas cuatro, cortas: van debajo de cada diagrama del libro, donde
   las largas no caben tres posiciones por página. */
const EVALUACION_CORTA = ["Dan mate a la fuerza", "Más de 4 peones", "De 2 a 4 peones", "Menos de 2 peones"];
const MATE = 90000;
const CORTES = [400, 200];
const MARGEN = 50;
function tramoEval(v) {
  return v >= MATE ? 0 : v >= CORTES[0] ? 1 : v >= CORTES[1] ? 2 : 3;
}
function puntosEvaluacion(v) {
  const bien = tramoEval(v);
  const cerca = v < MATE && CORTES.some((c) => Math.abs(v - c) < MARGEN);
  return EVALUACION.map((_, i) => {
    const d = Math.abs(i - bien);
    return d === 0 ? 5 : d === 1 ? (cerca ? 2 : 1) : -1;
  });
}

/* ---------- Parte 2: la jugada ----------
   La buena vale 5. Las otras tres, según lo que deja cada una: si las blancas
   siguen mejor, 1 (se vio algo, aunque no lo mejor); si la ventaja se esfuma,
   0; si se pierde, −1. Así adivinar al azar no suma nada en promedio. */
function puntosJugada(score) {
  if (score >= 150) return 1;
  if (score <= -150) return -1;
  return 0;
}

/* ---------- las categorías ----------
   Cada posición suma a varias. Se deciden con datos, no a ojo: el grupo del
   que salió, los temas que Lichess le puso y la jugada misma. */
const CATEGORIAS = [
  { id: "apertura",   nombre: "Apertura" },
  { id: "medio",      nombre: "Medio juego" },
  { id: "final",      nombre: "Final" },
  { id: "ataque",     nombre: "Ataque al rey" },
  { id: "defensa",    nombre: "Defensa" },
  { id: "tactica",    nombre: "Táctica" },
  { id: "calculo",    nombre: "Cálculo" },
  { id: "sacrificio", nombre: "Sacrificio" },
  { id: "tranquila",  nombre: "Jugada tranquila" },
  { id: "tipicos",    nombre: "Finales típicos" },
];
const TEMAS_TACTICA = /\b(fork|pin|skewer|discoveredAttack|deflection|attraction|doubleCheck|interference|capturingDefender|trappedPiece|xRayAttack|clearance|hangingPiece|intermezzo)\b/;
const TEMAS_ATAQUE = /\b(kingsideAttack|queensideAttack|attackingF2F7|exposedKing|mateIn\d)\b/;
const TEMAS_TIPICOS = /\b(pawnEndgame|rookEndgame|queenEndgame|bishopEndgame|knightEndgame)\b/;

function piezasMayoresYMenores(fen) {
  return (fen.split(" ")[0].match(/[qrbnQRBN]/g) || []).length;
}

function categoriasDe(a, grupo, plies) {
  const t = a.temas || "";
  const piezas = piezasMayoresYMenores(a.fen);
  const g = new Chess(a.fen);
  const m = g.move(L.uciAMov(a.sol));
  const cats = new Set();
  if (grupo === "ape") cats.add("apertura");
  else if (grupo === "fin" || piezas <= 4) cats.add("final");
  else cats.add("medio");
  if (grupo === "ata" || a.esMate || TEMAS_ATAQUE.test(t)) cats.add("ataque");
  if (grupo === "def" || !a.gana || /\bdefensiveMove\b/.test(t)) cats.add("defensa");
  if (a.gana && (grupo === "tac" || TEMAS_TACTICA.test(t))) cats.add("tactica");
  if (plies >= 5 || /\bveryLong\b/.test(t)) cats.add("calculo");
  if (/\bsacrifice\b/.test(t)) cats.add("sacrificio");
  if (!m.captured && !m.san.includes("+") && !m.promotion) cats.add("tranquila");
  // Los finales con pocas piezas son los que se juegan de memoria: no hace
  // falta que Lichess les haya puesto el tema.
  if (TEMAS_TIPICOS.test(t) || (grupo === "fin" && piezas <= 4)) cats.add("tipicos");
  return CATEGORIAS.map((c) => c.id).filter((id) => cats.has(id));
}

/* ---------- leer las candidatas ----------
   Las que ya son preguntas del diagnóstico se saltan: el mismo ejercicio en
   las dos pruebas mediría memoria. No es hipotético: la consulta ordena por
   md5(id), igual que la del diagnóstico, y la primera corrida repitió 81. */
function delDiagnostico() {
  const w = {};
  new Function("window", fs.readFileSync(path.join(RAIZ, "js", "diagnostico-items.js"), "utf8"))(w);
  return new Set((w.DIAGNOSTICO_ITEMS || []).map((i) => i.lichess).filter(Boolean));
}

function leerCandidatas() {
  const yaUsadas = delDiagnostico();
  return fs.readFileSync(CANDIDATAS, "utf8").split("\n")
    .filter((l) => l && !l.startsWith("#") && !yaUsadas.has(l.split("|")[2]))
    .map((l) => {
      const [grupo, banda, id, fen, mv, rating, temas] = l.split("|");
      return { grupo, banda: +banda, c: [grupo, +banda, id, fen, mv, +rating, temas || ""] };
    });
}

async function analizarTodo(cands) {
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE, "utf8")); } catch (e) {}
  const pendientes = cands.filter((x) => !cache[x.c[2]]);
  let hechos = 0;
  const motores = Array.from({ length: Math.max(1, os.cpus().length) }, () => new Motor(MOTOR));
  await Promise.all(motores.map(async (motor) => {
    while (pendientes.length) {
      const x = pendientes.shift();
      cache[x.c[2]] = await L.analizar(motor, x.c);
      if (++hechos % 10 === 0) {
        fs.writeFileSync(CACHE, JSON.stringify(cache));
        process.stderr.write(`${hechos}… `);
      }
    }
    motor.cerrar();
  }));
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  return cache;
}

/* Una evaluación pegada a un borde sirve, pero se prefiere la que no lo está:
   la pregunta 1 mide mejor cuando la respuesta no se discute. */
function nitida(a) {
  return a.v1 >= MATE || !CORTES.some((c) => Math.abs(a.v1 - c) < MARGEN);
}

function elegirDelGrupo(grupo, cands, cache) {
  const buenas = cands
    .filter((x) => x.grupo === grupo)
    .map((x) => ({ x, a: cache[x.c[2]] }))
    .filter(({ a }) => a && !a.descarte && L.elegirDistractores(a));
  const porBanda = {};
  buenas.forEach((b) => { (porBanda[b.x.banda] = porBanda[b.x.banda] || []).push(b); });
  Object.values(porBanda).forEach((l) => l.sort((p, q) => Number(nitida(q.a)) - Number(nitida(p.a))));
  const elegidas = [];
  const usadas = new Set();
  // Seis de cada banda; lo que le falte a una lo pone la vecina de abajo (o
  // la de arriba si es la primera), así el grupo llega a 30 sin inventar.
  for (let b = 1; b <= 5; b++) {
    const orden = [b, b - 1, b + 1, b - 2, b + 2].filter((k) => k >= 1 && k <= 5);
    let faltan = POR_BANDA;
    for (const k of orden) {
      const lista = (porBanda[k] || []).filter((p) => !usadas.has(p.a.id));
      // Al tomar de otra banda se toma lo más cercano a la que falta.
      if (k < b) lista.sort((p, q) => q.a.rating - p.a.rating);
      if (k > b) lista.sort((p, q) => p.a.rating - q.a.rating);
      for (const p of lista) {
        if (!faltan) break;
        elegidas.push(p); usadas.add(p.a.id); faltan--;
      }
      if (!faltan) break;
    }
  }
  // Si aún faltan es que el tramo más difícil está flaco (las aperturas de
  // rating alto casi no existen en la base): se completa con las más difíciles
  // de las que quedan.
  buenas.filter((p) => !usadas.has(p.a.id))
    .sort((p, q) => q.a.rating - p.a.rating)
    .forEach((p) => { if (elegidas.length < POR_GRUPO) { elegidas.push(p); usadas.add(p.a.id); } });
  if (elegidas.length < POR_GRUPO) {
    throw new Error(`El grupo ${grupo} tiene ${elegidas.length} posiciones buenas y hacen falta ${POR_GRUPO}: hay que bajar más candidatas.`);
  }
  return elegidas.slice(0, POR_GRUPO);
}

function comoItem(x, a) {
  const grupo = x.grupo;
  const ucis = x.c[4].split(" ");
  const plies = ucis.length - 1;
  const elo = a.rating - DESCUENTO_LICHESS;
  const tres = a.distractores.slice(0, 3);
  // En las opciones el mate se escribe como jaque: «Dh4#» entre cuatro
  // jugadas regala las dos preguntas. En la solución sí va el #.
  const sinMate = (san) => san.replace(/#$/, "+");
  const opciones = [L.sanEs(a.solSan)].concat(tres.map((d) => L.sanEs(d.san))).map(sinMate);
  const puntos = [5].concat(tres.map((d) => puntosJugada(d.score)));
  const m = L.uciAMov(a.sol);
  const porque = L.motivo(a.temas);
  const linea = L.lineaEs(a.fen, a.linea, 6);
  return {
    id: `pp_${a.id}`,
    grupo: NOMBRE_GRUPO[grupo],
    lichess: a.id,
    rating: a.rating,
    elo,
    peso: escalon(elo),
    fen: a.fen,
    ultima: L.sanEs(a.ultima),
    // De dónde a dónde fue esa última jugada: el diagrama la marca.
    marca: [ucis[0].slice(0, 2), ucis[0].slice(2, 4)],
    categorias: categoriasDe(a, grupo, plies),
    evaluacion: { correcta: tramoEval(a.v1), puntos: puntosEvaluacion(a.v1), motor: L.valor(a.v1) },
    jugada: { opciones, correcta: 0, puntos },
    solucion: m.promotion ? { from: m.from, to: m.to, promotion: m.promotion } : { from: m.from, to: m.to },
    linea,
    explica: `${porque} La línea: ${linea}. Las otras tientan, pero fallan: ${tres.map((d) => L.refutacion(a.fen, d, a.esMate)).join("; ")}.`.trim(),
    // Cómo se comprobó. No se llama `prueba` (como en el diagnóstico): acá
    // `prueba` es el número de la prueba del libro.
    comprobado: `Ejercicio ${a.id} de la base abierta de Lichess (CC0), rating ${a.rating}. Stockfish 16 a profundidad ${L.PROFUNDIDAD}: `
      + `${L.sanEs(a.solSan)} es la mejor (${L.valor(a.v1)}) y la segunda queda en ${L.valor(a.v2)}; `
      + `las otras tres opciones, en ${tres.map((d) => L.valor(d.score)).join(", ")} (profundidad 14).`,
  };
}

/* Las seis pruebas, parejas: cada grupo ordenado por dificultad se corta en
   tandas de seis y cada tanda reparte una posición a cada prueba, rotando
   el arranque para que la prueba 1 no se lleve siempre la más fácil. */
function repartir(porGrupo) {
  const pruebas = Array.from({ length: PRUEBAS }, () => []);
  GRUPOS.forEach((g) => {
    const lista = porGrupo[g].slice().sort((p, q) => p.elo - q.elo || (p.id < q.id ? -1 : 1));
    lista.forEach((it, i) => pruebas[(i % PRUEBAS + Math.floor(i / PRUEBAS)) % PRUEBAS].push(it));
  });
  let n = 0;
  return pruebas.flatMap((lista, p) => lista
    .sort((x, y) => x.elo - y.elo || (x.id < y.id ? -1 : 1))
    .map((it) => Object.assign({ n: ++n, prueba: p + 1 }, it)));
}

function js(v) {
  if (Array.isArray(v)) return "[" + v.map(js).join(", ") + "]";
  if (v && typeof v === "object") return "{ " + Object.keys(v).map((k) => `${k}: ${js(v[k])}`).join(", ") + " }";
  if (typeof v === "string") return "'" + v.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
  return String(v);
}

async function main() {
  const cands = leerCandidatas();
  const cache = await analizarTodo(cands);
  const porGrupo = {};
  GRUPOS.forEach((g) => {
    porGrupo[g] = elegirDelGrupo(g, cands, cache).map(({ x, a }) => comoItem(x, a));
  });
  const items = repartir(porGrupo);

  const cuerpo = items.map((it) => "  {\n" + Object.keys(it).map((k) => `    ${k}: ${js(it[k])},`).join("\n") + "\n  },").join("\n");
  const texto = `/* ===== El banco del libro «Ponte a prueba», de Oscar Angulo Cubero =====
 *
 * GENERADO por herramientas/libro-examen-generar.js — no se edita a mano.
 *
 * ${items.length} posiciones de la base abierta de Lichess (CC0), comprobadas con
 * Stockfish, en ${PRUEBAS} pruebas de ${items.length / PRUEBAS}. Cada una trae dos preguntas: cómo queda la
 * posición (evaluacion, con las cuatro respuestas de LIBRO_EXAMEN.EVALUACION) y
 * cuál es la mejor jugada (jugada). Los puntos de cada respuesta van en
 * \`puntos\`, en el mismo orden que las opciones; la buena siempre vale 5.
 * La sirven el libro impreso (herramientas/libro-examen-pdf.js) y la fuente
 * «libro» de los exámenes (js/examen-banco.js). Vive detrás del candado de
 * material/: trae las respuestas, y solo lo baja quien tiene el material.
 */
window.LIBRO_EXAMEN = {
  TITULO: 'Ponte a prueba',
  AUTOR: 'Oscar Angulo Cubero',
  PRUEBAS: ${PRUEBAS},
  EVALUACION: ${js(EVALUACION)},
  EVALUACION_CORTA: ${js(EVALUACION_CORTA)},
  CATEGORIAS: ${js(CATEGORIAS)},
};
window.LIBRO_EXAMEN_ITEMS = [
${cuerpo}
];
`;
  fs.writeFileSync(SALIDA, texto);

  const desc = Object.values(cache).filter((a) => a.descarte).length;
  const cuenta = {};
  items.forEach((it) => it.categorias.forEach((c) => { cuenta[c] = (cuenta[c] || 0) + 1; }));
  const evals = [0, 0, 0, 0];
  items.forEach((it) => evals[it.evaluacion.correcta]++);
  console.log(`\n${items.length} posiciones en ${PRUEBAS} pruebas. Descartadas por el motor: ${desc} de ${cands.length}.`);
  console.log("Por categoría:", cuenta);
  console.log("Respuesta de la parte 1:", evals);
  console.log("Dificultad (elo):", Math.min(...items.map((i) => i.elo)), "a", Math.max(...items.map((i) => i.elo)));
}

if (require.main === module) main();
module.exports = { EVALUACION, CATEGORIAS, puntosEvaluacion, puntosJugada, tramoEval, DESCUENTO_LICHESS };
