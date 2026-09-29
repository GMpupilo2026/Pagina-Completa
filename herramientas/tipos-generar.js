/* ===== Los bancos de los Tipos de entrenamiento =====
 *
 * Arma entreno/data/tipos.json, las posiciones de los seis tipos de
 * entreno/tipos.html. NINGUNA se inventa:
 *
 *   - El Detective, ¿Qué quiere el rival?, Descarte, La balanza y Fotografía
 *     salen de posiciones de partidas reales: el banco de «Ejercicios por tema»
 *     (entreno/data/temas.json, base abierta de Lichess, CC0) y las líneas de
 *     js/aperturas-lineas.js.
 *   - Con lo justo son finales de rey y piezas contra rey solo, sorteados, con
 *     la distancia al mate EXACTA de herramientas/lib/finales-dtm.js.
 *
 * Y ninguna se cree a ciegas:
 *   - El Detective: js/tipos-reglas.js (retro) comprueba con chess.js que la
 *     respuesta correcta es posible y que cada una de las otras es imposible.
 *   - ¿Qué quiere el rival?: Stockfish confirma que la amenaza es la mejor
 *     jugada del rival, que gana (mate o 2 peones) y que es la ÚNICA que gana.
 *   - Descarte: cada candidata se analiza por separado; las que «pierden»
 *     pierden 2,5 peones o más contra la mejor, las que «aguantan» quedan a
 *     menos de 0,6, y no entra ninguna en la zona gris del medio.
 *   - La balanza: la evaluación a profundidad 18, y solo si a profundidad 12
 *     decía casi lo mismo (una posición que el motor todavía está cambiando
 *     de opinión no sirve para calibrar a nadie).
 *
 * Cómo se corre (Stockfish instalado: apt install stockfish):
 *
 *   node herramientas/tipos-generar.js
 *
 * El análisis del motor se guarda en herramientas/.cache-tipos.json (fuera del
 * repositorio) para no repetirlo. entreno/data/tipos.json NO se edita a mano.
 * Después: node herramientas/verificar-tipos.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");
const { Motor } = require("./lib/motor-uci");
const R = require("../js/tipos-reglas.js");
const R_CATALOGO = require("../js/tipos-catalogo.js");
const FinalesDTM = require("./lib/finales-dtm.js");

const RAIZ = path.join(__dirname, "..");
const SALIDA = path.join(RAIZ, "entreno/data/tipos.json");
const CACHE_F = path.join(__dirname, ".cache-tipos.json");
const POR_NIVEL = 20;

const cache = fs.existsSync(CACHE_F) ? JSON.parse(fs.readFileSync(CACHE_F, "utf8")) : {};
let cacheSucio = 0;
function guardarCache() { fs.writeFileSync(CACHE_F, JSON.stringify(cache)); cacheSucio = 0; }

/* Orden estable pero mezclado: el mismo en cada corrida. */
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(semilla) { let x = hash(String(semilla)) || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
function barajar(arr, semilla) { const r = rng(semilla); const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const TEMAS = JSON.parse(fs.readFileSync(path.join(RAIZ, "entreno/data/temas.json"), "utf8"));
const PUZZLES = Object.keys(TEMAS.puzzles).sort((a, b) => hash(a) - hash(b)).map((id) => Object.assign({ id }, TEMAS.puzzles[id]));

/* ---------- motor: varios procesos a la vez ---------- */
/* `--solo con-lo-justo` rehace solo ese banco (no usa el motor: sale de las
   tablas de finales) y deja el resto de tipos.json como está. Así se puede
   ampliar sin Stockfish y sin tocar los demás. `--solo aguanta`, `--solo
   remata` y `--solo tiempo` hacen lo mismo con esos tres, que sí usan el motor: los demás bancos no se vuelven a analizar,
   así que ningún id cambia y nadie pierde sus estrellas. */
const SOLO = process.argv.includes("--solo") ? process.argv[process.argv.indexOf("--solo") + 1] : null;
const MOTORES = SOLO === "con-lo-justo" ? [] : Array.from({ length: Math.max(1, Math.min(4, require("os").cpus().length)) }, () => new Motor());
let libre = MOTORES.slice();
const cola = [];
function conMotor(fn) {
  return new Promise((ok, mal) => {
    const correr = (m) => fn(m).then((r) => { soltar(m); ok(r); }, (e) => { soltar(m); mal(e); });
    if (libre.length) correr(libre.pop()); else cola.push(correr);
  });
}
function soltar(m) { if (cola.length) cola.shift()(m); else libre.push(m); }
async function analizar(fen, multipv, prof, searchmoves) {
  const k = [fen, multipv, prof, (searchmoves || []).join(",")].join("|");
  if (cache[k]) return cache[k];
  const r = await conMotor((m) => m.analizar(fen, multipv, prof, searchmoves));
  cache[k] = r.map((x) => ({ uci: x.uci, score: x.score, mate: x.mate, pv: x.pv.slice(0, 6) }));
  if (++cacheSucio > 50) guardarCache();
  return cache[k];
}
async function enParalelo(lista, fn) { return Promise.all(lista.map(fn)); }

/* ---------- utilidades ---------- */
function sanDeUci(fen, uci) {
  const g = new Chess(fen);
  const m = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
  return m ? m.san : null;
}
function lineaEs(fen, ucis, max) {
  const g = new Chess(fen);
  let num = +fen.split(" ")[5] || 1;
  const partes = [];
  for (let i = 0; i < Math.min(ucis.length, max); i++) {
    const blancas = g.turn() === "w";
    const m = g.move({ from: ucis[i].slice(0, 2), to: ucis[i].slice(2, 4), promotion: ucis[i][4] || undefined });
    if (!m) break;
    if (blancas) partes.push(num + "." + R.sanEs(m.san));
    else { partes.push(i === 0 ? num + "…" + R.sanEs(m.san) : R.sanEs(m.san)); num++; }
  }
  return partes.join(" ");
}
const VALOR = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
function material(fen) {
  let v = 0;
  R.tablero(fen).forEach((p) => { if (p) v += (p.c === "w" ? 1 : -1) * VALOR[p.t]; });
  return v;
}
function piezas(fen) { return R.tablero(fen).filter(Boolean).length; }
/* Evaluación en peones, a favor de las blancas. Mate = ±10. */
function peones(r, turno) {
  const s = r.mate !== null && r.mate !== undefined ? (r.mate > 0 ? 10 : -10) : r.score / 100;
  return turno === "w" ? s : -s;
}
/* Para el alumno: la posición con el turno que se pide y sin derechos que no
   se puedan comprobar. */
function conTurno(fen, turno) {
  const p = fen.split(" ");
  return [p[0], turno, p[2], "-", "0", p[5] || "1"].join(" ");
}

const MOTIVOS = [
  ["smotheredMate", "Es un mate de la coz."],
  ["backRankMate", "El golpe va a la última fila, donde el rey no tiene salida."],
  ["doubleCheck", "Es un jaque doble."],
  ["discoveredAttack", "Es un ataque a la descubierta."],
  ["fork", "Es una horquilla: una pieza ataca dos cosas a la vez."],
  ["skewer", "Es una enfilada: la pieza de adelante se va y cae la de atrás."],
  ["pin", "Hay una clavada: la pieza clavada no puede moverse sin perder algo."],
  ["deflection", "Es una desviación: se aleja al defensor."],
  ["attraction", "Es una atracción: se arrastra una pieza a una casilla fatal."],
  ["trappedPiece", "Una pieza queda atrapada."],
  ["hangingPiece", "Hay una pieza sin defensa."],
  ["quietMove", "Es una jugada tranquila: sin jaque ni captura, pero sin defensa."],
  ["mateIn1", "Es mate en una."],
  ["mateIn2", "Es mate en dos."],
];
function motivo(temas) { const m = MOTIVOS.find(([k]) => (temas || []).includes(k)); return m ? m[1] : ""; }

/* =====================================================================
 * 1. El Detective
 * ===================================================================== */
function atacantesDelRey(fen) {
  // piezas del bando que acaba de mover que atacan al rey del que mueve ahora
  const tab = R.tablero(fen);
  const turno = fen.split(" ")[1], mueve = R.otro(turno);
  const rey = tab.findIndex((p) => p && p.t === "k" && p.c === turno);
  const g = new Chess();
  g.load(conTurno(fen, mueve));
  return g.moves({ verbose: true, legal: false }).filter((m) => m.to === R.sq(rey)).map((m) => m.from)
    .filter((v, i, a) => a.indexOf(v) === i);
}
function generarDetective() {
  const niveles = { 1: [], 2: [], 3: [], 4: [] };
  const vistas = new Set();
  for (const pz of PUZZLES) {
    if (Object.values(niveles).every((l) => l.length >= POR_NIVEL)) break;
    const g = new Chess(pz.fen);
    for (let k = 0; k < pz.solution.length; k++) {
      const san = pz.solution[k];
      const m = g.move(san);
      if (!m) break;
      if (!g.in_check()) continue;
      const fenQ = g.fen();
      const clavePos = fenQ.split(" ").slice(0, 2).join(" ");
      if (vistas.has(clavePos)) continue;
      const tipo = m.flags.includes("k") || m.flags.includes("q") ? "enroque" : m.flags.includes("p") ? "corona" : m.flags.includes("e") ? "alpaso" : "normal";
      const correcta = { p: tipo === "corona" ? m.promotion : m.piece, de: m.from, a: m.to, tipo };
      const chk = R.retro(Chess, fenQ, correcta);
      if (!chk.posible) throw new Error("Detective: la jugada real salió imposible en " + fenQ + " " + san);
      const atac = atacantesDelRey(fenQ);
      let nivel;
      if (tipo !== "normal" || atac.length > 1) nivel = 4;
      else if (atac[0] === m.to) nivel = 1;          // se decide abajo si va al 1 o al 2
      else nivel = 3;
      const imposibles = R.candidatasRetro(fenQ)
        .filter((op) => R.claveRetro(op) !== R.claveRetro(correcta))
        .map((op) => Object.assign(op, { r: R.retro(Chess, fenQ, op) }))
        .filter((op) => !op.r.posible && (op.r.motivo === "jaque-antes" || op.r.motivo === "ilegal"));
      const rnd = rng(pz.id + san);
      const elegir = (lista, n) => barajar(lista, pz.id + san + n).slice(0, n);
      let distractores = null;
      const mismaPieza = imposibles.filter((op) => op.a === m.to && op.tipo === "normal");
      const otras = imposibles.filter((op) => op.a !== m.to);
      if (nivel === 1) {
        if (niveles[1].length < POR_NIVEL && otras.length >= 2 && rnd() < 0.5) distractores = elegir(otras, 2);
        else if (mismaPieza.length >= 1 && otras.length >= 2) { nivel = 2; distractores = elegir(mismaPieza, 1).concat(elegir(otras, 2)); }
        else if (otras.length >= 2) distractores = elegir(otras, 2);
      } else if (nivel === 3) {
        const delQueDaJaque = imposibles.filter((op) => op.a === atac[0]);
        const resto = imposibles.filter((op) => op.a !== atac[0]);
        if (delQueDaJaque.length >= 1 && resto.length >= 2) distractores = elegir(delQueDaJaque, 1).concat(elegir(resto, 2));
      } else if (imposibles.length >= 3) distractores = elegir(imposibles, 3);
      if (!distractores || niveles[nivel].length >= POR_NIVEL) continue;
      // etiquetas distintas
      const etiquetas = new Set(distractores.map(R.etiquetaRetro).concat([R.etiquetaRetro(correcta)]));
      if (etiquetas.size !== distractores.length + 1) continue;
      vistas.add(clavePos);
      const opciones = barajar([correcta].concat(distractores.map((d) => ({ p: d.p, de: d.de, a: d.a, tipo: d.tipo, motivo: d.r.motivo }))), "o" + pz.id + san);
      niveles[nivel].push({
        id: "det-" + nivel + "-" + pz.id + "-" + (k + 1),
        nivel, fen: fenQ, opciones,
        correcta: R.claveRetro(correcta),
        jugada: R.sanEs(san),
        partida: pz.game || null,
      });
    }
  }
  return [].concat(niveles[1], niveles[2], niveles[3], niveles[4]);
}

/* =====================================================================
 * 2. ¿Qué quiere el rival?  y  3. Descarte  (las dos parten del mismo lugar:
 *    la posición del ejercicio, pero con el turno del que se defiende)
 * ===================================================================== */
function flipLegal(pz) {
  const g = new Chess(pz.fen);
  if (g.in_check()) return null;                    // el rival está en jaque: no hay amenaza que valga
  const yo = R.otro(g.turn());
  const fen = conTurno(pz.fen, yo);
  const f = new Chess();
  if (!f.load(fen) || f.in_check() || f.game_over()) return null;
  return fen;
}
function nivelAmenaza(pz) {
  const t = pz.themes || [];
  if (t.includes("mateIn1")) return 2;
  if (t.includes("mateIn2")) return 4;
  if (pz.mate) return null;
  const g = new Chess(pz.fen);
  const m = g.move(pz.solution[0]);
  if (t.includes("hangingPiece") && m.captured) return 1;
  if (!m.captured && !m.san.includes("+") && (t.includes("quietMove") || pz.rating >= 1500)) return 5;
  if (["fork", "pin", "skewer", "discoveredAttack"].some((k) => t.includes(k))) return 3;
  return null;
}
async function generarAmenaza() {
  const cand = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  for (const pz of PUZZLES) {
    const n = nivelAmenaza(pz);
    if (!n || cand[n].length >= POR_NIVEL * 3) continue;
    const fenYo = flipLegal(pz);
    if (fenYo) cand[n].push({ pz, fenYo });
  }
  const out = [];
  for (const n of [1, 2, 3, 4, 5]) {
    const buenos = (await enParalelo(cand[n], async ({ pz, fenYo }) => {
      const fenRival = conTurno(pz.fen, new Chess(pz.fen).turn());
      const r = await analizar(fenRival, 2, 16);
      if (!r.length) return null;
      const san = sanDeUci(fenRival, r[0].uci);
      const esperada = new Chess(fenRival).move(pz.solution[0]);
      const mateN = r[0].mate && r[0].mate > 0 ? r[0].mate : null;
      if (n === 2 || n === 4) {
        if (mateN !== (n === 2 ? 1 : 2)) return null;
        if (n === 4 && san !== esperada.san) return null;
      } else {
        if (san !== esperada.san || r[0].score < 200 || mateN) return null;
        if (r[1] && r[1].score > r[0].score - 150) return null;   // una sola amenaza
      }
      return {
        id: "ame-" + n + "-" + pz.id, nivel: n, fen: fenYo, fenRival,
        amenaza: esperada.san, amenazaEs: R.sanEs(esperada.san), mate: mateN,
        linea: lineaEs(fenRival, r[0].pv, n === 4 ? 3 : 1),
        motivo: motivo(pz.themes), rating: pz.rating, partida: pz.game || null,
      };
    })).filter(Boolean).slice(0, POR_NIVEL);
    out.push(...buenos);
  }
  return out;
}

const BANDAS_DESCARTE = { 1: [0, 1300, 3, 1], 2: [1300, 1700, 4, 2], 3: [1700, 2100, 5, 2], 4: [2100, 9999, 6, 3] };
async function generarDescarte(paraBalanza) {
  const out = [];
  for (const n of [1, 2, 3, 4]) {
    const [lo, hi, total, pierden] = BANDAS_DESCARTE[n];
    const pool = PUZZLES.filter((pz) => pz.rating >= lo && pz.rating < hi).map((pz) => ({ pz, fen: flipLegal(pz) })).filter((x) => x.fen).slice(0, POR_NIVEL * 14);
    const items = (await enParalelo(pool, async ({ pz, fen }) => {
      const g = new Chess(fen);
      const legales = g.moves({ verbose: true });
      if (legales.length < total + 2) return null;
      const r = await analizar(fen, Math.min(60, legales.length), 12);
      if (!r.length) return null;
      const mejor = r[0].score;
      if (r[0].mate || mejor < -100 || mejor > 250) return null;   // tiene que haber algo que defender, y defensa
      paraBalanza.push({ fen, origen: "descarte", partida: pz.game || null });
      const aguantan = r.filter((x) => !x.mate && x.score >= mejor - 60 && x.score >= -150);
      const pierdenL = r.filter((x) => (x.mate !== null && x.mate < 0) || (x.score <= mejor - 250 && x.score <= -200));
      if (aguantan.length < total - pierden || pierdenL.length < pierden) return null;
      // tientan más las capturas y los jaques: se prefieren entre las que pierden
      const tienta = (x) => { const s = sanDeUci(fen, x.uci); return /x|\+/.test(s) ? 0 : 1; };
      const elegP = barajar(pierdenL, "p" + pz.id).sort((a, b) => tienta(a) - tienta(b)).slice(0, pierden);
      const elegA = [r[0]].concat(barajar(aguantan.slice(1), "a" + pz.id)).slice(0, total - pierden);
      // confirmar cada una por separado, más hondo
      const conf = await Promise.all(elegP.concat(elegA).map((x) => analizar(fen, 1, 16, [x.uci])));
      const confMejor = conf.slice(pierden).reduce((m, c) => Math.max(m, c[0] ? c[0].score : -99999), -99999);
      const candidatas = [];
      for (let i = 0; i < conf.length; i++) {
        const c = conf[i][0];
        if (!c) return null;
        const pierde = i < pierden;
        const perdida = c.mate !== null && c.mate < 0;
        if (pierde && !(perdida || (c.score <= confMejor - 250 && c.score <= -200))) return null;
        if (!pierde && (c.mate || c.score < confMejor - 60 || c.score < -150)) return null;
        const san = sanDeUci(fen, c.uci);
        const despues = new Chess(fen); despues.move(san);
        candidatas.push({
          san, sanEs: R.sanEs(san), pierde,
          eval: perdida ? null : c.score,
          refuta: pierde ? lineaEs(despues.fen(), c.pv.slice(1), 3) : null,
          mateEn: perdida ? -c.mate : null,
        });
      }
      return { id: "des-" + n + "-" + pz.id, nivel: n, fen, candidatas: barajar(candidatas, "c" + pz.id), rating: pz.rating, partida: pz.game || null };
    })).filter(Boolean).slice(0, POR_NIVEL);
    out.push(...items);
  }
  return out;
}

/* =====================================================================
 * 4. La balanza
 * ===================================================================== */
async function generarBalanza(extra) {
  const fuentes = [];
  // posición del ejercicio (el material suele estar igual y hay un golpe)
  PUZZLES.slice(0, 500).forEach((pz) => {
    const g = new Chess(pz.fen);
    if (!g.in_check()) fuentes.push({ fen: pz.fen, origen: "ejercicio", partida: pz.game || null });
    // y la del final de la línea: el golpe ya se dio y el material habla
    pz.solution.forEach((s) => g.move(s));
    if (!g.game_over() && !g.in_check()) fuentes.push({ fen: g.fen(), origen: "final", partida: pz.game || null });
  });
  // aperturas: posiciones igualadas de verdad
  const APERTURAS = require("../js/aperturas-lineas.js");
  const lineas = APERTURAS.LINEAS || APERTURAS.lineas || APERTURAS;
  (Array.isArray(lineas) ? lineas : []).forEach((l) => {
    const g = new Chess();
    for (const j of l.jugadas) if (!g.move(j)) return;
    if (!g.game_over() && !g.in_check()) fuentes.push({ fen: g.fen(), origen: "apertura", nombre: l.nombre });
  });
  extra.forEach((x) => fuentes.push(x));
  const vistos = new Set();
  const lista = fuentes.filter((x) => { const k = x.fen.split(" ").slice(0, 2).join(" "); if (vistos.has(k)) return false; vistos.add(k); return true; });
  const evaluadas = (await enParalelo(lista, async (x) => {
    const t = x.fen.split(" ")[1];
    const [a] = await analizar(x.fen, 1, 12);
    const [b] = await analizar(x.fen, 1, 18);
    if (!a || !b) return null;
    const e12 = peones(a, t), e18 = peones(b, t);
    if (Math.abs(e18) < 10 && Math.abs(e12 - e18) > 0.8) return null;       // el motor todavía duda
    return Object.assign({}, x, { eval: Math.round(e18 * 10) / 10, mate: b.mate !== null && b.mate !== undefined ? (t === "w" ? b.mate : -b.mate) : null, mat: material(x.fen), linea: lineaEs(x.fen, b.pv, 3) });
  })).filter(Boolean);
  const niveles = {
    1: (x) => Math.abs(x.mat) >= 3 && Math.sign(x.mat) === Math.sign(x.eval) && Math.abs(x.eval) >= 2.5,
    2: (x) => Math.abs(x.eval) <= 1.5 && Math.abs(x.mat) <= 1,
    3: (x) => x.mat === 0 && Math.abs(x.eval) >= 2,
    4: (x) => Math.abs(x.mat) >= 2 && ((Math.sign(x.eval) === -Math.sign(x.mat) && Math.abs(x.eval) >= 1) || Math.abs(x.eval) <= 0.7),
  };
  const usadas = new Set();
  const out = [];
  for (const n of [4, 3, 2, 1]) {           // los niveles escasos eligen primero
    let elegidas = barajar(evaluadas.filter((x) => !usadas.has(x.fen) && niveles[n](x)), "bal" + n);
    if (n === 2) {
      // que no sean todas de apertura
      const ap = elegidas.filter((x) => x.origen === "apertura").slice(0, 8);
      elegidas = ap.concat(elegidas.filter((x) => x.origen !== "apertura"));
    }
    elegidas.slice(0, POR_NIVEL).forEach((x, i) => {
      usadas.add(x.fen);
      out.push({ id: "bal-" + n + "-" + hash(x.fen).toString(36), nivel: n, fen: x.fen, eval: x.eval, mate: x.mate, material: x.mat, linea: x.linea, origen: x.origen, nombre: x.nombre || null, partida: x.partida || null });
    });
  }
  return out.sort((a, b) => a.nivel - b.nivel);
}

/* =====================================================================
 * 5. Fotografía
 * ===================================================================== */
const RANGOS_FOTO = { 1: [3, 7], 2: [8, 12], 3: [13, 18], 4: [19, 26], 5: [16, 32] };
function preguntasFoto(fen, semilla) {
  const tab = R.tablero(fen);
  const r = rng(semilla);
  const ocupadas = tab.map((p, i) => (p && p.t !== "k" ? i : -1)).filter((i) => i >= 0);
  const pieza = (p) => (p ? R.NOMBRE[p.t] + " " + (p.c === "w" ? (["q", "r"].includes(p.t) ? "blanca" : "blanco") : (["q", "r"].includes(p.t) ? "negra" : "negro")) : "nada");
  const out = [];
  // 1) qué había en una casilla
  const s = ocupadas[Math.floor(r() * ocupadas.length)];
  const bien = pieza(tab[s]);
  const otras = new Set();
  [{ t: "p", c: "w" }, { t: "p", c: "b" }, { t: "n", c: "w" }, { t: "b", c: "b" }, { t: "r", c: "w" }, { t: "q", c: "b" }, { t: "b", c: "w" }, { t: "n", c: "b" }, null]
    .map(pieza).forEach((x) => { if (x !== bien) otras.add(x); });
  out.push({ texto: "¿Qué había en " + R.sq(s) + "?", opciones: barajar([bien].concat(barajar([...otras], semilla + "a").slice(0, 3)), semilla + "b"), correcta: bien });
  // 2) dónde estaba un rey
  const color = r() < 0.5 ? "w" : "b";
  const k = tab.findIndex((p) => p && p.t === "k" && p.c === color);
  const vecinas = [];
  for (let i = 0; i < 64; i++) if (i !== k && Math.max(Math.abs((i & 7) - (k & 7)), Math.abs((i >> 3) - (k >> 3))) <= 2) vecinas.push(R.sq(i));
  out.push({ texto: "¿Dónde estaba el rey " + (color === "w" ? "blanco" : "negro") + "?", opciones: barajar([R.sq(k)].concat(barajar(vecinas, semilla + "c").slice(0, 3)), semilla + "d"), correcta: R.sq(k) });
  // 3) cuántos peones
  const c2 = R.otro(color);
  const np = tab.filter((p) => p && p.t === "p" && p.c === c2).length;
  const nums = [np - 1, np, np + 1, np + 2].filter((x) => x >= 0);
  if (nums.length < 4) nums.push(np + 3);
  out.push({ texto: "¿Cuántos peones tenían las " + R.COLOR[c2] + "?", opciones: nums.map(String), correcta: String(np) });
  return out;
}
function generarFotografia() {
  const out = [];
  const usadas = new Set();
  for (const n of [1, 2, 3, 4, 5]) {
    const [lo, hi] = RANGOS_FOTO[n];
    const fuentes = [];
    PUZZLES.forEach((pz) => {
      const g = new Chess(pz.fen);
      fuentes.push({ fen: pz.fen, pz });
      pz.solution.forEach((s) => g.move(s));
      fuentes.push({ fen: g.fen(), pz });   // al final de la línea hay menos piezas
    });
    const elegidas = barajar(fuentes.filter((x) => { const c = piezas(x.fen); return c >= lo && c <= hi && !usadas.has(x.fen); }), "foto" + n).slice(0, POR_NIVEL);
    elegidas.forEach((x) => {
      usadas.add(x.fen);
      const item = { id: "fot-" + n + "-" + hash(x.fen).toString(36), nivel: n, fen: x.fen, piezas: piezas(x.fen), partida: x.pz.game || null };
      if (n === 5) item.preguntas = preguntasFoto(x.fen, item.id);
      out.push(item);
    });
  }
  return out;
}

/* =====================================================================
 * 6. Con lo justo
 * ===================================================================== */
const FINALES = { 1: ["rr", 4], 2: ["q", 7], 3: ["r", 12], 4: ["bb", 13], 5: ["bn", 22] };
/* Eran 6 por nivel y se agotaban en minutos; con 15 (y hasta 3 por cada
   distancia al mate, para que no salgan todas iguales) hay para varias
   sesiones. Las 6 de antes siguen: el sorteo es el mismo y solo se amplió. */
const POR_NIVEL_FINALES = 15;
const LETRA = { q: "Q", r: "R", b: "B", n: "N" };
function generarConLoJusto() {
  const out = [];
  for (const n of [1, 2, 3, 4, 5]) {
    const [piezasF, minDtm] = FINALES[n];
    const tabla = FinalesDTM.resolver(piezasF);
    const r = rng("final" + n);
    const tipos = piezasF.split("");
    const elegidas = [];
    let intentos = 0;
    while (elegidas.length < POR_NIVEL_FINALES && intentos++ < 400000) {
      const sqs = [];
      while (sqs.length < 2 + tipos.length) { const s = Math.floor(r() * 64); if (!sqs.includes(s)) sqs.push(s); }
      const [wk, bk, ...ps] = sqs;
      if (Math.max(Math.abs((wk & 7) - (bk & 7)), Math.abs((wk >> 3) - (bk >> 3))) <= 1) continue;
      // dos alfiles: de distinto color (si no, no hay mate)
      if (piezasF === "bb" && ((ps[0] & 7) + (ps[0] >> 3)) % 2 === ((ps[1] & 7) + (ps[1] >> 3)) % 2) continue;
      // ninguna pieza al lado del rey negro: nada colgando desde la primera jugada
      if (ps.some((s) => Math.max(Math.abs((s & 7) - (bk & 7)), Math.abs((s >> 3) - (bk >> 3))) <= 1)) continue;
      const tab = new Array(64).fill(null);
      tab[wk] = { t: "k", c: "w" }; tab[bk] = { t: "k", c: "b" };
      ps.forEach((s, i) => { tab[s] = { t: tipos[i], c: "w" }; });
      const fen = R.colocacion(tab) + " w - - 0 1";
      const g = new Chess();
      if (!g.load(fen)) continue;
      // negras no pueden estar en jaque con blancas al mover
      const gb = new Chess(); gb.load(R.colocacion(tab) + " b - - 0 1");
      if (gb.in_check()) continue;
      if (elegidas.some((x) => x.fen === fen)) continue;  // el sorteo puede repetir una posición
      const d = tabla.dtm(fen);
      if (!d || d < minDtm) continue;
      if (elegidas.filter((x) => x.minimo === d).length >= 3) continue;  // variedad
      elegidas.push({ id: "fin-" + n + "-" + hash(fen).toString(36), nivel: n, fen, minimo: d, piezas: piezasF });
    }
    elegidas.sort((a, b) => a.minimo - b.minimo).forEach((x) => out.push(x));
  }
  return out;
}

/* =====================================================================
 * 7. Siete diferencias: el detalle que cambia todo
 *
 * A es la posición de un ejercicio real, donde el golpe gana. B es A con UNA
 * sola cosa cambiada —una pieza menos, un peón una casilla más allá, una
 * pieza en la casilla de al lado—, y en B el mismo golpe ya no gana. Stockfish
 * lo confirma en las dos: en A es la mejor jugada y gana (mate o 2 peones), y
 * en B, jugado igual, queda en +0,8 o menos. La diferencia está en el tablero,
 * no se inventa: se busca probando cambios cerca de donde pasa el golpe.
 * ===================================================================== */
const DIF_NIVELES = { 1: "quitar", 2: "peon", 3: "mover", 4: "larga" };
function cambiosPosibles(fenA, t, tipo) {
  const tab = R.tablero(fenA);
  const cerca = (i) => Math.max(Math.abs((i & 7) - (R.idx(t.to) & 7)), Math.abs((i >> 3) - (R.idx(t.to) >> 3)));
  const casillas = [];
  tab.forEach((p, i) => { if (p) casillas.push(i); });
  casillas.sort((a, b) => cerca(a) - cerca(b) || a - b);
  const out = [];
  const intocable = (i) => R.sq(i) === t.from || R.sq(i) === t.to || tab[i].t === "k";
  for (const i of casillas) {
    const p = tab[i];
    if (tipo === "quitar") {
      if (intocable(i)) continue;
      const B = tab.slice(); B[i] = null;
      out.push({ B, cambio: { tipo: "quitar", casillas: [R.sq(i)], pieza: p.c + p.t, de: R.sq(i) } });
    } else if (tipo === "peon") {
      if (p.t !== "p" || R.sq(i) === t.from) continue;
      [8, -8].forEach((d) => {
        const j = i + d;
        if (j < 8 || j >= 56 || tab[j]) return;
        const B = tab.slice(); B[j] = p; B[i] = null;
        out.push({ B, cambio: { tipo: "peon", casillas: [R.sq(i), R.sq(j)], pieza: p.c + p.t, de: R.sq(i), a: R.sq(j) } });
      });
    } else if (tipo === "mover") {
      if (p.t === "p" || intocable(i)) continue;
      [1, -1, 8, -8, 9, -9, 7, -7].forEach((d) => {
        const j = i + d;
        if (j < 0 || j >= 64 || Math.abs((j & 7) - (i & 7)) > 1 || tab[j]) return;
        const B = tab.slice(); B[j] = p; B[i] = null;
        out.push({ B, cambio: { tipo: "mover", casillas: [R.sq(i), R.sq(j)], pieza: p.c + p.t, de: R.sq(i), a: R.sq(j) } });
      });
    }
  }
  return out;
}
function textoCambio(c) {
  const nombre = (pc) => R.NOMBRE[pc[1]] + (pc[0] === "w" ? (["q", "r"].includes(pc[1]) ? " blanca" : " blanco") : (["q", "r"].includes(pc[1]) ? " negra" : " negro"));
  if (c.tipo === "quitar") return "En B falta " + (["q", "r"].includes(c.pieza[1]) ? "la " : "el ") + nombre(c.pieza) + " de " + c.de + ".";
  return "En B " + (["q", "r"].includes(c.pieza[1]) ? "la " : "el ") + nombre(c.pieza) + " está en " + c.a + " y no en " + c.de + ".";
}
async function generarDiferencias() {
  const out = [];
  const usados = new Set();
  for (const n of [1, 2, 3, 4]) {
    const largas = n === 4;
    const pool = PUZZLES.filter((pz) => !usados.has(pz.id) && (largas ? pz.solution.length >= 5 : pz.solution.length <= 3));
    let elegidos = [];
    for (let k = 0; k < pool.length && elegidos.length < POR_NIVEL; k += 24) {
      const lote = pool.slice(k, k + 24);
      const hechos = await enParalelo(lote, async (pz) => {
        const fenA0 = conTurno(pz.fen, new Chess(pz.fen).turn());
        const gA = new Chess(fenA0);
        if (gA.in_check()) return null;
        const t = new Chess(fenA0).move(pz.solution[0]);
        if (!t) return null;
        const turno = gA.turn();
        const [, , enroquesA, , , jugadaN] = fenA0.split(" ");
        /* A y B comparten TODO menos el cambio: turno, contadores y derechos de
           enroque. Un derecho que A tiene y B no sería una segunda diferencia
           escondida (en A se podría enrocar y en B no), así que se dejan solo los
           que valen en las dos: rey y torre en su casilla de siempre. */
        const enroques = (tabA, tabB) => {
          const vale = { K: ["e1", "h1", "w"], Q: ["e1", "a1", "w"], k: ["e8", "h8", "b"], q: ["e8", "a8", "b"] };
          const r = (enroquesA === "-" ? "" : enroquesA).split("").filter((c) => [tabA, tabB].every((tb) => {
            const [kk, rr, c2] = vale[c];
            const K = tb[R.idx(kk)], T = tb[R.idx(rr)];
            return K && K.t === "k" && K.c === c2 && T && T.t === "r" && T.c === c2;
          })).join("");
          return r || "-";
        };
        const armarFen = (tb, enr) => R.colocacion(tb) + " " + turno + " " + enr + " - 0 " + (jugadaN || "1");
        const tipos = largas ? ["quitar", "mover", "peon"] : [DIF_NIVELES[n]];
        for (const tipo of tipos) {
          for (const v of cambiosPosibles(fenA0, t, tipo).slice(0, 6)) {
            if (!materialOk(v.B)) continue;
            const enr = enroques(R.tablero(fenA0), v.B);
            const fenA = armarFen(R.tablero(fenA0), enr);
            const fenB = armarFen(v.B, enr);
            const gB = new Chess();
            if (!gB.load(fenB) || gB.in_check() || gB.game_over()) continue;
            const gOtro = new Chess(); gOtro.load(R.colocacion(v.B) + " " + R.otro(turno) + " - - 0 1");
            if (gOtro.in_check()) continue;
            const mB = new Chess(fenB).move(t.san);
            if (!mB) continue;
            const [a] = await analizar(fenA, 1, 16);
            if (!a || sanDeUci(fenA, a.uci) !== t.san) continue;
            if (!((a.mate !== null && a.mate > 0) || a.score >= 200)) continue;
            const [b] = await analizar(fenB, 1, 14, [t.from + t.to + (t.promotion || "")]);
            if (!b) continue;
            const sigueGanando = (b.mate !== null && b.mate > 0) || b.score > 80;
            if (sigueGanando) continue;
            const despuesB = (() => { const g = new Chess(fenB); g.move(t.san); return g.fen(); })();
            // largas: el rival contesta en B lo mismo que en A (la línea arranca
            // igual y la diferencia se nota más adelante)
            if (largas && (!b.pv[1] || sanDeUci(despuesB, b.pv[1]) !== pz.solution[1])) continue;
            // la refutación: qué respuestas salvan en B (si son pocas, se pregunta)
            const res = await analizar(despuesB, Math.min(40, new Chess(despuesB).moves().length), 12);
            const salvan = res.filter((x) => (x.mate !== null && x.mate > 0) || (x.mate === null && x.score >= -100)).map((x) => sanDeUci(despuesB, x.uci));
            return {
              id: "dif-" + n + "-" + pz.id, nivel: n, fenA, fen: fenB,
              golpe: t.san, golpeEs: R.sanEs(t.san),
              evalA: a.mate ? null : a.score, mateA: a.mate || null,
              evalB: b.mate ? null : b.score, mateB: b.mate || null,
              cambio: v.cambio, texto: textoCambio(v.cambio),
              lineaB: lineaEs(fenB, b.pv, 4),
              salvan: salvan.length && salvan.length <= 3 ? salvan : null,
              rating: pz.rating, partida: pz.game || null,
            };
          }
        }
        return null;
      });
      hechos.filter(Boolean).forEach((x) => { if (elegidos.length < POR_NIVEL) { elegidos.push(x); usados.add(x.id.split("-")[2]); } });
    }
    out.push(...elegidos);
  }
  return out;
}
function materialOk(tab) { return R.materialPosible(tab, "w") && R.materialPosible(tab, "b"); }

/* =====================================================================
 * 8 a 14: el Barrido, Intercambios, Constrúyela tú, Rey y peón, Adivina la
 * jugada del maestro, ¿Qué apertura es? y la Ruta segura. Las reglas que
 * deciden la respuesta son las de js/tipos-reglas-mas.js: el banco se arma
 * con ellas y el verificador las vuelve a correr.
 * ===================================================================== */
const M = require("../js/tipos-reglas-mas.js");
const KPK = require("./lib/kpk.js");

/* Posiciones de partida real: la de cada ejercicio y las de su línea. */
function posicionesReales(limite) {
  const out = [], vistas = new Set();
  for (const pz of PUZZLES) {
    const g = new Chess(pz.fen);
    const lista = [pz.fen];
    for (const s of pz.solution) { if (!g.move(s)) break; lista.push(g.fen()); }
    for (const fen of lista) {
      const k = fen.split(" ").slice(0, 2).join(" ");
      if (vistas.has(k)) continue;
      vistas.add(k);
      const h = new Chess(fen);
      if (h.game_over()) continue;
      out.push({ fen, pz });
    }
    if (out.length >= limite) break;
  }
  return out;
}
const COLOR_ES = { w: "blancas", b: "negras" };

/* ---------- 8. El Barrido ---------- */
const NIVELES_BARRIDO = {
  1: { pide: ["jaques"], piezas: [0, 14], total: [1, 4] },
  2: { pide: ["jaques", "capturas"], piezas: [0, 22], total: [2, 7] },
  3: { pide: ["jaques", "capturas", "amenazas"], piezas: [0, 22], total: [3, 9], amenazas: true },
  4: { pide: ["jaques", "capturas", "amenazas"], piezas: [24, 32], total: [4, 12], amenazas: true },
};
function generarBarrido(reales) {
  const out = [], usadas = new Set();
  for (const n of [1, 2, 3, 4]) {
    const cfg = NIVELES_BARRIDO[n];
    let cuenta = 0;
    for (const { fen, pz } of barajar(reales, "barrido" + n)) {
      if (cuenta >= POR_NIVEL) break;
      if (usadas.has(fen)) continue;
      const np = piezas(fen);
      if (np < cfg.piezas[0] || np > cfg.piezas[1]) continue;
      if (new Chess(fen).in_check()) continue;
      const r = M.barrido(Chess, fen);
      const pedidas = [].concat(...cfg.pide.map((c) => r[c]));
      if (pedidas.length < cfg.total[0] || pedidas.length > cfg.total[1]) continue;
      if (cfg.amenazas && !r.amenazas.length) continue;
      if (n === 1 && !r.jaques.length) continue;
      usadas.add(fen); cuenta++;
      const respuestas = {};
      cfg.pide.forEach((c) => { respuestas[c] = r[c]; });
      out.push({
        id: "bar-" + n + "-" + hash(fen).toString(36), nivel: n, fen, pide: cfg.pide, respuestas,
        resumen: pedidas.length + " jugadas que encontrar",
        respuesta: cfg.pide.map((c) => ({ jaques: "Jaques", capturas: "Capturas", amenazas: "Amenazas" }[c]) + ": " + (r[c].length ? r[c].map(R.sanEs).join(", ") : "ninguna")),
        partida: pz.game || null,
      });
    }
  }
  return out;
}

/* ---------- 9. Intercambios ---------- */
function generarIntercambios(reales) {
  const clase = (x) => x.clavada ? 4 : x.rayos ? 3 : x.pasos.length >= 4 ? 2 : 1;
  const porNivel = { 1: [], 2: [], 3: [], 4: [] };
  const usadas = new Set();
  for (const { fen, pz } of barajar(reales, "intercambios")) {
    if (Object.values(porNivel).every((l) => l.length >= POR_NIVEL * 3)) break;
    const g = new Chess(fen);
    if (g.in_check()) continue;
    const casillas = [...new Set(g.moves({ verbose: true }).filter((m) => m.captured && !m.flags.includes("e")).map((m) => m.to))];
    for (const c of barajar(casillas, fen)) {
      const x = M.intercambio(Chess, fen, c);
      if (!x || x.corona || x.alPaso || x.pasos.length < 2) continue;
      const n = clase(x);
      if (porNivel[n].length >= POR_NIVEL * 3 || usadas.has(fen)) continue;
      usadas.add(fen);
      porNivel[n].push({ fen, c, x, pz });
      break;
    }
  }
  const out = [];
  for (const n of [1, 2, 3, 4]) {
    // que no sean todas «gana»: se reparten entre ganar, igualar y perder
    const signo = (v) => (v > 0 ? "g" : v < 0 ? "p" : "i");
    const grupos = { g: [], i: [], p: [] };
    porNivel[n].forEach((e) => grupos[signo(e.x.valor)].push(e));
    const elegidos = [];
    for (let k = 0; elegidos.length < POR_NIVEL && k < 60; k++) {
      const g = ["g", "i", "p"][k % 3];
      if (grupos[g].length) elegidos.push(grupos[g].shift());
    }
    elegidos.forEach(({ fen, c, x, pz }) => {
      const turno = fen.split(" ")[1];
      const todas = x.pasos.reduce((s, p, i) => s + (i % 2 === 0 ? p.gana : -p.gana), 0);   // si nadie para
      let opciones;
      if (n <= 2) opciones = ["gana", "igual", "pierde"];
      else {
        const set = new Set([x.valor]);
        [todas, x.valor + 2, x.valor - 2, x.valor + 3, x.valor - 3, 0, x.valor + 1].forEach((v) => { if (set.size < 4) set.add(v); });
        opciones = barajar([...set], "op" + fen).map(String);
      }
      const pieza = R.tablero(fen)[R.idx(c)];
      out.push({
        id: "int-" + n + "-" + hash(fen + c).toString(36), nivel: n, fen, casilla: c,
        valor: x.valor, opciones, jugadas: x.jugadas, todas: x.pasos.map((p) => p.san),
        rayos: x.rayos, clavada: x.clavada,
        resumen: "Cambio en " + c + " (" + R.NOMBRE[pieza.t] + ")",
        respuesta: ["Empiezan las " + COLOR_ES[turno] + ": " + M.textoIntercambio(x.valor, turno) + ".",
          "Lo que conviene: " + x.jugadas.map(R.sanEs).join(" ") + (x.jugadas.length < x.pasos.length ? " y ahí se para." : "."),
          "Si nadie parara: " + x.pasos.map((p) => R.sanEs(p.san)).join(" ") + "."],
        partida: pz.game || null,
      });
    });
  }
  return out;
}

/* ---------- 10. Constrúyela tú ---------- */
function generarConstruye(reales) {
  const out = [];
  const mates = PUZZLES.filter((pz) => (pz.themes || []).includes("mateIn1"));
  const empuja = (n, base) => {
    const sol = M.solucionesConstruye(Chess, base);
    if (!sol.length || sol.length > (n === 4 || n === 5 ? 5 : 3)) return false;
    out.push(Object.assign(base, { id: "con-" + n + "-" + hash(base.fen + base.pieza + base.objetivo).toString(36), nivel: n, soluciones: sol,
      resumen: ({ "mate-ya": "Mate ya", horquilla: "Horquilla", clavada: "Clavada", "mate-en-1": "Mate en 1", "quitar-mate": "Quitar el mate" })[base.objetivo] + " con " + R.NOMBRE[base.pieza[1]] + " " + ({ w: "blanc", b: "negr" })[base.pieza[0]] + (["q", "r"].includes(base.pieza[1]) ? "a" : "o"),
      respuesta: ["Casillas que cumplen: " + sol.join(", ") + "."] }));
    return true;
  };
  const cuenta = (n) => out.filter((x) => x.nivel === n).length;
  // 1. mate ya  ·  4. mate en 1  ·  5. quitar el mate  (de ejercicios de mate en 1)
  for (const pz of mates) {
    const S = conTurno(pz.fen, new Chess(pz.fen).turn());
    const g = new Chess(S);
    const c = g.turn();
    const m = g.move(pz.solution[0]);
    if (!m || m.promotion || !g.in_checkmate()) continue;
    if (cuenta(1) < POR_NIVEL) {
      const tab = R.tablero(g.fen()); tab[R.idx(m.to)] = null;
      const base = { fen: R.colocacion(tab) + " " + R.otro(c) + " - - 0 1", pieza: c + m.piece, objetivo: "mate-ya" };
      const gb = new Chess(); if (gb.load(base.fen) && !gb.in_checkmate()) empuja(1, base);
    }
    if (cuenta(4) < POR_NIVEL && m.piece !== "p" && m.piece !== "k") {
      const tab = R.tablero(S); tab[R.idx(m.from)] = null;
      const fen = R.colocacion(tab) + " " + c + " - - 0 1";
      const gb = new Chess();
      if (gb.load(fen) && !gb.in_check() && !M.tieneMateEn1(gb)) empuja(4, { fen, pieza: c + m.piece, objetivo: "mate-en-1" });
    }
    if (cuenta(5) < POR_NIVEL) {
      for (const t of ["p", "n", "b"]) {
        if (empuja(5, { fen: R.colocacion(R.tablero(S)) + " " + c + " - - 0 1", pieza: R.otro(c) + t, objetivo: "quitar-mate" })) break;
      }
    }
    if (cuenta(1) >= POR_NIVEL && cuenta(4) >= POR_NIVEL && cuenta(5) >= POR_NIVEL) break;
  }
  // 2. horquilla  ·  3. clavada  (en posiciones de partida)
  for (const { fen } of barajar(reales, "construye")) {
    if (cuenta(2) >= POR_NIVEL && cuenta(3) >= POR_NIVEL) break;
    const c = fen.split(" ")[1];
    const base = R.colocacion(R.tablero(fen)) + " " + c + " - - 0 1";
    if (cuenta(2) < POR_NIVEL && empuja(2, { fen: base, pieza: c + "n", objetivo: "horquilla" })) continue;
    if (cuenta(3) < POR_NIVEL) for (const t of ["b", "r", "q"]) if (empuja(3, { fen: base, pieza: c + t, objetivo: "clavada" })) break;
  }
  return out.sort((a, b) => a.nivel - b.nivel);
}

/* ---------- 11. Rey y peón ---------- */
function generarPeones() {
  const t = KPK.resolver();
  const bits = KPK.bits(t);
  fs.writeFileSync(path.join(RAIZ, "entreno/data/kpk.json"), JSON.stringify({
    fuente: "Rey y peón contra rey, resuelto entero por herramientas/lib/kpk.js. Un bit por posición: 1 = ganan las blancas. No se edita a mano.",
    bits: Buffer.from(bits).toString("base64"),
  }) + "\n");
  const gana = (fen) => M.kpkGana(bits, fen);
  const r = rng("peones");
  const cheb = (a, b) => Math.max(Math.abs((a & 7) - (b & 7)), Math.abs((a >> 3) - (b >> 3)));
  const out = [];
  const vistas = new Set();
  const cuenta = (n, v) => out.filter((x) => x.nivel === n && (v === undefined || x.gana === v)).length;
  for (let intento = 0; intento < 400000; intento++) {
    if ([1, 2].every((n) => cuenta(n, true) >= 10 && cuenta(n, false) >= 10) && cuenta(3) >= POR_NIVEL && cuenta(4) >= POR_NIVEL) break;
    const wk = Math.floor(r() * 64), bk = Math.floor(r() * 64), p = 8 + Math.floor(r() * 48);
    if (wk === bk || wk === p || bk === p || cheb(wk, bk) <= 1) continue;
    const turno = r() < 0.5 ? "w" : "b";
    const tab = new Array(64).fill(null);
    tab[wk] = { t: "k", c: "w" }; tab[bk] = { t: "k", c: "b" }; tab[p] = { t: "p", c: "w" };
    const fen = R.colocacion(tab) + " " + turno + " - - 0 1";
    const g = new Chess();
    if (!g.load(fen) || g.game_over()) continue;
    const gb = new Chess(); gb.load(R.colocacion(tab) + " " + R.otro(turno) + " - - 0 1");
    if (gb.in_check()) continue;
    if (vistas.has(fen)) continue;
    const v = gana(fen);
    const dwp = cheb(wk, p), dbp = cheb(bk, p);
    let n = 0;
    if (dwp >= 4 && (wk >> 3) <= (p >> 3) && dbp >= 2) n = 1;                    // el cuadrado: el rey blanco lejos
    else if (dwp <= 2 && dbp <= 2) n = 2;                                        // los reyes encima
    if (n && cuenta(n, v) < 10) {
      vistas.add(fen);
      out.push({ id: "peo-" + n + "-" + hash(fen).toString(36), nivel: n, fen, gana: v,
        resumen: "Juegan las " + COLOR_ES[turno], respuesta: [v ? "Ganan las blancas: el peón corona." : "Tablas: el rey negro lo para."] });
      continue;
    }
    if (turno !== "w" || !v || dbp > 2) continue;
    // 3. la única jugada que gana  ·  4. llevarlo a coronar
    const ganadoras = g.moves({ verbose: true }).filter((m) => {
      g.move(m);
      const ok = m.promotion ? KPK.coronaGana(wk, bk, R.idx(m.to)) : gana(g.fen());
      g.undo();
      return ok;
    });
    if (ganadoras.some((m) => m.promotion)) continue;
    if (ganadoras.length === 1 && cuenta(3) < POR_NIVEL && (p >> 3) >= 2) {
      vistas.add(fen);
      out.push({ id: "peo-3-" + hash(fen).toString(36), nivel: 3, fen, gana: true, jugada: ganadoras[0].san,
        resumen: "Juegan las blancas", respuesta: ["La única que gana: " + R.sanEs(ganadoras[0].san) + "."] });
    } else if (ganadoras.length >= 2 && cuenta(4) < POR_NIVEL && (p >> 3) <= 3 && dwp <= 2) {
      vistas.add(fen);
      out.push({ id: "peo-4-" + hash(fen).toString(36), nivel: 4, fen, gana: true,
        resumen: "Juegan las blancas", respuesta: ["Gana: hay que coronar sin soltar la ventaja. Jugadas que ganan ahora: " + ganadoras.map((m) => R.sanEs(m.san)).join(", ") + "."] });
    }
  }
  return out.sort((a, b) => a.nivel - b.nivel);
}

/* ---------- 12. Adivina la jugada del maestro ----------
   Las partidas son las del curso «Partidas modelo», que está detrás del
   candado de los cursos (cursos/protegido/): el banco de este tipo se escribe
   AHÍ, en cursos/protegido/data/tipos-maestro.json, y no en el público. Al
   público solo va el índice (ids y niveles), para contar el avance. */
const MAESTRO_SALIDA = path.join(RAIZ, "cursos/protegido/data/tipos-maestro.json");
async function generarMaestro() {
  const curso = JSON.parse(fs.readFileSync(path.join(RAIZ, "cursos/protegido/data/partidas-modelo.json"), "utf8"));
  const items = [];
  for (const [gid, p] of Object.entries(curso.partidas)) {
    const lado = p.resultado === "0-1" ? "b" : "w";
    const movs = p.moves;
    const antes = (k) => (k === 0 ? p.start_fen : movs[k - 1].fen);
    const propias = movs.map((m, k) => ({ m, k })).filter((x) => x.m.color === lado);
    const tramos = {
      1: propias.filter((x) => x.m.n >= 5 && x.m.n <= 14),
      2: propias.filter((x) => x.m.n >= 15 && x.m.n <= 24),
      3: propias.slice(-10),
    };
    for (const n of [1, 2, 3]) {
      const tramo = tramos[n].slice(0, 10);
      if (tramo.length < 6) continue;
      const posiciones = await enParalelo(tramo, async ({ m, k }) => {
        const fen = antes(k);
        const g = new Chess(fen);
        if (!g.move(m.san)) throw new Error("jugada ilegal en " + gid + " ply " + k);
        const r = await analizar(fen, 5, 14);
        const mejor = r[0];
        const buenas = r.filter((x) => (mejor.mate !== null && mejor.mate > 0) ? (x.mate !== null && x.mate > 0) : (x.mate === null && x.score >= mejor.score - 30))
          .map((x) => sanDeUci(fen, x.uci)).filter((s) => s && s !== m.san);
        const siguiente = movs[k + 1];
        return { fen, jugada: m.san, buenas, respuesta: siguiente ? siguiente.san : null, n: m.n };
      });
      items.push({ id: "mae-" + n + "-" + gid, nivel: n, partida: gid, titulo: p.titulo, blancas: p.blancas, negras: p.negras,
        evento: p.evento || "", lado, posiciones,
        resumen: p.blancas + " – " + p.negras + " (jugadas " + posiciones[0].n + "–" + posiciones[posiciones.length - 1].n + ")",
        respuesta: ["Las jugadas del maestro: " + posiciones.map((x) => x.n + (lado === "w" ? "." : "…") + R.sanEs(x.jugada)).join(" ")] });
    }
  }
  fs.writeFileSync(MAESTRO_SALIDA, JSON.stringify({
    fuente: "Partidas del curso «Partidas modelo», con las jugadas que el motor da por tan buenas como la del maestro. Generado por herramientas/tipos-generar.js: no se edita a mano.",
    maestro: items,
  }) + "\n");
  return items.map((x) => ({ id: x.id, nivel: x.nivel }));
}

/* ---------- 13. ¿Qué apertura es? ---------- */
function generarApertura() {
  const { LINEAS } = require("../js/aperturas-lineas.js");
  const aperturas = [...new Set(LINEAS.map((l) => l.apertura))];
  const out = [];
  const tras = (jugadas) => { const g = new Chess(); for (const j of jugadas) if (!g.move(j)) return null; return g; };
  const clave = (g) => g.fen().split(" ").slice(0, 2).join(" ");
  // 1. la familia, tras las primeras jugadas
  const porFen = {};
  LINEAS.forEach((l) => {
    const n = Math.min(l.jugadas.length, 6);
    const g = tras(l.jugadas.slice(0, n));
    if (!g) throw new Error("línea ilegal " + l.id);
    const k = clave(g);
    (porFen[k] = porFen[k] || { fen: g.fen(), jugadas: l.jugadas.slice(0, n), aperturas: new Set(), lineas: [] }).aperturas.add(l.apertura);
    porFen[k].lineas.push(l.id);
  });
  Object.values(porFen).forEach((x) => {
    if (x.aperturas.size !== 1) return;
    const ap = [...x.aperturas][0];
    out.push({ id: "ape-1-" + hash(x.fen).toString(36), nivel: 1, fen: x.fen, jugadas: x.jugadas, correcta: ap,
      opciones: barajar([ap].concat(barajar(aperturas.filter((a) => a !== ap), "o" + x.fen).slice(0, 3)), "p" + x.fen),
      resumen: x.jugadas.length + " jugadas", respuesta: ["Es la " + ap + "."] });
  });
  // 2. la línea exacta
  const vistas = new Set();
  LINEAS.forEach((l) => {
    if (l.jugadas.length < 7) return;
    const g = tras(l.jugadas);
    if (vistas.has(clave(g))) return;
    vistas.add(clave(g));
    const mismas = LINEAS.filter((o) => o.id !== l.id && o.apertura === l.apertura).map((o) => o.nombre);
    const otras = LINEAS.filter((o) => o.apertura !== l.apertura).map((o) => o.nombre);
    const distractores = barajar(mismas, "m" + l.id).slice(0, 2);
    const resto = barajar(otras.filter((o) => o !== l.nombre), "r" + l.id).slice(0, 3 - distractores.length);
    out.push({ id: "ape-2-" + l.id, nivel: 2, fen: g.fen(), jugadas: l.jugadas, correcta: l.nombre, apertura: l.apertura,
      opciones: barajar([l.nombre].concat(distractores, resto), "p" + l.id),
      resumen: l.jugadas.length + " jugadas", respuesta: ["Es «" + l.nombre + "» (" + l.apertura + ")."] });
  });
  // 3. en otro orden: dos jugadas del mismo bando cambiadas de lugar, y se
  //    llega a la MISMA posición
  LINEAS.forEach((l) => {
    const J = l.jugadas, fin = tras(J);
    for (let i = 0; i < J.length; i++) for (let j = i + 2; j < J.length; j += 2) {
      const K = J.slice(); [K[i], K[j]] = [K[j], K[i]];
      const g = tras(K);
      if (!g || clave(g) !== clave(fin)) continue;
      if (out.some((x) => x.nivel === 3 && x.lineaId === l.id)) continue;
      out.push({ id: "ape-3-" + l.id, nivel: 3, lineaId: l.id, fen: fin.fen(), jugadas: K, orden: J, correcta: l.apertura,
        opciones: barajar([l.apertura].concat(barajar(aperturas.filter((a) => a !== l.apertura), "o3" + l.id).slice(0, 3)), "p3" + l.id),
        resumen: K.length + " jugadas en otro orden", respuesta: ["Es la " + l.apertura + " («" + l.nombre + "»), con las jugadas en otro orden."] });
      i = J.length; break;
    }
  });
  return out.sort((a, b) => a.nivel - b.nivel);
}

/* ---------- 14. La ruta segura ---------- */
const NIVELES_RUTA = {
  1: { tipos: ["r", "b"], piezas: [0, 14], d: [2, 3] },
  2: { tipos: ["q", "k"], piezas: [0, 18], d: [3, 4] },
  3: { tipos: ["n"], piezas: [0, 18], d: [3, 5] },
  4: { tipos: ["n", "b"], piezas: [22, 32], d: [4, 8] },
};
function generarRuta(reales) {
  const out = [], usadas = new Set();
  for (const n of [1, 2, 3, 4]) {
    const cfg = NIVELES_RUTA[n];
    let cuenta = 0;
    for (const { fen, pz } of barajar(reales, "ruta" + n)) {
      if (cuenta >= POR_NIVEL) break;
      if (usadas.has(fen)) continue;
      const np = piezas(fen);
      if (np < cfg.piezas[0] || np > cfg.piezas[1]) continue;
      const c = fen.split(" ")[1];
      const tab = R.tablero(fen);
      const candidatas = [];
      tab.forEach((p, i) => { if (p && p.c === c && cfg.tipos.includes(p.t)) candidatas.push(R.sq(i)); });
      for (const desde of barajar(candidatas, "d" + fen)) {
        // todos los destinos a la distancia pedida; se elige el más lejano
        const destinos = [];
        for (let i = 0; i < 64; i++) {
          if (tab[i]) continue;
          const r = M.rutaMinima(fen, desde, R.sq(i));
          if (r && r.n >= cfg.d[0] && r.n <= cfg.d[1]) destinos.push({ hasta: R.sq(i), r });
        }
        if (!destinos.length) continue;
        destinos.sort((a, b) => b.r.n - a.r.n || (a.hasta < b.hasta ? -1 : 1));
        const e = destinos[Math.floor(rng("h" + fen)() * Math.min(3, destinos.length))];
        const p = tab[R.idx(desde)];
        out.push({ id: "rut-" + n + "-" + hash(fen + desde).toString(36), nivel: n, fen, desde, hasta: e.hasta, minimo: e.r.n, camino: e.r.camino,
          resumen: R.NOMBRE[p.t] + " de " + desde + " a " + e.hasta,
          respuesta: ["El mínimo: " + e.r.n + " jugadas. Por ejemplo: " + [desde].concat(e.r.camino).join(" → ") + "."],
          partida: pz.game || null });
        usadas.add(fen); cuenta++;
        break;
      }
    }
  }
  return out;
}

/* ---------- 15. Aguanta: la única defensa ----------
   Posiciones donde al que mueve le amenazan algo serio y solo UNA jugada lo
   para. Salen de dos lugares del banco de «Ejercicios por tema»:
     - los ejercicios que Lichess marca como defensa (`defensiveMove`,
       `equality`): la jugada del alumno ES la defensa, tal cual se jugó;
     - la posición de cualquier ejercicio con el turno del que se defiende (la
       misma de ¿Qué quiere el rival?). Casi nunca sirve —el que se defiende
       suele tener algo mejor que defenderse—, pero las pocas que sí, entran.
   Entra solo si el motor dice que hay UNA jugada que aguanta:
     - la amenaza del rival es real: si le tocara, su mejor jugada gana (mate
       o 2 peones). Por eso no entra ninguna con el rey en jaque: ahí la
       «amenaza» ya está hecha;
     - la mejor defensa queda entre −1,5 y +2,5 (se defiende; no es que haya
       un golpe propio mejor) y sin mate de por medio;
     - la segunda pierde: recibe mate, o queda 2,5 peones o más por debajo y
       en −2 o peor.
   Se pide con TODAS las jugadas a profundidad 12 (de ahí sale cómo castiga el
   rival cada error) y se confirma con las dos mejores a profundidad 18: como
   esa búsqueda mira todas las jugadas, si otra aguantara saldría segunda.
   El nivel lo pone la amenaza que vio el motor: comerse algo (1), mate en 1
   (2), un golpe sin captura (3) o mate en 2 o más (4). Una amenaza que es
   solo mover el rey (sin captura ni mate) no entra: no se lee como amenaza. Las posiciones que ya
   usan ¿Qué quiere el rival? y Descarte no se repiten. */
function nivelAguanta(fenRival, ra) {
  if (ra.mate !== null && ra.mate > 0) return ra.mate === 1 ? 2 : 4;
  return /x/.test(sanDeUci(fenRival, ra.uci)) ? 1 : 3;
}
async function generarAguanta(yaUsados) {
  const cand = [];
  const vistas = new Set();
  const sumar = (pz, fenYo, fenRival, origen) => {
    const k = fenYo.split(" ").slice(0, 2).join(" ");
    if (vistas.has(k)) return;
    const g = new Chess();
    if (!g.load(fenYo) || g.in_check() || g.game_over()) return;
    const h = new Chess();
    if (!h.load(fenRival) || h.game_over()) return;
    vistas.add(k);
    cand.push({ pz, fenYo, fenRival, origen });
  };
  PUZZLES.forEach((pz) => {
    const t = pz.themes || [];
    if (!t.includes("defensiveMove") && !t.includes("equality")) return;
    sumar(pz, pz.fen, conTurno(pz.fen, R.otro(pz.fen.split(" ")[1])), "defensa");
  });
  PUZZLES.forEach((pz) => {
    if (yaUsados.has(pz.id) || !nivelAmenaza(pz)) return;
    const fenYo = flipLegal(pz);
    if (fenYo) sumar(pz, fenYo, conTurno(pz.fen, pz.fen.split(" ")[1]), "turno");
  });
  const pierde = (x, mejor) => (x.mate !== null && x.mate < 0) || (x.score <= mejor - 250 && x.score <= -200);
  const aguanta = (x) => x.mate === null && x.score >= -150 && x.score <= 250;
  const buenos = (await enParalelo(cand, async ({ pz, fenYo, fenRival, origen }) => {
    const legales = new Chess(fenYo).moves({ verbose: true });
    if (legales.length < 6) return null;               // con pocas jugadas se adivina
    const [ra] = await analizar(fenRival, 1, 16);
    if (!ra || !((ra.mate !== null && ra.mate > 0) || ra.score >= 200)) return null;
    const todas = await analizar(fenYo, legales.length, 12);
    if (todas.length !== legales.length) return null;
    if (!aguanta(todas[0]) || !pierde(todas[1], todas[0].score)) return null;
    const hondo = await analizar(fenYo, 2, 18);
    if (hondo.length < 2 || hondo[0].uci !== todas[0].uci) return null;
    if (!aguanta(hondo[0]) || !pierde(hondo[1], hondo[0].score)) return null;
    // Una «amenaza» que es solo acercar el rey es real para el motor, pero no
    // se ve como amenaza: la pista «¿Qué quiere el rival?» no enseñaría nada.
    const mAm = new Chess(fenRival).move(sanDeUci(fenRival, ra.uci));
    if (mAm.piece === "k" && !mAm.captured && !(ra.mate > 0)) return null;
    const n = nivelAguanta(fenRival, ra);
    const defensa = sanDeUci(fenYo, hondo[0].uci);
    const amenaza = sanDeUci(fenRival, ra.uci);
    const refuta = {};
    todas.slice(1).forEach((x) => {
      const san = sanDeUci(fenYo, x.uci);
      const g = new Chess(fenYo); g.move(san);
      const r = x.pv[1] ? sanDeUci(g.fen(), x.pv[1]) : null;
      refuta[san] = { r: r ? R.sanEs(r) : null, e: x.mate === null ? x.score : null, m: x.mate !== null ? -x.mate : null };
    });
    const segunda = sanDeUci(fenYo, hondo[1].uci);
    const yo = fenYo.split(" ")[1];
    const evalTxt = (x) => (x.mate !== null ? "recibe mate en " + (-x.mate) : R.numeroBalanza(x.score / 100) + " para las " + R.COLOR[yo]);
    const mateAmenaza = ra.mate !== null && ra.mate > 0 ? ra.mate : null;
    // en los de defensa, el motivo de Lichess habla de la defensa, no de la amenaza
    const mot = origen === "turno" ? motivo(pz.themes) : "";
    return {
      id: "agu-" + n + "-" + pz.id, nivel: n, origen, fen: fenYo, fenRival,
      defensa, defensaEs: R.sanEs(defensa), eval: hondo[0].score,
      amenaza, amenazaEs: R.sanEs(amenaza), mateAmenaza,
      linea: lineaEs(fenYo, hondo[0].pv, 4),
      segunda: { san: segunda, sanEs: R.sanEs(segunda), eval: hondo[1].mate === null ? hondo[1].score : null, mateEn: hondo[1].mate !== null ? -hondo[1].mate : null, linea: lineaEs(fenYo, hondo[1].pv, 3) },
      refuta, motivo: mot, rating: pz.rating, partida: pz.game || null,
      resumen: "Juegan las " + R.COLOR[yo] + " · ELO " + pz.rating,
      respuesta: [
        "La única que aguanta: " + R.sanEs(defensa) + " (" + evalTxt(hondo[0]) + ").",
        ("Lo que amenazaba el rival: " + R.sanEs(amenaza) + (mateAmenaza ? " (mate en " + mateAmenaza + ")" : "") + ". " + mot).trim(),
        "La línea: " + lineaEs(fenYo, hondo[0].pv, 4) + ".",
        "La segunda mejor, " + R.sanEs(segunda) + ", ya pierde (" + evalTxt(hondo[1]) + "): " + lineaEs(fenYo, hondo[1].pv, 3) + ".",
      ],
    };
  })).filter(Boolean);
  // por nivel, de menor a mayor rating: el nivel también sube por dentro
  const out = [];
  for (const n of [1, 2, 3, 4]) out.push(...buenos.filter((x) => x.nivel === n).sort((a, b) => a.rating - b.rating || (a.id < b.id ? -1 : 1)).slice(0, POR_NIVEL * 2));
  return out;
}
function usadosPorAmenazaYDescarte(datos) {
  const ids = new Set();
  (datos.amenaza || []).concat(datos.descarte || []).forEach((x) => ids.add(x.id.replace(/^(ame|des)-\d+-/, "")));
  return ids;
}

/* ---------- 16. Remata la ventaja ----------
   Posiciones de medio juego donde el alumno ya va ganando y tiene que
   convertir. Salen de los ejercicios de «Ejercicios por tema» que ganan
   material o posición (no los de mate): se juega la solución entera, se deja
   que el rival conteste con la mejor jugada del motor (profundidad 16) y le
   toca al alumno. Entra si:
     - quedan 14 piezas o más (es medio juego, no un final de libro) y nadie
       está en jaque;
     - el motor da entre +4 y +8 al alumno a profundidad 18, sin mate, y a
       profundidad 12 decía casi lo mismo (a menos de 1): una posición donde el
       motor todavía duda no sirve para medir si se escapó. La meta es seguir
       en +3: el peón de margen es para la evaluación del navegador, que es
       más corta y se mueve (jugando la mejor del motor, un +3,3 se leía +2,1).
   El nivel lo pone el material: una torre o más (1), una pieza (2) o casi
   igual (3). Las jugadas de cada nivel están en el catálogo. */
async function generarRemata() {
  const cand = [];
  const vistas = new Set();
  for (const pz of PUZZLES) {
    const t = pz.themes || [];
    if (pz.mate || !(t.includes("crushing") || t.includes("advantage"))) continue;
    const g = new Chess(pz.fen);
    let ok = true;
    for (const s of pz.solution) if (!g.move(s)) { ok = false; break; }
    if (!ok || g.game_over() || piezas(g.fen()) < 15) continue;
    cand.push({ pz, fenRival: g.fen(), alumno: new Chess(pz.fen).turn() });
    if (cand.length >= 2000) break;
  }
  const buenos = (await enParalelo(cand, async ({ pz, fenRival, alumno }) => {
    const [rr] = await analizar(fenRival, 1, 16);
    if (!rr || rr.mate !== null) return null;
    const g = new Chess(fenRival);
    const resp = g.move({ from: rr.uci.slice(0, 2), to: rr.uci.slice(2, 4), promotion: rr.uci[4] || undefined });
    if (!resp || g.game_over() || g.in_check()) return null;
    const fen = g.fen();
    const k = fen.split(" ").slice(0, 2).join(" ");
    if (vistas.has(k) || piezas(fen) < 14) return null;
    const [a] = await analizar(fen, 1, 12);
    const [b] = await analizar(fen, 1, 18);
    if (!a || !b || a.mate !== null || b.mate !== null) return null;
    if (b.score < 400 || b.score > 800 || Math.abs(a.score - b.score) > 100) return null;
    vistas.add(k);
    const mat = material(fen) * (alumno === "w" ? 1 : -1);
    const n = mat >= 5 ? 1 : mat >= 3 ? 2 : mat <= 2 && mat >= -1 ? 3 : null;
    if (!n) return null;
    const jugadas = R_CATALOGO.nivel("remata", n).jugadas;
    const numero = R.numeroBalanza(b.score / 100);
    const matTxt = mat === 0 ? "igual" : (mat > 0 ? "+" : "−") + Math.abs(mat);
    return {
      id: "rem-" + n + "-" + pz.id, nivel: n, fen, eval: b.score, material: mat, jugadas,
      respuestaRival: R.sanEs(resp.san), linea: lineaEs(fen, b.pv, 4),
      rating: pz.rating, partida: pz.game || null,
      resumen: "Juegan las " + R.COLOR[alumno] + " · " + numero + " · material " + matTxt,
      respuesta: [
        "El motor: " + numero + " para las " + R.COLOR[alumno] + " (profundidad 18). Material: " + matTxt + ".",
        "Lo que jugaría el motor: " + lineaEs(fen, b.pv, 4) + ".",
        "La meta: dar mate, o seguir en +3 o más después de " + jugadas + " jugadas. Si baja de +1,5, se escapó.",
      ],
    };
  })).filter(Boolean);
  const out = [];
  for (const n of [1, 2, 3]) out.push(...buenos.filter((x) => x.nivel === n).sort((a, b) => a.rating - b.rating || (a.id < b.id ? -1 : 1)).slice(0, POR_NIVEL * 2));
  return out;
}

/* ---------- 17. Elige a tiempo ----------
   Posiciones TRANQUILAS: la del final de un ejercicio (ya pasó el golpe), la
   mejor respuesta del rival (profundidad 16) y le toca al alumno. Entra si:
     - nadie está en jaque y el motor da entre −1,5 y +3 al alumno, sin mate;
     - no hay una sola jugada: la segunda mejor está a menos de 0,6 de la
       mejor (a profundidad 12). Si hubiera un golpe, sería otro ejercicio;
     - se arman las candidatas, cada una analizada SOLA a profundidad 18 y
       comparada con la mejor analizada igual: la mejor; una razonable que
       pierde entre 0,3 y 1,1; y una (o dos, en el nivel 3) que pierde entre
       1,3 y 4, entre las que se prefieren capturas y jaques, que tientan.
       Nada que pierda más de 4: se descartaría sin pensar.
   Los niveles solo cambian el reloj y cuántas candidatas: el 1 y el 2 con
   tres, el 3 con cuatro, repartidas por rating (por eso no entran los
   ejercicios propios del banco, que no traen rating). */
async function generarTiempo() {
  const cand = [];
  for (const pz of PUZZLES) {
    if (pz.mate || typeof pz.rating !== "number") continue;
    const g = new Chess(pz.fen);
    let ok = true;
    for (const s of pz.solution) if (!g.move(s)) { ok = false; break; }
    if (!ok || g.game_over() || piezas(g.fen()) < 10) continue;
    cand.push({ pz, fenRival: g.fen() });
    if (cand.length >= 3000) break;
  }
  const vistas = new Set();
  const tienta = (fen, x) => (/x|\+/.test(sanDeUci(fen, x.uci)) ? 0 : 1);
  const buenos = (await enParalelo(cand, async ({ pz, fenRival }) => {
    const [rr] = await analizar(fenRival, 1, 16);
    if (!rr || rr.mate !== null) return null;
    const g = new Chess(fenRival);
    const resp = g.move({ from: rr.uci.slice(0, 2), to: rr.uci.slice(2, 4), promotion: rr.uci[4] || undefined });
    if (!resp || g.game_over() || g.in_check()) return null;
    const fen = g.fen();
    const k = fen.split(" ").slice(0, 2).join(" ");
    if (vistas.has(k)) return null;
    const legales = g.moves({ verbose: true });
    if (legales.length < 8) return null;
    const r = await analizar(fen, Math.min(25, legales.length), 12);
    if (r.length < 5 || r[0].mate !== null || r[0].score < -150 || r[0].score > 300) return null;
    if (r[1].mate !== null || r[1].score < r[0].score - 60) return null;          // hay más de una jugada
    const mejor0 = r[0].score;
    const razonables = r.slice(1).filter((x) => x.mate === null && x.score <= mejor0 - 30 && x.score >= mejor0 - 110);
    const errores = barajar(r.filter((x) => x.mate === null && x.score <= mejor0 - 130 && x.score >= mejor0 - 400), "e" + pz.id).sort((a, b) => tienta(fen, a) - tienta(fen, b));
    if (!razonables.length || errores.length < 1) return null;
    // confirmar cada una SOLA, más hondo
    const elegidas = [r[0], razonables[0]].concat(errores.slice(0, 2));
    const conf = await Promise.all(elegidas.map((x) => analizar(fen, 1, 18, [x.uci])));
    if (conf.some((c) => !c[0] || c[0].mate !== null)) return null;
    const mejor = conf[0][0].score;
    if (mejor < -150 || mejor > 300) return null;                               // el rango, con la evaluación que se guarda
    if (conf.slice(1).some((c) => c[0].score > mejor)) return null;             // la «mejor» tiene que seguir siéndolo
    const perdida = (i) => mejor - conf[i][0].score;
    // Los cortes son los de la regla de la página (M.TIEMPO): una razonable
    // que perdiera justo 0,3 daría tres estrellas, como la mejor.
    if (perdida(1) <= M.TIEMPO.mejor || perdida(1) > M.TIEMPO.buena) return null;
    const errOk = [2, 3].filter((i) => conf[i] && perdida(i) >= 130 && perdida(i) <= 400 && perdida(i) > M.TIEMPO.buena);
    if (!errOk.length) return null;
    vistas.add(k);
    const yo = fen.split(" ")[1];
    const clase = (i) => (i === 0 ? "mejor" : i === 1 ? "razonable" : "error");
    const cands = [0, 1].concat(errOk).map((i) => {
      const san = sanDeUci(fen, conf[i][0].uci);
      return { san, sanEs: R.sanEs(san), eval: conf[i][0].score, perdida: perdida(i), clase: clase(i), linea: lineaEs(fen, conf[i][0].pv, 3) };
    });
    return { pz, fen, yo, cands };
  })).filter(Boolean);
  // repartir por rating: el 1 y el 2 con tres candidatas, el 3 con cuatro
  buenos.sort((a, b) => a.pz.rating - b.pz.rating || (a.pz.id < b.pz.id ? -1 : 1));
  const cuatro = buenos.filter((x) => x.cands.length === 4);
  const n3 = new Set(cuatro.slice(-POR_NIVEL * 2).map((x) => x.pz.id));
  const resto = buenos.filter((x) => !n3.has(x.pz.id));
  const mitad = Math.min(POR_NIVEL * 2, Math.floor(resto.length / 2));
  const reparto = [[1, resto.slice(0, mitad)], [2, resto.slice(mitad, mitad * 2)], [3, buenos.filter((x) => n3.has(x.pz.id))]];
  const out = [];
  for (const [n, lista] of reparto) {
    const seg = R_CATALOGO.nivel("tiempo", n).segundos;
    lista.forEach((x) => {
      const cands = n === 3 ? x.cands : x.cands.slice(0, 3);
      const orden = barajar(cands, "o" + x.pz.id);
      out.push({
        id: "tie-" + n + "-" + x.pz.id, nivel: n, fen: x.fen, segundos: seg,
        candidatas: orden, rating: x.pz.rating, partida: x.pz.game || null,
        resumen: "Juegan las " + R.COLOR[x.yo] + " · " + orden.map((c) => c.sanEs).join(", "),
        respuesta: orden.map((c) => c.sanEs + ": " + (c.clase === "mejor" ? "la mejor" : "pierde " + R.numeroBalanza(c.perdida / 100).replace("+", "")) +
          " (" + R.numeroBalanza(c.eval / 100) + " para las " + R.COLOR[x.yo] + "). " + c.linea + "."),
      });
    });
  }
  return out;
}

/* ---------- solo un banco ---------- */
if (SOLO === "aguanta") {
  (async () => {
    const datos = JSON.parse(fs.readFileSync(SALIDA, "utf8"));
    console.log("Aguanta (motor)…");
    datos.aguanta = await generarAguanta(usadosPorAmenazaYDescarte(datos));
    guardarCache();
    MOTORES.forEach((m) => m.cerrar());
    fs.writeFileSync(SALIDA, JSON.stringify(datos) + "\n");
    const c = datos.aguanta.reduce((m, x) => { m[x.nivel] = (m[x.nivel] || 0) + 1; return m; }, {});
    console.log("aguanta       ", JSON.stringify(c));
    process.exit(0);
  })().catch((e) => { console.error(e); process.exit(1); });
} else if (SOLO === "remata") {
  (async () => {
    const datos = JSON.parse(fs.readFileSync(SALIDA, "utf8"));
    console.log("Remata la ventaja (motor)…");
    datos.remata = await generarRemata();
    guardarCache();
    MOTORES.forEach((m) => m.cerrar());
    fs.writeFileSync(SALIDA, JSON.stringify(datos) + "\n");
    const c = datos.remata.reduce((m, x) => { m[x.nivel] = (m[x.nivel] || 0) + 1; return m; }, {});
    console.log("remata        ", JSON.stringify(c));
    process.exit(0);
  })().catch((e) => { console.error(e); process.exit(1); });
} else if (SOLO === "tiempo") {
  (async () => {
    const datos = JSON.parse(fs.readFileSync(SALIDA, "utf8"));
    console.log("Elige a tiempo (motor)…");
    datos.tiempo = await generarTiempo();
    guardarCache();
    MOTORES.forEach((m) => m.cerrar());
    fs.writeFileSync(SALIDA, JSON.stringify(datos) + "\n");
    const c = datos.tiempo.reduce((m, x) => { m[x.nivel] = (m[x.nivel] || 0) + 1; return m; }, {});
    console.log("tiempo        ", JSON.stringify(c));
    process.exit(0);
  })().catch((e) => { console.error(e); process.exit(1); });
} else if (SOLO) {
  if (SOLO !== "con-lo-justo") { console.error("--solo solo sabe rehacer «con-lo-justo», «aguanta», «remata» o «tiempo»."); process.exit(2); }
  const datos = JSON.parse(fs.readFileSync(SALIDA, "utf8"));
  console.log("Con lo justo (tablas de finales, tarda un par de minutos)…");
  datos["con-lo-justo"] = generarConLoJusto();
  fs.writeFileSync(SALIDA, JSON.stringify(datos) + "\n");
  const c = datos["con-lo-justo"].reduce((m, x) => { m[x.nivel] = (m[x.nivel] || 0) + 1; return m; }, {});
  console.log("con-lo-justo  ", JSON.stringify(c));
  process.exit(0);
}

/* ---------- todo junto ---------- */
if (!SOLO) (async () => {
  console.log("Detective…");
  const detective = generarDetective();
  console.log("¿Qué quiere el rival?…");
  const amenaza = await generarAmenaza();
  console.log("Descarte…");
  const paraBalanza = [];
  const descarte = await generarDescarte(paraBalanza);
  console.log("Siete diferencias…");
  const diferencias = await generarDiferencias();
  console.log("La balanza…");
  const balanza = await generarBalanza(paraBalanza);
  console.log("Fotografía…");
  const fotografia = generarFotografia();
  console.log("Con lo justo (tablas de finales, tarda un par de minutos)…");
  const conLoJusto = generarConLoJusto();
  const reales = posicionesReales(3000);
  console.log("El Barrido…");
  const barrido = generarBarrido(reales);
  console.log("Intercambios…");
  const intercambios = generarIntercambios(reales);
  console.log("Constrúyela tú…");
  const construye = generarConstruye(reales);
  console.log("Rey y peón…");
  const peones = generarPeones();
  console.log("Adivina la jugada del maestro…");
  const maestro = await generarMaestro();
  console.log("¿Qué apertura es?…");
  const apertura = generarApertura();
  console.log("La ruta segura…");
  const ruta = generarRuta(reales);
  console.log("Aguanta…");
  const aguanta = await generarAguanta(usadosPorAmenazaYDescarte({ amenaza, descarte }));
  console.log("Remata la ventaja…");
  const remata = await generarRemata();
  console.log("Elige a tiempo…");
  const tiempo = await generarTiempo();
  guardarCache();
  MOTORES.forEach((m) => m.cerrar());
  const datos = {
    fuente: "Posiciones de partidas reales de la base abierta de Lichess (CC0) y de js/aperturas-lineas.js; finales sorteados con su distancia exacta al mate. Generado por herramientas/tipos-generar.js: no se edita a mano.",
    detective, amenaza, descarte, diferencias, balanza, fotografia, "con-lo-justo": conLoJusto,
    barrido, intercambios, construye, peones, maestro, apertura, ruta, aguanta, remata, tiempo,
  };
  fs.writeFileSync(SALIDA, JSON.stringify(datos) + "\n");
  const cuenta = (l) => l.reduce((m, x) => { m[x.nivel] = (m[x.nivel] || 0) + 1; return m; }, {});
  Object.keys(datos).filter((k) => k !== "fuente").forEach((k) => console.log(k.padEnd(14), JSON.stringify(cuenta(datos[k]))));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
