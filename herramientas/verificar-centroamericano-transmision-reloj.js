#!/usr/bin/env node
/* El control de tiempos que sale de la transmisión de Lichess (js/centroamericano-transmision-reloj.js): las cuentas,
 * sin navegador. Partidas simuladas con un reloj de verdad (90 min + 30 s), la transmisión con 15 min de atraso y los
 * dos significados posibles de `thinkTime`; y que la calculadora del reloj apagado, partiendo de ese control, da el
 * total exacto. Además, que las dos páginas cargan el módulo y que la calculadora ofrece el botón.
 * Ver «El control de tiempos desde la transmisión» en docs/decisiones/juegos-y-torneos.md.
 *
 *   node herramientas/verificar-centroamericano-transmision-reloj.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");
const TX = require(path.join(RAIZ, "js/centroamericano-transmision-reloj.js"));
const C = require(path.join(RAIZ, "js/centroamericano-mesas.js"));

let fallas = 0, pruebas = 0;
function ok(nombre, cond, detalle) {
  pruebas++;
  if (!cond) { fallas++; console.error("✗ " + nombre + (detalle ? " — " + detalle : "")); }
}

// ---- los nombres
ok("mismo jugador: chess-results y Lichess escriben distinto", TX.mismoJugador("Pérez Solís María José", "Perez Solis, Maria"));
ok("mismo jugador: mayúsculas y comas", TX.mismoJugador("ACUÑA PORRAS, Fabio", "Acuña Porras Fabio"));
ok("mismo jugador: con solo el primer apellido y el nombre", TX.mismoJugador("Mora Jiménez, Daniel", "Mora, Daniel"));
ok("otro jugador con el mismo apellido no", !TX.mismoJugador("Mora Jiménez, Daniel", "Mora Vargas, Andrés"));
ok("vacío no", !TX.mismoJugador("", "Mora, Daniel"));

// ---- las jugadas de la FEN
const j1 = TX.jugadasDeFen("r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3");
ok("FEN con turno de las blancas", j1 && j1.j_blancas === 2 && j1.j_negras === 2 && j1.turno === "blancas", JSON.stringify(j1));
const j2 = TX.jugadasDeFen("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1");
ok("FEN con turno de las negras", j2 && j2.j_blancas === 1 && j2.j_negras === 0 && j2.turno === "negras", JSON.stringify(j2));
ok("FEN rota", TX.jugadasDeFen("8/8/8 x") === null);

// ---- partidas simuladas: un reloj de verdad y lo que muestra la transmisión
// Devuelve el estado de la partida en el instante `t` (ms) con sus relojes, y la hora de la última jugada.
function simular(semilla, inicio, cuantas) {
  let x = semilla;
  const azar = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  const R = TX.RITMO;
  let tB = R.inicial, tN = R.inicial, t = inicio;
  const jugadas = [];   // { t, color, tB, tN } después de cada jugada (el reloj ya con el incremento)
  for (let i = 0; i < cuantas; i++) {
    const color = i % 2 === 0 ? "blancas" : "negras";
    const piensa = Math.round(20 + azar() * (color === "blancas" ? 240 : 140));
    t += piensa * 1000;
    if (color === "blancas") tB = tB - piensa + R.incremento; else tN = tN - piensa + R.incremento;
    jugadas.push({ t, color, tB, tN });
  }
  return jugadas;
}
const fen = (jB, jN) => "8/8/8/8/8/8/8/K6k " + (jB === jN ? "w" : "b") + " - - 0 " + (jB === jN ? jB + 1 : jB);

const INICIO = Date.UTC(2026, 10, 4, 15, 30, 0);
let maxErr = 0;
for (let s = 1; s <= 300; s++) {
  const cuantas = 10 + (s % 60);
  const jug = simular(s, INICIO, cuantas);
  const u = jug[jug.length - 1];
  const jB = jug.filter((x) => x.color === "blancas").length, jN = jug.filter((x) => x.color === "negras").length;
  const atraso = 900, piensaReal = 37 + (s % 400);
  // Lo que ve la transmisión «ahora»: la posición de hace 15 min. `ahora` = la última jugada + lo que pensó después + el atraso.
  const ahora = u.t + (piensaReal + atraso) * 1000;
  for (const incluye of [false, true]) {
    const g = { fen: fen(jB, jN), status: "*", thinkTime: incluye ? piensaReal + atraso : piensaReal, players: [{ name: "B", clock: u.tB * 100 }, { name: "N", clock: u.tN * 100 }] };
    const c = TX.controlDe(g, { ahora, atraso, inicio: INICIO });
    const err = Math.abs(new Date(c.ocurrio).getTime() - u.t) / 1000;
    maxErr = Math.max(maxErr, err);
    if (err > 1) { ok("partida " + s + (incluye ? " (thinkTime con el atraso)" : "") + ": la hora del control es la de la última jugada", false, "error de " + err + " s"); break; }
    ok("partida " + s + ": sin avisos cuando todo cuadra", c.avisos.length === 0, c.avisos.join(" | "));
    ok("partida " + s + ": jugadas y relojes", c.j_blancas === jB && c.j_negras === jN && c.t_blancas === u.tB && c.t_negras === u.tN);
    // La calculadora del reloj apagado, desde este control, da el total exacto un rato después.
    const despues = 400 + (s % 900);
    const masJ = 2;   // dos medias jugadas más en ese rato
    const r = C.relojApagado({ control: c, inicio: INICIO, ahora: ahora + despues * 1000, jBlancas: jB + 1, jNegras: jN + 1, bonos: [] });
    const real = 2 * TX.RITMO.inicial + TX.RITMO.incremento * (jB + jN + masJ) - Math.round((ahora + despues * 1000 - INICIO) / 1000);
    ok("partida " + s + ": el reloj apagado da el total exacto", !r.error && Math.abs(r.total - real) <= 1, r.error || (r.total + " contra " + real));
  }
}
ok("ninguna hora de control erra más de 1 s", maxErr <= 1, maxErr + " s");

// Sin la hora de inicio: atraso + lo que lleva pensando (la interpretación de `thinkTime` sin el atraso).
{
  const jug = simular(7, INICIO, 30), u = jug[jug.length - 1];
  const ahora = u.t + (60 + 900) * 1000;
  const c = TX.controlDe({ fen: fen(15, 15), status: "*", thinkTime: 60, players: [{ clock: u.tB * 100 }, { clock: u.tN * 100 }] }, { ahora, atraso: 900 });
  ok("sin inicio: atraso + pensando", Math.abs(new Date(c.ocurrio).getTime() - u.t) <= 1000);
  ok("sin inicio: avisa que no se pudo comprobar", c.avisos.some((x) => /no se pudo comprobar/.test(x)));
  const sinPiensa = TX.controlDe({ fen: fen(15, 15), status: "*", players: [{ clock: u.tB * 100 }, { clock: u.tN * 100 }] }, { ahora, atraso: 900 });
  ok("sin thinkTime: avisa que la hora es aproximada", sinPiensa.avisos.length === 1 && /aproximada/.test(sinPiensa.avisos[0]));
  // Una pausa de 10 min que nadie anotó: los relojes no cuadran con el inicio y se avisa.
  const pausa = TX.controlDe({ fen: fen(15, 15), status: "*", thinkTime: 60, players: [{ clock: u.tB * 100 }, { clock: u.tN * 100 }] }, { ahora: ahora + 600000, atraso: 900, inicio: INICIO });
  ok("con una pausa: avisa que no cuadra", pausa.avisos.some((x) => /no cuadra/.test(x)), JSON.stringify(pausa.avisos));
  // Los 2 minutos de una ilegal están en el reloj: con el bono anotado, sigue cuadrando.
  const conBono = TX.controlDe({ fen: fen(15, 15), status: "*", thinkTime: 60, players: [{ clock: (u.tB + 120) * 100 }, { clock: u.tN * 100 }] }, { ahora, atraso: 900, inicio: INICIO, bonos: [{ color: "blancas", segundos: 120 }] });
  ok("los 2 min de una ilegal, contados", conBono.avisos.length === 0 && Math.abs(new Date(conBono.ocurrio).getTime() - u.t) <= 1000, JSON.stringify(conBono.avisos));
}

// ---- lo que no se usa
ok("terminada: no", !!TX.controlDe({ fen: fen(30, 30), status: "1-0", players: [{ clock: 1 }, { clock: 1 }] }, { ahora: Date.now(), atraso: 900 }).error);
ok("sin reloj electrónico: no", /sin el reloj/.test(TX.controlDe({ fen: fen(10, 10), status: "*", players: [{ name: "a" }, { name: "b" }] }, { ahora: Date.now(), atraso: 900 }).error || ""));
ok("sin jugadas: no", !!TX.controlDe({ fen: fen(0, 0), status: "*", players: [{ clock: 540000 }, { clock: 540000 }] }, { ahora: Date.now(), atraso: 900 }).error);
ok("el atraso que falta es el de la sala (15 min)", TX.controlDe({ fen: fen(10, 10), status: "*", thinkTime: 0, players: [{ clock: 500000 }, { clock: 500000 }] }, { ahora: Date.now() }).atraso === 900);

// ---- las páginas
for (const pagina of ["centroamericano-arbitro.html", "centroamericano-mesas.html"]) {
  const h = fs.readFileSync(path.join(RAIZ, pagina), "utf8");
  const i1 = h.indexOf('src="js/lichess-transmision.js"'), i2 = h.indexOf('src="js/centroamericano-transmision-reloj.js"'), i3 = h.indexOf('src="js/centroamericano-reloj-apagado.js"');
  ok(pagina + " carga la transmisión antes de la calculadora", i1 > 0 && i2 > i1 && i3 > i2);
}
const calc = fs.readFileSync(path.join(RAIZ, "js/centroamericano-reloj-apagado.js"), "utf8");
ok("la calculadora ofrece buscar la mesa en la transmisión", calc.includes("Buscar esta mesa en la transmisión") && calc.includes("o.transmision("));
ok("la nota dice que salió de la transmisión", calc.includes("relojes de la transmisión de Lichess"));
for (const js of ["js/centroamericano-arbitro.js", "js/centroamericano-mesas-pagina.js"]) {
  ok(js + " le pasa la transmisión a la calculadora", /transmision[^\n]*TX\.buscar\(/.test(fs.readFileSync(path.join(RAIZ, js), "utf8")));
}

if (fallas) { console.error("\n" + fallas + " de " + pruebas + " comprobaciones fallaron."); process.exit(1); }
console.log("✓ El control de tiempos desde la transmisión: " + pruebas + " comprobaciones (hora del control con error máximo de " + maxErr + " s).");
