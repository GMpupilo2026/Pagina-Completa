/* ===== El banco de la prueba de estilo =====
 *
 * Arma las 45 posiciones de la prueba de estilo (js/estilo-items.js): 15 por
 * eje (atacar o maniobrar, abrir o cerrar, cambiar o mantener piezas). Cada
 * posición trae DOS jugadas que Stockfish valora casi igual y que son de
 * carácter opuesto en su eje: como las dos son buenas, no hay respuesta
 * correcta, y lo que la persona elige dice qué tipo de juego prefiere.
 *
 *   - Ninguna posición se inventa: salen de partidas reales que ya están en el
 *     repositorio (las casi 2000 de «Una clase al día», las 33 de «Cambiar o
 *     no cambiar» y las 18 de «Ganar con poco»), en la jugada 8 a la 35, sin
 *     venir de una captura ni de un jaque (con una recaptura pendiente, una de
 *     las dos jugadas sería obligada) y sin estar en jaque. Ninguna es una
 *     posición que «Una clase al día» pregunta o dibuja (sus `claves` y
 *     `diagramas`, con dos medias jugadas de margen): quien hizo el curso la
 *     reconocería.
 *   - Las dos jugadas son PAREJAS para el motor: a profundidad 20, cada una a
 *     30 centipeones o menos de la mejor jugada de la posición (y por lo
 *     tanto entre ellas), y la posición no está decidida (la mejor, entre
 *     −1,5 y +1,5). Si una fuera claramente mejor, la pregunta mediría fuerza
 *     y no gusto.
 *   - El carácter opuesto lo miden las funciones de js/estilo-medidas.js,
 *     con la línea del motor que sigue a cada jugada, y
 *     con los umbrales de UMBRAL: mucha diferencia en su eje y poca en los
 *     otros dos, para que cada pregunta mida una sola cosa.
 *   - Una sola posición por partida, y en cada eje al menos 5 con cada color
 *     al turno: el estilo no se mide solo con blancas.
 *
 * El análisis se guarda en herramientas/.cache-estilo.json (fuera del
 * repositorio). La salida reemplaza el bloque entre ESTILO-INICIO y
 * ESTILO-FIN de js/estilo-items.js, que NO se edita a mano.
 *
 * Cómo se corre (hace falta Stockfish: apt install stockfish):
 *
 *   STOCKFISH=/usr/games/stockfish node herramientas/estilo-generar.js
 *
 * Y después: node herramientas/verificar-todo.js estilo
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Chess } = require("chess.js");
const { Motor } = require("./lib/motor-uci");
const M = require("../js/estilo-medidas");
const PartidasMaestros = require("./lib/partidas-maestros");

const RAIZ = path.join(__dirname, "..");
const BANCO = path.join(RAIZ, "js/estilo-items.js");
const CACHE = path.join(__dirname, ".cache-estilo.json");
const RUTA = process.env.STOCKFISH || "/usr/games/stockfish";
const HILOS = +process.env.HILOS || 4;

const PROF_RAPIDA = 12;       // primer barrido: multipv 5
const PROF = 20;              // confirmación de cada pregunta
const PAREJAS = 30;           // centipeones: cada jugada a lo más esto de la mejor
const DECIDIDA = 150;         // la mejor jugada, entre −DECIDIDA y +DECIDIDA
const POR_EJE = 15;
const MIN_COLOR = 5;          // por eje, al menos esto con cada color al turno
const PLY_DESDE = 14, PLY_HASTA = 70, CADA = 3;
const EJES = ["ataque", "estructura", "cambios"];

const huella = (s) => crypto.createHash("md5").update(s).digest("hex");

/* ---------- Las partidas ---------- */

const partidas = () => PartidasMaestros.leer(Chess);

