/* ===== Las posiciones de «Los cimientos del ajedrez» (curso y libro) =====
 *
 * Arma las posiciones del curso y del libro «Los cimientos del ajedrez», de
 * Oscar Angulo Cubero:
 *
 *   - material/los-cimientos-del-ajedrez/banco.js: el banco del libro (los
 *     ejemplos de cada lección, sus ejercicios y el repaso de cada nivel, con
 *     sus soluciones). No se edita a mano.
 *   - el campo `diagramas` de cada lección de
 *     herramientas/cursos/los-cimientos-del-ajedrez.json: los ejemplos de la
 *     lección en el curso, los MISMOS del libro. Se reescribe en cada corrida
 *     (el resto del archivo, el texto de las lecciones, es a mano).
 *
 * El temario sigue el orden de un método clásico de enseñanza en tres tomos
 * (ver «El curso y el libro "Los cimientos del ajedrez"» en
 * docs/decisiones/cursos-y-material.md). De ese método se tomaron el orden de
 * los temas y LAS PARTIDAS que cita, que son hechos: quién jugó contra quién,
 * dónde, cuándo y qué jugadas. El texto, los comentarios y la selección de
 * ejercicios son propios. Las posiciones salen de tres lugares, y ninguna se
 * inventa:
 *
 *   1. Las partidas del método (herramientas/datos/los-cimientos-partidas.json):
 *      cada una se buscó por jugadores, lugar y año en una base pública de
 *      partidas en PGN, y la posición es la de esa partida justo antes de la
 *      jugada que el método muestra. Como ejemplo, solo quedan si el motor
 *      confirma que la jugada de la partida es la mejor o vale lo mismo; como
 *      ejercicio, si es la ÚNICA buena.
 *   2. La base abierta de ejercicios de Lichess (CC0), la tabla «Ejercicios
 *      Lichess» de Supabase (herramientas/datos/los-cimientos-candidatas.txt;
 *      la consulta la arma herramientas/datos/los-cimientos-temario.py), con
 *      los filtros de calidad de siempre.
 *   3. Partidas reales de esa misma base de PGN para lo que Lichess no trae:
 *      no tiene ningún ejercicio de tablas (ahogado, jaque perpetuo) y casi
 *      ninguno de los finales teóricos (dama contra peón, dama contra torre,
 *      alfil y caballo…). Están en herramientas/datos/los-cimientos-base.json.
 *
 * Todas pasan por Stockfish 16 a profundidad 18 (herramientas/lib/motor-uci.js)
 * y ninguna repite una del diagnóstico, «Ponte a prueba», «Mide tu fuerza» ni
 * «Rompe el estancamiento».
 *
 * Cómo se corre (hace falta Stockfish: apt install stockfish):
 *
 *   STOCKFISH=/usr/games/stockfish node herramientas/los-cimientos-generar.js
 *
 * El análisis queda en herramientas/.cache-los-cimientos.json (fuera del
 * repositorio) para no repetirlo. Después: curso-posiciones.js,
 * curso-generar.py, el material de estudio y los-cimientos-pdf.js.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { Chess } = require("chess.js");
const { Motor } = require("./lib/motor-uci");
const L = require("./diagnostico-lichess.js");

const RAIZ = path.join(__dirname, "..");
const SLUG = "los-cimientos-del-ajedrez";
const CANDIDATAS = path.join(__dirname, "datos", "los-cimientos-candidatas.txt");
const PARTIDAS = path.join(__dirname, "datos", "los-cimientos-partidas.json");
const BASE = path.join(__dirname, "datos", "los-cimientos-base.json");
const CACHE = path.join(__dirname, ".cache-los-cimientos.json");
const CURSO = path.join(__dirname, "cursos", SLUG + ".json");
const SALIDA = path.join(RAIZ, "material", SLUG, "banco.js");
const MOTOR = process.env.STOCKFISH || "/usr/games/stockfish";
const PROF = L.PROFUNDIDAD;

/* Como en «Mide tu fuerza»: se contesta con la jugada, sin opciones. */
const DESCUENTO_LICHESS = 780;
const POR_LECCION = 4;
const EJEMPLOS_MAX = 2;
const REPASO = 12;
/* De qué banda de Lichess sale cada ejercicio, según el nivel. */
const BANDAS = { 1: [1, 1, 2, 2], 2: [1, 2, 2, 3], 3: [2, 2, 3, 3] };

