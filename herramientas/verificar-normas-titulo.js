/* Comprueba js/normas-titulo.js (NormasTitulo), el cálculo de «Normas de
   título», contra el Reglamento de Títulos de FIDE (B.01, vigente desde 2024).

   La prueba más fuerte es el ANEXO del reglamento: la tabla que dice, para 9,
   10, 11 y 12 partidas, cuántos puntos hacen falta con cada rango de
   promedio de los rivales para cada norma (GM, IM, WGM, WIM). Está copiada
   abajo tal cual (ANEXO) y se revisa fila por fila: en la punta baja del
   rango, con esos puntos hay norma; con medio punto menos, no; y un punto
   abajo de la punta baja (salvo el promedio mínimo), tampoco.

   Además, una partida armada para cada artículo: las federaciones (1.4.3 y
   1.4.4), los rivales con título (1.4.5, sin CM), el piso de Elo que sube a
   un solo rival y el que no tiene Elo cuenta 1400 (1.4.6), las
   incomparecencias que no cuentan (1.4.2c), 8 como 9 (1.4.1c), cortar
   después de la norma en un suizo (1.4.1e) y dejar afuera una partida ganada
   (1.4.1f, en cualquier formato), y que las normas femeninas no se le buscan a un hombre.

   Ver «Normas de título» en docs/decisiones/juegos-y-torneos.md.

   Uso:  node herramientas/verificar-normas-titulo.js */
"use strict";
const NT = require("../js/normas-titulo.js");

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
  else console.log("  ✓ " + nombre);
}

// El anexo de B.01: { partidas: [[puntos, [[desde, hasta] GM, IM, WGM, WIM]], …] }.
const ANEXO = {"9":[[7.0,[[2380,2433],[2230,2283],[2180,2233],[2030,2083]]],[6.5,[[2434,2474],[2284,2324],[2234,2274],[2084,2124]]],[6.0,[[2475,2519],[2325,2369],[2275,2319],[2125,2169]]],[5.5,[[2520,2556],[2370,2406],[2320,2356],[2170,2206]]],[5.0,[[2557,2599],[2407,2449],[2357,2399],[2207,2249]]],[4.5,[[2600,2642],[2450,2492],[2400,2442],[2250,2292]]],[4.0,[[2643,2679],[2493,2529],[2443,2479],[2293,2329]]],[3.5,[[2680,null],[2530,null],[2480,null],[2330,null]]]],"10":[[8.0,[[2380,2406],[2230,2256],[2180,2206],[2030,2056]]],[7.5,[[2407,2450],[2257,2300],[2207,2250],[2057,2100]]],[7.0,[[2451,2489],[2301,2339],[2251,2289],[2101,2139]]],[6.5,[[2490,2527],[2340,2377],[2290,2327],[2140,2177]]],[6.0,[[2528,2563],[2378,2413],[2328,2363],[2178,2213]]],[5.5,[[2564,2599],[2414,2449],[2364,2399],[2214,2249]]],[5.0,[[2600,2635],[2450,2485],[2400,2435],[2250,2285]]],[4.5,[[2636,2671],[2486,2521],[2436,2471],[2286,2321]]],[4.0,[[2672,2709],[2522,2559],[2472,2509],[2322,2359]]],[3.5,[[2710,null],[2560,null],[2510,null],[2360,null]]]],"11":[[9.0,[[2380,2388],[2230,2238],[2180,2188],[2030,2038]]],[8.5,[[2389,2424],[2239,2274],[2189,2224],[2039,2074]]],[8.0,[[2425,2466],[2275,2316],[2225,2266],[2075,2116]]],[7.5,[[2467,2497],[2317,2347],[2267,2297],[2117,2147]]],[7.0,[[2498,2534],[2348,2384],[2298,2334],[2148,2184]]],[6.5,[[2535,2563],[2385,2413],[2335,2363],[2185,2213]]],[6.0,[[2564,2599],[2414,2449],[2364,2399],[2214,2249]]],[5.5,[[2600,2635],[2450,2485],[2400,2435],[2250,2285]]],[5.0,[[2636,2664],[2486,2514],[2436,2464],[2286,2314]]],[4.5,[[2665,2701],[2515,2551],[2465,2501],[2315,2351]]],[4.0,[[2702,null],[2552,null],[2502,null],[2352,null]]]],"12":[[9.5,[[2380,2406],[2230,2256],[2180,2206],[2030,2056]]],[9.0,[[2407,2441],[2257,2291],[2207,2241],[2057,2091]]],[8.5,[[2442,2474],[2292,2324],[2242,2274],[2092,2124]]],[8.0,[[2475,2504],[2325,2354],[2275,2304],[2125,2154]]],[7.5,[[2505,2542],[2355,2392],[2305,2342],[2155,2192]]],[7.0,[[2543,2570],[2393,2420],[2343,2370],[2193,2220]]],[6.5,[[2571,2599],[2421,2449],[2371,2399],[2221,2249]]],[6.0,[[2600,2628],[2450,2478],[2400,2428],[2250,2278]]],[5.5,[[2629,2656],[2479,2506],[2429,2456],[2279,2306]]],[5.0,[[2657,2686],[2507,2536],[2457,2486],[2307,2336]]],[4.5,[[2687,null],[2537,null],[2487,null],[2337,null]]]]};
const TITULOS = ["GM", "IM", "WGM", "WIM"];

