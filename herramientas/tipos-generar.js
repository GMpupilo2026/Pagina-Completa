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
const MOTORES = Array.from({ length: Math.max(1, Math.min(4, require("os").cpus().length)) }, () => new Motor());
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
    while (elegidas.length < 6 && intentos++ < 200000) {
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
      const d = tabla.dtm(fen);
      if (!d || d < minDtm) continue;
      if (elegidas.filter((x) => x.minimo === d).length >= 2) continue;  // variedad
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

/* ---------- todo junto ---------- */
(async () => {
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
  guardarCache();
  MOTORES.forEach((m) => m.cerrar());
  const datos = {
    fuente: "Posiciones de partidas reales de la base abierta de Lichess (CC0) y de js/aperturas-lineas.js; finales sorteados con su distancia exacta al mate. Generado por herramientas/tipos-generar.js: no se edita a mano.",
    detective, amenaza, descarte, diferencias, balanza, fotografia, "con-lo-justo": conLoJusto,
  };
  fs.writeFileSync(SALIDA, JSON.stringify(datos) + "\n");
  const cuenta = (l) => l.reduce((m, x) => { m[x.nivel] = (m[x.nivel] || 0) + 1; return m; }, {});
  Object.keys(datos).filter((k) => k !== "fuente").forEach((k) => console.log(k.padEnd(14), JSON.stringify(cuenta(datos[k]))));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