/* Qué tipo de posición de la base de PGN sirve para cada lección. */
const DE_LA_BASE = {
  ahogado: ["ahogado"], ahogado2: ["ahogado"], perpetuo: ["perpetuo"],
  "dama-peon": ["dama-peon"], "dama-torre": ["dama-torre"], "alfil-caballo": ["alfil-caballo"],
  "caballo-peon": ["caballo-peon"], "alfil-peones": ["alfil-peones"], "alfil-malo": ["alfil-erroneo?"],
};
/* Las lecciones de tablas: la solución salva, no gana. */
const SALVAR = new Set(["ahogado", "ahogado2", "perpetuo"]);
/* La de fortalezas: Lichess no tiene ejercicios de tablas, y sus «jugadas
   defensivas» casi siempre conservan una ventaja. Lo que se le pide es que la
   solución SOSTENGA la posición (no pierde) y que cualquier otra jugada la
   empeore mucho: la única que aguanta. */
const AGUANTAR = new Set(["fortaleza"]);

/* ---------- lo que cada lección le pide a la posición ----------
   Las etiquetas de Lichess miran la solución entera; la lección habla de la
   primera jugada, así que lo que el texto promete se comprueba acá. */
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
function jugadas(fen, ucis) {
  const g = new Chess(fen);
  const out = [];
  for (const u of ucis) { const m = g.move(L.uciAMov(u)); if (!m) break; out.push(Object.assign(m, { fenTras: g.fen() })); }
  return out;
}
function esSacrificio(fen, uci) {
  const g = new Chess(fen);
  const m = g.move(L.uciAMov(uci));
  if (!m) return false;
  const ganado = m.captured ? VAL[m.captured] : 0;
  return VAL[m.piece] > ganado && g.moves({ verbose: true }).some((r) => r.to === m.to && r.captured);
}
const soloPeones = (fen) => /^[kKpP1-8/]+$/.test(fen.split(" ")[0]);
const FILTRO = {
  centro: (a) => { const m = jugadas(a.fen, [a.sol])[0]; return m && m.piece !== "p" && m.piece !== "k" && "cdef".includes(m.to[0]) && "3456".includes(m.to[1]); },
  "pieza:R": (a) => jugadas(a.fen, [a.sol])[0].piece === "r",
  "pieza:N": (a) => jugadas(a.fen, [a.sol])[0].piece === "n",
  "pieza:B": (a) => jugadas(a.fen, [a.sol])[0].piece === "b",
  "pieza:P": (a) => jugadas(a.fen, [a.sol])[0].piece === "p",
  "pieza:QR": (a) => "qr".includes(jugadas(a.fen, [a.sol])[0].piece),
  sacrificio: (a) => esSacrificio(a.fen, a.sol),
  "sac:N": (a) => jugadas(a.fen, [a.sol])[0].piece === "n" && esSacrificio(a.fen, a.sol),
  "sac:Q": (a) => jugadas(a.fen, [a.sol])[0].piece === "q" && esSacrificio(a.fen, a.sol),
  molino: (a) => jugadas(a.fen, a.linea).filter((m, i) => i % 2 === 0 && m.san.includes("+")).length >= 2,
  "come-peon": (a) => jugadas(a.fen, [a.sol])[0].captured === "p",
  septima: (a) => { const m = jugadas(a.fen, [a.sol])[0]; return m.piece === "r" && m.to[1] === (m.color === "w" ? "7" : "2"); },
  /* O cambia piezas hasta un final de peones, o ya es el final de peones al
     que se llegó cambiando: Lichess casi no trae de las primeras. */
  "cambia-a-peones": (a) => soloPeones(a.fen) || jugadas(a.fen, a.linea).some((m) => soloPeones(m.fenTras)),
};
/* El material que promete el título, en la posición que se ve (Lichess
   filtra por la de antes de la jugada del rival, que a veces corona). */