// n rivales del mismo Elo (así el promedio es exacto), de federaciones y
// títulos que cumplen todo lo demás; los puntos, repartidos al principio.
function partidasCon(n, elo, puntos, extra) {
  const feds = ["ESP", "CUB", "MEX", "ARG", "COL", "PER", "CHI", "VEN", "URU", "ECU", "BOL", "PAR", "PAN"];
  return Array.from({ length: n }, (_, i) => Object.assign({
    ronda: i + 1,
    puntos: Math.min(1, Math.max(0, puntos - i)),
    jugada: true,
    rival: { nombre: "Rival " + (i + 1), fed: feds[i], titulo: "GM", elo },
  }, extra ? extra(i) : {}));
}
const fallan = (r) => r.chequeos.filter((c) => !c.ok).map((c) => c.art);

console.log("\n=== El anexo de B.01, fila por fila ===");
{
  let revisadas = 0, malas = [];
  for (const [n, filas] of Object.entries(ANEXO)) {
    for (const [puntos, rangos] of filas) {
      rangos.forEach(([desde], k) => {
        const t = TITULOS[k];
        const jugador = { fed: "CRC", sexo: "w" };
        const conNorma = NT.chequear(t, jugador, partidasCon(+n, desde, puntos), {});
        const conMedioMenos = NT.chequear(t, jugador, partidasCon(+n, desde, puntos - 0.5), {});
        const unoAbajo = desde > NT.NORMAS[t].promedio ? NT.chequear(t, jugador, partidasCon(+n, desde - 1, puntos), {}) : null;
        revisadas++;
        if (!conNorma.norma || conMedioMenos.norma || (unoAbajo && unoAbajo.norma)) malas.push(n + " partidas, " + puntos + " puntos, " + t + " desde " + desde);
      });
    }
  }
  igual("las " + revisadas + " casillas del anexo (9 a 12 partidas): norma justo en la punta baja, y no con medio punto menos ni un punto de promedio menos", malas, []);
}
igual("la tabla 1.4.9: 50 % → 0, 65 % → 110, 100 % → 800, 0 % → −800", [NT.DP[50], NT.DP[65], NT.DP[100], NT.DP[0]], [0, 110, 800, -800]);
igual("el porcentaje se redondea al entero, el ,5 hacia arriba: 5,5 de 9 = 61,1 → 61; 6,5 de 10 = 65; 4,5 de 11 = 40,9 → 41",
  [NT.porcentaje(5.5, 9), NT.porcentaje(6.5, 10), NT.porcentaje(4.5, 11)], [61, 65, 41]);

console.log("\n=== Artículo por artículo ===");
{
  const base = partidasCon(9, 2450, 7);
  igual("la mezcla buena: norma de GM", NT.chequear("GM", { fed: "CRC" }, base, {}).norma, true);
  const unaFed = base.map((p) => Object.assign({}, p, { rival: Object.assign({}, p.rival, { fed: "ESP" }) }));
  igual("todos de una sola federación extranjera: falla 1.4.3 (hacen falta dos) y 1.4.4 (máximo 2/3 de una)", fallan(NT.chequear("GM", { fed: "CRC" }, unaFed, {})), ["1.4.3", "1.4.4"]);
  igual("…salvo que el torneo esté exento (campeonato nacional, zonal)", NT.chequear("GM", { fed: "CRC" }, unaFed, { exentoFederaciones: true }).norma, true);
  const muchosPropios = base.map((p, i) => i < 6 ? Object.assign({}, p, { rival: Object.assign({}, p.rival, { fed: "CRC" }) }) : p);
  igual("6 de 9 de su propia federación: falla 1.4.4 (máximo 3/5 = 5)", fallan(NT.chequear("GM", { fed: "CRC" }, muchosPropios, {})), ["1.4.4"]);
  igual("FID no cuenta como federación extranjera", fallan(NT.chequear("GM", { fed: "CRC" }, base.map((p, i) => i ? Object.assign({}, p, { rival: Object.assign({}, p.rival, { fed: i % 2 ? "FID" : "CRC" }) }) : p), {})).includes("1.4.3"), true);
  const cm = base.map((p, i) => i < 5 ? Object.assign({}, p, { rival: Object.assign({}, p.rival, { titulo: "CM" }) }) : p);
  igual("5 de 9 con CM: los CM no cuentan como título (1.4.5)", fallan(NT.chequear("GM", { fed: "CRC" }, cm, {})), ["1.4.5a"]);
  const im = base.map((p, i) => i < 7 ? Object.assign({}, p, { rival: Object.assign({}, p.rival, { titulo: "IM" }) }) : p);
  igual("solo 2 GM en 9: para GM hacen falta 3 (1/3, mínimo 3); para IM sí alcanza", [fallan(NT.chequear("GM", { fed: "CRC" }, im, {})), NT.chequear("IM", { fed: "CRC" }, im, {}).norma], [["1.4.5"], true]);
}
{
  // 1.4.6: el de menos Elo sube al piso, y solo ese; sin Elo cuenta 1400.
  const p = partidasCon(9, 2450, 7);
  p[0].rival.elo = 1900; p[1].rival.elo = 2000;
  const r = NT.chequear("GM", { fed: "CRC" }, p, {});
  const ch = r.chequeos.find((c) => c.art === "1.4.7");
  igual("un rival de 1900 sube al piso de 2200 y el de 2000, no: promedio (2200 + 2000 + 7 × 2450) / 9 = 2372", [ch.ra, ch.subido && ch.subido.de], [2372, 1900]);
  const s = partidasCon(9, 2450, 7);
  s[0].rival.elo = 0; s[1].rival.elo = 1500;
  igual("sin Elo cuenta 1400 (y es el de menos, el que sube al piso)", NT.chequear("GM", { fed: "CRC" }, s, {}).chequeos.find((c) => c.art === "1.4.7").subido.de, 1400);
}

