/* Revista N.º 21, parte D (sistemas de juego y desempates): comprueba todas
 * las cifras de d-cuerpo.html y d-fichas.json.
 *
 *   node herramientas/revistas-arbitraje/no21/calculos/desempates.js
 *
 * 1. Tablas Berger de 6 y 8 jugadores (las del Anexo 1 del C.05) y cuentas de
 *    rondas y partidas.
 * 2. El todos contra todos de 6 del artículo de desempates: puntos, encuentro
 *    directo (DE), Sonneborn-Berger (SB), Koya (KS) y victorias (WIN),
 *    calculados aquí a mano y comparados con js/pareo/desempates.js (que sigue
 *    el C.07:2026 y está comprobado con los ejemplos de la FIDE).
 * 3. El suizo de 8 jugadores a 5 rondas: cada ronda se empareja con el motor
 *    del Sistema Holandés de Pareo Integral (bbpPairings, FIDE_DUTCH_2026) y se
 *    exige que salga lo que dice la revista; después, Buchholz y Buchholz
 *    corte 1 con las rondas no jugadas del art. 16 del C.07, calculados aquí y
 *    comparados con js/pareo/desempates.js. También WIN, WON y REP.
 * 4. Las cuentas de los recuadros «Practica».
 *
 * Termina con código 1 si algo no coincide.                                  */
"use strict";
const path = require("path");
const RAIZ = path.join(__dirname, "..", "..", "..", "..");
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const D = require(path.join(RAIZ, "js/pareo/desempates.js"));
const M = require(path.join(RAIZ, "js/pareo/motor.js")).enNode();

let fallos = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) fallos++; };
const igual = (a, b) => Math.abs(a - b) < 1e-9;
const f = (x) => String(x).replace(".", ",");