const piezas = (fen, color) => fen.split(" ")[0].replace(/[^a-zA-Z]/g, "").split("")
  .filter((c) => (color === "w" ? c === c.toUpperCase() : c === c.toLowerCase())).map((c) => c.toUpperCase()).filter((c) => c !== "K").sort().join("");
const materialEs = (fen, prueba) => prueba(piezas(fen, "w"), piezas(fen, "b")) || prueba(piezas(fen, "b"), piezas(fen, "w"));
FILTRO["dama-peon"] = (a) => materialEs(a.fen, (x, y) => x === "Q" && /^P+$/.test(y));
FILTRO["dama-torre"] = (a) => materialEs(a.fen, (x, y) => /^P*Q$/.test(x) && /^P*R$/.test(y));
for (const par of ["QN", "QR", "QB", "QP", "RB", "RN"]) {
  FILTRO["piezas:" + par] = (a) => {
    const mias = jugadas(a.fen, a.linea).filter((m, i) => i % 2 === 0).map((m) => m.piece.toUpperCase());
    return par.split("").every((p) => mias.includes(p));
  };
}

/* ---------- el motor ---------- */
const mejorQue = (x, y) => x - y;
/* Una sola jugada buena: la de la solución es la primera del motor, y la
   segunda no alcanza (si gana, la segunda no gana; si salva, la segunda pierde). */
async function juzgar(motor, fen, sol, salvar, aguantar) {
  const top = await motor.analizar(fen, 3, PROF);
  if (!top.length) return { descarte: "sin análisis" };
  if (!sol) sol = top[0].uci;
  if (top[0].uci !== sol) return { descarte: `el motor prefiere ${top[0].uci}`, top: top[0].uci };
  if (sol[4] && sol[4] !== "q") return { descarte: "coronación que no es dama" };
  const v1 = top[0].score;
  const v2 = top.length > 1 ? top[1].score : -100000;
  const esMate = top[0].mate !== null && top[0].mate > 0;
  const gana = v1 >= 300;
  const mate2 = top[1] && top[1].mate !== null && top[1].mate > 0 ? top[1].mate : null;
  if (esMate) {
    if (top[0].mate === 2 ? mate2 !== null && mate2 <= 2 : mate2 !== null) return { descarte: "otra jugada también da mate" };
  } else if (aguantar) {
    if (v1 < -150) return { descarte: "la solución no aguanta" };
    if (v2 > v1 - 250) return { descarte: "la segunda también aguanta" };
  } else if (salvar) {
    if (Math.abs(v1) > 100) return { descarte: "no es una posición de tablas" };
    if (v2 > -250) return { descarte: "la segunda también salva" };
  } else {
    if (!gana) return { descarte: "la solución no gana" };
    if (v2 > 150) return { descarte: `la segunda también gana (${L.valor(v2)})` };
  }
  return { sol, v1, v2, gana: aguantar ? false : gana || esMate, esMate, mateEn: esMate ? top[0].mate : null, pv: top[0].pv };
}
/* El ejemplo de una lección: la jugada de la partida tiene que ser la mejor o
   valer lo mismo (60 centipeones de tolerancia). No hace falta que sea única. */
async function juzgarEjemplo(motor, fen, sol) {
  const top = await motor.analizar(fen, 2, PROF);
  if (!top.length) return { descarte: "sin análisis" };
  let propia = top.find((t) => t.uci === sol);
  if (!propia) [propia] = await motor.analizar(fen, 1, PROF, [sol]);
  if (!propia) return { descarte: "la jugada no se pudo analizar" };
  const mejor = top[0];
  const tol = mejor.mate !== null && mejor.mate > 0 ? (propia.mate !== null && propia.mate > 0) : propia.score >= mejor.score - 60;
  if (!tol) return { descarte: `el motor prefiere ${mejor.uci} (${L.valor(mejor.score)} contra ${L.valor(propia.score)})` };
  if (propia.score < -150) return { descarte: "la jugada de la partida pierde" };
  return { sol, v1: propia.score, mejor: mejor.uci === sol, vMejor: mejor.score, esMate: propia.mate !== null && propia.mate > 0, mateEn: propia.mate, gana: propia.score >= 300 };
}

