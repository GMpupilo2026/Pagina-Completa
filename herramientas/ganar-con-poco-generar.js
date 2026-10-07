/* ===== Las posiciones de «Ganar con poco» (curso y libro) =====
 *
 * Arma, desde las candidatas de Lichess, las posiciones del curso y del libro
 * «Ganar con poco. El arte de las ventajas pequeñas», de Oscar Angulo Cubero:
 *
 *   - material/ganar-con-poco/banco.js: el banco del libro (los ejemplos de
 *     cada lección, los ejercicios de cada capítulo y los mixtos del final, con
 *     sus soluciones). No se edita a mano.
 *   - el campo `diagramas` de cada lección de herramientas/cursos/ganar-con-poco.json:
 *     el ejemplo de la lección en el curso, el MISMO del libro. Se reescribe en
 *     cada corrida (el resto del archivo, el texto de las lecciones, es a mano).
 *
 * El curso toma como referencia la IDEA de un libro ajeno (ganar una partida
 * sumando ventajas pequeñas, casi invisibles, en vez de esperar una
 * combinación). Ni el texto, ni las partidas, ni las posiciones, ni el título
 * salen de ese libro:
 *
 *   - Ninguna posición se inventa ni se copia. Salen de la base abierta de
 *     ejercicios de Lichess (CC0), la tabla «Ejercicios Lichess» de Supabase,
 *     con los filtros de calidad de siempre (Popularity ≥ 85,
 *     NbPlays ≥ 1000, RatingDeviation ≤ 80). Las candidatas están en
 *     herramientas/datos/ganar-con-poco-candidatas.txt (la consulta, abajo).
 *   - Ninguna se cree a ciegas: pasan por el MISMO análisis de Stockfish que
 *     el diagnóstico y los otros libros (analizar() de
 *     herramientas/diagnostico-lichess.js), que solo deja las que tienen UNA
 *     jugada buena. Las de ataque además tienen que ganar (+3 o mate); las de
 *     defensa (defensiveMove) basta con que conserven lo que hay.
 *   - Ninguna repite una del diagnóstico, de «Ponte a prueba», de «Mide tu
 *     fuerza» ni de «Rompe el estancamiento».
 *   - Los temas son los de la técnica, no los de la táctica: finales de cada
 *     pieza, jugadas tranquilas, peones pasados, piezas atrapadas, zugzwang.
 *     Cada capítulo pide los que muestran su idea (TEMAS_CAPITULO), y lo que
 *     la lección dice de su ejemplo se comprueba en la posición (cumple()).
 *
 * Cómo se corre (hace falta Stockfish: apt install stockfish):
 *
 *   STOCKFISH=/usr/games/stockfish node herramientas/ganar-con-poco-generar.js
 *
 * El análisis queda en herramientas/.cache-ganar-con-poco.json (fuera del
 * repositorio) para no repetirlo. Después: curso-posiciones.js,
 * curso-generar.py y ganar-con-poco-pdf.js.
 *
 * LA CONSULTA de las candidatas (Supabase, proyecto AjedrezIntegral), bajada
 * con «tema|nivel|id|FEN|jugadas|rating|temas», un renglón por candidata:
 *
 *   with t(orden, tema) as (values
 *     (1,'zugzwang'),(2,'queenEndgame'),(3,'knightEndgame'),(4,'bishopEndgame'),(5,'rookEndgame'),(6,'pawnEndgame'),
 *     (7,'trappedPiece'),(8,'promotion'),(9,'advancedPawn'),(10,'defensiveMove'),(11,'quietMove')
 *   ), c as (
 *     select e."PuzzleId" id, e."FEN" fen, e."Moves" mv, e."Rating" r, e."Themes" th,
 *       (select t.tema from t where e."Themes" ~ ('\m' || t.tema || '\M') order by t.orden limit 1) tema,
 *       width_bucket(e."Rating", array[1250,1650,2050,2550]) banda
 *     from "Ejercicios Lichess" e
 *     where e."Popularity">=85 and e."NbPlays">=1000 and e."RatingDeviation"<=80
 *       and e."Rating" between 1250 and 2549 and e."Themes" !~ '\mmate\M'
 *   ), n as (select *, row_number() over (partition by tema, banda order by md5(id || 'ganar')) k
 *            from c where tema is not null)
 *   select … from n where k <= 16
 */
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { Motor } = require("./lib/motor-uci");
const L = require("./diagnostico-lichess.js");

