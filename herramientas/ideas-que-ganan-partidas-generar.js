/* ===== Las posiciones de «Ideas que ganan partidas» (curso y libro) =====
 *
 * Arma, desde las candidatas de Lichess, las posiciones del curso y del libro
 * «Ideas que ganan partidas», de Oscar Angulo Cubero:
 *
 *   - material/ideas-que-ganan-partidas/banco.js: el banco del libro (el
 *     ejemplo de cada lección, los ejercicios de cada capítulo y los mixtos
 *     del final, con sus soluciones). No se edita a mano.
 *   - el campo `diagramas` de cada lección de
 *     herramientas/cursos/ideas-que-ganan-partidas.json: el ejemplo de la
 *     lección en el curso, el MISMO del libro. Se reescribe en cada corrida
 *     (el resto del archivo, el texto de las lecciones, es a mano).
 *
 * Los TEMAS del curso (el ataque al enroque, el rey en el centro, las piezas,
 * los peones, la táctica que sostiene el plan y los finales) toman como
 * referencia el índice de una colección ajena de lecciones de medio juego.
 * Ni el texto, ni las posiciones, ni los ejercicios salen de ahí:
 *
 *   - Ninguna posición se inventa ni se copia. Salen de la base abierta de
 *     ejercicios de Lichess (CC0), la tabla «Ejercicios Lichess» de Supabase,
 *     con los filtros de calidad de siempre (Popularity ≥ 85,
 *     NbPlays ≥ 1000, RatingDeviation ≤ 80, rating 1250-2549).
 *   - Cada lección pide una IDEA concreta, y la idea se comprueba en la
 *     posición, no solo en la etiqueta de Lichess (CRITERIOS): el «sacrificio
 *     del alfil en h7» es un alfil que toma en h7 con jaque, la «torre en la
 *     séptima» es una torre que llega a la séptima, el final de «alfil contra
 *     caballo» no tiene otras piezas. Las etiquetas de Lichess miran la
 *     solución entera, y la lección habla de la primera jugada.
 *   - Ninguna se cree a ciegas: pasan por el MISMO análisis de Stockfish que
 *     el diagnóstico y los otros libros (analizar() de
 *     herramientas/diagnostico-lichess.js), que solo deja las que tienen UNA
 *     jugada buena. Las de ataque además tienen que ganar (+3 o mate); las de
 *     defensa basta con que salven, porque lo que enseñan es aguantar.
 *   - Ninguna repite una del diagnóstico, de «Ponte a prueba», de «Mide tu
 *     fuerza» ni de «Rompe el estancamiento»: el mismo ejercicio en dos libros
 *     mediría memoria.
 *
 * LAS CANDIDATAS (herramientas/datos/ideas-que-ganan-partidas-candidatas.txt)
 * salen de las que ya se bajaron de esa tabla para los otros libros
 * (herramientas/datos/*-candidatas.txt) más las de mate en la última fila,
 * que ahí casi no había (consulta abajo). `--armar` las vuelve a juntar: de
 * cada idea y cada nivel, las 18 primeras que cumplen el criterio, en el
 * orden de md5(id + 'ideas').
 *
 *   with c as (select "PuzzleId" id, "FEN" fen, "Moves" mv, "Rating" r, "Themes" th,
 *       width_bucket("Rating", array[1250,1650,2050,2550]) banda
 *     from "Ejercicios Lichess" where "Popularity">=85 and "NbPlays">=1000
 *       and "RatingDeviation"<=80 and "Rating" between 1250 and 2549
 *       and "Themes" ~ '\mbackRankMate\M' and "Themes" !~ '\mmateIn1\M'),
 *   n as (select *, row_number() over (partition by banda order by md5(id || 'ideas')) k from c)
 *   select 'octava|'||banda||'|'||id||'|'||fen||'|'||mv||'|'||r||'|'||th from n where k <= 16
 *
 * Cómo se corre (hace falta Stockfish: apt install stockfish):
 *
 *   node herramientas/ideas-que-ganan-partidas-generar.js --armar   (solo si cambian las fuentes)
 *   STOCKFISH=/usr/games/stockfish node herramientas/ideas-que-ganan-partidas-generar.js
 *
 * El análisis queda en herramientas/.cache-ideas-que-ganan-partidas.json
 * (fuera del repositorio) para no repetirlo. Después: curso-posiciones.js,
 * curso-generar.py e ideas-que-ganan-partidas-pdf.js.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { Chess } = require("chess.js");

const RAIZ = path.join(__dirname, "..");
const DATOS = path.join(__dirname, "datos");
const CANDIDATAS = path.join(DATOS, "ideas-que-ganan-partidas-candidatas.txt");
const CACHE = path.join(__dirname, ".cache-ideas-que-ganan-partidas.json");
const CURSO = path.join(__dirname, "cursos", "ideas-que-ganan-partidas.json");
const SALIDA = path.join(RAIZ, "material", "ideas-que-ganan-partidas", "banco.js");
const MOTOR = process.env.STOCKFISH || "/usr/games/stockfish";

/* Igual que los otros libros: se contesta con la jugada, sin opciones. */
const DESCUENTO_LICHESS = 780;
const POR_CAPITULO = 8;
const MIXTOS = 24;
const POR_NIVEL = 18;

