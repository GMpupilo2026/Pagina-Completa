/* ===== El banco del libro «Mide tu fuerza» =====
 *
 * Arma el banco de cada volumen del libro de ejercicios tácticos de Oscar
 * Angulo Cubero: 360 posiciones en 45 tests temáticos de 8, en tres niveles.
 * El volumen 1 va en material/mide-tu-fuerza/banco.js y cada uno de los
 * siguientes en su propia carpeta (material/mide-tu-fuerza-2/banco.js…), que es
 * también su propio material para compartir. El mismo banco sirve para el
 * libro impreso (herramientas/mide-tu-fuerza-pdf.js) y su versión accesible.
 *
 * Todos los volúmenes tienen la misma forma (los mismos temas, niveles y
 * tiempos) y posiciones distintas: ninguna se repite entre volúmenes.
 *
 * El MÉTODO toma como referencia los libros de tests por tema (cada test, un
 * solo motivo táctico; ocho posiciones; tiempo fijo; 5 puntos por posición;
 * premio o castigo por el tiempo; la suma pasada a una fuerza en Elo). Las
 * posiciones, los textos, los tiempos y las tablas son propios:
 *
 *   - Ninguna posición se inventa ni se copia de un libro. Salen de la base
 *     abierta de ejercicios de Lichess (CC0), la tabla «Ejercicios Lichess» de
 *     Supabase, con filtros de calidad (Popularity ≥ 85, NbPlays ≥ 1000,
 *     RatingDeviation ≤ 80). Las candidatas están en
 *     herramientas/datos/mide-tu-fuerza-candidatas.txt (volumen 1) y
 *     mide-tu-fuerza-N-candidatas.txt (volumen N).
 *   - Ninguna se cree a ciegas: pasan por el MISMO análisis de Stockfish que
 *     el diagnóstico y «Ponte a prueba» (analizar() de
 *     herramientas/diagnostico-lichess.js), que solo deja las que tienen UNA
 *     jugada buena. Acá además se exige que gane (+3 o mate): un test de
 *     combinaciones promete que hay una, y si la posición solo empata, quien
 *     busca el golpe busca algo que no está.
 *   - Ninguna repite una pregunta del diagnóstico ni una posición de «Ponte a
 *     prueba», ni una de otro volumen: el mismo ejercicio en dos pruebas
 *     mediría memoria.
 *   - El tema de cada test es el que Lichess le puso a la posición. Si tiene
 *     varios, manda el más raro (el orden de TEMAS en la consulta): un jaque
 *     doble casi siempre es también un ataque a la descubierta, y al revés no.
 *   - La dificultad (`elo`) sale del rating de Lichess menos 780: el descuento
 *     de las preguntas de mover del diagnóstico (400) más el corrimiento que
 *     midió su calibración (380). Acá se contesta igual: sin opciones, con la
 *     jugada y la línea.
 *
 * El banco vive en material/ y no en js/: trae las respuestas,
 * y así lo sirve el worker solo a quien puede bajar el material (administración
 * o con quien se compartió desde admin.html#materiales).
 *
 * NO se edita a mano el banco.js de ningún volumen: se vuelve a correr esto.
 *
 * Cómo se corre (hace falta Stockfish: apt install stockfish):
 *
 *   STOCKFISH=/usr/games/stockfish node herramientas/mide-tu-fuerza-generar.js      # volumen 1
 *   STOCKFISH=/usr/games/stockfish node herramientas/mide-tu-fuerza-generar.js 2    # volumen 2 (y 3…)
 *
 * El análisis queda en herramientas/.cache-mide-tu-fuerza.json (fuera del
 * repositorio) para no repetirlo.
 *
 * LA CONSULTA de las candidatas (Supabase, proyecto AjedrezIntegral), bajada
 * con «tema|nivel|id|FEN|jugadas|rating|temas», un renglón por candidata:
 *
 *   with t(orden, tema) as (values
 *     (1,'doubleCheck'),(2,'interference'),(3,'clearance'),(4,'xRayAttack'),(5,'intermezzo'),
 *     (6,'trappedPiece'),(7,'capturingDefender'),(8,'attraction'),(9,'deflection'),(10,'skewer'),
 *     (11,'discoveredAttack'),(12,'pin'),(13,'fork'),(14,'quietMove'),(15,'advancedPawn')
 *   ), c as (
 *     select e."PuzzleId" id, e."FEN" fen, e."Moves" mv, e."Rating" r, e."Themes" th,
 *       (select t.tema from t
 *         where e."Themes" ~ ('\m' || t.tema || '\M') and e."Themes" !~ '\mmate\M'
 *         order by t.orden limit 1) tema,
 *       width_bucket(e."Rating", array[1250,1650,2050,2550]) banda
 *     from "Ejercicios Lichess" e
 *     where e."Popularity">=85 and e."NbPlays">=1000 and e."RatingDeviation"<=80
 *       and e."Rating" between 1250 and 2549
 *   ), n as (select *, row_number() over (partition by tema, banda order by md5(id)) k
 *            from c where tema is not null)
 *   select … from n where k <= 20                 -- volumen 1
 *   select … from n where k between 21 and 40     -- volumen 2
 *   select … from n where k between 41 and 60     -- volumen 3
 *   select … from n where k between 61 and 80     -- volumen 4 (ver su archivo:
 *                                                    los temas que ya no tenían 20
 *                                                    se completan con un filtro
 *                                                    algo más ancho)
 *   volumen 5: las 20 siguientes que no tomó ningún volumen anterior, en orden
 *              de calidad (ver la cabecera de su archivo de candidatas)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { Motor } = require("./lib/motor-uci");
const L = require("./diagnostico-lichess.js");

const RAIZ = path.join(__dirname, "..");
const CACHE = path.join(__dirname, ".cache-mide-tu-fuerza.json");

/* El producto de cada volumen: la carpeta de material/ y el nombre que usa
   la base para compartirlo (admin.html#materiales). */
