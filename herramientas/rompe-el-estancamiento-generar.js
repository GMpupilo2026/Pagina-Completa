/* ===== Las posiciones de «Rompe el estancamiento» (curso y libro) =====
 *
 * Arma, desde las candidatas de Lichess, las posiciones del curso y del libro
 * «Rompe el estancamiento», de Oscar Angulo Cubero:
 *
 *   - material/rompe-el-estancamiento/banco.js: el banco del libro (los
 *     ejemplos de cada lección, los ejercicios de cada capítulo y los mixtos
 *     del final, con sus soluciones). No se edita a mano.
 *   - el campo `diagramas` de cada lección de
 *     herramientas/cursos/rompe-el-estancamiento.json: el ejemplo de la
 *     lección en el curso, el MISMO del libro. Se reescribe en cada corrida
 *     (el resto del archivo, el texto de las lecciones, es a mano).
 *
 * El MÉTODO del curso toma como referencia la idea de un libro ajeno (ordenar
 * por familias los errores que frenan a un jugador de 1400 a 2100 y
 * corregirlos de a uno). Ni el texto, ni las posiciones, ni los ejercicios
 * salen de ese libro:
 *
 *   - Ninguna posición se inventa ni se copia. Salen de la base abierta de
 *     ejercicios de Lichess (CC0), la tabla «Ejercicios Lichess» de Supabase,
 *     con los filtros de calidad de siempre (Popularity ≥ 85,
 *     NbPlays ≥ 1000, RatingDeviation ≤ 80). Las candidatas están en
 *     herramientas/datos/rompe-el-estancamiento-candidatas.txt (la consulta,
 *     abajo).
 *   - Ninguna se cree a ciegas: pasan por el MISMO análisis de Stockfish que
 *     el diagnóstico, «Ponte a prueba» y «Mide tu fuerza» (analizar() de
 *     herramientas/diagnostico-lichess.js), que solo deja las que tienen UNA
 *     jugada buena. Las de un tema de ataque además tienen que ganar (+3 o
 *     mate); las de defensa (defensiveMove) basta con que salven, porque lo
 *     que enseñan es justamente aguantar.
 *   - Ninguna repite una del diagnóstico, de «Ponte a prueba» ni de «Mide tu
 *     fuerza»: el mismo ejercicio en dos libros mediría memoria.
 *   - El tema de cada posición es el que le puso Lichess; cada capítulo pide
 *     los temas que muestran su familia de errores (TEMAS_CAPITULO).
 *
 * Cómo se corre (hace falta Stockfish: apt install stockfish):
 *
 *   STOCKFISH=/usr/games/stockfish node herramientas/rompe-el-estancamiento-generar.js
 *
 * El análisis queda en herramientas/.cache-rompe-el-estancamiento.json (fuera
 * del repositorio) para no repetirlo. Después: curso-posiciones.js,
 * curso-generar.py y rompe-el-estancamiento-pdf.js.
 *
 * LA CONSULTA de las candidatas (Supabase, proyecto AjedrezIntegral), bajada
 * con «tema|nivel|id|FEN|jugadas|rating|temas», un renglón por candidata:
 *
 *   with t(orden, tema) as (values
 *     (1,'zugzwang'),(2,'pawnEndgame'),(3,'equality'),(4,'defensiveMove'),(5,'intermezzo'),(6,'quietMove'),
 *     (7,'exposedKing'),(8,'sacrifice'),(9,'veryLong'),(10,'clearance'),(11,'deflection'),(12,'attraction')
 *   ), c as (
 *     select e."PuzzleId" id, e."FEN" fen, e."Moves" mv, e."Rating" r, e."Themes" th,
 *       (select t.tema from t where e."Themes" ~ ('\m' || t.tema || '\M') order by t.orden limit 1) tema,
 *       width_bucket(e."Rating", array[1250,1650,2050,2550]) banda
 *     from "Ejercicios Lichess" e
 *     where e."Popularity">=85 and e."NbPlays">=1000 and e."RatingDeviation"<=80
 *       and e."Rating" between 1250 and 2549 and e."Themes" !~ '\mmate\M'
 *   ), n as (select *, row_number() over (partition by tema, banda order by md5(id || 'rompe')) k
 *            from c where tema is not null)
 *   select … from n where k <= 14
 */
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { Motor } = require("./lib/motor-uci");
const L = require("./diagnostico-lichess.js");

const RAIZ = path.join(__dirname, "..");
const CANDIDATAS = path.join(__dirname, "datos", "rompe-el-estancamiento-candidatas.txt");
const CACHE = path.join(__dirname, ".cache-rompe-el-estancamiento.json");
const CURSO = path.join(__dirname, "cursos", "rompe-el-estancamiento.json");
const SALIDA = path.join(RAIZ, "material", "rompe-el-estancamiento", "banco.js");
const MOTOR = process.env.STOCKFISH || "/usr/games/stockfish";

