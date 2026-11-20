// Generado por herramientas/defensa-mate-armar.js a partir de js/tipos-reglas.js y herramientas/lib/finales-dtm.js.
// No se edita a mano. Ver la cabecera del script.
// ===== js/tipos-reglas.js =====
/* Las reglas de los Tipos de entrenamiento (entreno/tipos.html), sin DOM.
 *
 * Las usan tres lugares y por eso viven aparte: la página del alumno, el panel
 * del profesor en la clase en vivo (sesion.html) y los verificadores en Node
 * (herramientas/verificar-tipos.js). Lo que se comprueba es la regla que juega
 * el alumno, no una copia.
 *
 * Todo lo que necesita chess.js lo recibe como parámetro (`Chess`): en el
 * navegador es window.Chess y en Node el require("chess.js").Chess.
 */
(function (raiz) {
  "use strict";

  const FILAS = "abcdefgh";
  const NOMBRE = { p: "peón", n: "caballo", b: "alfil", r: "torre", q: "dama", k: "rey" };
  const NOMBRE_MAY = { p: "Peón", n: "Caballo", b: "Alfil", r: "Torre", q: "Dama", k: "Rey" };
  const LETRA_ES = { K: "R", Q: "D", R: "T", B: "A", N: "C" };
  const COLOR = { w: "blancas", b: "negras" };
  const REY = { w: "rey blanco", b: "rey negro" };
  const otro = (c) => (c === "w" ? "b" : "w");

  function sq(i) { return FILAS[i & 7] + ((i >> 3) + 1); }
  function idx(s) { return (+s[1] - 1) * 8 + FILAS.indexOf(s[0]); }

  /* FEN → 64 casillas ({t, c} o null), índice 0 = a1. */
  function tablero(fen) {
    const out = new Array(64).fill(null);
    const filas = fen.split(" ")[0].split("/");
    for (let r = 0; r < 8; r++) {
      let f = 0;
      for (const ch of filas[r]) {
        if (/\d/.test(ch)) { f += +ch; continue; }
        out[(7 - r) * 8 + f] = { t: ch.toLowerCase(), c: ch === ch.toUpperCase() ? "w" : "b" };
        f++;
      }
    }
    return out;
  }
  function colocacion(tab) {
    const filas = [];
    for (let r = 7; r >= 0; r--) {
      let s = "", vacias = 0;
      for (let f = 0; f < 8; f++) {
        const p = tab[r * 8 + f];
        if (!p) { vacias++; continue; }
        if (vacias) { s += vacias; vacias = 0; }
        s += p.c === "w" ? p.t.toUpperCase() : p.t;
      }
      if (vacias) s += vacias;
      filas.push(s);
    }
    return filas.join("/");
  }
  /* Para quien no ve (Modo Adaptado o cuenta ciega), la jugada en palabras
     («caballo felix 3»), la de ComandosTablero en todo el sitio; para los
     demás, en algebraica española. Sin página (los generadores y los
     verificadores en Node) siempre la española. */
  function paraQuienNoVe() {
    const doc = raiz.document && raiz.document.documentElement;
    return !!(doc && doc.classList && (doc.classList.contains("adaptive-mode") || doc.classList.contains("modo-ciego"))
      && raiz.ComandosTablero && raiz.ComandosTablero.jugadaParaMostrar);
  }
  function sanEs(san) {
    if (paraQuienNoVe()) return raiz.ComandosTablero.jugadaParaMostrar(String(san));
    return String(san).replace(/^[KQRBN]/, (c) => LETRA_ES[c]).replace(/=([QRBN])/, (_, c) => "=" + LETRA_ES[c]).replace(/^O-O-O/, "0-0-0").replace(/^O-O/, "0-0");
  }

  /* ¿Tiene sentido la cantidad de piezas de un bando? (8 peones como mucho, y
     cada pieza de más que las del principio necesita un peón que coronó). */
  function materialPosible(tab, c) {
    const n = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
    tab.forEach((x) => { if (x && x.c === c) n[x.t]++; });
    if (n.k !== 1 || n.p > 8) return false;
    const extra = Math.max(0, n.q - 1) + Math.max(0, n.r - 2) + Math.max(0, n.b - 2) + Math.max(0, n.n - 2);
    return n.p + extra <= 8;
  }

  /* =====================================================================
   * El Detective: ¿qué jugada se acaba de hacer?
   *
   * Una opción es {p, de, a, tipo}: tipo "normal", "corona" (en `a` está la
   * pieza coronada y en `de` había un peón), "enroque" (p = "k", de/a del rey)
   * o "alpaso". Es POSIBLE si existe una posición anterior legal —con o sin
   * una pieza capturada en `a`— desde la que esa jugada lleva exactamente a
   * la posición que se ve. Legal quiere decir, sobre todo, que el rey del
   * bando que ahora mueve NO estuviera en jaque antes: le tocaba al otro.
   * ===================================================================== */
  function retro(Chess, fenQ, op) {
    const partes = fenQ.split(" ");
    const turnoQ = partes[1];
    const mueve = otro(turnoQ);          // quien hizo la última jugada
    const Q = tablero(fenQ);
    const pa = Q[idx(op.a)];
    const res = (posible, motivo, antes) => ({ posible, motivo, antes: antes || null });
    if (!pa || pa.c !== mueve) return res(false, "no-esta");
    if (Q[idx(op.de)] && !(op.tipo === "enroque")) return res(false, "ocupada");

    // Posiciones anteriores candidatas.
    const bases = [];
    const P = Q.slice();
    if (op.tipo === "normal") {
      if (pa.t !== op.p) return res(false, "no-esta");
      P[idx(op.a)] = null; P[idx(op.de)] = { t: op.p, c: mueve };
      const capturas = [null, "q", "r", "b", "n", "p"];
      const filaA = +op.a[1];
      capturas.forEach((t) => {
        if (t === "p" && (filaA === 1 || filaA === 8)) return;
        const X = P.slice();
        if (t) X[idx(op.a)] = { t, c: turnoQ };
        bases.push({ tab: X, castling: "-", ep: "-", mov: { from: op.de, to: op.a } });
      });
    } else if (op.tipo === "corona") {
      if (pa.t === "p" || pa.t === "k" || pa.t !== op.p) return res(false, "no-esta");
      P[idx(op.a)] = null; P[idx(op.de)] = { t: "p", c: mueve };
      [null, "q", "r", "b", "n"].forEach((t) => {
        const X = P.slice();
        if (t) X[idx(op.a)] = { t, c: turnoQ };
        bases.push({ tab: X, castling: "-", ep: "-", mov: { from: op.de, to: op.a, promotion: op.p } });
      });
    } else if (op.tipo === "enroque") {
      if (pa.t !== "k") return res(false, "no-esta");
      const fila = mueve === "w" ? "1" : "8";
      const corto = op.a[0] === "g";
      const torreHoy = (corto ? "f" : "d") + fila, torreAntes = (corto ? "h" : "a") + fila;
      const t = Q[idx(torreHoy)];
      if (op.de !== "e" + fila || op.a !== (corto ? "g" : "c") + fila || !t || t.t !== "r" || t.c !== mueve) return res(false, "no-esta");
      if (Q[idx(op.de)] || Q[idx(torreAntes)]) return res(false, "ocupada");
      P[idx(op.a)] = null; P[idx(torreHoy)] = null;
      P[idx(op.de)] = { t: "k", c: mueve }; P[idx(torreAntes)] = { t: "r", c: mueve };
      const derecho = corto ? "k" : "q";
      bases.push({ tab: P, castling: mueve === "w" ? derecho.toUpperCase() : derecho, ep: "-", mov: { from: op.de, to: op.a } });
    } else if (op.tipo === "alpaso") {
      if (pa.t !== "p") return res(false, "no-esta");
      const capt = op.a[0] + op.de[1];
      if (Q[idx(capt)]) return res(false, "ocupada");
      P[idx(op.a)] = null; P[idx(op.de)] = { t: "p", c: mueve }; P[idx(capt)] = { t: "p", c: turnoQ };
      bases.push({ tab: P, castling: "-", ep: op.a, mov: { from: op.de, to: op.a } });
    } else return res(false, "no-esta");

    let motivo = "ilegal";
    const colQ = colocacion(Q);
    for (const b of bases) {
      if (!materialPosible(b.tab, turnoQ) || !materialPosible(b.tab, mueve)) { if (motivo === "ilegal") motivo = "material"; continue; }
      const col = colocacion(b.tab);
      // 1) el rey del que ahora mueve no podía estar en jaque antes
      const g1 = new Chess();
      if (!g1.load(col + " " + turnoQ + " - - 0 1")) continue;
      if (g1.in_check()) { motivo = "jaque-antes"; continue; }
      // 2) la jugada tenía que ser legal y dar exactamente lo que se ve
      const g = new Chess();
      if (!g.load(col + " " + mueve + " " + b.castling + " " + b.ep + " 0 1")) continue;
      const m = g.move(b.mov);
      if (!m) { if (motivo !== "jaque-antes") motivo = "ilegal"; continue; }
      if (g.fen().split(" ")[0] !== colQ) continue;
      return res(true, "", col + " " + mueve + " " + b.castling + " " + b.ep + " 0 1");
    }
    return res(false, motivo);
  }

  /* Todas las jugadas que, mirando solo cómo se mueven las piezas, podrían
     haber llevado a esta posición. Sin decidir si son legales: eso es retro(). */
  function candidatasRetro(fenQ) {
    const Q = tablero(fenQ);
    const mueve = otro(fenQ.split(" ")[1]);
    const out = [];
    const vacia = (i) => i >= 0 && i < 64 && !Q[i];
    const dirs = { r: [[1, 0], [-1, 0], [0, 1], [0, -1]], b: [[1, 1], [1, -1], [-1, 1], [-1, -1]] };
    dirs.q = dirs.r.concat(dirs.b);
    for (let i = 0; i < 64; i++) {
      const p = Q[i];
      if (!p || p.c !== mueve) continue;
      const f = i & 7, r = i >> 3;
      const add = (j, tipo, pp) => out.push({ p: pp || p.t, de: sq(j), a: sq(i), tipo: tipo || "normal" });
      if (p.t === "n" || p.t === "k") {
        const saltos = p.t === "n" ? [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]
          : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
        saltos.forEach(([df, dr]) => {
          const nf = f + df, nr = r + dr;
          if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8 && vacia(nr * 8 + nf)) add(nr * 8 + nf);
        });
      } else if (p.t === "p") {
        const atras = mueve === "w" ? -1 : 1;
        const r1 = r + atras;
        if (r1 >= 1 && r1 <= 6) {
          if (vacia(r1 * 8 + f)) {
            add(r1 * 8 + f);
            const r2 = r + 2 * atras;
            if ((mueve === "w" ? r === 3 : r === 4) && vacia(r2 * 8 + f)) add(r2 * 8 + f);
          }
          [-1, 1].forEach((df) => {
            const nf = f + df;
            if (nf < 0 || nf > 7 || !vacia(r1 * 8 + nf)) return;
            add(r1 * 8 + nf);
            // al paso: el peón capturado estaba al lado del de origen
            if ((mueve === "w" ? r === 5 : r === 2) && vacia(r1 * 8 + f)) add(r1 * 8 + nf, "alpaso");
          });
        }
      } else {
        dirs[p.t].forEach(([df, dr]) => {
          let nf = f + df, nr = r + dr;
          while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8 && vacia(nr * 8 + nf)) { add(nr * 8 + nf); nf += df; nr += dr; }
        });
        // coronación: la pieza en la última fila pudo haber sido un peón
        if (p.t !== "k" && (mueve === "w" ? r === 7 : r === 0)) {
          const r1 = mueve === "w" ? 6 : 1;
          [-1, 0, 1].forEach((df) => {
            const nf = f + df;
            if (nf >= 0 && nf < 8 && vacia(r1 * 8 + nf)) add(r1 * 8 + nf, "corona");
          });
        }
      }
      if (p.t === "k") {
        const fila = mueve === "w" ? 0 : 7;
        if (r === fila && (f === 6 || f === 2)) out.push({ p: "k", de: "e" + (fila + 1), a: sq(i), tipo: "enroque" });
      }
    }
    return out;
  }

  function etiquetaRetro(op) {
    if (op.tipo === "enroque") return op.a[0] === "g" ? "Enroque corto (0-0)" : "Enroque largo (0-0-0)";
    if (op.tipo === "corona") return "Un peón de " + op.de + " coronó " + (op.p === "q" ? "dama" : NOMBRE[op.p]) + " en " + op.a;
    if (op.tipo === "alpaso") return "Peón de " + op.de + " capturó al paso en " + op.a;
    return NOMBRE_MAY[op.p] + " de " + op.de + " a " + op.a;
  }
  function claveRetro(op) { return [op.tipo, op.p, op.de, op.a].join(":"); }

  function explicacionRetro(motivo, turnoQ) {
    const mueve = otro(turnoQ);
    if (motivo === "jaque-antes") return "Imposible: antes de esa jugada el " + REY[turnoQ] + " ya habría estado en jaque, con las " + COLOR[mueve] + " por mover. Un jaque así nunca queda sin atender.";
    if (motivo === "ilegal") return "Imposible: esa jugada no era legal en la posición de antes (la pieza estaba clavada o el camino, cerrado).";
    if (motivo === "material") return "Imposible: para eso haría falta más material del que puede tener un bando.";
    return "Imposible: esa jugada no pudo dejar el tablero así.";
  }

  /* =====================================================================
   * ¿Qué quiere el rival?  La jugada que se busca es la del RIVAL.
   * Cuenta si es la de la solución, o cualquier mate cuando se promete mate.
   * ===================================================================== */
  function amenazaAcertada(Chess, item, mov) {
    const g = new Chess(item.fenRival);
    const m = g.move(mov);
    if (!m) return { legal: false, ok: false };
    const ok = m.san === item.amenaza || (item.mate === 1 && g.in_checkmate());
    return { legal: true, ok, san: m.san };
  }

  /* =====================================================================
   * Descarte: cuáles de las candidatas pierden. Se compara el conjunto.
   * ===================================================================== */
  function corregirDescarte(item, tachadas) {
    const set = new Set(tachadas);
    const filas = item.candidatas.map((c) => ({
      san: c.san, pierde: c.pierde, tachada: set.has(c.san),
      bien: c.pierde === set.has(c.san),
    }));
    return { filas, aciertos: filas.filter((f) => f.bien).length, total: filas.length, perfecto: filas.every((f) => f.bien) };
  }

  /* =====================================================================
   * La balanza: la aguja va de −5 a +5 (a favor de las blancas si es +).
   * El motor también se recorta a ±5: más que eso ya es «decisivo».
   * ===================================================================== */
  function recortar(v) { return Math.max(-5, Math.min(5, v)); }
  function puntosBalanza(estimado, real) {
    const e = recortar(estimado), r = recortar(real);
    const dif = Math.abs(e - r);
    const mismoLado = (e > 0.5 && r > 0.5) || (e < -0.5 && r < -0.5) || (Math.abs(e) <= 0.5 && Math.abs(r) <= 0.5);
    let estrellas = dif <= 0.75 ? 3 : dif <= 1.5 ? 2 : dif <= 3 ? 1 : 0;
    // del lado equivocado nunca es un acierto, aunque la distancia sea corta
    if (!mismoLado && Math.abs(r) > 1) estrellas = 0;
    return { diferencia: Math.round(dif * 10) / 10, estrellas, acierto: estrellas >= 2 };
  }
  function veredictoBalanza(v) {
    const a = Math.abs(v), lado = v > 0 ? "las blancas" : "las negras";
    if (a <= 0.5) return "igualdad";
    if (a <= 1.5) return "ventaja leve de " + lado;
    if (a <= 3) return "ventaja clara de " + lado;
    return "ventaja decisiva de " + lado;
  }
  function numeroBalanza(v) {
    const r = Math.round(v * 10) / 10;
    return (r > 0 ? "+" : r < 0 ? "−" : "") + Math.abs(r).toFixed(1).replace(".", ",");
  }

  /* =====================================================================
   * Fotografía: comparar el tablero reconstruido con el de verdad.
   * `colocado` es {casilla: "wq" | "bn" | …}.
   * ===================================================================== */
  function compararFoto(fen, colocado) {
    const real = tablero(fen);
    let aciertos = 0; const faltan = [], sobran = [], cambiadas = [];
    for (let i = 0; i < 64; i++) {
      const s = sq(i), r = real[i], c = colocado[s];
      const cr = r ? r.c + r.t : null;
      if (cr && c === cr) aciertos++;
      else if (cr && !c) faltan.push(s);
      else if (!cr && c) sobran.push(s);
      else if (cr && c) cambiadas.push(s);
    }
    const total = real.filter(Boolean).length;
    return { aciertos, total, faltan, sobran, cambiadas, errores: faltan.length + sobran.length + cambiadas.length };
  }
  /* «Rg1 Tf1 a2 b2» → piezas de UN color. La letra va en castellano (R, D, T,
     A, C) o sin letra para el peón; también entiende la inglesa (K Q R B N)
     cuando no choca: la R castellana es rey. */
  function leerPiezas(texto, color) {
    const out = {}, malas = [];
    const mapa = { R: "k", D: "q", T: "r", A: "b", C: "n", P: "p", K: "k", Q: "q", B: "b", N: "n" };
    String(texto || "").split(/[\s,;]+/).filter(Boolean).forEach((tok) => {
      const m = /^([RDTACPKQBN]?)([a-h])([1-8])$/i.exec(tok.trim());
      if (!m) { malas.push(tok); return; }
      const letra = m[1] ? m[1].toUpperCase() : "P";
      const t = mapa[letra];
      if (!t) { malas.push(tok); return; }
      out[m[2].toLowerCase() + m[3]] = color + t;
    });
    return { piezas: out, malas };
  }
  function estrellasFoto(errores, total) {
    if (errores === 0) return 3;
    if (errores <= Math.max(1, Math.round(total / 10))) return 2;
    if (errores <= Math.max(2, Math.round(total / 4))) return 1;
    return 0;
  }

  /* =====================================================================
   * Con lo justo: el rey negro se defiende solo.
   *
   * No juega perfecto (para eso haría falta la tabla entera en el navegador):
   * juega como un rival con malas intenciones, mirando una jugada suya y la
   * respuesta blanca. Si puede comerse una pieza suelta, se la come (así el
   * alumno aprende a no regalarla); si no, busca quedarse con casillas, lejos
   * del borde —y, contra alfil y caballo, de las esquinas del color del
   * alfil—, y huye de los mates que se ven venir. Si el alumno lo ahoga, son
   * tablas.
   * El número de jugadas mínimo de cada posición sí es exacto: lo calculó
   * herramientas/lib/finales-dtm.js contra la MEJOR defensa.
   * ===================================================================== */
  function defensaRey(Chess, fen) {
    const g = new Chess(fen);
    const movs = g.moves({ verbose: true });
    if (!movs.length) return null;
    const tab = tablero(fen);
    let colorAlfil = null;
    tab.forEach((p, i) => { if (p && p.c === "w" && p.t === "b") colorAlfil = ((i & 7) + (i >> 3)) % 2; });
    const hayCaballo = tab.some((p) => p && p.c === "w" && p.t === "n");
    const esquinas = [0, 7, 56, 63].filter((e) => colorAlfil !== null && (((e & 7) + (e >> 3)) % 2) === colorAlfil);
    /* Qué tan bien está el rey negro, con negras al mover: el mate es lo peor,
       el ahogado lo mejor (son tablas); si no, cuantas más casillas tenga y más
       lejos esté del borde (y de las esquinas que matan), mejor. */
    function valor() {
      if (g.in_checkmate()) return -1000;
      if (g.in_stalemate() || g.insufficient_material()) return 1000;
      const t = tablero(g.fen());
      const k = t.findIndex((p) => p && p.t === "k" && p.c === "b");
      const f = k & 7, r = k >> 3;
      let v = 3 * g.moves().length + 10 * Math.min(f, 7 - f, r, 7 - r);
      if (hayCaballo && esquinas.length) v += 4 * Math.min.apply(null, esquinas.map((e) => Math.max(Math.abs((e & 7) - f), Math.abs((e >> 3) - r))));
      return v;
    }
    /* Mira una jugada y la mejor respuesta blanca (dos medias jugadas): así no
       se mete solo en una red de mate que se ve a simple vista. */
    let mejor = null, mejorV = -Infinity;
    movs.forEach((m) => {
      g.move(m);
      let v;
      if (m.captured) v = 5000;                        // una pieza suelta: se la come
      else {
        v = Infinity;
        g.moves().forEach((w) => { g.move(w); v = Math.min(v, valor()); g.undo(); });
      }
      g.undo();
      if (v > mejorV) { mejorV = v; mejor = m; }
    });
    return mejor;
  }
  function estrellasFinal(jugadas, minimo) {
    if (jugadas <= minimo + 3) return 3;
    if (jugadas <= minimo + 12) return 2;
    return 1;
  }

  const TiposReglas = {
    tablero, colocacion, sq, idx, sanEs, otro, NOMBRE, COLOR, materialPosible,
    retro, candidatasRetro, etiquetaRetro, claveRetro, explicacionRetro,
    amenazaAcertada, corregirDescarte,
    puntosBalanza, veredictoBalanza, numeroBalanza, recortar,
    compararFoto, leerPiezas, estrellasFoto,
    defensaRey, estrellasFinal,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = TiposReglas;
  else raiz.TiposReglas = TiposReglas;
})(typeof window !== "undefined" ? window : globalThis);


