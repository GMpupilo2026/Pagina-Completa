// Revista N.º 21 · Parte E — comprobación de todos los cálculos de rating y normas.
// Tablas copiadas del FIDE Handbook: B.02 (aplicado desde el 1-mar-2024) arts. 8.1.1 y 8.1.2,
// idéntica a la tabla 1.4.9 del B.01 (aplicado desde el 1-ene-2024).
// Uso: node herramientas/revistas-arbitraje/no21/calculos/rating.js
const dpRaw = "1.0 800 .83 273 .66 117 .49 -7 .32 -133 .15 -296 .99 677 .82 262 .65 110 .48 -14 .31 -141 .14 -309 .98 589 .81 251 .64 102 .47 -21 .30 -149 .13 -322 .97 538 .80 240 .63 95 .46 -29 .29 -158 .12 -336 .96 501 .79 230 .62 87 .45 -36 .28 -166 .11 -351 .95 470 .78 220 .61 80 .44 -43 .27 -175 .10 -366 .94 444 .77 211 .60 72 .43 -50 .26 -184 .09 -383 .93 422 .76 202 .59 65 .42 -57 .25 -193 .08 -401 .92 401 .75 193 .58 57 .41 -65 .24 -202 .07 -422 .91 383 .74 184 .57 50 .40 -72 .23 -211 .06 -444 .90 366 .73 175 .56 43 .39 -80 .22 -220 .05 -470 .89 351 .72 166 .55 36 .38 -87 .21 -230 .04 -501 .88 336 .71 158 .54 29 .37 -95 .20 -240 .03 -538 .87 322 .70 149 .53 21 .36 -102 .19 -251 .02 -589 .86 309 .69 141 .52 14 .35 -110 .18 -262 .01 -677 .85 296 .68 133 .51 7 .34 -117 .17 -273 .00 -800 .84 284 .67 125 .50 0 .33 -125 .16 -284".split(" ");
const DP = {};
for (let i = 0; i < dpRaw.length; i += 2) DP[Math.round(parseFloat(dpRaw[i]) * 100)] = +dpRaw[i + 1];
const pdRaw = "0-3 .50 4-10 .51 11-17 .52 18-25 .53 26-32 .54 33-39 .55 40-46 .56 47-53 .57 54-61 .58 62-68 .59 69-76 .60 77-83 .61 84-91 .62 92-98 .63 99-106 .64 107-113 .65 114-121 .66 122-129 .67 130-137 .68 138-145 .69 146-153 .70 154-162 .71 163-170 .72 171-179 .73 180-188 .74 189-197 .75 198-206 .76 207-215 .77 216-225 .78 226-235 .79 236-245 .80 246-256 .81 257-267 .82 268-278 .83 279-290 .84 291-302 .85 303-315 .86 316-328 .87 329-344 .88 345-357 .89 358-374 .90 375-391 .91 392-411 .92 412-432 .93 433-456 .94 457-484 .95 485-517 .96 518-559 .97 560-619 .98 620-735 .99".split(" ");
const PDT = [];
for (let i = 0; i < pdRaw.length; i += 2) { const [a, b] = pdRaw[i].split("-").map(Number); PDT.push([a, b, Math.round(parseFloat(pdRaw[i + 1]) * 100)]); }
// PD (en centésimas) del jugador, con D = rating propio − rating del rival
function PD(D) {
  const a = Math.abs(D); let h = 100;
  for (const [x, y, v] of PDT) if (a >= x && a <= y) h = v;
  return D >= 0 ? h : 100 - h;
}
const dp = p => DP[Math.round(p * 100 + 1e-9)];                    // p redondeado a centésimas
const redondeoFIDE = x => Math.sign(x) * Math.round(Math.abs(x));  // 8.3.4: 0,5 se aleja de cero
const f2 = x => x.toFixed(2);
let fallos = 0;
function ok(desc, real, esperado) {
  const b = real === esperado; if (!b) fallos++;
  console.log((b ? "OK    " : "FALLA ") + desc + " = " + real + (b ? "" : " (esperado " + esperado + ")"));
}

