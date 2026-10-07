/* ===== Las posiciones de «¿Cambio o no cambio?» (curso y libro) =====
 *
 * Arma, desde las candidatas de Lichess, las posiciones del curso y del libro
 * «¿Cambio o no cambio?», de Oscar Angulo Cubero:
 *
 *   - material/cambio-o-no-cambio/banco.js: el banco del libro (los ejemplos
 *     de cada lección, los ejercicios de cada capítulo y los mixtos del final,
 *     con sus soluciones). No se edita a mano.
 *   - el campo `diagramas` de cada lección de
 *     herramientas/cursos/cambio-o-no-cambio.json: el ejemplo de la lección en
 *     el curso, el MISMO del libro. Se reescribe en cada corrida (el resto del
 *     archivo, el texto de las lecciones, es a mano).
 *
 * El TEMA del curso toma como referencia la idea de un libro ajeno (el cambio
 * de piezas como decisión estratégica: qué pieza se va, qué queda y cómo se
 * transforma la partida). Ni el texto, ni las posiciones, ni los ejercicios
 * salen de ese libro:
 *
 *   - Ninguna posición se inventa ni se copia. Salen de la base abierta de
 *     ejercicios de Lichess (CC0), la tabla «Ejercicios Lichess» de Supabase,
 *     con los filtros de calidad de siempre (Popularity ≥ 85,
 *     NbPlays ≥ 1000, RatingDeviation ≤ 80). Las candidatas están en
 *     herramientas/datos/cambio-o-no-cambio-candidatas.txt (la consulta,
 *     abajo).
 *   - Ninguna se cree a ciegas: pasan por el MISMO análisis de Stockfish que
 *     el diagnóstico y los otros libros (analizar() de
 *     herramientas/diagnostico-lichess.js), que solo deja las que tienen UNA
 *     jugada buena. Las de ataque además tienen que ganar (+3 o mate); las de
 *     defensa (defensiveMove) basta con que salven.
 *   - Ninguna repite una del diagnóstico, de «Ponte a prueba», de los diez
 *     volúmenes de «Mide tu fuerza» ni de «Rompe el estancamiento».
 *   - Lo que la lección dice del CAMBIO se comprueba en la línea de la
 *     solución con chess.js, no se cree a la etiqueta (cambios()): «se cambian
 *     las damas» quiere decir que en la línea una dama se come a una dama y la
 *     otra se recaptura en la misma casilla; «lleva a un final de peones», que
 *     al final de la línea solo quedan reyes y peones; «no cambia», que podía
 *     cambiar una pieza por otra igual y la solución no lo hace.
 *
 * Cómo se corre (hace falta Stockfish: apt install stockfish):
 *
 *   STOCKFISH=/usr/games/stockfish node herramientas/cambio-o-no-cambio-generar.js
 *
 * El análisis queda en herramientas/.cache-cambio-o-no-cambio.json (fuera del
 * repositorio) para no repetirlo. Después: curso-posiciones.js,
 * curso-generar.py y cambio-o-no-cambio-pdf.js.
 *
 * LA CONSULTA de las candidatas (Supabase, proyecto AjedrezIntegral), bajada
 * con «tema|nivel|id|FEN|jugadas|rating|temas», un renglón por candidata:
 *
 *   with t(orden, tema) as (values
 *     (1,'capturingDefender'),(2,'pawnEndgame'),(3,'bishopEndgame'),(4,'knightEndgame'),
 *     (5,'queenEndgame'),(6,'queenRookEndgame'),(7,'rookEndgame'),(8,'zugzwang'),
 *     (9,'defensiveMove'),(10,'advancedPawn'),(11,'quietMove'),(12,'trappedPiece')
 *   ), c as (
 *     select e."PuzzleId" id, e."FEN" fen, e."Moves" mv, e."Rating" r, e."Themes" th,
 *       (select t.tema from t where e."Themes" ~ ('\m' || t.tema || '\M') order by t.orden limit 1) tema,
 *       width_bucket(e."Rating", array[1250,1650,2050,2550]) banda
 *     from "Ejercicios Lichess" e
 *     where e."Popularity">=85 and e."NbPlays">=1000 and e."RatingDeviation"<=80
 *       and e."Rating" between 1250 and 2549 and e."Themes" !~ '\mmate\M'
 *   ), n as (select *, row_number() over (partition by tema, banda order by md5(id || 'cambio')) k
 *            from c where tema is not null)
 *   select … from n where k <= 40
 */
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { Chess } = require("chess.js");
const L = require("./diagnostico-lichess.js");

