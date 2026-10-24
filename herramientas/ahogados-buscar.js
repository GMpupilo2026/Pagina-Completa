#!/usr/bin/env node
/* Busca posiciones donde el bando que va perdiendo SALVA la partida forzando
 * el ahogado (nivel 3 de «Salva las tablas», entreno/entreno-tipos.html#tablas).
 *
 * Por qué existe: los bancos de Lichess que ya están en el repositorio no
 * traen ninguno: se buscó en las 7274 posiciones de «Ejercicios por tema» (la
 * de partida y cada posición de su solución), en los finales difíciles, en
 * Táctica y en los demás bancos de tipos.json, y no hay ninguna de hasta 12
 * piezas con un ahogado forzado en dos jugadas que sirva (la única que salió
 * es un final de dama del banco «Constrúyela tú», donde ahogar es un error).
 * Y Lichess no tiene un tema «ahogado». Así que las posiciones se SORTEAN y se
 * comprueban, como las de «Con lo justo»: nada se inventa, todo se verifica.
 *
 * Qué hace: sortea posiciones pequeñas (de 4 a 8 piezas) donde al que mueve
 * (las blancas) le falta material, y se queda con las que tienen una jugada
 * que fuerza el ahogado en una o dos jugadas propias contra TODAS las defensas
 * (`ahogadoForzado`, de js/tipos-reglas-mas.js: la misma función con la que la
 * página corrige y el verificador comprueba). Para ir más rápido la búsqueda
 * descarta de entrada las jugadas que dejan al rival más de 6 respuestas (un
 * ahogado forzado casi siempre empieza con un jaque o una captura); esa poda
 * solo puede dejar posiciones sin encontrar, nunca dar una falsa: lo que sale
 * se vuelve a comprobar sin poda. Después, `node herramientas/tipos-generar.js
 * --solo ahogado` las analiza con Stockfish (que estaba perdida sin el
 * ahogado, que el ahogado es lo único que salva) y las guarda en tipos.json.
 *
 * Uso:   node herramientas/ahogados-buscar.js [--procesos 4] [--muestras 60000] [--semilla 1]
 * Salida: herramientas/.cache-ahogados.json (fuera del repositorio). Con la
 * misma semilla y las mismas muestras sale lo mismo, y cada corrida SUMA a lo
 * que ya había: para juntar más, otra semilla.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { fork } = require("child_process");
const { Chess } = require("chess.js");
const M = require("../js/tipos-reglas-mas.js");

const SALIDA = path.join(__dirname, ".cache-ahogados.json");
const arg = (n, def) => (process.argv.includes("--" + n) ? +process.argv[process.argv.indexOf("--" + n) + 1] : def);
const VALOR = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function rng(semilla) {
  let x = (semilla * 2654435761) >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}

/* Una posición al azar, con las blancas a mover. null si no se pudo armar. */
function sortear(r) {
  const pick = (a) => a[Math.floor(r() * a.length)];
  const casillas = [];
  for (let i = 0; i < 64; i++) casillas.push(i);
  for (let i = 63; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [casillas[i], casillas[j]] = [casillas[j], casillas[i]]; }
  const piezas = ["K", "k"];
  const propias = ["P", "P", "R", "B", "N", "R", "Q", "P"];
  const rivales = ["p", "p", "p", "b", "n", "r", "q", "r", "b"];
  const extraPropias = Math.floor(r() * 3), extraRivales = Math.floor(r() * 3);
  for (let i = 0; i < extraPropias; i++) piezas.push(pick(propias));
  piezas.push(pick(["q", "r", "q", "r", "b"]));
  for (let i = 0; i < extraRivales; i++) piezas.push(pick(rivales));
  const tab = Array(64).fill(null);
  for (let i = 0; i < piezas.length; i++) {
    const s = casillas[i], fila = s >> 3;
    if ((piezas[i] === "p" || piezas[i] === "P") && (fila === 0 || fila === 7)) return null;
    tab[s] = piezas[i];
  }
  let f = "";
  for (let fila = 7; fila >= 0; fila--) {
    let v = 0;
    for (let col = 0; col < 8; col++) {
      const p = tab[fila * 8 + col];
      if (!p) v++; else { if (v) { f += v; v = 0; } f += p; }
    }
    if (v) f += v;
    if (fila) f += "/";
  }
  return f + " w - - 0 1";
}
function materialBlancas(fen) {
  let v = 0;
  for (const c of fen.split(" ")[0]) if (/[a-z]/i.test(c)) v += (c === c.toUpperCase() ? 1 : -1) * VALOR[c.toLowerCase()];
  return v;
}
/* La búsqueda con poda: solo cuenta si el rival se queda con pocas respuestas. */
function rapido(g, n) {
  for (const m of g.moves()) {
    g.move(m);
    let ok;
    if (g.in_stalemate()) ok = true;
    else if (g.game_over()) ok = false;
    else {
      const rs = g.moves();
      if (rs.length > 6) ok = false;
      else {
        ok = true;
        for (const x of rs) {
          g.move(x);
          const s = g.in_stalemate() ? true : g.game_over() || n <= 1 ? false : rapido(g, n - 1);
          g.undo();
          if (!s) { ok = false; break; }
        }
      }
    }
    g.undo();
    if (ok) return true;
  }
  return false;
}

if (process.argv[2] === "--trabajo") {
  const [semilla, muestras] = [+process.argv[3], +process.argv[4]];
  const r = rng(semilla);
  const hallazgos = [];
  for (let k = 0; k < muestras; k++) {
    const fen = sortear(r);
    if (!fen) continue;
    if (materialBlancas(fen) > -3) continue;                       // al que mueve le tiene que faltar
    const g = new Chess();
    if (!g.load(fen) || g.game_over()) continue;
    if (new Chess(fen.replace(" w ", " b ")).in_check()) continue;   // el rival no puede estar en jaque
    if (!rapido(g, 2)) continue;
    const buenas = M.ahogadoForzado(Chess, fen, 2);                 // la comprobación de verdad, sin poda
    if (buenas.length) hallazgos.push({ fen, buenas });
  }
  process.send({ hallazgos });
  process.exit(0);
}

const procesos = arg("procesos", 4), muestras = arg("muestras", 60000), semilla = arg("semilla", 1);
console.log("Buscando ahogados forzados: " + procesos + " procesos × " + muestras + " posiciones (semilla " + semilla + ")…");
const todos = new Map();
if (fs.existsSync(SALIDA)) JSON.parse(fs.readFileSync(SALIDA, "utf8")).forEach((x) => todos.set(x.fen.split(" ").slice(0, 2).join(" "), x));
let faltan = procesos;
for (let i = 0; i < procesos; i++) {
  const h = fork(__filename, ["--trabajo", String(semilla * 1000 + i), String(muestras)]);
  h.on("message", (m) => {
    m.hallazgos.forEach((x) => todos.set(x.fen.split(" ").slice(0, 2).join(" "), x));
  });
  h.on("exit", () => {
    if (--faltan) return;
    const lista = [...todos.values()];
    fs.writeFileSync(SALIDA, JSON.stringify(lista));
    console.log("\n" + lista.length + " posiciones con ahogado forzado → " + path.relative(process.cwd(), SALIDA));
  });
}