const RAIZ = path.join(__dirname, "..");
const CANDIDATAS = path.join(__dirname, "datos", "ganar-con-poco-candidatas.txt");
const CACHE = path.join(__dirname, ".cache-ganar-con-poco.json");
const CURSO = path.join(__dirname, "cursos", "ganar-con-poco.json");
const SALIDA = path.join(RAIZ, "material", "ganar-con-poco", "banco.js");
const MOTOR = process.env.STOCKFISH || "/usr/games/stockfish";

/* Igual que «Mide tu fuerza»: se contesta con la jugada, sin opciones. */
const DESCUENTO_LICHESS = 780;
const POR_CAPITULO = 8;
const MIXTOS = 24;

/* Los temas que muestra cada capítulo. El capítulo 7 (el método propio) no
   lleva ejercicios: su tarea es el cuaderno de ventajas. */
const TEMAS_CAPITULO = {
  1: ["quietMove", "trappedPiece", "defensiveMove"],
  2: ["trappedPiece", "bishopEndgame", "knightEndgame", "rookEndgame"],
  3: ["advancedPawn", "promotion", "pawnEndgame"],
  4: ["pawnEndgame", "zugzwang", "rookEndgame"],
  5: ["rookEndgame", "bishopEndgame", "knightEndgame", "queenEndgame"],
  6: ["quietMove", "defensiveMove", "zugzwang"],
};
const TODOS = ["zugzwang", "queenEndgame", "knightEndgame", "bishopEndgame", "rookEndgame", "pawnEndgame",
  "trappedPiece", "promotion", "advancedPawn", "defensiveMove", "quietMove"];

/* Lo que cada tema le pide a quien resuelve: va como pista arriba del
   ejercicio. El texto es propio. */
const PISTA = {
  quietMove: "No hay un jaque que gane: busca la jugada silenciosa que mejora lo tuyo y deja al rival sin respuesta.",
  trappedPiece: "Mira las casillas de cada pieza rival: una se quedó sin salida.",
  defensiveMove: "Antes de apretar, mira qué amenaza el rival: solo una jugada conserva lo que tienes.",
  bishopEndgame: "En un final de alfiles mandan los colores: ¿qué casillas controla tu alfil y cuáles no?",
  knightEndgame: "El caballo es lento: cuenta cuántos saltos necesita cada uno para llegar.",
  rookEndgame: "En un final de torres gana la torre activa: ¿dónde molesta más la tuya?",
  queenEndgame: "Con damas, primero el rey propio a salvo de jaques; después, el peón.",
  pawnEndgame: "Cuenta tiempos antes de mover: en un final de peones una sola jugada decide.",
  advancedPawn: "Un peón pasado es una ventaja que crece sola: ¿cómo lo empujas o lo aprovechas?",
  promotion: "Cuenta cuántas jugadas faltan para coronar y quién llega primero.",
  zugzwang: "A veces lo mejor es pasar el turno: ¿qué jugada deja al rival sin jugadas buenas?",
};