/* ---------- las fuentes ---------- */
function yaUsadas() {
  /* Cada banco se carga en su propia ventana: los diez volúmenes de «Mide tu
     fuerza» usan el mismo nombre global y uno pisaría al otro. */
  const items = [];
  const cargar = (rel, nombre) => {
    const w = {};
    new Function("window", fs.readFileSync(path.join(RAIZ, rel), "utf8"))(w);
    (w[nombre] || []).forEach((i) => items.push(i));
  };
  cargar("js/diagnostico-items.js", "DIAGNOSTICO_ITEMS");
  cargar("material/ponte-a-prueba/banco.js", "LIBRO_EXAMEN_ITEMS");
  fs.readdirSync(path.join(RAIZ, "material")).filter((d) => /^mide-tu-fuerza(-\d+)?$/.test(d))
    .forEach((d) => cargar(`material/${d}/banco.js`, "MIDE_TU_FUERZA_ITEMS"));
  cargar("material/rompe-el-estancamiento/banco.js", "ROMPE_EL_ESTANCAMIENTO_ITEMS");
  return {
    lichess: new Set(items.map((i) => i.lichess).filter(Boolean)),
    fens: new Set(items.map((i) => (i.fen || "").split(" ").slice(0, 4).join(" "))),
  };
}
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const clavePos = (fen) => fen.split(" ").slice(0, 4).join(" ");

function leerLichess(usadas) {
  return fs.readFileSync(CANDIDATAS, "utf8").split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const [clave, banda, id, fen, mv, rating, temas] = l.split("|");
      return { fuente: "lichess", clave, banda: +banda, id, fenPrev: fen, ucis: mv.split(" "), rating: +rating, temas: temas || "" };
    })
    .filter((c) => !usadas.lichess.has(c.id))
    .map((c) => {
      const previa = L.jugar(c.fenPrev, c.ucis[0]);
      return previa ? Object.assign(c, { fen: previa.fen, prevUci: c.ucis[0], sol: c.ucis[1], resto: c.ucis.slice(1), ultimaSan: previa.san }) : null;
    })
    .filter(Boolean);
}
function leerPartidas() {
  /* Una «partida» sin ningún jugador es una línea de muestra del libro, no
     una partida jugada: no entra. */
  return JSON.parse(fs.readFileSync(PARTIDAS, "utf8"))
    .filter((p) => p.partida && (p.partida.blancas || p.partida.negras))
    .map((p) => Object.assign(p, { fuente: "libro", id: p.id }));
}
function leerBase() {
  return JSON.parse(fs.readFileSync(BASE, "utf8")).map((b, i) => Object.assign(b, { fuente: "base", id: b.id || "pgn-" + md5(b.fen).slice(0, 8) }));
}

async function analizarTodo(tareas) {
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE, "utf8")); } catch (e) {}
  const pendientes = tareas.filter((t) => !cache[t.clave]);
  let hechos = 0;
  const motores = Array.from({ length: Math.max(1, os.cpus().length) }, () => new Motor(MOTOR));
  await Promise.all(motores.map(async (motor) => {
    while (pendientes.length) {
      const t = pendientes.shift();
      cache[t.clave] = await t.hacer(motor);
      if (++hechos % 20 === 0) {
        fs.writeFileSync(CACHE, JSON.stringify(cache));
        process.stderr.write(`${hechos}/${hechos + pendientes.length}… `);
      }
    }
    motor.cerrar();
  }));
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  return cache;
}