(async () => {
  /* ---------- 1. Berger ---------- */
  console.log("=== 1. Tablas Berger ===");
  const txt = (n) => Array.from({ length: n - 1 }, (_, r) => T.berger(n, r + 1).map(([a, b]) => a + "-" + b).join(" "));
  const FIDE6 = ["1-6 2-5 3-4", "6-4 5-3 1-2", "2-6 3-1 4-5", "6-5 1-4 2-3", "3-6 4-2 5-1"];
  const FIDE8 = ["1-8 2-7 3-6 4-5", "8-5 6-4 7-3 1-2", "2-8 3-1 4-7 5-6", "8-6 7-5 1-4 2-3",
    "3-8 4-2 5-1 6-7", "8-7 1-6 2-5 3-4", "4-8 5-3 6-2 7-1"];
  ok(JSON.stringify(txt(6)) === JSON.stringify(FIDE6), "tabla de 5-6 jugadores = Anexo 1 del C.05: " + txt(6).join(" / "));
  ok(JSON.stringify(txt(8)) === JSON.stringify(FIDE8), "tabla de 7-8 jugadores = Anexo 1 del C.05");
  // Practica 1: 1 y 2 en la tabla de 8 -> ronda 2, 1 con blancas.
  ok(FIDE8[1].split(" ").includes("1-2"), "Practica 1.1: en la tabla de 8, 1-2 se juega en la ronda 2 (1 con blancas)");
  ok(FIDE8[0].split(" ")[0] === "1-8", "Practica 1.2: con 7 jugadores, en la ronda 1 descansa el 1 (su rival es el 8, fantasma)");
  ok(FIDE6[2].split(" ").includes("4-5"), "Practica 1.4: tabla de 6, ronda 3: 4 (blancas) contra 5");
  ok(10 * 9 / 2 === 45, "Practica 1.5: 10 jugadores, 9 rondas y 45 partidas");
  // Practica 1.3: en qué ronda se enfrentan 2 y 3 en la tabla de 6.
  ok(FIDE6[3].split(" ").includes("2-3"), "texto: tabla de 6, 2-3 en la ronda 4");

  /* ---------- 2. Todos contra todos de 6 ---------- */
  console.log("=== 2. Todos contra todos de 6 (desempates) ===");
  const rr = [ // [blancas o número menor, rival, puntos del primero]
    [1, 2, 0.5], [1, 3, 1], [1, 4, 0], [1, 5, 1], [1, 6, 0.5],
    [2, 3, 1], [2, 4, 0.5], [2, 5, 0.5], [2, 6, 0.5],
    [3, 4, 1], [3, 5, 1], [3, 6, 0.5],
    [4, 5, 0], [4, 6, 0.5],
    [5, 6, 1],
  ];
  const nomRR = ["Irene Salas", "Jorge Mena", "Karla Ulate", "Luis Porras", "Marta Jiménez", "Néstor Calvo"];
  const P = (i, j) => { for (const [a, b, p] of rr) { if (a === i && b === j) return p; if (a === j && b === i) return 1 - p; } return null; };
  const pts = {}; for (let i = 1; i <= 6; i++) { pts[i] = 0; for (let j = 1; j <= 6; j++) if (j !== i) pts[i] += P(i, j); }
  const sb = {}, ks = {}, win = {};
  const max = 5; // 5 partidas por jugador
  for (let i = 1; i <= 6; i++) {
    sb[i] = 0; ks[i] = 0; win[i] = 0;
    for (let j = 1; j <= 6; j++) if (j !== i) {
      sb[i] += P(i, j) * pts[j];
      if (pts[j] >= max / 2) ks[i] += P(i, j);
      if (P(i, j) === 1) win[i]++;
    }
  }
  // Encuentro directo dentro de cada grupo de empatados.
  const de = {};
  for (let i = 1; i <= 6; i++) { de[i] = 0; for (let j = 1; j <= 6; j++) if (j !== i && pts[j] === pts[i]) de[i] += P(i, j); }
  // Contra Pareo Integral: el calendario de la tabla Berger de 6 con estos resultados.
  const tRR = T.nuevo({ sistema: "todos", rondasTotales: 5, jugadores: nomRR.map((n, k) => ({ id: "r" + (k + 1), nombre: n, elo: 2000 - k })) });
  tRR.numeracion = nomRR.map((_, k) => "r" + (k + 1));
  for (let r = 1; r <= 5; r++) {
    const mesas = T.berger(6, r).map(([a, b]) => { const p = P(a, b); return { b: "r" + a, n: "r" + b, r: p === 1 ? "1-0" : p === 0 ? "0-1" : "=" }; });
    tRR.rondas.push({ mesas, ausencias: {} });
  }
  const ref = { DE: D.calcular(tRR, "DE"), SB: D.calcular(tRR, "SB"), KS: D.calcular(tRR, "KS"), WIN: D.calcular(tRR, "WIN") };
  let coincide = true;
  for (let i = 1; i <= 6; i++) {
    const id = "r" + i;
    if (T.puntos(tRR, id) !== pts[i] || !igual(ref.SB[id], sb[i]) || !igual(ref.KS[id], ks[i]) || ref.WIN[id] !== win[i] || !igual(ref.DE[id], de[i])) {
      coincide = false;
      console.log("    distinto en " + i, pts[i], sb[i], ks[i], win[i], de[i], ref.SB[id], ref.KS[id], ref.WIN[id], ref.DE[id]);
    }
  }
  ok(coincide, "puntos, DE, SB, KS y WIN calculados aquí = js/pareo/desempates.js (C.07:2026)");
  const ordenRR = [1, 2, 3, 4, 5, 6].sort((a, b) => pts[b] - pts[a] || de[b] - de[a] || sb[b] - sb[a] || win[b] - win[a]);
  for (let i = 1; i <= 6; i++) console.log(`    ${i} ${nomRR[i - 1].padEnd(15)} pts ${f(pts[i])}  DE ${f(de[i])}  SB ${f(sb[i])}  KS ${f(ks[i])}  WIN ${win[i]}  puesto ${ordenRR.indexOf(i) + 1}`);
  const esperadoRR = { pts: [3, 3, 2.5, 2, 2.5, 2], sb: [7.5, 7.25, 5.5, 5.5, 5.5, 5.25], de: [0.5, 0.5, 1, 0.5, 0, 0.5], ks: [2.5, 2, 1, 1.5, 0.5, 1.5], win: [2, 1, 2, 1, 2, 0], orden: [1, 2, 3, 5, 4, 6] };
  ok(esperadoRR.pts.every((v, k) => v === pts[k + 1]), "puntos de la revista: 3, 3, 2½, 2, 2½, 2");
  ok(esperadoRR.sb.every((v, k) => igual(v, sb[k + 1])), "SB de la revista: 7,5 · 7,25 · 5,5 · 5,5 · 5,5 · 5,25");
  ok(esperadoRR.de.every((v, k) => igual(v, de[k + 1])), "DE de la revista");
  ok(esperadoRR.ks.every((v, k) => igual(v, ks[k + 1])), "Koya de la revista (rivales con 2½ o más)");
  ok(esperadoRR.win.every((v, k) => v === win[k + 1]), "WIN de la revista");
  ok(JSON.stringify(ordenRR) === JSON.stringify(esperadoRR.orden), "clasificación con DE, SB, WIN: " + ordenRR.join(", "));
  // 4 y 6: empatados en puntos y en DE (tablas); SB los separa.
  ok(sb[4] > sb[6], "Luis (4) supera a Néstor (6) por SB: 5,5 contra 5,25");
  // Si el primer desempate fuera SB, Karla (3) y Marta (5) seguirían empatadas: las separa DE.
  ok(igual(sb[3], sb[5]) && de[3] > de[5], "Karla (3) y Marta (5) empatan también en SB (5,5); las separa el DE (Karla ganó)");
  // Practica 4.2: SB de Jorge (2) desglosado.
  ok(igual(0.5 * 3 + 1 * 2.5 + 0.5 * 2 + 0.5 * 2.5 + 0.5 * 2, 7.25), "SB de Jorge: 1,5 + 2,5 + 1 + 1,25 + 1 = 7,25");

  /* ---------- 3. El suizo de 8 a 5 rondas ---------- */
  console.log("=== 3. Suizo de 8 jugadores a 5 rondas (holandés 2026) ===");
  const jug = [["a", "Ana Mora", 2150], ["b", "Bruno Solís", 2100], ["c", "Carla Vega", 2050], ["d", "Diego Rojas", 2000],
    ["e", "Elena Castro", 1950], ["f", "Fabián Brenes", 1900], ["g", "Gabriela Quirós", 1850], ["h", "Hugo Arias", 1800]];
  const t = T.nuevo({ nombre: "Ejemplo", rondasTotales: 5, colorInicial: "w" });
  for (const [id, n, e] of jug) t.jugadores.push({ id, nombre: n, elo: e, titulo: "", fed: "CRC", sexo: "m", retiradoDespuesDe: null });
  T.fijarNumeracion(t);
  const num = T.numeros(t);
  const plan = [
    { pareo: "1-5 6-2 3-7 8-4", res: { "1-5": "1-0", "6-2": "=", "3-7": "1-0", "8-4": "0-1" }, aus: {} },
    { pareo: "4-1 2-3 5-6 7-8", res: { "4-1": "=", "2-3": "1-0", "5-6": "=", "7-8": "1-0" }, aus: {} },
    { pareo: "1-2 3-4 6-7 8-5", res: { "1-2": "=", "3-4": "1-0", "6-7": "+-", "8-5": "0-1" }, aus: {} },
    { pareo: "6-3 2-4 8-1 5-7", res: { "6-3": "=", "2-4": "1-0", "8-1": "0-1", "5-7": "0-1" }, aus: {} },
    { pareo: "1-6 7-2 3-5 4-bye", res: { "1-6": "1-0", "7-2": "=", "3-5": "1-0" }, aus: { h: "Z" } }, // Hugo se retira
  ];
  for (let r = 0; r < plan.length; r++) {
    const mesas = T.leerPareo(t, await M.emparejar(T.aTrf(t, { hasta: r, proxima: { ausencias: plan[r].aus } })));
    const s = mesas.map((m) => (m.n ? num.get(m.b) + "-" + num.get(m.n) : num.get(m.b) + "-bye")).join(" ");
    ok(s === plan[r].pareo, `ronda ${r + 1}: el motor empareja ${s}`);
    for (const m of mesas) if (m.n) m.r = plan[r].res[num.get(m.b) + "-" + num.get(m.n)];
    t.rondas.push({ mesas, ausencias: plan[r].aus });
  }
  // Practica 2.3: ronda 1 de 9 jugadores.
  {
    const t9 = T.nuevo({ rondasTotales: 5, colorInicial: "w" });
    for (let k = 1; k <= 9; k++) t9.jugadores.push({ id: "n" + k, nombre: "J" + k, elo: 2100 - 10 * k, titulo: "", fed: "CRC", sexo: "m", retiradoDespuesDe: null });
    T.fijarNumeracion(t9);
    const n9 = T.numeros(t9);
    const m9 = T.leerPareo(t9, await M.emparejar(T.aTrf(t9, { hasta: 0, proxima: { ausencias: {} } })));
    const s9 = m9.map((m) => (m.n ? n9.get(m.b) + "-" + n9.get(m.n) : n9.get(m.b) + "-bye")).join(" ");
    ok(s9 === "1-5 6-2 3-7 8-4 9-bye", "Practica 2.3: ronda 1 con 9 jugadores: " + s9);
    // Pregunta de la ficha: 11 jugadoras, la n.º 1 con negras.
    const t11 = T.nuevo({ rondasTotales: 5, colorInicial: "b" });
    for (let k = 1; k <= 11; k++) t11.jugadores.push({ id: "m" + k, nombre: "J" + k, elo: 2100 - 10 * k, titulo: "", fed: "CRC", sexo: "f", retiradoDespuesDe: null });
    T.fijarNumeracion(t11);
    const n11 = T.numeros(t11);
    const m11 = T.leerPareo(t11, await M.emparejar(T.aTrf(t11, { hasta: 0, proxima: { ausencias: {} } })));
    const s11 = m11.map((m) => (m.n ? n11.get(m.b) + "-" + n11.get(m.n) : n11.get(m.b) + "-bye")).join(" ");
    ok(s11 === "6-1 2-7 8-3 4-9 10-5 11-bye", "ficha: 11 jugadoras, la 1 con negras: " + s11);
  }

  // Registro por ronda, hecho aquí desde los resultados (sin desempates.js).
  const N = 5;
  const reg = {}; // reg[id][r] = {tipo, rival, pts, vur}
  for (const [id] of jug) reg[id] = [];
  t.rondas.forEach((ro, r) => {
    for (const m of ro.mesas) {
      if (!m.n) { reg[m.b][r] = { tipo: "PAB", pts: 1, vur: false }; continue; }
      const pb = { "1-0": 1, "0-1": 0, "=": 0.5, "+-": 1, "-+": 0 }[m.r];
      if (m.r === "+-" || m.r === "-+") {
        reg[m.b][r] = { tipo: pb ? "gana-inc" : "pierde-inc", rival: m.n, pts: pb, vur: !pb };
        reg[m.n][r] = { tipo: pb ? "pierde-inc" : "gana-inc", rival: m.b, pts: 1 - pb, vur: !!pb };
      } else {
        reg[m.b][r] = { tipo: "jugada", rival: m.n, pts: pb, color: "b" };
        reg[m.n][r] = { tipo: "jugada", rival: m.b, pts: 1 - pb, color: "n" };
      }
    }
    for (const [id] of jug) if (!reg[id][r]) reg[id][r] = { tipo: "bye-0", pts: 0, vur: true }; // retiro: bye de cero
  });
  const total = (id) => reg[id].reduce((s, x) => s + x.pts, 0);
  // Categoría del art. 16.2 de una ronda no jugada.
  const cat = (id, r) => {
    const x = reg[id][r];
    if (x.tipo === "PAB") return 1;
    if (x.tipo === "gana-inc") return 2;
    if (x.tipo === "pierde-inc") return 4;
    // bye pedido: 3 si le sigue al menos una ronda que no es VUR; si no, 5.
    return reg[id].slice(r + 1).some((y) => !y.vur) ? 3 : 5;
  };
  // Art. 16.3: puntuación ajustada (para el desempate de los rivales).
  const ajustada = (id) => reg[id].reduce((s, x, r) => s + (x.tipo === "jugada" ? x.pts : cat(id, r) === 5 ? 0.5 : x.pts), 0);
  // Art. 16.4: aporte de cada ronda al Buchholz propio.
  const aportes = (id) => reg[id].map((x, r) => {
    if (x.tipo === "jugada") return { v: ajustada(x.rival), vur: false, r };
    const c = cat(id, r);
    const tope = c === 2 || c === 4 ? ajustada(x.rival) : 0.5 * N;
    return { v: Math.min(total(id), tope), vur: !!x.vur, r };
  });
  const bh = (id) => aportes(id).reduce((s, a) => s + a.v, 0);
  // Art. 14.1 con la excepción del art. 16.5: si hay VUR, se corta el menor aporte de una VUR.
  const bhc1 = (id) => {
    const a = aportes(id);
    const vurs = a.filter((x) => x.vur);
    const menor = Math.min(...a.map((x) => x.v));
    const corte = vurs.length && Math.min(...vurs.map((x) => x.v)) >= menor ? Math.min(...vurs.map((x) => x.v)) : menor;
    return bh(id) - corte;
  };
  const winP = (id) => reg[id].filter((x) => x.pts === 1).length;
  const wonP = (id) => reg[id].filter((x) => x.tipo === "jugada" && x.pts === 1).length;
  const repP = (id) => N - reg[id].filter((x) => x.tipo === "pierde-inc" || x.tipo === "bye-0" || x.tipo === "bye-½").length;

  const RBH = D.calcular(t, "BH"), RC1 = D.calcular(t, "BH-C1"), RWIN = D.calcular(t, "WIN"), RWON = D.calcular(t, "WON"), RREP = D.calcular(t, "REP");
  let coincide2 = true;
  for (const [id, n] of jug) {
    const v = [T.puntos(t, id), total(id), bh(id), RBH[id], bhc1(id), RC1[id], winP(id), RWIN[id], wonP(id), RWON[id], repP(id), RREP[id]];
    if (v[0] !== v[1] || !igual(v[2], v[3]) || !igual(v[4], v[5]) || v[6] !== v[7] || v[8] !== v[9] || v[10] !== v[11]) { coincide2 = false; console.log("    distinto", n, v); }
    console.log(`    ${num.get(id)} ${n.padEnd(16)} pts ${f(total(id))}  ajust. ${f(ajustada(id))}  BH ${f(bh(id))}  BH-C1 ${f(bhc1(id))}  WIN ${winP(id)} WON ${wonP(id)} REP ${repP(id)}  aportes [${aportes(id).map((a) => f(a.v) + (a.vur ? "*" : "")).join(" ")}]`);
  }
  ok(coincide2, "BH, BH-C1, WIN, WON y REP calculados aquí = js/pareo/desempates.js (C.07:2026)");
  const esperado = { // lo que dice la revista
    a: [4, 10.5, 10], b: [3.5, 15, 12.5], c: [3.5, 12.5, 11], d: [2.5, 14, 13.5],
    e: [1.5, 13, 12.5], f: [2.5, 15, 13.5], g: [2.5, 11.5, 9], h: [0, 10.5, 10.5],
  };
  ok(Object.entries(esperado).every(([id, [p, b, c]]) => total(id) === p && igual(bh(id), b) && igual(bhc1(id), c)), "puntos, BH y BH-C1 de la tabla de la revista");
  ok(igual(ajustada("h"), 0.5) && total("h") === 0, "Hugo: 0 puntos, pero 0,5 para el Buchholz de sus rivales (bye de cero al final = tablas, art. 16.3)");
  ok(igual(ajustada("g"), 2.5) && igual(ajustada("f"), 2.5), "Gabriela y Fabián: puntuación ajustada = real (las incomparecencias cuentan como se dieron)");
  const ap = (id) => aportes(id).map((a) => a.v);
  ok(JSON.stringify(ap("d")) === JSON.stringify([0.5, 4, 3.5, 3.5, 2.5]), "Diego: 0,5 + 4 + 3,5 + 3,5 + 2,5 (bye del pareo: mín(2½; ½ × 5)) = 14");
  ok(JSON.stringify(ap("f")) === JSON.stringify([3.5, 1.5, 2.5, 3.5, 4]), "Fabián: 3,5 + 1,5 + 2,5 (gana por inc.: mín(2½; 2½)) + 3,5 + 4 = 15");
  ok(JSON.stringify(ap("g")) === JSON.stringify([3.5, 0.5, 2.5, 1.5, 3.5]), "Gabriela: 3,5 + 0,5 + 2,5 (pierde por inc., VUR) + 1,5 + 3,5 = 11,5; corte 1 quita el 2,5 de la VUR = 9");
  ok(igual(bh("g") - 0.5, 11), "sin la excepción del art. 16.5, Gabriela tendría BH-C1 = 11");
  // Clasificación con BH-C1, BH.
  const orden = jug.map(([id]) => id).sort((x, y) => total(y) - total(x) || bhc1(y) - bhc1(x) || bh(y) - bh(x));
  ok(orden.join("") === "abcfdgeh", "clasificación final (puntos, BH-C1, BH): " + orden.map((id) => num.get(id)).join(", "));
  ok(winP("f") === 1 && wonP("f") === 0, "Practica 5.6: Fabián WIN 1 (la victoria por incomparecencia cuenta), WON 0");
  ok(repP("g") === 4 && repP("d") === 5, "Practica 5.5: REP de Gabriela 4, de Diego 5");
  ok(winP("g") === 2 && wonP("g") === 2, "Gabriela: WIN 2 y WON 2");
  // Encuentro directo entre Bruno (2) y Carla (3): Bruno ganó en la ronda 2.
  ok(reg.b[1].rival === "c" && reg.b[1].pts === 1, "Bruno le ganó a Carla en la ronda 2 (DE lo pondría delante también)");
  // Fabián y Gabriela: incomparecencia -> no cuenta para DE en suizo (art. 6.1.1).
  ok(igual(D.calcular(t, "DE").f, 0) && igual(D.calcular(t, "DE").g, 0), "DE entre Fabián, Diego y Gabriela: 0 (la incomparecencia se excluye; Diego no jugó con ninguno)");

  /* ---------- 4. Cuentas de la práctica ---------- */
  console.log("=== 4. Cuentas de la práctica ===");
  const r7 = [4, 5.5, 6, 3, 5, 4.5, 7];
  const s7 = r7.reduce((a, b) => a + b, 0);
  ok(s7 === 35 && s7 - 3 === 32 && s7 - 3 - 7 === 25 && s7 - 3 - 4 === 28, "Practica 4.1: BH 35, BH-C1 32, BH-M1 25, BH-C2 28");
  const r9 = [5.5, 6.5, 9.5, 7, 8, 10, 8.5, 10, 8];
  ok(r9.reduce((a, b) => a + b, 0) - 5.5 === 67.5, "Ejercicio del seminario: BH-C1 = 73 − 5,5 = 67,5");
  const aro = [1850, 1923, 2010, 1764];
  const media = aro.reduce((a, b) => a + b, 0) / aro.length;
  ok(media === 1886.75 && Math.round(media) === 1887, "Practica 4.6: ARO = 7547 / 4 = 1886,75 → 1887");
  ok(Math.min(6.5, 0.5 * 9) === 4.5 && Math.min(5, 6) === 5 && Math.min(6.5, 4) === 4, "Practica 5.3 y 5.4: topes del rival ficticio");
  // Orden inicial (C.04.2, art. 2.2): rating, título, nombre.
  const ordenar = (lista) => { const tt = T.nuevo({ jugadores: lista.map(([n, e, ti]) => ({ id: n, nombre: n, elo: e, titulo: ti })) }); return T.fijarNumeracion(tt).join(", "); };
  ok(ordenar([["Rosa", 2105, ""], ["Pablo", 2105, "FM"], ["Elsa", 2105, "WFM"], ["Tomás", 2140, ""]]) === "Tomás, Pablo, Elsa, Rosa", "texto: Tomás, Pablo (FM), Elsa (WFM), Rosa");
  ok(ordenar([["Ulises", 1980, "CM"], ["Vera", 1980, "WIM"], ["Walter", 1995, ""], ["Ximena", 1980, "WIM"]]) === "Walter, Vera, Ximena, Ulises", "Practica 2.1: Walter, Vera, Ximena, Ulises");
  // Preferencias de color de la práctica del suizo.
  const dif = (h) => [...h].filter((c) => c === "B").length - [...h].filter((c) => c === "N").length;
  ok(dif("BNN") === -1 && dif("BNB") === 1 && dif("BNBN") === 0 && dif("BB") === 2, "diferencias de color: BNN −1, BNB +1, BNBN 0, BB +2");

  console.log(fallos ? `\n${fallos} comprobaciones fallaron` : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