/* Las ideas de cada capítulo, en el orden de sus lecciones. El capítulo 6
   termina con una lección sin ejemplo (el plan de estudio). */
const IDEAS_CAPITULO = {
  1: ["concentracion", "h7", "demolicion", "mayores", "octava", "patrones"],
  2: ["reycentro", "f7", "desarrollo", "extraccion", "opuestos", "defensa"],
  3: ["septima", "caballo", "alfil", "dama", "atrapada", "calidad"],
  4: ["pasado", "coronar", "ruptura", "peonsac", "peones", "detener"],
  5: ["desviacion", "defensor", "interferencia", "clavada", "despeje", "rayosx"],
  6: ["torres", "alfiles", "alfilcaballo", "damas", "zugzwang"],
};
const TODAS = [].concat(...Object.values(IDEAS_CAPITULO));
/* Las que enseñan a aguantar: basta con que la jugada salve. */
const DEFENSA = new Set(["defensa", "detener"]);

/* ---------- lo que la posición tiene que mostrar ---------- */
const tiene = (t, re) => new RegExp("\\b(" + re + ")\\b").test(t);
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
// La fila contada desde el lado de quien la mira: la propia primera es la 1.
const fila = (sq, c) => (c === "w" ? +sq[1] : 9 - +sq[1]);

/* Lo que hace falta saber de una candidata para juzgarla: la posición que ve
   quien resuelve (después de la jugada del rival) y su primera jugada. */
function datos(fen0, jugadas) {
  const u = jugadas.split(" ");
  const g = new Chess(fen0);
  if (!g.move({ from: u[0].slice(0, 2), to: u[0].slice(2, 4), promotion: u[0][4] })) return null;
  return datosDe(g.fen(), u[1]);
}
/* Lo mismo desde la posición que ve quien resuelve y su jugada en UCI: así lo
   mira también el verificador, que solo tiene el banco. */
function datosDe(fen, uci) {
  const g = new Chess(fen);
  const yo = g.turn();
  const el = yo === "w" ? "b" : "w";
  const piezas = [];
  g.board().forEach((f, i) => f.forEach((x, j) => { if (x) piezas.push(Object.assign({ sq: "abcdefgh"[j] + (8 - i) }, x)); }));
  const m = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || "q" });
  if (!m) return null;
  const rey = (c) => piezas.find((x) => x.type === "k" && x.color === c).sq;
  return { fen, yo, el, m, piezas, tras: g.moves({ verbose: true }), reyYo: rey(yo), reyEl: rey(el), jugada: +fen.split(" ")[5] };
}
const capturable = (d) => d.tras.some((r) => r.to === d.m.to && r.captured);
const sacrificio = (d) => VAL[d.m.piece] > (d.m.captured ? VAL[d.m.captured] : 0) && capturable(d);
const cuenta = (d, c, t) => d.piezas.filter((x) => x.color === c && x.type === t).length;
const soloPiezas = (d, tipos) => d.piezas.every((x) => tipos.includes(x.type));
const enroqueCorto = (sq, c) => "fgh".includes(sq[0]) && fila(sq, c) <= 2;
function frenaAlPeon(d) {
  return d.piezas.some((x) => x.color === d.el && x.type === "p" && fila(x.sq, d.el) >= 6 && x.sq[0] === d.m.to[0]
    && (d.m.to === x.sq || fila(d.m.to, d.el) > fila(x.sq, d.el)) && d.m.piece !== "p");
}