// ---------- 1. Cambio de rating (B.02 art. 8.3) ----------
function cambio(R, K, partidas) {
  let sumaC = 0; const filas = [];
  for (const [rival, res] of partidas) {
    const D = R - rival;
    const Du = (R < 2650 && Math.abs(D) > 400) ? Math.sign(D) * 400 : D; // 8.3.1 (desde 1-oct-2025)
    const pd = PD(Du); const dr = Math.round(res * 100) - pd; sumaC += dr;
    filas.push({ rival, D, Du, PD: f2(pd / 100), res, dR: (dr >= 0 ? "+" : "") + f2(dr / 100) });
  }
  const n = partidas.length; let Kn = K;
  if (K * n > 700) Kn = Math.floor(700 / n);                           // 8.3.3: K × n ≤ 700
  const crudo = sumaC * Kn / 100;
  return { filas, suma: sumaC / 100, K: Kn, crudo, cambio: redondeoFIDE(crudo) };
}
console.log("\n== Ejemplo: Andrés (1975), 7 partidas ==");
const andres = [[2110, 0.5], [1890, 1], [2240, 0], [1560, 1], [1985, 0.5], [2050, 1], [1930, 0]];
const ea = cambio(1975, 20, andres);
console.table(ea.filas);
console.log("crudo K20:", ea.crudo);
const ej = cambio(1975, 40, andres);
console.log("crudo K40:", ej.crudo);
ok("suma de ΔR", ea.suma, 0.51);
ok("cambio con K = 20", ea.cambio, 10);
ok("cambio con K = 40", ej.cambio, 20);

console.log("\n== Práctica de rating ==");
const match = []; for (let i = 0; i < 10; i++) match.push([2428, i < 6 ? 1 : 0]);
ok("match 2377 vs 2428, 6 de 10, K20 → nuevo rating", 2377 + cambio(2377, 20, match).cambio, 2411);
ok("2000 (K20) le gana a 2300", cambio(2000, 20, [[2300, 1]]).cambio, 17);
ok("2300 (K20) pierde con 2000", cambio(2300, 20, [[2000, 0]]).cambio, -17);
const dieciocho = []; for (let i = 0; i < 18; i++) dieciocho.push([1600, 0.5]);
ok("K40 con 18 partidas → K", cambio(1600, 40, dieciocho).K, 38);
ok("PD de 2600 contra 2150 (cuenta 400)", PD(400), 92);
ok("PD de 2680 contra 2200 (cuenta 480)", PD(480), 95);
ok("1840 (K20) tablas con 1906: ΔR", cambio(1840, 20, [[1906, 0.5]]).suma, 0.09);
ok("1840 (K20) tablas con 1906: cambio", cambio(1840, 20, [[1906, 0.5]]).cambio, 2);
ok("1760 (K20) pierde con 1600: cambio", cambio(1760, 20, [[1600, 0]]).cambio, -14);

// ---------- 2. Rating inicial (B.02 arts. 7.1.4 y 8.2) ----------
function inicial(partidas) {
  const n = partidas.length; const suma = partidas.reduce((a, x) => a + x[0], 0);
  const pts = partidas.reduce((a, x) => a + x[1], 0);
  const Ra = (suma + 2 * 1800) / (n + 2); const p = (pts + 1) / (n + 2);
  const Ru = Math.min(2200, Math.round(Ra + dp(p)));
  return { n, suma, pts, Ra: +Ra.toFixed(2), p: +p.toFixed(4), dp: dp(p), Ru };
}
console.log("\n== Ejemplo: Lucía, dos torneos ==");
const lucia = [[1620, 1], [1755, 0], [1540, 0.5], [1810, 0.5], [1490, 1], [1685, 1], [1920, 0]];
const el = inicial(lucia); console.log(el);
ok("suma de los rivales", el.suma, 11820);
ok("Ra", el.Ra, 1713.33);
ok("p", el.p, 0.5556);
ok("dp", el.dp, 43);
ok("Ru", el.Ru, 1756);
console.log("\n== Práctica de rating inicial ==");
const p2 = inicial([[2100, 1], [2150, 1], [2200, 1], [2050, 1], [2250, 0.5]]); console.log("tope:", p2);
ok("4½ de 5 contra 2150 de promedio → tope", p2.Ru, 2200);
const p3 = inicial([[1450, 0], [1500, 0.5], [1420, 0], [1600, 0], [1480, 0.5]]); console.log("bajo el piso:", p3);
ok("1 de 5 contra 1490 de promedio → Ru", p3.Ru, 1421);
const p5 = inicial([[1450, 0], [1500, 0], [1550, 0], [1400, 0.5], [1600, 0]]); console.log("½ de 5:", p5);
ok("½ de 5 contra 1500 de promedio → Ru menor que 1400", p5.Ru < 1400, true);
const p4 = inicial([[1700, 0.5], [1800, 0.5], [1900, 0.5], [1600, 0.5], [2000, 0.5]]);
ok("cinco tablas, promedio 1800 → Ru", p4.Ru, 1800);
// 3 de 7 (más una incomparecencia, que no cuenta: art. 5.1)
const p6 = inicial([[1726, 1], [1415, 1], [1424, 1], [1625, 0], [1502, 0], [1628, 0], [1740, 0]]); console.log("3 de 7:", p6);
ok("3 de 7 → suma", p6.suma, 11060);
ok("3 de 7 → Ru", p6.Ru, 1586);