/* ---------- el ítem ---------- */
const BANDO = { w: "las blancas", b: "las negras" };
const mayuscula = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : "");
function apellido(nombre) {
  if (!nombre) return null;
  const n = String(nombre).trim();
  if (/^(nn|n\.n\.|\?)$/i.test(n)) return "NN";
  return n.split(",")[0].trim();
}
function cabecera(p) {
  const b = apellido(p.blancas) || "NN", n = apellido(p.negras) || "NN";
  const lugar = [p.lugar, p.anio].filter(Boolean).join(" ");
  return `${b}–${n}${lugar ? ", " + lugar : ""}`;
}
function lineaSan(fen, ucis) {
  return jugadas(fen, ucis).map((m) => m.san);
}
function comoItem(c, a, extra) {
  const m = L.uciAMov(a.sol);
  const ucisLinea = (c.resto && c.resto.length && c.resto[0] === a.sol ? c.resto : (a.pv || [a.sol])).slice(0, extra.largo || 5);
  const it = {
    id: `lc_${c.fuente === "lichess" ? "lx_" + c.id : c.id}`,
    origen: c.fuente,
    lichess: c.fuente === "lichess" ? c.id : undefined,
    rating: c.fuente === "lichess" ? c.rating : undefined,
    elo: c.fuente === "lichess" ? c.rating - DESCUENTO_LICHESS : undefined,
    partida: c.fuente !== "lichess" ? cabecera(c.partida) : undefined,
    juegan: c.fen.split(" ")[1],
    fen: c.fen,
    ultima: L.sanEs(L.jugar(c.fenPrev, c.prevUci).san),
    marca: [c.prevUci.slice(0, 2), c.prevUci.slice(2, 4)],
    solucion: m.promotion ? { from: m.from, to: m.to, promotion: m.promotion } : { from: m.from, to: m.to },
    primera: L.sanEs(L.jugar(c.fen, a.sol).san),
    lineaSan: lineaSan(c.fen, ucisLinea),
    linea: L.lineaEs(c.fen, ucisLinea, ucisLinea.length),
    gana: !!a.gana,
    valor: L.valor(a.v1),
  };
  Object.keys(it).forEach((k) => it[k] === undefined && delete it[k]);
  return Object.assign(it, extra.campos || {});
}
function comprobado(c, a, uso) {
  const v = `${L.sanEs(L.jugar(c.fen, a.sol).san)}`;
  const motor = `Stockfish 16 a profundidad ${PROF}`;
  if (uso === "ejemplo") {
    const juicio = a.mejor ? `${v} es la mejor (${L.valor(a.v1)})` : `${v} vale lo mismo que la mejor (${L.valor(a.v1)} contra ${L.valor(a.vMejor)})`;
    const quien = c.fuente === "libro" ? `Partida ${cabecera(c.partida)}` : c.fuente === "base" ? `Partida ${cabecera(c.partida)}` : `Ejercicio ${c.id} de la base abierta de Lichess (CC0), rating ${c.rating}`;
    return `${quien}. ${motor}: ${juicio}.`;
  }
  const quien = c.fuente === "lichess" ? `Ejercicio ${c.id} de la base abierta de Lichess (CC0), rating ${c.rating}` : `Partida ${cabecera(c.partida)}`;
  return `${quien}. ${motor}: ${v} es la mejor (${L.valor(a.v1)}) y la segunda queda en ${L.valor(a.v2)}.`;
}

function js(v) {
  if (Array.isArray(v)) return "[" + v.map(js).join(", ") + "]";
  if (v && typeof v === "object") return "{ " + Object.keys(v).map((k) => `${k}: ${js(v[k])}`).join(", ") + " }";
  if (typeof v === "string") return "'" + v.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
  return String(v);
}

