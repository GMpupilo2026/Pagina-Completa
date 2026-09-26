/* Rey y peón contra rey: quién gana en cada posición.
 *
 * Tabla entera, por iteración hacia adelante: una posición con blancas al
 * mover gana si ALGUNA jugada lleva a una posición ganada; con negras al mover,
 * si TODAS las jugadas llevan a una ganada. Se repite hasta que nada cambia.
 *
 * La coronación se resuelve en el acto: con dama o torre (lo que sirva), el
 * final está ganado salvo que el rey negro se coma la pieza nueva o quede
 * ahogado. Si el rey negro se come el peón, tablas.
 *
 * El peón es siempre blanco. Índice: turno (0 blancas, 1 negras) · rey blanco
 * · rey negro · peón, 64 cada uno (js/tipos-reglas-mas.js, kpkIndice). Sale
 * como bits (1 = ganan las blancas) para entreno/data/kpk.json.
 */
"use strict";
const ADY = [];
for (let s = 0; s < 64; s++) {
  const a = [];
  for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) {
    if (!df && !dr) continue;
    const f = (s & 7) + df, r = (s >> 3) + dr;
    if (f >= 0 && f < 8 && r >= 0 && r < 8) a.push(r * 8 + f);
  }
  ADY.push(a);
}
const ady = (a, b) => Math.abs((a & 7) - (b & 7)) <= 1 && Math.abs((a >> 3) - (b >> 3)) <= 1;
const peonAtaca = (p, x) => (x >> 3) === (p >> 3) + 1 && Math.abs((x & 7) - (p & 7)) === 1;

/* Tras coronar en q (negras al mover): ¿gana? Con dama o con torre. */
function coronaGana(wk, bk, q) {
  for (const tipo of ["q", "r"]) {
    const ocup = (s) => s === wk || s === q;
    const ataca = (x) => {
      if (ady(wk, x)) return true;
      const df = (x & 7) - (q & 7), dr = (x >> 3) - (q >> 3);
      const recta = df === 0 || dr === 0, diag = Math.abs(df) === Math.abs(dr);
      if (x === q) return false;
      if (tipo === "r" ? !recta : !(recta || diag)) return false;
      const pf = Math.sign(df), pr = Math.sign(dr);
      let f = (q & 7) + pf, r = (q >> 3) + pr;
      while (f !== (x & 7) || r !== (x >> 3)) { if (ocup(r * 8 + f)) return false; f += pf; r += pr; }
      return true;
    };
    // el rey negro se come la pieza sin defensa
    if (ady(bk, q) && !ady(wk, q)) continue;
    const salidas = ADY[bk].filter((x) => x !== wk && !ady(x, wk) && (x === q ? !ady(wk, q) : !ataca(x)));
    if (!salidas.length && !ataca(bk)) continue;   // ahogado
    return true;
  }
  return false;
}

function resolver() {
  const N = 64 * 64 * 64;
  const W = new Uint8Array(N), B = new Uint8Array(N);   // 1 = ganan las blancas
  const validaW = new Uint8Array(N), validaB = new Uint8Array(N);
  const id = (wk, bk, p) => (wk * 64 + bk) * 64 + p;
  for (let wk = 0; wk < 64; wk++) for (let bk = 0; bk < 64; bk++) for (let p = 8; p < 56; p++) {
    if (wk === bk || wk === p || bk === p || ady(wk, bk)) continue;
    const i = id(wk, bk, p);
    // blancas al mover: el rey negro no puede estar en jaque (del peón)
    if (!peonAtaca(p, bk)) validaW[i] = 1;
    validaB[i] = 1;
  }
  let cambios = 1, vueltas = 0;
  while (cambios) {
    cambios = 0; vueltas++;
    for (let wk = 0; wk < 64; wk++) for (let bk = 0; bk < 64; bk++) for (let p = 8; p < 56; p++) {
      const i = id(wk, bk, p);
      // ---- blancas al mover
      if (validaW[i] && !W[i]) {
        let gana = false;
        for (const x of ADY[wk]) {
          if (x === p || ady(x, bk)) continue;
          if (B[id(x, bk, p)] && validaB[id(x, bk, p)]) { gana = true; break; }
        }
        if (!gana) {
          const uno = p + 8;
          if (uno !== wk && uno !== bk) {
            if (uno >= 56) gana = coronaGana(wk, bk, uno);
            else if (B[id(wk, bk, uno)]) gana = true;
            if (!gana && (p >> 3) === 1) {
              const dos = p + 16;
              if (dos !== wk && dos !== bk && B[id(wk, bk, dos)]) gana = true;
            }
          }
        }
        if (gana) { W[i] = 1; cambios++; }
      }
      // ---- negras al mover
      if (validaB[i] && !B[i]) {
        let hay = false, todas = true;
        const enJaque = peonAtaca(p, bk);
        for (const x of ADY[bk]) {
          if (x === wk || ady(x, wk) || peonAtaca(p, x)) continue;
          hay = true;
          if (x === p) { todas = false; break; }            // se come el peón: tablas
          const j = id(wk, x, p);
          if (!(validaW[j] && W[j])) { todas = false; break; }
        }
        if (hay ? todas : enJaque) { B[i] = 1; cambios++; }
      }
    }
  }
  return { W, B, validaW, validaB, vueltas, id };
}

/* Los bits que viajan a la página: índice kpkIndice (turno · rey · rey · peón). */
function bits(t) {
  const N = 64 * 64 * 64;
  const out = new Uint8Array((2 * N) >> 3);
  for (let i = 0; i < N; i++) {
    if (t.validaW[i] && t.W[i]) out[i >> 3] |= 1 << (i & 7);
    const k = N + i;
    if (t.validaB[i] && t.B[i]) out[k >> 3] |= 1 << (k & 7);
  }
  return out;
}

module.exports = { resolver, bits, coronaGana };