// ===== herramientas/lib/finales-dtm.js =====
/* Distancia exacta al mate (DTM) de los finales de «Con lo justo».
 *
 * Rey y una o dos piezas blancas contra el rey negro solo: dama, torre, dos
 * torres, dos alfiles, alfil y caballo. Resuelve la tabla ENTERA hacia atrás
 * (análisis retrógrado, como se arman las tablas de finales): parte de los
 * mates y retrocede jugada por jugada. Por eso el número que da es el mínimo
 * de verdad contra la mejor defensa, no «el mate que encontró el motor».
 * Stockfish no sirve para esto: a rey y torre le dio «mate en 20» a una
 * posición que se gana en menos, y el máximo teórico de ese final es 16.
 *
 * Captura: si el rey negro se come una pieza, el resultado sale de la tabla
 * del final que queda (rey y torre si se come una de las dos torres; tablas
 * si queda una pieza menor sola).
 *
 * Uso: const t = FinalesDTM.resolver("bn"); t.dtm(fen) → jugadas blancas
 * hasta el mate con blancas al mover (0 si no gana, null si la FEN no es de
 * ese final). Sin DOM: lo usan el generador y el verificador en Node.
 */
"use strict";

const ADY = [];      // casillas vecinas de cada casilla
const SALTO = [];    // saltos de caballo
for (let s = 0; s < 64; s++) {
  const f = s & 7, r = s >> 3;
  const a = [], c = [];
  for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) {
    if (!df && !dr) continue;
    const nf = f + df, nr = r + dr;
    if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) a.push(nr * 8 + nf);
  }
  [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]].forEach(([df, dr]) => {
    const nf = f + df, nr = r + dr;
    if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) c.push(nr * 8 + nf);
  });
  ADY.push(a); SALTO.push(c);
}
const DIR_T = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIR_A = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const DIRS = { r: DIR_T, b: DIR_A, q: DIR_T.concat(DIR_A) };
function adyacentes(a, b) { return Math.abs((a & 7) - (b & 7)) <= 1 && Math.abs((a >> 3) - (b >> 3)) <= 1; }