const CRITERIOS = {
  /* 1. El ataque al rey enrocado */
  concentracion: (t, d) => tiene(t, "kingsideAttack") && !tiene(t, "mateIn1") && enroqueCorto(d.reyEl, d.el),
  h7: (t, d) => d.m.piece === "b" && d.m.to === (d.yo === "w" ? "h7" : "h2") && d.m.captured === "p" && d.m.san.includes("+"),
  demolicion: (t, d) => "nbrq".includes(d.m.piece) && d.m.captured === "p" && (d.yo === "w" ? ["g7", "h6"] : ["g2", "h3"]).includes(d.m.to)
    && sacrificio(d) && "gh".includes(d.reyEl[0]),
  mayores: (t, d) => tiene(t, "kingsideAttack") && "rq".includes(d.m.piece) && enroqueCorto(d.reyEl, d.el),
  octava: (t, d) => tiene(t, "backRankMate") && enroqueCorto(d.reyEl, d.el),
  // Solo los mates que la lección nombra o que tienen un dibujo de manual.
  patrones: (t) => tiene(t, "smotheredMate|arabianMate|anastasiaMate|hookMate|bodenMate|doubleBishopMate|dovetailMate"),
  /* 2. El rey en el centro y los enroques opuestos */
  reycentro: (t, d) => tiene(t, "exposedKing") && !tiene(t, "endgame") && "def".includes(d.reyEl[0]) && fila(d.reyEl, d.el) <= 2,
  f7: (t) => tiene(t, "attackingF2F7"),
  desarrollo: (t, d) => tiene(t, "opening") && d.jugada <= 15,
  extraccion: (t, d) => tiene(t, "attraction") && d.m.san.includes("+") && d.tras.some((r) => r.piece === "k" && r.to === d.m.to),
  opuestos: (t, d) => tiene(t, "middlegame") && (("abc".includes(d.reyEl[0]) && "gh".includes(d.reyYo[0])) || ("gh".includes(d.reyEl[0]) && "abc".includes(d.reyYo[0]))),
  defensa: (t) => tiene(t, "defensiveMove") && tiene(t, "middlegame"),
  /* 3. Las piezas en su sitio */
  septima: (t, d) => d.m.piece === "r" && fila(d.m.to, d.yo) === 7,
  caballo: (t, d) => tiene(t, "fork") && d.m.piece === "n",
  alfil: (t, d) => tiene(t, "pin|skewer|discoveredAttack|xRayAttack") && d.m.piece === "b",
  dama: (t, d) => d.m.piece === "q" && !/[x+#]/.test(d.m.san) && !tiene(t, "mate"),
  atrapada: (t) => tiene(t, "trappedPiece"),
  // La torre se entrega por una pieza menor (o queda donde una menor o un peón la toma).
  calidad: (t, d) => d.m.piece === "r" && !tiene(t, "mateIn1|pawnEndgame")
    && ((["n", "b"].includes(d.m.captured) && capturable(d)) || (!d.m.captured && d.tras.some((r) => r.to === d.m.to && "pnb".includes(r.piece)))),
  /* 4. Los peones deciden */
  pasado: (t, d) => tiene(t, "advancedPawn") && d.m.piece === "p",
  coronar: (t) => tiene(t, "promotion"),
  ruptura: (t, d) => tiene(t, "middlegame") && !tiene(t, "mate") && d.m.piece === "p" && !d.m.promotion,
  peonsac: (t, d) => d.m.piece === "p" && !d.m.promotion && capturable(d) && !tiene(t, "pawnEndgame"),
  peones: (t, d) => tiene(t, "pawnEndgame") && soloPiezas(d, "kp"),
  // La jugada frena al peón rival más avanzado: se pone delante, en su
  // columna, o lo captura.
  detener: (t, d) => frenaAlPeon(d),
  /* 5. La táctica que sostiene el plan */
  desviacion: (t) => tiene(t, "deflection"),
  defensor: (t) => tiene(t, "capturingDefender"),
  interferencia: (t) => tiene(t, "interference"),
  clavada: (t) => tiene(t, "pin"),
  despeje: (t) => tiene(t, "clearance"),
  rayosx: (t) => tiene(t, "skewer|xRayAttack"),
  /* 6. Los finales que hay que saber */
  torres: (t, d) => tiene(t, "rookEndgame") && soloPiezas(d, "kpr"),
  alfiles: (t, d) => tiene(t, "bishopEndgame") && soloPiezas(d, "kpb"),
  alfilcaballo: (t, d) => soloPiezas(d, "kpbn")
    && ((cuenta(d, "w", "b") === 1 && cuenta(d, "w", "n") === 0 && cuenta(d, "b", "n") === 1 && cuenta(d, "b", "b") === 0)
      || (cuenta(d, "b", "b") === 1 && cuenta(d, "b", "n") === 0 && cuenta(d, "w", "n") === 1 && cuenta(d, "w", "b") === 0)),
  damas: (t, d) => tiene(t, "queenEndgame") && soloPiezas(d, "kpq"),
  zugzwang: (t) => tiene(t, "zugzwang"),
};

/* Lo que cada idea le pide a quien resuelve: va como pista arriba del
   ejercicio. El texto es propio. */
const PISTA = {
  concentracion: "Cuenta atacantes y defensores alrededor del rey: si sobran los tuyos, hay algo.",
  h7: "El peón de h7 (h2) es el único defensor de esa casilla. ¿Qué pasa si se lo quitas con jaque?",
  demolicion: "Los peones del enroque son el techo del rey. Romper uno puede valer una pieza.",
  mayores: "La dama y las torres son las que dan el mate: ¿por dónde entran?",
  octava: "El rey no tiene casillas de escape: mira su última fila.",
  patrones: "Hay un mate de dibujo conocido. Busca el jaque que lo deja armado.",
  reycentro: "El rey rival sigue en el centro: abre líneas antes de que se esconda.",
  f7: "La casilla f7 (f2) solo la defiende el rey. Es el punto más débil al empezar.",
  desarrollo: "Tienes más piezas en juego que el rival. Ese tiempo hay que usarlo ahora.",
  extraccion: "Un jaque con sacrificio puede sacar al rey de su casa. Afuera está solo.",
  opuestos: "Con los reyes en flancos distintos, gana quien llegue primero.",
  defensa: "Juega por el rival primero: ¿qué amenaza? Solo una jugada lo para.",
  septima: "Una torre en la séptima ataca peones y encierra al rey.",
  caballo: "El caballo ataca dos cosas a la vez: busca la casilla.",
  alfil: "El alfil trabaja de lejos: mira la diagonal entera, hasta el final.",
  dama: "No hay jaque ni captura que sirva: la dama gana con una jugada tranquila.",
  atrapada: "Una pieza rival se quedó sin casillas. ¿Cómo la atacas?",
  calidad: "Entregar la torre por una pieza menor está bien si lo que queda vale más.",
  pasado: "Un peón pasado avanzado vale casi una pieza: empújalo.",
  coronar: "El peón está cerca de la última fila. ¿Qué hay que quitar del camino?",
  ruptura: "Un golpe de peón abre las líneas que tus piezas necesitan.",
  peonsac: "El peón se entrega a propósito: lo que importa es lo que abre.",
  peones: "Cuenta tiempos antes de mover: en un final de peones una sola jugada decide.",
  detener: "El peón rival está muy avanzado. Lo primero es frenarlo.",
  desviacion: "Una pieza rival sostiene todo. ¿Puedes obligarla a irse?",
  defensor: "Toma la pieza que defiende, y lo que defendía queda colgando.",
  interferencia: "Pon una pieza entre dos piezas rivales que se defienden.",
  clavada: "Una pieza rival no se puede mover sin dejar algo peor detrás.",
  despeje: "Una pieza tuya estorba a otra. ¿Cómo la sacas de ahí con ganancia de tiempo?",
  rayosx: "Dos piezas rivales en la misma línea: ataca la de adelante.",
  torres: "En los finales de torre manda la actividad: torre y rey activos.",
  alfiles: "En los finales de alfiles, las casillas del color de tu alfil son tuyas.",
  alfilcaballo: "Alfil contra caballo: decide quién tiene peones en los dos flancos.",
  damas: "Con damas, cada jaque cuenta: busca el que gana algo o corona.",
  zugzwang: "A veces lo mejor es dejar que el rival se ahogue: ¿qué jugada le quita las buenas?",
};

function bancoDe(archivo, global) {
  const w = {};
  new Function("window", fs.readFileSync(path.join(RAIZ, archivo), "utf8"))(w);
  return w[global] || [];
}
function yaUsadas() {
  return new Set([].concat(
    bancoDe("js/diagnostico-items.js", "DIAGNOSTICO_ITEMS"),
    bancoDe("material/ponte-a-prueba/banco.js", "LIBRO_EXAMEN_ITEMS"),
    bancoDe("material/mide-tu-fuerza/banco.js", "MIDE_TU_FUERZA_ITEMS"),
    bancoDe("material/rompe-el-estancamiento/banco.js", "ROMPE_EL_ESTANCAMIENTO_ITEMS"),
  ).map((i) => i.lichess).filter(Boolean));
}

const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const nivel = (rating) => (rating < 1650 ? 1 : rating < 2050 ? 2 : 3);

/* --armar: junta las candidatas desde las fuentes. */
function armar() {
  const usadas = yaUsadas();
  const todas = new Map();
  const leer = (archivo) => fs.readFileSync(archivo, "utf8").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.split("|"));
  fs.readdirSync(DATOS).filter((f) => f.endsWith("-candidatas.txt") && !f.startsWith("ideas-que-ganan-partidas"))
    .forEach((f) => leer(path.join(DATOS, f)).forEach((c) => todas.set(c[2], c)));
  // Las de mate en la última fila, bajadas aparte, quedan en el propio archivo.
  const propias = fs.existsSync(CANDIDATAS) ? leer(CANDIDATAS).filter((c) => c[0] === "octava") : [];
  propias.forEach((c) => todas.set(c[2], c));
  const libres = [...todas.values()].filter((c) => !usadas.has(c[2]))
    .map((c) => ({ c, d: datos(c[3], c[4]), orden: md5(c[2] + "ideas") })).filter((x) => x.d)
    .sort((a, b) => (a.orden < b.orden ? -1 : 1));
  const salida = [];
  TODAS.forEach((idea) => {
    [1, 2, 3].forEach((banda) => {
      const lista = libres.filter((x) => nivel(+x.c[5]) === banda && CRITERIOS[idea](x.c[6] || "", x.d))
        .slice(0, POR_NIVEL).map((x) => x.c);
      lista.forEach((c) => salida.push([idea, banda, c[2], c[3], c[4], c[5], c[6] || ""].join("|")));
    });
  });
  fs.writeFileSync(CANDIDATAS, `# Candidatas del curso y libro «Ideas que ganan partidas» (herramientas/ideas-que-ganan-partidas-generar.js).
# Base abierta de ejercicios de Lichess (CC0), tabla «Ejercicios Lichess» de
# Supabase. Una por línea: idea|nivel|id|FEN|jugadas|rating|temas.
# Las arma \`--armar\` del generador; de dónde sale cada una, en su cabecera.
${salida.join("\n")}
`);
  console.log(`${salida.length} candidatas.`);
}