console.log("\n=== Qué partidas cuentan (evaluar) ===");
{
  const jug = (partidas) => ({ fed: "CRC", sexo: "m", partidas });
  // 9 rondas, una ganada por incomparecencia: 8 jugadas cuentan como 9 (1.4.1c).
  const p = partidasCon(9, 2450, 7);
  p[8].jugada = false; p[8].puntos = 1;
  const r = NT.evaluar(jug(p), { rondas: 9 });
  const gm = r.titulos.find((t) => t.titulo === "GM");
  igual("la incomparecencia a favor no cuenta como partida, y 8 de 9 rondas cuentan como 9 (1.4.1c)", [gm.mejor.n, gm.mejor.chequeos[0].ok], [8, true]);
  igual("a un hombre no se le buscan las normas femeninas", r.titulos.map((t) => t.titulo), ["GM", "IM"]);
  const q = partidasCon(9, 2450, 7);
  q[8].jugada = false; q[8].puntos = 1;
  igual("…pero en un torneo de 11 rondas, 8 partidas no alcanzan", NT.evaluar(jug(q), { rondas: 11 }).titulos[0].norma, false);
}
{
  // Suizo de 11: con 7 de 9 ya hizo la norma y perdió las dos últimas.
  const p = partidasCon(11, 2450, 7);
  const r = NT.evaluar({ fed: "CRC", sexo: "", partidas: p }, { sistema: "suizo", rondas: 11 });
  const gm = r.titulos.find((t) => t.titulo === "GM");
  igual("en un suizo, se corta después de la norma (1.4.1e): sin las rondas 10 y 11", [gm.norma, gm.mejor.ignoradas.map((i) => i.ronda)], [true, [10, 11]]);
  igual("en un todos contra todos, no se corta: sin norma", NT.evaluar({ fed: "CRC", sexo: "", partidas: p }, { sistema: "todos", rondas: 11 }).titulos[0].norma, false);
}
{
  // Un rival muy flojo al que le ganó baja el promedio: se deja afuera (1.4.1f).
  const p = partidasCon(10, 2475, 7); // con él: 2448 + 149 = 2597; sin él: 2475 + 125 = 2600
  p[0].rival = { nombre: "Flojo", fed: "PAN", titulo: "", elo: 1600 };
  // En un todos contra todos (1.4.1f vale «en cualquier formato»), para que no la salve cortar rondas.
  const r = NT.evaluar({ fed: "CRC", sexo: "", partidas: p }, { sistema: "todos", rondas: 10 });
  const gm = r.titulos.find((t) => t.titulo === "GM");
  igual("sin la partida ganada al de 1600 (1.4.1f), la norma de GM sale", [gm.norma, gm.mejor.ignoradas.map((i) => i.por.includes("1.4.1f"))], [true, [true]]);
}
{
  // 1.4.1d: cada punto entero de más cuenta como una partida más.
  const r = NT.chequear("GM", { fed: "CRC" }, partidasCon(9, 2450, 8), {});
  igual("con un punto de más en 9 partidas, la norma vale como 10 partidas (1.4.1d)", [r.norma, r.valeComo], [true, 10]);
}

console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
process.exit(fallos ? 1 : 0);