/* ¿La pieza de tipo t en s ataca la casilla x? `ocupada(q)` dice si hay algo
   en q (para las piezas de largo alcance). */
function ataca(t, s, x, ocupada) {
  if (s === x) return false;
  if (t === "n") return SALTO[s].indexOf(x) >= 0;
  if (t === "k") return adyacentes(s, x);
  const df = (x & 7) - (s & 7), dr = (x >> 3) - (s >> 3);
  const recta = df === 0 || dr === 0, diag = Math.abs(df) === Math.abs(dr);
  if (t === "r" && !recta) return false;
  if (t === "b" && !diag) return false;
  if (t === "q" && !recta && !diag) return false;
  const pf = Math.sign(df), pr = Math.sign(dr);
  let f = (s & 7) + pf, r = (s >> 3) + pr;
  while (f !== (x & 7) || r !== (x >> 3)) {
    if (ocupada(r * 8 + f)) return false;
    f += pf; r += pr;
  }
  return true;
}

/* Casillas desde donde la pieza t pudo haber llegado a s (para retroceder):
   las mismas a las que iría desde s, sin saltar nada ocupado. */
function origenes(t, s, ocupada) {
  if (t === "n") return SALTO[s].filter((x) => !ocupada(x));
  if (t === "k") return ADY[s].filter((x) => !ocupada(x));
  const out = [];
  DIRS[t].forEach(([df, dr]) => {
    let f = (s & 7) + df, r = (s >> 3) + dr;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const q = r * 8 + f;
      if (ocupada(q)) break;
      out.push(q);
      f += df; r += dr;
    }
  });
  return out;
}