function leerCandidatas() {
  const usadas = yaUsadas();
  return fs.readFileSync(CANDIDATAS, "utf8").split("\n")
    .filter((l) => l && !l.startsWith("#") && !usadas.has(l.split("|")[2]))
    .map((l) => {
      const [idea, banda, id, fen, mv, rating, temas] = l.split("|");
      return { idea, banda: +banda, c: [idea, +banda, id, fen, mv, +rating, temas || ""] };
    });
}

async function analizarTodo(cands) {
  const { Motor } = require("./lib/motor-uci");
  const L = require("./diagnostico-lichess.js");
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE, "utf8")); } catch (e) {}
  const vistos = new Set();
  const pendientes = cands.filter((x) => !cache[x.c[2]] && !vistos.has(x.c[2]) && vistos.add(x.c[2]));
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

/* Sirve si el motor la dejó (una sola jugada buena), si la idea se ve en la
   posición y si cumple lo que la idea promete: las de defensa, salvar; las
   demás, ganar. */
function sirve(x, a) {
  if (!a || a.descarte) return false;
  const d = datos(x.c[3], x.c[4]);
  if (!d || !CRITERIOS[x.idea](x.c[6], d)) return false;
  if (DEFENSA.has(x.idea)) return true;
  return !!(a.esMate || a.gana);
}