function producto(volumen) {
  return volumen === 1 ? "mide-tu-fuerza" : `mide-tu-fuerza-${volumen}`;
}
function banco(volumen) {
  return path.join(RAIZ, "material", producto(volumen), "banco.js");
}
/* Los volúmenes que ya tienen banco, en orden. */
function volumenes() {
  const v = [];
  for (let n = 1; fs.existsSync(banco(n)); n++) v.push(n);
  return v;
}
const VOLUMEN = +(process.argv[2] || 1);
const CANDIDATAS = path.join(__dirname, "datos", `${producto(VOLUMEN)}-candidatas.txt`);
const SALIDA = banco(VOLUMEN);
const MOTOR = process.env.STOCKFISH || "/usr/games/stockfish";

const POR_TEST = 8;
const DESCUENTO_LICHESS = 780;

/* Los temas, en el orden del libro: de lo más conocido a lo más fino, como se
   aprende. El texto de cada uno es propio. */
const TEMAS = [
  { id: "fork", nombre: "Ataque doble",
    idea: "Una sola pieza ataca dos cosas a la vez y el rival solo puede salvar una. El caballo es el especialista, pero la dama, el alfil, la torre, el peón y hasta el rey dan ataques dobles.",
    pista: "Busca dos piezas rivales sin defensa, o el rey y una pieza grande: ¿hay una casilla desde la que una de tus piezas las toque a las dos?" },
  { id: "discoveredAttack", nombre: "Ataque a la descubierta",
    idea: "Una pieza se aparta y destapa el ataque de otra que estaba detrás. Son dos amenazas en una jugada: la de la pieza que se mueve y la de la que queda libre.",
    pista: "Mira tus piezas de largo alcance (dama, torres, alfiles) tapadas por una pieza propia: ¿adónde puede ir la de adelante para que su jugada también amenace?" },
  { id: "doubleCheck", nombre: "Jaque doble",
    idea: "Dos piezas dan jaque a la vez. No se puede tapar ni capturar a las dos: el rey está obligado a moverse, y eso suele terminar en mate o en una gran ganancia.",
    pista: "Cuando una pieza tapa a otra que apunta al rey, prueba la jugada que, además de destapar, también da jaque." },
  { id: "pin", nombre: "La clavada",
    idea: "Una pieza no se puede mover porque detrás está el rey (o algo más valioso). La clavada se aprovecha atacando a la pieza clavada con más fuerzas de las que la defienden.",
    pista: "Busca piezas rivales en línea con su rey o su dama: ¿puedes clavarlas, o atacar más a la que ya está clavada?" },
  { id: "skewer", nombre: "La enfilada",
    idea: "Es la clavada al revés: se ataca la pieza más valiosa, que tiene que apartarse, y cae la que estaba detrás en la misma línea.",
    pista: "Si el rey o la dama rivales están en línea con otra pieza, un jaque o un ataque por esa línea puede ganarla." },
  { id: "deflection", nombre: "Desviación",
    idea: "Una pieza rival cumple una tarea importante: defiende una casilla o a otra pieza. Se la obliga a irse de ahí, casi siempre con una captura o un jaque, y la tarea queda sin hacer.",
    pista: "Pregúntate qué defiende cada pieza rival. Si una sola sostiene todo, ofrécele algo que no pueda rechazar." },
  { id: "attraction", nombre: "Atracción",
    idea: "Se lleva a una pieza rival, muchas veces el rey, a una casilla donde queda mal: al alcance de un ataque doble, de una clavada o del mate. Suele costar un sacrificio.",
    pista: "Piensa en qué casilla te convendría tener al rey o a la dama del rival, y cómo obligarlos a ir ahí." },
  { id: "interference", nombre: "Interferencia",
    idea: "Una pieza se mete entre una pieza rival y lo que esta defiende, y corta la línea. De golpe, la defensa deja de funcionar.",
    pista: "Busca dos piezas rivales que se cuidan por una línea: ¿hay una casilla en medio donde puedas poner una pieza?" },
  { id: "clearance", nombre: "Despeje",
    idea: "Una pieza propia estorba: ocupa la casilla o tapa la línea que otra necesita. Se la quita con ganancia de tiempo (jaque, captura, amenaza) y la otra entra.",
    pista: "Si una jugada ganaría pero la casilla está ocupada por una pieza tuya, busca cómo sacarla de ahí con fuerza." },
  { id: "capturingDefender", nombre: "Eliminación del defensor",
    idea: "Se captura a la pieza que defiende, aunque cueste material, y lo que estaba defendido queda sin protección.",
    pista: "Cuenta atacantes y defensores de lo que quieres ganar. Si hay un solo defensor, ¿puedes capturarlo?" },
  { id: "xRayAttack", nombre: "Rayos X",
    idea: "Una pieza actúa a través de otra que está en medio: ataca o defiende una casilla aunque haya una pieza entre ambas, porque cuando esa pieza se mueve o se cambia, la línea queda abierta.",
    pista: "Al calcular cambios en una línea, cuenta también las piezas de atrás: la dama detrás de una torre o la torre detrás de otra." },
  { id: "intermezzo", nombre: "Jugada intermedia",
    idea: "Antes de la jugada que parece obligada (recapturar, salvar una pieza), se intercala otra más fuerte: un jaque o una amenaza que el rival tiene que atender.",
    pista: "Antes de recapturar por reflejo, mira si tienes un jaque o una amenaza mayor que cambie el orden." },
  { id: "trappedPiece", nombre: "Pieza atrapada",
    idea: "Una pieza rival se quedó sin casillas de escape. Se la ataca y no tiene adónde ir.",
    pista: "Busca piezas rivales metidas en tu campo o encerradas por sus propios peones: cuenta sus casillas de escape." },
  { id: "quietMove", nombre: "Jugada tranquila",
    idea: "La jugada que gana no es un jaque ni una captura: es una jugada silenciosa que deja una amenaza sin defensa o quita las últimas casillas al rival.",
    pista: "Si los jaques y las capturas no alcanzan, busca la jugada que mejora una pieza y deja dos amenazas a la vez." },
  { id: "advancedPawn", nombre: "El peón avanzado",
    idea: "Un peón cerca de coronar vale casi una pieza. Se gana empujándolo en el momento justo, desviando a quien lo frena o sacrificando material para abrirle paso.",
    pista: "Cuenta cuántas jugadas le faltan al peón para coronar y quién lo puede frenar: ¿puedes quitar a ese guardián?" },
];

