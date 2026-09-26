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