function lineaSan(fen, ucis) {
  const L = require("./diagnostico-lichess.js");
  const g = new Chess(fen);
  return ucis.map((u) => g.move(L.uciAMov(u))).filter(Boolean).map((m) => m.san);
}

function comoItem(x, a) {
  const L = require("./diagnostico-lichess.js");
  const ucis = x.c[4].split(" ");
  const m = L.uciAMov(a.sol);
  return {
    id: `ig_${a.id}`,
    tema: x.idea,
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
    pista: PISTA[x.idea],
    explica: L.motivo(a.temas),
    comprobado: `Ejercicio ${a.id} de la base abierta de Lichess (CC0), rating ${a.rating}. Stockfish 16 a profundidad ${L.PROFUNDIDAD}: `
      + `${L.sanEs(a.solSan)} es la mejor (${L.valor(a.v1)}) y la segunda queda en ${L.valor(a.v2)}.`,
  };
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
  if (process.argv.includes("--armar")) return armar();
  const cands = leerCandidatas();
  const cache = await analizarTodo(cands);
  if (process.argv.includes("--solo-analisis")) return;
  const curso = JSON.parse(fs.readFileSync(CURSO, "utf8"));

  const buenas = cands.filter((x) => sirve(x, cache[x.c[2]])).map((x) => ({ x, a: cache[x.c[2]] }));
  const usadas = new Set();
  const tomar = (ideas, banda, cuantas) => {
    const lista = buenas.filter((b) => ideas.includes(b.x.idea) && !usadas.has(b.a.id) && (!banda || b.x.banda === banda));
    // Repartir entre las ideas: una de cada una por turno.
    const salida = [];
    let i = 0;
    while (salida.length < cuantas && lista.length) {
      const idea = ideas[i++ % ideas.length];
      const k = lista.findIndex((b) => b.x.idea === idea && !usadas.has(b.a.id));
      if (k < 0) { if (!lista.some((b) => !usadas.has(b.a.id))) break; continue; }
      const [b] = lista.splice(k, 1);
      usadas.add(b.a.id);
      salida.push(b);
    }
    if (salida.length < cuantas) throw new Error(`Faltan posiciones de ${ideas.join("/")} (nivel ${banda || "cualquiera"}): hay ${salida.length} y hacen falta ${cuantas}. Hay que bajar más candidatas.`);
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
      if (!CRITERIOS[leccion.tema]) throw new Error(`La lección ${n} pide la idea «${leccion.tema}», que no está en CRITERIOS.`);
      let b;
      try { [b] = tomar([leccion.tema], 1, 1); } catch (e) {
        try { [b] = tomar([leccion.tema], 2, 1); } catch (e2) { [b] = tomar([leccion.tema], 3, 1); }
      }
      ejemplos.push(Object.assign({ uso: "ejemplo", capitulo: bloque.n, leccion: n }, comoItem(b.x, b.a)));
    });
  });

  /* 2. Los ejercicios de cada capítulo: 3 fáciles, 3 medios y 2 difíciles,
        de las ideas de su capítulo, ordenados por dificultad. */
  const ejercicios = [];
  Object.keys(IDEAS_CAPITULO).forEach((cap) => {
    const ideas = IDEAS_CAPITULO[cap];
    [].concat(tomar(ideas, 1, 3), tomar(ideas, 2, 3), tomar(ideas, 3, 2))
      .map((b) => Object.assign({ uso: "ejercicio", capitulo: +cap }, comoItem(b.x, b.a)))
      .sort((p, q) => p.elo - q.elo)
      .forEach((it) => ejercicios.push(it));
  });

  /* 3. Los mixtos: de todas las ideas, sin decir cuál. 8 de cada nivel. */
  const mixtos = [].concat(tomar(TODAS, 1, 8), tomar(TODAS, 2, 8), tomar(TODAS, 3, 8))
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
        id: `IG-${n}`,
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
  const capitulos = curso.bloques.map((b) => ({ n: b.n, titulo: b.titulo, ideas: IDEAS_CAPITULO[b.n] || [] }));
  const texto = `/* ===== Las posiciones de «Ideas que ganan partidas», de Oscar Angulo Cubero =====
 *
 * GENERADO por herramientas/ideas-que-ganan-partidas-generar.js — no se edita a mano.
 *
 * ${items.length} posiciones de la base abierta de Lichess (CC0), comprobadas con
 * Stockfish: ${ejemplos.length} ejemplos (uno por lección, los mismos del curso),
 * ${ejercicios.length} ejercicios por capítulo y ${mixtos.length} mixtos. Lo usa el libro
 * (herramientas/ideas-que-ganan-partidas-pdf.js). Vive detrás del candado de
 * material/: trae las respuestas.
 */
window.IDEAS_QUE_GANAN = {
  TITULO: 'Ideas que ganan partidas',
  AUTOR: 'Oscar Angulo Cubero',
  POR_CAPITULO: ${POR_CAPITULO},
  MIXTOS: ${MIXTOS},
  CAPITULOS: ${js(capitulos)},
};
window.IDEAS_QUE_GANAN_ITEMS = [
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
module.exports = { IDEAS_CAPITULO, CRITERIOS, PISTA, DESCUENTO_LICHESS, datos, datosDe };