/* Tres niveles, como tres tomos. El tiempo de cada test sale de la
   dificultad: con 8 posiciones, 4, 5 y 6 minutos por posición. Se escribe
   en el banco para que el libro y quien lo use en clase digan lo mismo. */
const NIVELES = [
  { n: 1, nombre: "Primer nivel", rating: "1250 a 1649", minutos: 30 },
  { n: 2, nombre: "Segundo nivel", rating: "1650 a 2049", minutos: 40 },
  { n: 3, nombre: "Tercer nivel", rating: "2050 a 2549", minutos: 50 },
];

/* ---------- leer las candidatas ---------- */
function yaUsadas() {
  const w = {};
  new Function("window", fs.readFileSync(path.join(RAIZ, "js", "diagnostico-items.js"), "utf8"))(w);
  new Function("window", fs.readFileSync(path.join(RAIZ, "material", "ponte-a-prueba", "banco.js"), "utf8"))(w);
  const usadas = (w.DIAGNOSTICO_ITEMS || []).concat(w.LIBRO_EXAMEN_ITEMS || []).map((i) => i.lichess).filter(Boolean);
  // Las de los otros volúmenes: cada volumen trae posiciones nuevas.
  volumenes().filter((v) => v !== VOLUMEN).forEach((v) => {
    const o = {};
    new Function("window", fs.readFileSync(banco(v), "utf8"))(o);
    o.MIDE_TU_FUERZA_ITEMS.forEach((i) => usadas.push(i.lichess));
  });
  return new Set(usadas);
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

/* Sirve si el motor la dejó (una sola jugada buena) y si de verdad gana. */
function sirve(a) {
  return a && !a.descarte && (a.esMate || a.gana);
}

/* Ocho de cada tema y nivel. Si un nivel está flaco (los jaques dobles y los
   rayos X difíciles casi no existen en la base), lo completa el nivel vecino
   con las de rating más cercano: así ningún test queda corto sin inventar. */
function elegir(cands, cache) {
  const usadas = new Set();
  const tests = [];
  NIVELES.forEach((nivel) => {
    TEMAS.forEach((tema) => {
      const buenas = cands
        .filter((x) => x.tema === tema.id)
        .map((x) => ({ x, a: cache[x.c[2]] }))
        .filter(({ a }) => sirve(a));
      const elegidas = [];
      const orden = [nivel.n, nivel.n - 1, nivel.n + 1].filter((k) => k >= 1 && k <= 3);
      for (const k of orden) {
        const lista = buenas.filter((b) => b.x.banda === k && !usadas.has(b.a.id));
        if (k < nivel.n) lista.sort((p, q) => q.a.rating - p.a.rating);
        if (k > nivel.n) lista.sort((p, q) => p.a.rating - q.a.rating);
        for (const b of lista) {
          if (elegidas.length === POR_TEST) break;
          elegidas.push(b); usadas.add(b.a.id);
        }
        if (elegidas.length === POR_TEST) break;
      }
      if (elegidas.length < POR_TEST) {
        throw new Error(`«${tema.nombre}», ${nivel.nombre}: hay ${elegidas.length} posiciones buenas y hacen falta ${POR_TEST}. Hay que bajar más candidatas.`);
      }
      tests.push({ nivel: nivel.n, tema: tema.id, elegidas });
    });
  });
  return tests;
}

function comoItem(x, a, tema) {
  const ucis = x.c[4].split(" ");
  const m = L.uciAMov(a.sol);
  const juegan = a.fen.split(" ")[1];
  return {
    id: `mf_${a.id}`,
    tema,
    lichess: a.id,
    rating: a.rating,
    elo: a.rating - DESCUENTO_LICHESS,
    juegan,
    fen: a.fen,
    ultima: L.sanEs(a.ultima),
    // De dónde a dónde fue la última jugada del rival: el diagrama la marca.
    marca: [ucis[0].slice(0, 2), ucis[0].slice(2, 4)],
    solucion: m.promotion ? { from: m.from, to: m.to, promotion: m.promotion } : { from: m.from, to: m.to },
    primera: L.sanEs(a.solSan),
    // La línea entera de la solución de Lichess: lo que hay que ver para
    // llevarse los 5 puntos.
    linea: L.lineaEs(a.fen, a.linea, a.linea.length),
    mate: a.esMate ? a.mateEn : null,
    explica: L.motivo(a.temas),
    comprobado: `Ejercicio ${a.id} de la base abierta de Lichess (CC0), rating ${a.rating}. Stockfish 16 a profundidad ${L.PROFUNDIDAD}: `
      + `${L.sanEs(a.solSan)} es la mejor (${L.valor(a.v1)}) y la segunda queda en ${L.valor(a.v2)}.`,
  };
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
  const tests = elegir(cands, cache);
  let n = 0;
  const items = [];
  tests.forEach((t, k) => {
    t.elegidas
      .map(({ x, a }) => comoItem(x, a, t.tema))
      .sort((p, q) => p.elo - q.elo || (p.id < q.id ? -1 : 1))
      .forEach((it) => items.push(Object.assign({ n: ++n, test: k + 1, nivel: t.nivel }, it)));
  });

  const cuerpo = items.map((it) => "  {\n" + Object.keys(it).map((k) => `    ${k}: ${js(it[k])},`).join("\n") + "\n  },").join("\n");
  const texto = `/* ===== El banco del libro «Mide tu fuerza», volumen ${VOLUMEN}, de Oscar Angulo Cubero =====
 *
 * GENERADO por herramientas/mide-tu-fuerza-generar.js — no se edita a mano.
 *
 * ${items.length} posiciones de la base abierta de Lichess (CC0), comprobadas con
 * Stockfish, en ${tests.length} tests temáticos de ${POR_TEST} (${TEMAS.length} temas en ${NIVELES.length} niveles).
 * Cada posición se contesta con la jugada y la línea; la buena vale 5 puntos.
 * Lo usan el libro impreso (herramientas/mide-tu-fuerza-pdf.js) y su versión
 * accesible. Vive detrás del candado de material/: trae las respuestas, y solo
 * lo baja quien tiene el material.
 */
window.MIDE_TU_FUERZA = {
  TITULO: 'Mide tu fuerza',
  VOLUMEN: ${VOLUMEN},
  PRODUCTO: '${producto(VOLUMEN)}',
  AUTOR: 'Oscar Angulo Cubero',
  POR_TEST: ${POR_TEST},
  PUNTOS: 5,
  TEMAS: ${js(TEMAS)},
  NIVELES: ${js(NIVELES)},
};
window.MIDE_TU_FUERZA_ITEMS = [
${cuerpo}
];
`;
  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  fs.writeFileSync(SALIDA, texto);

  const desc = Object.values(cache).filter((a) => a.descarte).length;
  const noGana = Object.values(cache).filter((a) => !a.descarte && !(a.esMate || a.gana)).length;
  const prestadas = items.filter((it) => {
    const b = it.rating < 1650 ? 1 : it.rating < 2050 ? 2 : 3;
    return b !== it.nivel;
  }).length;
  console.log(`\n${items.length} posiciones en ${tests.length} tests. Descartadas por el motor: ${desc}; no ganan: ${noGana}; de ${cands.length} candidatas.`);
  console.log(`Tomadas del nivel vecino: ${prestadas}. Juegan las negras: ${items.filter((i) => i.juegan === "b").length}.`);
  NIVELES.forEach((nv) => {
    const de = items.filter((i) => i.nivel === nv.n).map((i) => i.elo);
    console.log(`${nv.nombre}: elo ${Math.min(...de)} a ${Math.max(...de)}`);
  });
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { TEMAS, NIVELES, DESCUENTO_LICHESS, POR_TEST, producto, banco, volumenes };