const CACHE = {};
const NUNCA = 255;   // el negro tiene una salida que no pierde (tablas)

/* piezas: "q", "r", "rr", "bb" o "bn" (las blancas, además del rey). */
function resolver(piezas) {
  if (CACHE[piezas]) return CACHE[piezas];
  const tipos = piezas.split("");
  const n = tipos.length;                 // 1 o 2
  const TAM = n === 1 ? 64 * 64 * 64 : 64 * 64 * 64 * 64;
  const idx = (wk, bk, p) => n === 1 ? ((wk * 64 + bk) * 64 + p[0]) : (((wk * 64 + bk) * 64 + p[0]) * 64 + p[1]);
  // Resultado en medias jugadas: W[i] = plies hasta el mate con blancas al mover
  // (1, 3, 5…; 0 = no gana); B[i] con negras al mover (0 = mate ya, 2, 4…;
  // -1 = no pierde). cuenta[i] = jugadas negras que todavía no se sabe que pierden.
  const W = new Int16Array(TAM);
  const B = new Int16Array(TAM).fill(-1);
  const cuenta = new Uint8Array(TAM);
  const validaW = new Uint8Array(TAM);

  const sub = n === 2 ? tipos.map((_, k) => {
    const queda = tipos[1 - k];
    return (queda === "q" || queda === "r") ? resolver(queda) : null;   // pieza menor sola: tablas
  }) : null;

  function decode(i) {
    if (n === 1) return { p: [i & 63], bk: (i >> 6) & 63, wk: (i >> 12) & 63 };
    return { p: [(i >> 6) & 63, i & 63], bk: (i >> 12) & 63, wk: (i >> 18) & 63 };
  }
  function atacadaPorBlancas(x, wk, p, bkFuera) {
    const ocup = (q) => q === wk || q === p[0] || (n === 2 && q === p[1]);
    // el rey negro no tapa nada (se mueve), por eso no está en `ocup`
    if (adyacentes(wk, x)) return true;
    for (let k = 0; k < n; k++) {
      if (p[k] === x) continue;
      if (ataca(tipos[k], p[k], x, ocup)) return true;
    }
    return false;
  }

  const porCapa = [];  // porCapa[ply] = índices B que pierden en `ply`
  const pendientesSub = []; // [ply] -> índices B a descontar cuando la subtabla gana en ply

  // 1) Posiciones con negras al mover: legalidad, mates, ahogados y capturas.
  //    cuenta[i] = jugadas negras que todavía no se sabe que pierden; NUNCA si
  //    alguna captura lleva a tablas (esa posición no se pierde nunca).
  for (let i = 0; i < TAM; i++) {
    const { p, bk, wk } = decode(i);
    if (wk === bk || p[0] === wk || p[0] === bk) continue;
    if (n === 2 && (p[1] === wk || p[1] === bk || p[1] === p[0])) continue;
    if (adyacentes(wk, bk)) continue;
    const enJaque = atacadaPorBlancas(bk, wk, p);
    // con blancas al mover, el negro no puede estar en jaque
    if (!enJaque) validaW[i] = 1;
    let legales = 0, seguro = false;
    for (const x of ADY[bk]) {
      if (x === wk) continue;
      const k = p.indexOf(x);
      if (k >= 0) {
        // captura: la pieza tiene que estar sin defender
        const resto = p.filter((_, j) => j !== k);
        const def = adyacentes(wk, x) || (resto.length && ataca(tipos[1 - k], resto[0], x, (q) => q === wk));
        if (def) continue;
        const d = (sub && sub[k]) ? sub[k].W[(wk * 64 + x) * 64 + resto[0]] : 0;
        if (!d) { seguro = true; continue; }
        legales++;
        (pendientesSub[d] = pendientesSub[d] || []).push(i);
        continue;
      }
      if (atacadaPorBlancas(x, wk, p)) continue;
      legales++;
    }
    if (legales === 0 && !seguro) {
      if (enJaque) { B[i] = 0; (porCapa[0] = porCapa[0] || []).push(i); }
      // ahogado: queda en -1 (tablas)
      continue;
    }
    cuenta[i] = seguro ? NUNCA : legales;
  }

  // 2) Hacia atrás, capa por capa.
  const maxPly = 400;
  for (let ply = 0; ply < maxPly; ply++) {
    if (ply % 2 === 0) {
      // capa de negras que pierden en `ply`: sus predecesoras (juegan blancas) ganan en ply+1
      const capa = porCapa[ply] || [];
      if (!capa.length && !pendientesSub.slice(ply).some((x) => x && x.length)) break;
      const nuevas = [];
      for (const i of capa) {
        const { p, bk, wk } = decode(i);
        const ocup = (q) => q === wk || q === bk || q === p[0] || (n === 2 && q === p[1]);
        // mueve el rey blanco hacia atrás
        for (const s of ADY[wk]) {
          if (ocup(s) || adyacentes(s, bk)) continue;
          const j = idx(s, bk, p);
          if (validaW[j] && !W[j]) { W[j] = ply + 1; nuevas.push(j); }
        }
        for (let k = 0; k < n; k++) {
          for (const s of origenes(tipos[k], p[k], ocup)) {
            const q = p.slice(); q[k] = s;
            const j = idx(wk, bk, q);
            if (validaW[j] && !W[j]) { W[j] = ply + 1; nuevas.push(j); }
          }
        }
      }
      porCapa[ply + 1] = nuevas;
    } else {
      // capa de blancas que ganan en `ply`: a sus predecesoras (juegan negras) les
      // queda una jugada menos que no pierde
      const capa = (porCapa[ply] || []);
      const nuevas = [];
      const descontar = (j) => {
        if (cuenta[j] === NUNCA || cuenta[j] === 0) return;
        if (--cuenta[j] === 0) { B[j] = ply + 1; nuevas.push(j); }
      };
      for (const i of capa) {
        const { p, bk, wk } = decode(i);
        const ocup = (q) => q === wk || q === p[0] || (n === 2 && q === p[1]);
        for (const s of ADY[bk]) {
          if (ocup(s) || adyacentes(s, wk)) continue;
          descontar(idx(wk, s, p));
        }
      }
      // capturas que llevan a una subtabla que gana en `ply`
      (pendientesSub[ply] || []).forEach(descontar);
      porCapa[ply + 1] = (porCapa[ply + 1] || []).concat(nuevas);
    }
  }

  const LETRAS = { q: "Q", r: "R", b: "B", n: "N" };
  function desdeFen(fen) {
    const filas = fen.split(" ")[0].split("/");
    let wk = -1, bk = -1; const ps = [];
    for (let r = 0; r < 8; r++) {
      let f = 0;
      for (const ch of filas[r]) {
        if (/\d/.test(ch)) { f += +ch; continue; }
        const s = (7 - r) * 8 + f;
        if (ch === "K") wk = s; else if (ch === "k") bk = s; else ps.push([ch, s]);
        f++;
      }
    }
    const quiero = tipos.map((t) => LETRAS[t]).slice().sort().join("");
    if (ps.map((x) => x[0]).sort().join("") !== quiero || wk < 0 || bk < 0) return null;
    // ordenar las piezas como `tipos`
    const usadas = [];
    const p = tipos.map((t) => {
      const k = ps.findIndex((x, j) => x[0] === LETRAS[t] && usadas.indexOf(j) < 0);
      usadas.push(k);
      return ps[k][1];
    });
    return { wk, bk, p, turno: fen.split(" ")[1] };
  }
  const tabla = {
    W, B,
    /* Jugadas blancas hasta el mate (juegan blancas). 0 = no se gana. */
    dtm(fen) {
      const d = desdeFen(fen);
      if (!d) return null;
      if (d.turno === "w") { const v = W[idx(d.wk, d.bk, d.p)]; return v ? (v + 1) / 2 : 0; }
      const v = B[idx(d.wk, d.bk, d.p)];
      return v < 0 ? 0 : v / 2;
    },
  };
  CACHE[piezas] = tabla;
  return tabla;
}

const FinalesDTM = { resolver };
if (typeof module !== "undefined" && module.exports) module.exports = FinalesDTM;


// ===== los export para Deno =====
// js/tipos-reglas.js se cuelga de globalThis cuando no hay `module`.
export const TiposReglas = globalThis.TiposReglas;
export { FinalesDTM };