const RAIZ = path.join(__dirname, "..");
const CANDIDATAS = path.join(__dirname, "datos", "cambio-o-no-cambio-candidatas.txt");
const CACHE = path.join(__dirname, ".cache-cambio-o-no-cambio.json");
const CURSO = path.join(__dirname, "cursos", "cambio-o-no-cambio.json");
const SALIDA = path.join(RAIZ, "material", "cambio-o-no-cambio", "banco.js");
const MOTOR = process.env.STOCKFISH || "/usr/games/stockfish";

/* Igual que «Mide tu fuerza» y «Rompe el estancamiento»: se contesta con la
   jugada, sin opciones. */
const DESCUENTO_LICHESS = 780;
const POR_CAPITULO = 8;
const MIXTOS = 24;

/* Los temas de Lichess de cada capítulo y lo que tiene que pasar con los
   cambios en la línea de cada ejercicio (exige(), abajo). El capítulo 6 (los
   cambios paradójicos y el método) no lleva ejercicios propios: los mixtos
   del final hacen ese papel. */
const CAPITULOS = {
  1: { temas: ["capturingDefender", "quietMove", "queenEndgame"], exige: "cambio" },
  2: { temas: ["knightEndgame", "bishopEndgame", "capturingDefender", "zugzwang"], exige: "cambio-m" },
  3: { temas: ["queenEndgame", "rookEndgame", "queenRookEndgame", "capturingDefender"], exige: "cambio-pesada" },
  4: { temas: ["pawnEndgame", "rookEndgame", "queenEndgame", "knightEndgame", "zugzwang"], exige: "final" },
  5: { temas: ["defensiveMove"], exige: null },
};
const TODOS = ["capturingDefender", "pawnEndgame", "bishopEndgame", "knightEndgame", "queenEndgame",
  "queenRookEndgame", "rookEndgame", "zugzwang", "defensiveMove", "advancedPawn", "quietMove", "trappedPiece"];

/* Lo que cada tema le pide a quien resuelve: va como pista arriba del
   ejercicio. El texto es propio. */
const PISTA = {
  capturingDefender: "Una pieza rival defiende todo. ¿Qué pasa si la cambias?",
  pawnEndgame: "Sin piezas, cada tiempo cuenta: calcula el final de peones hasta el final.",
  bishopEndgame: "Mira de qué color son las casillas de los peones y de los alfiles antes de mover.",
  knightEndgame: "Un caballo menos cambia todo el final: ¿quién gana si se van los caballos?",
  queenEndgame: "Con damas, el rey nunca está tranquilo. ¿Te conviene que se vayan?",
  queenRookEndgame: "Hay damas y torres: decide cuál de ellas te sobra y cuál te hace falta.",
  rookEndgame: "Antes de cambiar las torres, cuenta el final de peones que queda.",
  zugzwang: "Después de los cambios, el que tiene que mover pierde. ¿A quién le toca?",
  defensiveMove: "Juega por el rival primero: ¿qué amenaza? Solo una jugada lo para.",
  advancedPawn: "El peón avanzado vale más que su punto: ¿qué pieza le estorba la coronación?",
  quietMove: "No hay captura que gane ya: busca la jugada tranquila que obliga al cambio que te sirve.",
  trappedPiece: "Una pieza sin casillas vale menos que su valor. ¿Cuál está atrapada?",
};