async function main() {
  const curso = JSON.parse(fs.readFileSync(CURSO, "utf8"));
  const LECC = curso.bloques.flatMap((b) => b.lecciones.map((l) => Object.assign(l, { nivel: b.n })));
  LECC.forEach((l, i) => { l.n = i + 1; });
  const porN = Object.fromEntries(LECC.map((l) => [l.n, l]));
  const porClave = Object.fromEntries(LECC.map((l) => [l.clave, l]));
  const usadas = yaUsadas();

  /* Lo que se puede comprobar sin motor (la pieza que mueve, el sacrificio, la
     séptima…) se mira antes de analizar: con la jugada de Lichess basta. */
  const previo = (c) => {
    const f = FILTRO[porClave[c.clave].js || ""];
    try { return !f || f({ fen: c.fen, sol: c.sol, linea: c.resto }); } catch (e) { return false; }
  };
  const lichess = leerLichess(usadas).filter((c) => porClave[c.clave] && previo(c));
  const partidas = leerPartidas().filter((p) => porN[p.leccion] && !usadas.fens.has(clavePos(p.fen)));
  const base = leerBase();

  const tareas = [];
  const sufijo = (clave) => (SALVAR.has(clave) ? ":s" : AGUANTAR.has(clave) ? ":a" : "");
  lichess.forEach((c) => tareas.push({ clave: "lx:" + c.id + sufijo(c.clave), hacer: (m) => juzgar(m, c.fen, c.sol, SALVAR.has(c.clave), AGUANTAR.has(c.clave)) }));
  partidas.forEach((p) => {
    if (p.rol === "ejemplo") tareas.push({ clave: "ej:" + p.id, hacer: (m) => juzgarEjemplo(m, p.fen, p.sol) });
    else tareas.push({ clave: "pr:" + p.id + (SALVAR.has(porN[p.leccion].clave) ? ":s" : ""), hacer: (m) => juzgar(m, p.fen, p.sol, SALVAR.has(porN[p.leccion].clave)) });
  });
  /* En los finales teóricos vale ganar o, si no hay cómo, la única jugada que
     salva (dama contra peón de alfil en séptima, el alfil equivocado…). */
  const claveBase = (b) => "pg:" + b.id + (b.tipo === "ahogado" || b.tipo === "perpetuo" ? ":s" : ":gs");
  base.forEach((b) => {
    const salvar = b.tipo === "ahogado" || b.tipo === "perpetuo";
    tareas.push({ clave: claveBase(b), hacer: async (m) => {
      if (salvar) return juzgar(m, b.fen, b.sol, true);
      const a = await juzgar(m, b.fen, b.sol, false);
      return a.descarte === "la solución no gana" ? juzgar(m, b.fen, b.sol, true) : a;
    } });
  });
  const cache = await analizarTodo(tareas);
  if (process.argv.includes("--solo-analisis")) return;

  const resLichess = (c) => cache["lx:" + c.id + sufijo(c.clave)];
  const resPartida = (p) => cache[(p.rol === "ejemplo" ? "ej:" : "pr:") + p.id + (p.rol !== "ejemplo" && SALVAR.has(porN[p.leccion].clave) ? ":s" : "")];
  const resBase = (b) => cache[claveBase(b)];

  const posUsadas = new Set();
  const libre = (fen) => !posUsadas.has(clavePos(fen)) && !usadas.fens.has(clavePos(fen));
  const tomar = (fen) => posUsadas.add(clavePos(fen));

  /* Lo que pide la lección se cumple en la posición (FILTRO), además de
     tener una sola jugada buena. Las de ahogado, además, terminan en ahogado. */
  const sirveLichess = (l) => (c) => {
    const a = resLichess(c);
    if (!a || a.descarte || c.clave !== l.clave || !libre(c.fen)) return false;
    const f = FILTRO[l.js || ""];
    return !f || f(Object.assign({}, a, { fen: c.fen, linea: c.resto }));
  };
  const terminaEnAhogado = (b) => { const g = new Chess(b.fen); for (const u of b.resto) if (!g.move(L.uciAMov(u))) return false; return g.in_stalemate(); };
  const sirveBase = (l) => (b) => {
    const a = resBase(b);
    if (!a || a.descarte || !(DE_LA_BASE[l.clave] || []).includes(b.tipo) || !libre(b.fen)) return false;
    if (b.tipo === "ahogado" && !terminaEnAhogado(b)) return false;
    return true;
  };

  const items = [];
  const ejemplosCurso = {};
  const informe = [];
  for (const l of LECC) {
    const ejemplos = [];
    /* 1. Los ejemplos: las partidas del método que el motor confirma. */
    partidas.filter((p) => p.leccion === l.n && p.rol === "ejemplo").forEach((p) => {
      const a = resPartida(p);
      if (ejemplos.length >= EJEMPLOS_MAX || !a || a.descarte || !libre(p.fen)) return;
      tomar(p.fen);
      ejemplos.push(comoItem(p, a, { largo: 7, campos: { uso: "ejemplo", leccion: l.n, nivel: l.nivel, explica: mayuscula(p.idea), comprobado: comprobado(p, a, "ejemplo") } }));
    });
    /* Si el método no trae ninguna que sirva, un ejemplo de las otras fuentes. */
    if (!ejemplos.length) {
      const deBase = base.filter(sirveBase(l));
      const deLichess = lichess.filter(sirveLichess(l)).sort((x, y) => x.banda - y.banda || x.rating - y.rating);
      const c = deBase[0] || deLichess.find((x) => x.banda <= 2) || deLichess[0];
      if (c) {
        const a = c.fuente === "lichess" ? resLichess(c) : resBase(c);
        tomar(c.fen);
        ejemplos.push(comoItem(c, a, { largo: c.tipo === "ahogado" ? 12 : 7, campos: { uso: "ejemplo", leccion: l.n, nivel: l.nivel, explica: c.fuente === "lichess" ? L.motivo(c.temas) : "", comprobado: comprobado(c, a, "ejercicio") } }));
      }
    }
    ejemplos.forEach((e) => items.push(e));
    ejemplosCurso[l.n] = ejemplos;

    /* 2. Los ejercicios: primero las partidas del método que tienen una sola
          jugada buena; después, de la base de PGN y de Lichess por banda. */
    const ejercicios = [];
    partidas.filter((p) => p.leccion === l.n && p.rol === "ejercicio").forEach((p) => {
      const a = resPartida(p);
      if (ejercicios.length >= POR_LECCION || !a || a.descarte || !libre(p.fen)) return;
      tomar(p.fen);
      ejercicios.push(comoItem(p, a, { campos: { uso: "ejercicio", leccion: l.n, nivel: l.nivel, explica: mayuscula(p.idea), comprobado: comprobado(p, a, "ejercicio") } }));
    });
    base.filter(sirveBase(l)).forEach((b) => {
      if (ejercicios.length >= POR_LECCION || !libre(b.fen)) return;
      const a = resBase(b);
      tomar(b.fen);
      ejercicios.push(comoItem(b, a, { largo: b.tipo === "ahogado" ? 12 : 5, campos: { uso: "ejercicio", leccion: l.n, nivel: l.nivel, explica: "", comprobado: comprobado(b, a, "ejercicio") } }));
    });
    const bandas = BANDAS[l.nivel].slice(ejercicios.length);
    for (const banda of bandas) {
      const lista = lichess.filter(sirveLichess(l));
      const c = lista.find((x) => x.banda === banda) || lista.sort((x, y) => Math.abs(x.banda - banda) - Math.abs(y.banda - banda))[0];
      if (!c) break;
      tomar(c.fen);
      const a = resLichess(c);
      ejercicios.push(comoItem(c, a, { campos: { uso: "ejercicio", leccion: l.n, nivel: l.nivel, explica: L.motivo(c.temas), comprobado: comprobado(c, a, "ejercicio") } }));
    }
    if (ejercicios.length < POR_LECCION && process.env.SOLO_FALTAN) { console.log(`FALTAN ${l.n} ${l.clave}: ${ejercicios.length}`); continue; }
    if (ejercicios.length < POR_LECCION) throw new Error(`La lección ${l.n} (${l.clave}) tiene ${ejercicios.length} ejercicios y hacen falta ${POR_LECCION}: hay que bajar más candidatas.`);
    ejercicios.sort((x, y) => (x.elo || 0) - (y.elo || 0)).forEach((e) => items.push(e));
    informe.push(`${l.n} ${l.clave}: ${ejemplos.map((e) => e.origen).join("+") || "sin ejemplo"} · ejercicios ${ejercicios.map((e) => ({ libro: "m", base: "b", lichess: "l" })[e.origen]).join("")}`);
  }

  /* 3. El repaso de cada nivel: posiciones que sobraron de sus lecciones, de
        todos los temas, sin decir cuál. Solo de las que ganan. */
  for (const nivel of [1, 2, 3]) {
    const lecs = LECC.filter((l) => l.nivel === nivel && !SALVAR.has(l.clave) && !AGUANTAR.has(l.clave));
    const repaso = [];
    let vuelta = 0;
    while (repaso.length < REPASO && vuelta < 10) {
      for (const l of lecs) {
        if (repaso.length >= REPASO) break;
        const h = md5(l.clave + vuelta);
        if (parseInt(h.slice(0, 2), 16) % 2) continue;
        const c = lichess.filter(sirveLichess(l)).find((x) => x.banda === Math.min(3, nivel + 1)) || lichess.filter(sirveLichess(l))[0];
        if (!c) continue;
        tomar(c.fen);
        const a = resLichess(c);
        repaso.push(comoItem(c, a, { campos: { uso: "repaso", leccion: l.n, nivel, explica: L.motivo(c.temas), comprobado: comprobado(c, a, "ejercicio") } }));
      }
      vuelta++;
    }
    repaso.sort((x, y) => (x.elo || 0) - (y.elo || 0)).forEach((e) => items.push(e));
  }

  let k = 0;
  items.forEach((it) => { it.n = ++k; });

  /* Los ejemplos de cada lección, en el curso: los mismos del libro. */
  for (const l of LECC) {
    const lista = ejemplosCurso[l.n];
    if (!lista.length) { delete l.diagramas; continue; }
    l.diagramas = lista.map((it, i) => ({
      id: `LC-${l.n}${lista.length > 1 ? "-" + (i + 1) : ""}`,
      fen: it.fen,
      turno: it.juegan,
      resultado: it.gana ? (it.juegan === "w" ? "1-0" : "0-1") : "½",
      pregunta: `${l.pregunta} Juegan ${BANDO[it.juegan]}; el rival acaba de jugar ${it.juegan === "w" ? "…" : ""}${it.ultima}.`,
      comentario: `${it.partida ? it.partida + ". " : ""}${it.linea}. ${it.explica ? it.explica.replace(/\.?$/, ".") + " " : ""}${l.enlace || ""} (${it.comprobado})`.replace(/\s+/g, " ").trim(),
      linea: it.lineaSan,
    }));
  }
  const limpio = JSON.parse(JSON.stringify(curso));
  limpio.bloques.forEach((b) => b.lecciones.forEach((l) => { delete l.nivel; delete l.n; }));
  if (process.env.SOLO_FALTAN) return;
  fs.writeFileSync(CURSO, JSON.stringify(limpio, null, 2) + "\n");

  const cuerpo = items.map((it) => {
    const copia = Object.assign({}, it);
    delete copia.lineaSan;
    return "  {\n" + Object.keys(copia).map((key) => `    ${key}: ${js(copia[key])},`).join("\n") + "\n  },";
  }).join("\n");
  const niveles = curso.bloques.map((b) => ({ n: b.n, titulo: b.titulo }));
  const texto = `/* ===== Las posiciones de «Los cimientos del ajedrez», de Oscar Angulo Cubero =====
 *
 * GENERADO por herramientas/los-cimientos-generar.js — no se edita a mano.
 *
 * ${items.length} posiciones comprobadas con Stockfish: ${items.filter((i) => i.uso === "ejemplo").length} ejemplos (los mismos del
 * curso), ${items.filter((i) => i.uso === "ejercicio").length} ejercicios (${POR_LECCION} por lección) y ${items.filter((i) => i.uso === "repaso").length} de repaso. De partidas del
 * método: ${items.filter((i) => i.origen === "libro").length}; de otras partidas reales de la base de PGN: ${items.filter((i) => i.origen === "base").length};
 * de la base abierta de Lichess (CC0): ${items.filter((i) => i.origen === "lichess").length}. Lo usa el libro
 * (herramientas/los-cimientos-pdf.js). Vive detrás del candado de material/:
 * trae las respuestas.
 */
window.LOS_CIMIENTOS = {
  TITULO: 'Los cimientos del ajedrez',
  AUTOR: 'Oscar Angulo Cubero',
  POR_LECCION: ${POR_LECCION},
  REPASO: ${REPASO},
  NIVELES: ${js(niveles)},
};
window.LOS_CIMIENTOS_ITEMS = [
${cuerpo}
];
`;
  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  fs.writeFileSync(SALIDA, texto);
  console.log(informe.join("\n"));
  console.log(`\n${items.length} posiciones. Del método: ${items.filter((i) => i.origen === "libro").length} (ejemplos ${items.filter((i) => i.origen === "libro" && i.uso === "ejemplo").length}). De la base: ${items.filter((i) => i.origen === "base").length}. De Lichess: ${items.filter((i) => i.origen === "lichess").length}.`);
}

if (require.main === module) main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
module.exports = { FILTRO, DE_LA_BASE, SALVAR, AGUANTAR, juzgar, juzgarEjemplo };