/* Igual que «Mide tu fuerza»: se contesta con la jugada, sin opciones. */
const DESCUENTO_LICHESS = 780;
const POR_CAPITULO = 8;
const MIXTOS = 24;

/* Los temas que muestra cada familia de errores. El capítulo 8 (el método
   propio) no lleva ejercicios: su tarea es la ficha de errores. */
const TEMAS_CAPITULO = {
  1: ["quietMove", "pawnEndgame", "clearance"],
  2: ["exposedKing", "sacrifice", "deflection"],
  3: ["pawnEndgame", "intermezzo", "defensiveMove", "veryLong"],
  4: ["pawnEndgame", "zugzwang", "clearance"],
  5: ["veryLong", "intermezzo", "attraction"],
  6: ["defensiveMove", "zugzwang"],
  7: ["sacrifice", "defensiveMove", "exposedKing"],
};
const TODOS = ["zugzwang", "pawnEndgame", "defensiveMove", "intermezzo", "quietMove", "exposedKing",
  "sacrifice", "veryLong", "clearance", "deflection", "attraction"];

/* Lo que cada tema le pide a quien resuelve: va como pista arriba del
   ejercicio. El texto es propio. */
const PISTA = {
  quietMove: "No hay un jaque que gane: busca la jugada silenciosa que deja una amenaza sin defensa.",
  pawnEndgame: "Cuenta tiempos antes de mover: en un final de peones una sola jugada decide.",
  clearance: "Una pieza tuya estorba a otra. ¿Cómo la sacas de ahí con ganancia de tiempo?",
  exposedKing: "El factor que manda es el rey rival: ¿qué le falta para defenderse?",
  sacrifice: "Lo que cuenta no es el material que entregas, sino lo que queda en el tablero después.",
  deflection: "Una pieza rival sostiene todo. ¿Puedes obligarla a irse?",
  intermezzo: "Antes de la jugada obvia, ¿hay un jaque o una amenaza más fuerte?",
  defensiveMove: "Juega por el rival primero: ¿qué amenaza? Solo una jugada lo para.",
  veryLong: "La línea es larga: calcúlala hasta el final antes de tocar una pieza.",
  zugzwang: "A veces lo mejor es dejar que el rival se ahogue: ¿qué jugada le quita las buenas?",
  attraction: "Piensa en qué casilla te convendría tener una pieza rival, y cómo llevarla ahí.",
};

/* ---------- leer las candidatas ---------- */
function yaUsadas() {
  const w = {};
  new Function("window", fs.readFileSync(path.join(RAIZ, "js", "diagnostico-items.js"), "utf8"))(w);
  new Function("window", fs.readFileSync(path.join(RAIZ, "material", "ponte-a-prueba", "banco.js"), "utf8"))(w);
  new Function("window", fs.readFileSync(path.join(RAIZ, "material", "mide-tu-fuerza", "banco.js"), "utf8"))(w);
  return new Set([].concat(w.DIAGNOSTICO_ITEMS || [], w.LIBRO_EXAMEN_ITEMS || [], w.MIDE_TU_FUERZA_ITEMS || [])
    .map((i) => i.lichess).filter(Boolean));
}

function leerCandidatas() {
  const usadas = yaUsadas();
  return fs.readFileSync(CANDIDATAS, "utf8").split("\n")
    .filter((l) => l && !l.startsWith("#") && !usadas.has(l.split("|")[2]))
    .map((l) => {
      const [tema, banda, id, fen, mv, rating, temas] = l.split("|");
      return { tema, banda: +banda, c: [tema, +banda, id, fen, mv, +rating, temas || ""] };
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
        process.stderr.write(`${hechos}/${hechos + pendientes.length}… `);
      }
    }
    motor.cerrar();
  }));
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  return cache;
}

/* Lo que el texto de la lección dice de su ejemplo tiene que ser cierto en
   la posición, no solo en la etiqueta de Lichess: la jugada «tranquila» no da
   jaque ni captura, la que «entrega material» deja la pieza al alcance del
   rival, y el final de peones no tiene otras piezas. Las etiquetas de Lichess
   miran la solución entera, y la lección habla de la primera jugada. */