/* Lo que el texto de la lección dice que pasa con los cambios, comprobado en
   la línea de la solución. Se cuenta como CAMBIO una captura contestada en la
   misma casilla por una captura de una pieza de la misma clase (dama por
   dama, torre por torre, alfil o caballo por alfil o caballo), en cualquier
   orden de bandos. */
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const CLASE = { p: "p", n: "m", b: "m", r: "r", q: "q", k: "k" };
function cambios(fen, ucis) {
  const g = new Chess(fen);
  const inicial = fen.split(" ")[0];
  const disponibles = g.moves({ verbose: true })
    .filter((m) => m.captured && CLASE[m.captured] === CLASE[m.piece] && CLASE[m.piece] !== "p");
  const hechas = [];
  for (const u of ucis) {
    const m = g.move(L.uciAMov(u));
    if (!m) break;
    hechas.push(m);
  }
  const lista = [];
  for (let i = 0; i + 1 < hechas.length; i++) {
    const a = hechas[i], b = hechas[i + 1];
    if (a.captured && b.captured && b.to === a.to && CLASE[a.captured] === CLASE[b.captured] && CLASE[a.captured] !== "p") {
      lista.push(CLASE[a.captured]);
    }
  }
  const tablero = g.fen().split(" ")[0];
  return {
    lista,
    // Alguna captura de la línea se lleva una pieza de su misma clase (aunque
    // la recaptura quede fuera de la línea): ahí ya empezó un cambio.
    capturaPareja: hechas.some((m) => m.captured && CLASE[m.captured] === CLASE[m.piece] && CLASE[m.piece] !== "p"),
    primeraCaptura: !!(hechas[0] && hechas[0].captured),
    primeraJaque: !!(hechas[0] && /[+#]/.test(hechas[0].san)),
    podiaCambiar: disponibles.length > 0,
    finalDePeones: /^[kKpP1-8/]+$/.test(tablero),
    alfilesDistintos: alfilesDeDistintoColor(fen),
    conDamas: /Q/.test(inicial) && /q/.test(inicial),
  };
}

/* Un alfil por bando, cada uno en casillas de un color distinto. */
function alfilesDeDistintoColor(fen) {
  const filas = fen.split(" ")[0].split("/");
  const alfiles = [];
  filas.forEach((f, r) => {
    let c = 0;
    for (const ch of f) {
      if (/\d/.test(ch)) { c += +ch; continue; }
      if (ch === "B" || ch === "b") alfiles.push({ blanco: ch === "B", claro: (r + c) % 2 === 0 });
      c += 1;
    }
  });
  const b = alfiles.filter((a) => a.blanco), n = alfiles.filter((a) => !a.blanco);
  return b.length === 1 && n.length === 1 && b[0].claro !== n[0].claro;
}

/* ¿Cumple la posición lo que promete el texto? */
function exige(regla, c) {
  if (!regla) return true;
  if (regla === "cambio") return c.lista.length > 0;
  if (regla === "cambio-tranquila") return c.lista.length > 0 && !c.primeraCaptura && !c.primeraJaque;
  if (regla === "decision") return c.lista.length > 0 || exige("sin-cambio", c);
  if (regla === "cambio-q") return c.lista.includes("q");
  if (regla === "cambio-r") return c.lista.includes("r");
  if (regla === "cambio-m") return c.lista.includes("m");
  if (regla === "cambio-pesada") return c.lista.includes("q") || c.lista.includes("r");
  if (regla === "a-peones") return c.lista.length > 0 && c.finalDePeones;
  if (regla === "final") return c.finalDePeones;
  if (regla === "sin-cambio") return c.podiaCambiar && !c.primeraCaptura && c.lista.length === 0 && !c.capturaPareja;
  if (regla === "sin-cambio-damas") return exige("sin-cambio", c) && c.conDamas;
  if (regla === "distinto-color") return c.alfilesDistintos;
  throw new Error(`Regla desconocida: ${regla}`);
}

/* ---------- leer las candidatas ---------- */
/* Los bancos que ya tienen posiciones de Lichess. «Mide tu fuerza» son diez
   volúmenes (material/mide-tu-fuerza, mide-tu-fuerza-2 … -10) y todos ponen
   su lista en la misma variable: se juntan de a uno. */
function bancosAnteriores() {
  const archivos = [path.join("js", "diagnostico-items.js"), path.join("material", "ponte-a-prueba", "banco.js"),
    path.join("material", "rompe-el-estancamiento", "banco.js")]
    .concat(fs.readdirSync(path.join(RAIZ, "material")).filter((d) => /^mide-tu-fuerza(-\d+)?$/.test(d))
      .map((d) => path.join("material", d, "banco.js")));
  const items = [];
  archivos.forEach((f) => {
    const w = {};
    new Function("window", fs.readFileSync(path.join(RAIZ, f), "utf8"))(w);
    items.push(...[].concat(w.DIAGNOSTICO_ITEMS || [], w.LIBRO_EXAMEN_ITEMS || [], w.MIDE_TU_FUERZA_ITEMS || [],
      w.ROMPE_EL_ESTANCAMIENTO_ITEMS || []));
  });
  return items;
}
function yaUsadas() {
  return new Set(bancosAnteriores().map((i) => i.lichess).filter(Boolean));
}

function leerCandidatas() {
  const usadas = yaUsadas();
  return fs.readFileSync(CANDIDATAS, "utf8").split("\n")
    .filter((l) => l && !l.startsWith("#") && !usadas.has(l.split("|")[2]))
    .map((l) => {
      const [tema, banda, id, fen, mv, rating, temas] = l.split("|");
      const ucis = mv.split(" ");
      const g = new Chess(fen);
      if (!g.move(L.uciAMov(ucis[0]))) return null;
      return { tema, banda: +banda, c: [tema, +banda, id, fen, mv, +rating, temas || ""], cambios: cambios(g.fen(), ucis.slice(1)) };
    })
    .filter(Boolean);
}

/* Solo se le pide al motor lo que podría servir: las que tienen un cambio en
   la línea, las que podían cambiar y no lo hacen, y las de los temas que no
   necesitan cambio (finales de peones, zugzwang, defensa). */
function vale(x) {
  return x.cambios.lista.length > 0 || exige("sin-cambio", x.cambios) || x.cambios.alfilesDistintos
    || ["pawnEndgame", "zugzwang", "defensiveMove", "bishopEndgame", "trappedPiece"].includes(x.tema);
}

async function analizarTodo(cands) {
  const { Motor } = require("./lib/motor-uci");
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

/* Sirve si el motor la dejó (una sola jugada buena) y si cumple lo que el
   tema promete: las de defensa, salvar; las demás, ganar. */
function sirve(x, a) {
  if (!a || a.descarte) return false;
  if (x.tema === "pawnEndgame" && !/^[kKpP1-8/]+$/.test(a.fen.split(" ")[0])) return false;
  if (x.tema === "defensiveMove") return true;
  return a.esMate || a.gana;
}

/* Lo que pasa con los cambios en la línea, dicho en palabras para el
   comentario. */
const NOMBRE_CLASE = { q: "las damas", r: "las torres", m: "una pieza menor por otra" };
function queCambia(c) {
  if (!c.lista.length) return "";
  const nombres = [...new Set(c.lista)].map((k) => NOMBRE_CLASE[k]);
  const lista = nombres.length > 1 ? nombres.slice(0, -1).join(", ") + " y " + nombres[nombres.length - 1] : nombres[0];
  return `En la línea se cambian ${lista}${c.finalDePeones ? ", y queda un final de peones" : ""}.`;
}

/* El motivo según las etiquetas de Lichess, sin las que la PRIMERA jugada
   desmiente: las etiquetas miran la solución entera, y el comentario habla de
   la jugada que se busca. Una «jugada tranquila» no captura ni da jaque, y
   un «sacrificio» entrega material con esa misma jugada. */
function motivo(a) {
  let temas = a.temas.split(" ");
  if (/[x+#]/.test(a.solSan)) temas = temas.filter((t) => t !== "quietMove");
  // Un «sacrificio» entrega algo con la primera jugada: la pieza que se mueve
  // vale más que lo que se lleva y el rival la puede capturar.
  if (temas.includes("sacrifice")) {
    const g = new Chess(a.fen);
    const m = g.move(L.uciAMov(a.sol));
    const entrega = VAL[m.piece] > (m.captured ? VAL[m.captured] : 0) && g.moves({ verbose: true }).some((r) => r.to === m.to && r.captured);
    if (!entrega) temas = temas.filter((t) => t !== "sacrifice");
  }
  return L.motivo(temas.join(" "));
}

function comoItem(x, a) {
  const ucis = x.c[4].split(" ");
  const m = L.uciAMov(a.sol);
  return {
    id: `cc_${a.id}`,
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
    cambios: x.cambios.lista,
    finalDePeones: x.cambios.finalDePeones,
    pista: PISTA[x.tema],
    explica: [queCambia(x.cambios), motivo(a)].filter(Boolean).join(" "),
    comprobado: `Ejercicio ${a.id} de la base abierta de Lichess (CC0), rating ${a.rating}. Stockfish 16 a profundidad ${L.PROFUNDIDAD}: `
      + `${L.sanEs(a.solSan)} es la mejor (${L.valor(a.v1)}) y la segunda queda en ${L.valor(a.v2)}.`,
  };
}

function lineaSan(fen, ucis) {
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
  const cands = leerCandidatas().filter(vale);
  const cache = await analizarTodo(cands);
  if (process.argv.includes("--solo-analisis")) return;
  const buenas = cands.filter((x) => sirve(x, cache[x.c[2]])).map((x) => ({ x, a: cache[x.c[2]] }));

  if (process.argv.includes("--cuantas")) {
    const reglas = [null, "cambio", "cambio-tranquila", "decision", "cambio-q", "cambio-r", "cambio-m", "cambio-pesada", "a-peones", "final", "sin-cambio", "distinto-color"];
    const tabla = {};
    TODOS.forEach((t) => {
      tabla[t] = {};
      reglas.forEach((r) => {
        tabla[t][r || "—"] = [1, 2, 3].map((bd) => buenas.filter((b) => b.x.tema === t && b.x.banda === bd && exige(r, b.x.cambios)).length).join("/");
      });
    });
    console.table(tabla);
    return;
  }

  const curso = JSON.parse(fs.readFileSync(CURSO, "utf8"));
  const usadas = new Set();
  const tomar = (temas, banda, cuantas, regla, soloGana) => {
    const lista = buenas.filter((b) => temas.includes(b.x.tema) && !usadas.has(b.a.id) && (!banda || b.x.banda === banda)
      && exige(regla, b.x.cambios) && (!soloGana || b.a.gana || b.a.esMate));
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
    if (salida.length < cuantas) throw new Error(`Faltan posiciones de ${temas.join("/")} (nivel ${banda || "cualquiera"}, ${regla || "sin regla"}): hay ${salida.length} y hacen falta ${cuantas}. Hay que bajar más candidatas.`);
    return salida;
  };

  /* 1. El ejemplo de cada lección, del nivel más bajo que tenga: es para
        entender la idea, no para trabarse. */
  const ejemplos = [];
  let n = 0;
  curso.bloques.forEach((bloque) => {
    bloque.lecciones.forEach((leccion) => {
      n += 1;
      if (!leccion.tema) { delete leccion.diagramas; return; }
      // «gana»: el texto de la lección dice que la jugada conserva la ventaja.
      let b;
      for (const banda of [1, 2, 3]) {
        try { [b] = tomar([].concat(leccion.tema), banda, 1, leccion.exige, leccion.gana); break; } catch (e) { if (banda === 3) throw e; }
      }
      ejemplos.push(Object.assign({ uso: "ejemplo", capitulo: bloque.n, leccion: n, exige: leccion.exige || "" }, comoItem(b.x, b.a)));
    });
  });

  /* 2. Los ejercicios de cada capítulo: 3 fáciles, 3 medios y 2 difíciles,
        de los temas de su capítulo, ordenados por dificultad. */
  const ejercicios = [];
  Object.keys(CAPITULOS).forEach((cap) => {
    const { temas, exige: regla } = CAPITULOS[cap];
    const elegidas = [].concat(tomar(temas, 1, 3, regla), tomar(temas, 2, 3, regla), tomar(temas, 3, 2, regla));
    elegidas.map((b) => Object.assign({ uso: "ejercicio", capitulo: +cap, exige: regla || "" }, comoItem(b.x, b.a)))
      .sort((p, q) => p.elo - q.elo)
      .forEach((it) => ejercicios.push(it));
  });

  /* 3. Los mixtos: de todos los temas, sin decir cuál; todos con un cambio en
        la línea o una decisión de no cambiar. 8 de cada nivel. */
  const conDecision = (banda) => tomar(TODOS, banda, 8, "decision");
  const mixtos = [].concat(conDecision(1), conDecision(2), conDecision(3))
    .map((b) => Object.assign({ uso: "mixto", capitulo: 0, exige: "" }, comoItem(b.x, b.a)))
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
        id: `CC-${n}`,
        fen: it.fen,
        turno: it.juegan,
        resultado: resultado(it),
        pregunta: `${leccion.pregunta || ""} Juegan ${bando}; el rival acaba de jugar ${it.juegan === "w" ? "…" : ""}${it.ultima}.`.trim(),
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
  const capitulos = curso.bloques.map((b) => ({ n: b.n, titulo: b.titulo, temas: (CAPITULOS[b.n] || {}).temas || [] }));
  const texto = `/* ===== Las posiciones de «¿Cambio o no cambio?», de Oscar Angulo Cubero =====
 *
 * GENERADO por herramientas/cambio-o-no-cambio-generar.js — no se edita a mano.
 *
 * ${items.length} posiciones de la base abierta de Lichess (CC0), comprobadas con
 * Stockfish: ${ejemplos.length} ejemplos (uno por lección, los mismos del curso),
 * ${ejercicios.length} ejercicios por capítulo y ${mixtos.length} mixtos. Lo usa el libro
 * (herramientas/cambio-o-no-cambio-pdf.js). Vive detrás del candado de
 * material/: trae las respuestas.
 */
window.CAMBIO_O_NO_CAMBIO = {
  TITULO: '¿Cambio o no cambio?',
  AUTOR: 'Oscar Angulo Cubero',
  POR_CAPITULO: ${POR_CAPITULO},
  MIXTOS: ${MIXTOS},
  CAPITULOS: ${js(capitulos)},
};
window.CAMBIO_O_NO_CAMBIO_ITEMS = [
${cuerpo}
];
`;
  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  fs.writeFileSync(SALIDA, texto);

  const desc = Object.values(cache).filter((a) => a.descarte).length;
  console.log(`\n${items.length} posiciones: ${ejemplos.length} ejemplos, ${ejercicios.length} ejercicios, ${mixtos.length} mixtos.`);
  console.log(`Buenas: ${buenas.length} de ${cands.length} candidatas analizadas (descartadas por el motor: ${desc}).`);
  console.log(`Con un cambio en la línea: ${items.filter((i) => i.cambios.length).length}. Juegan las negras: ${items.filter((i) => i.juegan === "b").length}. Solo salvan: ${items.filter((i) => !i.gana).length}.`);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { CAPITULOS, PISTA, DESCUENTO_LICHESS, cambios, exige, bancosAnteriores };