/* ---------- leer las candidatas ---------- */
function yaUsadas() {
  const w = {};
  new Function("window", fs.readFileSync(path.join(RAIZ, "js", "diagnostico-items.js"), "utf8"))(w);
  new Function("window", fs.readFileSync(path.join(RAIZ, "material", "ponte-a-prueba", "banco.js"), "utf8"))(w);
  new Function("window", fs.readFileSync(path.join(RAIZ, "material", "mide-tu-fuerza", "banco.js"), "utf8"))(w);
  new Function("window", fs.readFileSync(path.join(RAIZ, "material", "rompe-el-estancamiento", "banco.js"), "utf8"))(w);
  return new Set([].concat(w.DIAGNOSTICO_ITEMS || [], w.LIBRO_EXAMEN_ITEMS || [], w.MIDE_TU_FUERZA_ITEMS || [],
    w.ROMPE_EL_ESTANCAMIENTO_ITEMS || [])
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
   la posición, no solo en la etiqueta de Lichess: el «final de torres» no
   tiene más piezas que torres, reyes y peones; la jugada «tranquila» no da
   jaque ni captura; el «zugzwang» empieza sin capturar. Las etiquetas de
   Lichess miran la solución entera, y la lección habla de la posición y de la
   primera jugada. */
const SOLO = {
  pawnEndgame: /^[kKpP1-8/]+$/,
  rookEndgame: /^[kKpPrR1-8/]+$/,
  bishopEndgame: /^[kKpPbB1-8/]+$/,
  knightEndgame: /^[kKpPnN1-8/]+$/,
  queenEndgame: /^[kKpPqQ1-8/]+$/,
};
function cumple(tema, a) {
  const tablero = a.fen.split(" ")[0];
  if (SOLO[tema]) {
    // Un final «de torres» tiene torre en los dos bandos, no solo en uno.
    const pieza = { rookEndgame: "r", bishopEndgame: "b", knightEndgame: "n", queenEndgame: "q" }[tema];
    return SOLO[tema].test(tablero) && (!pieza || (tablero.includes(pieza) && tablero.includes(pieza.toUpperCase())));
  }
  if (tema === "quietMove") return !/[x+#]/.test(a.solSan);
  // El zugzwang de la lección es pasar el turno: la primera jugada no se lleva nada.
  if (tema === "zugzwang") return !/x/.test(a.solSan);
  if (tema === "promotion") return /=/.test(a.linea.join(" ")) || a.linea.some((u) => u.length === 5);
  return true;
}

/* Sirve si el motor la dejó (una sola jugada buena) y si cumple lo que el
   tema promete: las de defensa, salvar; las demás, ganar. */
function sirve(x, a) {
  if (!a || a.descarte) return false;
  if (SOLO[x.tema] && !cumple(x.tema, a)) return false;
  if (x.tema === "defensiveMove") return true;
  return a.esMate || a.gana;
}

function comoItem(x, a) {
  const ucis = x.c[4].split(" ");
  const m = L.uciAMov(a.sol);
  return {
    id: `gp_${a.id}`,
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
        id: `GP-${n}`,
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
  const texto = `/* ===== Las posiciones de «Ganar con poco», de Oscar Angulo Cubero =====
 *
 * GENERADO por herramientas/ganar-con-poco-generar.js — no se edita a mano.
 *
 * ${items.length} posiciones de la base abierta de Lichess (CC0), comprobadas con
 * Stockfish: ${ejemplos.length} ejemplos (uno por lección, los mismos del curso),
 * ${ejercicios.length} ejercicios por capítulo y ${mixtos.length} mixtos. Lo usa el libro
 * (herramientas/ganar-con-poco-pdf.js). Vive detrás del candado de
 * material/: trae las respuestas.
 */
window.GANAR_CON_POCO = {
  TITULO: 'Ganar con poco',
  AUTOR: 'Oscar Angulo Cubero',
  POR_CAPITULO: ${POR_CAPITULO},
  MIXTOS: ${MIXTOS},
  CAPITULOS: ${js(capitulos)},
};
window.GANAR_CON_POCO_ITEMS = [
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
module.exports = { TEMAS_CAPITULO, PISTA, DESCUENTO_LICHESS, cumple };
