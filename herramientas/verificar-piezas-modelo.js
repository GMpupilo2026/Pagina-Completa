/* Verifica js/piezas-modelo.js: reconocer qué pieza hay en cada casilla con
 * una red chica que se entrena en el aparato con las fotos de «Enseñarle a la
 * cámara». Sin navegador: se dibujan fotos enderezadas de mentira (64 × 64 por
 * casilla, cada pieza con su forma vista desde arriba, corrida y de tamaño un
 * poco distinto cada vez, con ruido), de posiciones de partidas al azar
 * jugadas con chess.js, y se comprueba:
 *   - que aprende: acierta casi todo en fotos que NO vio;
 *   - que con el color de la lectura arma la posición entera de una foto nueva,
 *     con un rey de cada color y sin peones en la fila 1 ni en la 8;
 *   - que el modelo se guarda y se vuelve a cargar igual, y que un archivo
 *     que no es un modelo no se carga.
 * NO prueba que lea las piezas de verdad: eso solo se sabe con fotos de
 * nuestros tableros (ver «Reconocer qué pieza es» en
 * docs/decisiones/juegos-y-torneos.md).
 *
 *   node herramientas/verificar-piezas-modelo.js
 */
"use strict";
const { Chess } = require("chess.js");
const M = require("../js/piezas-modelo.js");

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const ok = JSON.stringify(hallado) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log((ok ? "  ✓ " : "  ✗ ") + nombre + (ok ? "" : " — hallado " + JSON.stringify(hallado) + ", se esperaba " + JSON.stringify(esperado)));
}
function cierto(nombre, cond, detalle) { igual(nombre + (detalle ? ": " + detalle : ""), !!cond, true); }

let semilla = 7;
const azar = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };

/* Cada pieza, vista desde arriba: su forma en la casilla (lx, ly de -0,5 a
 * 0,5). Todas tienen el centro lleno, como las de verdad (el lector del color
 * mira el centro); se distinguen por el borde. */
const FORMA = {
  p: (r) => r < 0.22,
  n: (r, lx, ly) => r < 0.34 && !(r > 0.16 && lx > 0.05 && ly < -0.05),
  b: (r, lx, ly) => r < 0.34 && !(r > 0.14 && Math.abs(lx - ly) < 0.06),
  r: (r, lx, ly) => Math.abs(lx) < 0.3 && Math.abs(ly) < 0.3,
  q: (r) => r < 0.36 && !(r > 0.2 && r < 0.27),
  k: (r, lx, ly) => r < 0.34 && !(r > 0.14 && (Math.abs(lx) < 0.05 || Math.abs(ly) < 0.05)),
};
const LADO = 256;
function foto(fen) {
  const d = new Uint8ClampedArray(LADO * LADO * 4), c = LADO / 8;
  const piezas = {};
  fen.split(" ")[0].split("/").forEach((f, i) => { let col = 0; for (const ch of f) { if (/\d/.test(ch)) { col += Number(ch); continue; } piezas[col + "," + (7 - i)] = { ch, dx: (azar() - 0.5) * 0.08, dy: (azar() - 0.5) * 0.08, k: 0.9 + azar() * 0.2 }; col++; } });
  for (let y = 0; y < LADO; y++) for (let x = 0; x < LADO; x++) {
    const col = Math.floor(x / c), fila = 7 - Math.floor(y / c);
    let v = (col + fila) % 2 === 0 ? 110 : 215;
    const p = piezas[col + "," + fila];
    if (p) {
      const lx = ((x % c) / c - 0.5 - p.dx) / p.k, ly = ((y % c) / c - 0.5 - p.dy) / p.k, r = Math.hypot(lx, ly);
      if (FORMA[p.ch.toLowerCase()](r, lx, ly)) v = p.ch === p.ch.toUpperCase() ? 245 : 35;
    }
    v += (azar() - 0.5) * 30;
    const k = (y * LADO + x) * 4;
    d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = 255;
  }
  return d;
}
// Posiciones de partidas al azar (cada jugada, una foto), como las que junta la cámara.
function posiciones(n, largo) {
  const fens = [];
  while (fens.length < n) {
    const j = new Chess();
    for (let i = 0; i < largo && !j.game_over(); i++) { const ms = j.moves(); j.move(ms[Math.floor(azar() * ms.length)]); if (i % 3 === 2) fens.push(j.fen()); }
  }
  return fens.slice(0, n);
}
const lecturaDe = (fen) => {
  const l = new Array(64).fill(".");
  fen.split(" ")[0].split("/").forEach((f, i) => { let col = 0; for (const ch of f) { if (/\d/.test(ch)) { col += Number(ch); continue; } l[(7 - i) * 8 + col] = ch === ch.toUpperCase() ? "B" : "N"; col++; } });
  return l.join("");
};

(async () => {
  console.log("\nAprender con las fotos de la cámara");
  const fens = posiciones(120, 40);
  const porFoto = fens.map((f) => M.ejemplos(foto(f), LADO, f));
  igual("cada foto da un ejemplo por casilla ocupada", porFoto[0].length, fens[0].split(" ")[0].replace(/[^a-zA-Z]/g, "").length);
  let avance = 0;
  const t0 = Date.now();
  const modelo = await M.entrenar(porFoto, { alAvanzar: (x) => { avance = x; } });
  cierto("se entrena en poco tiempo", Date.now() - t0 < 60000, (Date.now() - t0) + " ms");
  igual("y avisa cómo va, hasta el final", avance, 1);
  cierto("acierta casi todo en las fotos que no vio (las de prueba)", modelo.acierto >= 0.95, Math.round(modelo.acierto * 1000) / 10 + " % de " + modelo.prueba);

  console.log("\nLa posición entera de una foto nueva");
  let bien = 0;
  const nuevas = posiciones(6, 50);
  for (const f of nuevas) {
    const r = M.posicion(modelo, foto(f), LADO, lecturaDe(f));
    if (r.colocacion === f.split(" ")[0]) bien++;
  }
  cierto("arma la posición entera de fotos nuevas", bien >= 5, bien + " de " + nuevas.length);
  {
    /* Un rey de cada color aunque no se vea uno, y ningún peón en la fila 1
     * ni en la 8: la foto tiene una dama blanca donde iría el rey y un peón
     * negro en a8 (una mano encima, un mal ángulo), y la posición que se
     * arma igual es posible. */
    const f = "p3k3/8/8/8/8/8/8/R3Q2R w - - 0 1";
    const r = M.posicion(modelo, foto(f), LADO, lecturaDe(f));
    const reyes = (r.colocacion.match(/k/g) || []).length + "," + (r.colocacion.match(/K/g) || []).length;
    const filas = r.colocacion.split("/");
    igual("un rey de cada color y sin peones en la fila 1 ni en la 8", [reyes, /p/i.test(filas[0] + filas[7])], ["1,1", false]);
    igual("la posición que arma es legal para chess.js", new Chess().load(r.colocacion + " w - - 0 1"), true);
  }

  console.log("\nGuardar y cargar el modelo");
  const otra = M.deJSON(M.aJSON(modelo));
  const x = porFoto[0][0].x;
  igual("se guarda y se vuelve a cargar: da lo mismo", M.probabilidades(otra, x).map((p) => Math.round(p * 100)), M.probabilidades(modelo, x).map((p) => Math.round(p * 100)));
  igual("un archivo que no es un modelo no se carga", M.deJSON(JSON.stringify({ v: 1, n: 16, W1: [1, 2] })), null);

  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nEl modelo de las piezas está como se pidió.");
  process.exit(fallos ? 1 : 0);
})();