// ---------- 3. Norma de MI (B.01 art. 1.4) ----------
console.log("\n== Ejemplo: norma de MI ==");
const rivales = [ // [título, federación, rating]
  ["GM", "COL", 2512], ["IM", "MEX", 2405], ["FM", "CRC", 2290], ["IM", "PER", 2380], ["", "CRC", 2015],
  ["IM", "CRC", 2330], ["FM", "GUA", 2260], ["WGM", "CUB", 2290], ["", "CRC", 2155]];
const propia = "CRC";
const ratings = rivales.map(r => r[2]); const minimo = Math.min(...ratings);
const ajust = ratings.map(r => (r === minimo && r < 2050) ? 2050 : r);
const sumaN = ajust.reduce((a, b) => a + b, 0); const ARO = Math.round(sumaN / 9 + 1e-9);
const TH = rivales.filter(r => r[0] && r[0] !== "CM" && r[0] !== "WCM").length;
const MO = rivales.filter(r => r[0] === "GM" || r[0] === "IM").length;
const deLaPropia = rivales.filter(r => r[1] === propia).length;
const otras = new Set(rivales.filter(r => r[1] !== propia).map(r => r[1])).size;
const porFed = {}; rivales.forEach(r => { porFed[r[1]] = (porFed[r[1]] || 0) + 1; });
console.log({ sumaN, promedio: (sumaN / 9).toFixed(3), ARO, TH, MO, deLaPropia, otras, porFed });
ok("suma con el piso", sumaN, 20672);
ok("ARO", ARO, 2297);
ok("titulados (sin CM ni WCM)", TH, 7);
ok("GM + IM", MO, 4);
ok("rivales de la propia federación", deLaPropia, 4);
ok("otras federaciones", otras, 5);
for (const pts of [5.5, 6, 6.5]) { const p = Math.round(pts / 9 * 100) / 100; console.log(pts, "p", p, "dp", dp(p), "Rp", ARO + dp(p)); }
ok("Rp con 6", ARO + dp(Math.round(6 / 9 * 100) / 100), 2422);
ok("Rp con 6½", ARO + dp(Math.round(6.5 / 9 * 100) / 100), 2463);
ok("anexo 9 rondas, MI, 6½ pide ARO 2284-2324", ARO >= 2284 && ARO <= 2324, true);
ok("anexo 9 rondas, MI, 6 pide ARO 2325-2369 (no alcanza)", ARO >= 2325, false);

console.log("\n== Práctica de normas ==");
{
  const sumaMin = Math.ceil((2520 - 0.5) * 9);
  ok("GM 5½/9: suma mínima de los 9 rivales", sumaMin, 22676);
  ok("GM 5½/9: rating mínimo del 9.º rival (ocho promedian 2523)", sumaMin - 8 * 2523, 2492);
}
ok("6/9 con ARO 2510 → Rp", 2510 + dp(Math.round(6 / 9 * 100) / 100), 2635);
ok("GM 5/9 con ARO 2560 → Rp", 2560 + dp(Math.round(5 / 9 * 100) / 100), 2603);
{
  const r = [2600, 2550, 2480, 2510, 2450, 2420, 2390, 2150, 2180]; const m = Math.min(...r);
  const a = r.map(x => (x === m && x < 2200) ? 2200 : x); const s = a.reduce((x, y) => x + y, 0);
  console.log("piso de GM: suma", s, "promedio", (s / 9).toFixed(3));
  ok("piso de GM con dos rivales bajo 2200 → ARO", Math.round(s / 9 + 1e-9), 2420);
}

// ---------- 4. Certificados de norma de árbitro (B.06.1 2026, art. 2.7.1) ----------
console.log("\n== Certificados de norma de árbitro por evento (no todos contra todos) ==");
const cert = n => Math.ceil(n / 25);
for (const n of [20, 25, 26, 50, 51, 60, 100, 137]) console.log(n, "jugadores →", cert(n));
ok("60 jugadores", cert(60), 3);
ok("50 jugadores", cert(50), 2);
ok("51 jugadores", cert(51), 3);
ok("137 jugadores", cert(137), 6);

console.log(fallos ? "\n" + fallos + " FALLOS" : "\nTodo comprobado.");
process.exitCode = fallos ? 1 : 0;

/*! rev bfb5bbb0d2d82f9f */