/* Las posiciones de una partida que pueden ser pregunta. */
function posiciones(p) {
  const c = new Chess(p.inicial);
  const out = [];
  const desfase = parseInt(huella(p.id).slice(0, 2), 16) % CADA;
  for (let ply = 0; ply < p.sans.length; ply++) {
    const m = c.move(p.sans[ply]);
    if (!m) break;
    const n = ply + 1;     // medias jugadas hechas
    if (n < PLY_DESDE || n > PLY_HASTA || (n - desfase) % CADA) continue;
    if (p.vetadas.has(n)) continue;
    if (/[x+#]/.test(m.san) || c.in_check() || c.game_over()) continue;
    out.push({ fen: c.fen(), ply: n, enLaPartida: p.sans[n] || null });
  }
  return out;
}

/* ---------- El motor, en paralelo y con caché ---------- */

const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
let sinGuardar = 0;
function guardarCache(forzar) {
  if (!forzar && ++sinGuardar < 200) return;
  sinGuardar = 0;
  fs.writeFileSync(CACHE, JSON.stringify(cache));
}

const motores = Array.from({ length: HILOS }, () => new Motor(RUTA));
const libres = [...motores];
const cola = [];
function conMotor(fn) {
  return new Promise((ok, mal) => {
    const correr = (m) => fn(m).then((r) => { ok(r); soltar(m); }, (e) => { mal(e); soltar(m); });
    const m = libres.pop();
    m ? correr(m) : cola.push(correr);
  });
}
function soltar(m) { const sig = cola.shift(); sig ? sig(m) : libres.push(m); }

async function analizar(fen, multipv, prof, mueves) {
  const k = [fen, multipv, prof, mueves || ""].join("|");
  if (!cache[k]) {
    const r = await conMotor((m) => m.analizar(fen, multipv, prof, mueves ? [mueves] : undefined));
    cache[k] = r.map((x) => ({ uci: x.uci, score: x.score, pv: x.pv.slice(0, 6) }));
    guardarCache();
  }
  return cache[k];
}

const uciASan = (fen, uci) => {
  const c = new Chess(fen);
  const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  return m && m.san;
};

/* ---------- Las preguntas ---------- */

/* Primer barrido: las parejas de jugadas que podrían ser pregunta de un eje. */
function candidatasDe(pos, lineas) {
  if (!lineas.length || Math.abs(lineas[0].score) > DECIDIDA) return [];
  const buenas = lineas.filter((l) => lineas[0].score - l.score <= PAREJAS && Math.abs(l.score) < 50000);
  const out = [];
  for (let i = 0; i < buenas.length; i++) {
    for (let j = i + 1; j < buenas.length; j++) {
      let ma, mb;
      try { ma = M.medir(Chess, pos.fen, buenas[i].pv); mb = M.medir(Chess, pos.fen, buenas[j].pv); } catch (e) { continue; }
      for (const eje of EJES) {
        const ta = M.tipoDeJugada(Chess, pos.fen, buenas[i].uci), tb = M.tipoDeJugada(Chess, pos.fen, buenas[j].uci);
        if (M.poloDe(eje, ma, mb, ta, tb)) out.push({ eje, a: buenas[i].uci, b: buenas[j].uci, fuerza: Math.abs(ma[eje] - mb[eje]) / M.UMBRAL[eje].polo });
      }
    }
  }
  return out;
}

/* Confirmación a profundidad 20: cada jugada por separado y la mejor de la
 * posición; las medidas se vuelven a tomar con las líneas buenas. */
async function confirmar(pos, cand) {
  const [mejor] = await analizar(pos.fen, 1, PROF);
  if (!mejor || Math.abs(mejor.score) > DECIDIDA) return null;
  const [la] = await analizar(pos.fen, 1, PROF, cand.a);
  const [lb] = await analizar(pos.fen, 1, PROF, cand.b);
  if (!la || !lb) return null;
  // A profundidad 20 una de las dos puede valer más que la «mejor» de la
  // búsqueda general: se mide contra la más alta de las tres.
  const tope = Math.max(mejor.score, la.score, lb.score);
  if (tope - la.score > PAREJAS || tope - lb.score > PAREJAS) return null;
  if (Math.abs(la.score) > DECIDIDA || Math.abs(lb.score) > DECIDIDA) return null;
  const pa = la.pv.slice(0, 4), pb = lb.pv.slice(0, 4);
  const ma = M.medir(Chess, pos.fen, pa), mb = M.medir(Chess, pos.fen, pb);
  const polo = M.poloDe(cand.eje, ma, mb, M.tipoDeJugada(Chess, pos.fen, cand.a), M.tipoDeJugada(Chess, pos.fen, cand.b));
  if (!polo) return null;
  return {
    eje: cand.eje, polo, mejor: tope,
    a: { uci: cand.a, san: uciASan(pos.fen, cand.a), eval: la.score, linea: pa, medidas: ma },
    b: { uci: cand.b, san: uciASan(pos.fen, cand.b), eval: lb.score, linea: pb, medidas: mb },
    fuerza: Math.abs(ma[cand.eje] - mb[cand.eje]) / M.UMBRAL[cand.eje].polo,
  };
}

async function main() {
  if (!fs.existsSync(RUTA)) { console.error("Falta Stockfish en " + RUTA + " (apt install stockfish, o STOCKFISH=/ruta)."); process.exit(2); }
  const lista = partidas();
  const todas = [];
  for (const p of lista) for (const pos of posiciones(p)) todas.push({ p, pos });
  console.log(lista.length + " partidas, " + todas.length + " posiciones para el primer barrido");

  const candidatas = [];
  let hechas = 0;
  await Promise.all(todas.map(async ({ p, pos }) => {
    const lineas = await analizar(pos.fen, 5, PROF_RAPIDA);
    for (const c of candidatasDe(pos, lineas)) candidatas.push({ p, pos, c });
    if (++hechas % 1000 === 0) console.log("  " + hechas + " / " + todas.length + " (" + candidatas.length + " candidatas)");
  }));
  guardarCache(true);
  const porEje = {};
  EJES.forEach((e) => (porEje[e] = candidatas.filter((x) => x.c.eje === e).length));
  console.log("Candidatas del primer barrido: " + JSON.stringify(porEje));

  /* Se confirman primero las de más diferencia en su eje, una por partida y
   * eje, en tandas, hasta tener de sobra para elegir (CONFIRMAR por eje). */
  const CONFIRMAR = 60;
  const confirmadas = [];
  for (const eje of EJES) {
    const mejorPorPartida = new Map();
    for (const x of candidatas) {
      if (x.c.eje !== eje) continue;
      const y = mejorPorPartida.get(x.p.id);
      if (!y || x.c.fuerza > y.c.fuerza) mejorPorPartida.set(x.p.id, x);
    }
    const orden = [...mejorPorPartida.values()]
      .map((x) => ({ ...x, h: huella(x.pos.fen + eje) }))
      .sort((x, y) => (y.c.fuerza - x.c.fuerza) || (x.h < y.h ? -1 : 1));
    let n = 0;
    for (let i = 0; i < orden.length && n < CONFIRMAR; i += 4 * HILOS) {
      const tanda = await Promise.all(orden.slice(i, i + 4 * HILOS).map(async (x) => ({ x, r: await confirmar(x.pos, x.c) })));
      for (const { x, r } of tanda) if (r) { confirmadas.push({ ...x, r }); n++; }
      guardarCache(true);
    }
    console.log("Eje «" + eje + "»: " + n + " confirmadas a profundidad " + PROF + " (de " + orden.length + " partidas con candidata)");
  }

  /* La elección: por eje, las de más fuerza, una por partida en todo el
   * banco, y al menos MIN_COLOR con cada color al turno. */
  const usadas = new Set();
  const banco = [];
  for (const eje of EJES) {
    const del = confirmadas.filter((x) => x.r.eje === eje)
      .sort((x, y) => (y.r.fuerza - x.r.fuerza) || (x.h < y.h ? -1 : 1));
    const elegidas = [];
    const turno = (x) => x.pos.fen.split(" ")[1];
    const tomar = (filtro) => {
      for (const x of del) {
        if (elegidas.length >= POR_EJE) return;
        // Una partida, una pregunta; y una posición, una pregunta (dos partidas
        // llegan a la misma por otro orden de jugadas).
        const tab = x.pos.fen.split(" ").slice(0, 2).join(" ");
        if (usadas.has(x.p.id) || usadas.has(tab) || elegidas.includes(x) || !filtro(x)) continue;
        usadas.add(x.p.id);
        usadas.add(tab);
        elegidas.push(x);
      }
    };
    for (const color of ["w", "b"]) {
      const antes = elegidas.length;
      tomar((x) => turno(x) === color && elegidas.length - antes < MIN_COLOR);
    }
    tomar(() => true);
    if (elegidas.length < POR_EJE) {
      console.error("Eje «" + eje + "»: solo " + elegidas.length + " de " + POR_EJE + ". Hay que bajar umbrales o sumar partidas.");
      process.exit(1);
    }
    banco.push(...elegidas);
  }

  const items = banco.map((x, i) => {
    const r = x.r;
    // El orden de las dos jugadas no puede delatar el polo: en cada eje, el
    // primer polo (atacar, abrir, cambiar) va una vez como «a» y otra como «b».
    const enEje = banco.slice(0, i).filter((y) => y.r.eje === r.eje).length;
    const polo = enEje % 2 === 0 ? "a" : "b";
    const [a, b] = (r.polo === polo) ? [r.a, r.b] : [r.b, r.a];
    const jugada = (j, esPrimero) => ({
      san: j.san, uci: j.uci, polo: M.POLOS[r.eje][esPrimero ? 0 : 1],
      eval: j.eval, linea: j.linea, medidas: j.medidas,
    });
    return {
      id: "es" + String(i + 1).padStart(2, "0"),
      eje: r.eje,
      fen: x.pos.fen,
      a: jugada(a, polo === "a"),
      b: jugada(b, polo === "b"),
      mejor: r.mejor,
      fuente: {
        de: x.p.fuente, partida: x.p.id, blancas: x.p.blancas, negras: x.p.negras,
        evento: x.p.evento, ply: x.pos.ply, enLaPartida: x.pos.enLaPartida,
      },
    };
  });

  const texto = fs.readFileSync(BANCO, "utf8");
  const ini = texto.indexOf("/* ESTILO-INICIO");
  const fin = texto.indexOf("/* ESTILO-FIN */");
  if (ini < 0 || fin < 0) throw new Error("Faltan las marcas ESTILO-INICIO / ESTILO-FIN en " + BANCO);
  const finLinea = texto.indexOf("\n", ini) + 1;
  const cuerpo = "  const ITEMS = " + JSON.stringify(items, null, 1).replace(/\n/g, "\n  ") + ";\n  ";
  fs.writeFileSync(BANCO, texto.slice(0, finLinea) + cuerpo + texto.slice(fin));
  console.log("Listo: " + items.length + " preguntas en js/estilo-items.js");
  motores.forEach((m) => m.cerrar());
}

main().catch((e) => { console.error(e); process.exit(1); });