function cumple(tema, a) {
  const { Chess } = require("chess.js");
  if (tema === "pawnEndgame") return /^[kKpP1-8/]+$/.test(a.fen.split(" ")[0]);
  if (tema === "quietMove") return !/[x+#]/.test(a.solSan);
  if (tema === "sacrifice") {
    const g = new Chess(a.fen);
    const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    const m = g.move(L.uciAMov(a.sol));
    const ganado = m.captured ? VAL[m.captured] : 0;
    // El rival puede capturar la pieza que se movió, y vale más que lo que se llevó.
    return VAL[m.piece] > ganado && g.moves({ verbose: true }).some((r) => r.to === m.to && r.captured);
  }
  return true;
}

/* Sirve si el motor la dejó (una sola jugada buena) y si cumple lo que el
   tema promete: las de defensa, salvar; las demás, ganar. */
function sirve(x, a) {
  if (!a || a.descarte) return false;
  if (x.tema === "pawnEndgame" && !cumple("pawnEndgame", a)) return false;
  if (x.tema === "defensiveMove") return true;
  return a.esMate || a.gana;
}

function comoItem(x, a) {
  const ucis = x.c[4].split(" ");
  const m = L.uciAMov(a.sol);
  return {
    id: `re_${a.id}`,
    tema: x.tema,
    lichess: a.id,
    rating: a.rating,
    elo: a.rating - DESCUENTO_LICHESS,
    juegan: a.fen.split(" ")[1],
    fen: a.fen,
    ultima: L.sanEs(a.ultima),
    ultimaUci: ucis[0],
    marca: [ucis[0].slice(0, 2), ucis[0].slice(2, 4)],
    solucion: m.promotion ? { from: m.from, to: m.to, promotion: m.promotion } : { from: m.from, to: m.to },
    primera: L.sanEs(a.solSan),
    // La línea en SAN inglés: la que lee chess.js (el visor del curso).
    lineaSan: lineaSan(a.fen, a.linea),
    linea: L.lineaEs(a.fen, a.linea, a.linea.length),
    gana: !!(a.esMate || a.gana),
    valor: L.valor(a.v1),
    pista: PISTA[x.tema],
    explica: L.motivo(a.temas),
    comprobado: `Ejercicio ${a.id} de la base abierta de Lichess (CC0), rating ${a.rating}. Stockfish 16 a profundidad ${L.PROFUNDIDAD}: `
      + `${L.sanEs(a.solSan)} es la mejor (${L.valor(a.v1)}) y la segunda queda en ${L.valor(a.v2)}.`,
  };
}

function lineaSan(fen, ucis) {
  const { Chess } = require("chess.js");
  const g = new Chess(fen);
  return ucis.map((u) => g.move(L.uciAMov(u))).filter(Boolean).map((m) => m.san);
}

/* El resultado que promete el visor del curso: si la solución gana, gana el
   bando que juega; si solo salva, tablas o una partida que sigue pareja. */
function resultado(it) {
  if (!it.gana) return "½";
  return it.juegan === "w" ? "1-0" : "0-1";
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
  if (process.argv.includes("--solo-analisis")) return;
  const curso = JSON.parse(fs.readFileSync(CURSO, "utf8"));

  const buenas = cands.filter((x) => sirve(x, cache[x.c[2]])).map((x) => ({ x, a: cache[x.c[2]] }));
  const usadas = new Set();
  const tomar = (temas, banda, cuantas, estricto) => {
    const lista = buenas.filter((b) => temas.includes(b.x.tema) && !usadas.has(b.a.id) && (!banda || b.x.banda === banda)
      && (!estricto || cumple(b.x.tema, b.a)));
    // Repartir entre los temas: uno de cada uno por turno.
    const salida = [];
    let i = 0;
    while (salida.length < cuantas && lista.length) {
      const tema = temas[i++ % temas.length];
      const k = lista.findIndex((b) => b.x.tema === tema);
      if (k < 0) { if (!lista.some((b) => temas.includes(b.x.tema))) break; continue; }
      const [b] = lista.splice(k, 1);
      usadas.add(b.a.id);
      salida.push(b);
    }
    if (salida.length < cuantas) throw new Error(`Faltan posiciones de ${temas.join("/")} (nivel ${banda || "cualquiera"}): hay ${salida.length} y hacen falta ${cuantas}. Hay que bajar más candidatas.`);
    return salida;
  };

  /* 1. El ejemplo de cada lección, de nivel bajo o medio: es para entender la
        idea, no para trabarse. */
  const ejemplos = [];
  let n = 0;
  curso.bloques.forEach((bloque) => {
    bloque.lecciones.forEach((leccion) => {
      n += 1;
      if (!leccion.tema) { delete leccion.diagramas; return; }
      let b;
      try { [b] = tomar([leccion.tema], 1, 1, true); } catch (e) { [b] = tomar([leccion.tema], 2, 1, true); }
      const it = Object.assign({ uso: "ejemplo", capitulo: bloque.n, leccion: n }, comoItem(b.x, b.a));
      ejemplos.push(it);
    });
  });

  /* 2. Los ejercicios de cada capítulo: 3 fáciles, 3 medios y 2 difíciles,
        de los temas de su familia, ordenados por dificultad. */
  const ejercicios = [];
  Object.keys(TEMAS_CAPITULO).forEach((cap) => {
    const temas = TEMAS_CAPITULO[cap];
    const elegidas = [].concat(tomar(temas, 1, 3), tomar(temas, 2, 3), tomar(temas, 3, 2));
    elegidas.map((b) => Object.assign({ uso: "ejercicio", capitulo: +cap }, comoItem(b.x, b.a)))
      .sort((p, q) => p.elo - q.elo)
      .forEach((it) => ejercicios.push(it));
  });

  /* 3. Los mixtos: de todos los temas, sin decir cuál. 8 de cada nivel. */
  const mixtos = [].concat(tomar(TODOS, 1, 8), tomar(TODOS, 2, 8), tomar(TODOS, 3, 8))
    .map((b) => Object.assign({ uso: "mixto", capitulo: 0 }, comoItem(b.x, b.a)))
    .sort((p, q) => p.elo - q.elo);

  let k = 0;
  const items = [].concat(ejemplos, ejercicios, mixtos).map((it) => Object.assign({ n: ++k }, it));

  /* El ejemplo de cada lección, en el curso. */
  const porLeccion = Object.fromEntries(ejemplos.map((it) => [it.leccion, items.find((x) => x.id === it.id)]));
  n = 0;
  curso.bloques.forEach((bloque) => {
    bloque.lecciones.forEach((leccion) => {
      n += 1;
      const it = porLeccion[n];
      if (!it) return;
      const bando = it.juegan === "w" ? "las blancas" : "las negras";
      leccion.diagramas = [{
        id: `RE-${n}`,
        fen: it.fen,
        turno: it.juegan,
        resultado: resultado(it),
        pregunta: `${leccion.pregunta || "Juegan " + bando + "."} Juegan ${bando}; el rival acaba de jugar ${it.juegan === "w" ? "…" : ""}${it.ultima}.`,
        comentario: `${it.linea}. ${it.explica} ${leccion.enlace || ""} (${it.comprobado})`.replace(/\s+\(/, " (").replace(/\s+/g, " ").trim(),
        linea: it.lineaSan,
      }];
    });
  });
  fs.writeFileSync(CURSO, JSON.stringify(curso, null, 2) + "\n");

  const cuerpo = items.map((it) => {
    const copia = Object.assign({}, it);
    delete copia.lineaSan; delete copia.ultimaUci;
    return "  {\n" + Object.keys(copia).map((key) => `    ${key}: ${js(copia[key])},`).join("\n") + "\n  },";
  }).join("\n");
  const capitulos = curso.bloques.map((b) => ({ n: b.n, titulo: b.titulo, temas: TEMAS_CAPITULO[b.n] || [] }));
  const texto = `/* ===== Las posiciones de «Rompe el estancamiento», de Oscar Angulo Cubero =====
 *
 * GENERADO por herramientas/rompe-el-estancamiento-generar.js — no se edita a mano.
 *
 * ${items.length} posiciones de la base abierta de Lichess (CC0), comprobadas con
 * Stockfish: ${ejemplos.length} ejemplos (uno por lección, los mismos del curso),
 * ${ejercicios.length} ejercicios por capítulo y ${mixtos.length} mixtos. Lo usa el libro
 * (herramientas/rompe-el-estancamiento-pdf.js). Vive detrás del candado de
 * material/: trae las respuestas.
 */
window.ROMPE_EL_ESTANCAMIENTO = {
  TITULO: 'Rompe el estancamiento',
  AUTOR: 'Oscar Angulo Cubero',
  POR_CAPITULO: ${POR_CAPITULO},
  MIXTOS: ${MIXTOS},
  CAPITULOS: ${js(capitulos)},
};
window.ROMPE_EL_ESTANCAMIENTO_ITEMS = [
${cuerpo}
];
`;
  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  fs.writeFileSync(SALIDA, texto);

  const desc = Object.values(cache).filter((a) => a.descarte).length;
  console.log(`\n${items.length} posiciones: ${ejemplos.length} ejemplos, ${ejercicios.length} ejercicios, ${mixtos.length} mixtos.`);
  console.log(`Buenas: ${buenas.length} de ${cands.length} candidatas (descartadas por el motor: ${desc}).`);
  console.log(`Juegan las negras: ${items.filter((i) => i.juegan === "b").length}. Solo salvan: ${items.filter((i) => !i.gana).length}.`);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { TEMAS_CAPITULO, PISTA, DESCUENTO_LICHESS };
