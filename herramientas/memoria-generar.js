#!/usr/bin/env node
/* Arma entreno/data/memoria.json: las posiciones de la ficha de Memoria
 * (entreno/memoria.html), ordenadas por cuántas piezas tienen.
 *
 * NINGUNA se inventa. Salen del banco de «Ejercicios por tema»
 * (entreno/data/temas.json, 7.008 ejercicios de la base abierta de Lichess,
 * partidas jugadas de verdad): la posición del ejercicio y cada una de las que
 * se van dando al jugar su solución, que tienen menos piezas. Así hay de 3 a 32
 * piezas, todas de partidas reales. Un sorteo de piezas al azar daría
 * posiciones que no pasan en una partida (dos alfiles del mismo color, peones
 * en la primera fila, reyes en jaque los dos), y memorizar eso no entrena lo
 * que se quiere entrenar: ver el tablero por grupos con sentido.
 *
 * Se puede correr todas las veces que se quiera: el sorteo tiene semilla y
 * los ids salen de la posición, así que da siempre lo mismo.
 *
 *     node herramientas/memoria-generar.js
 *
 * Después: node herramientas/verificar-todo.js memoria memoria-pagina
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");

const RAIZ = path.resolve(__dirname, "..");
const MIN_PIEZAS = 3, MAX_PIEZAS = 32;
const POR_CANTIDAD = 40;

function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(semilla) { let x = hash(String(semilla)) || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
function barajar(arr, semilla) { const r = rng(semilla); const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const piezas = (fen) => fen.split(" ")[0].replace(/[^a-zA-Z]/g, "").length;

function generar() {
  const temas = JSON.parse(fs.readFileSync(path.join(RAIZ, "entreno/data/temas.json"), "utf8"));
  const porCantidad = {};
  const vistas = new Set();   // la misma colocación de piezas, una sola vez
  Object.keys(temas.puzzles).sort().forEach((id) => {
    const pz = temas.puzzles[id];
    const g = new Chess(pz.fen);
    const fens = [pz.fen];
    for (const s of pz.solution) {
      if (!g.move(s, { sloppy: true })) break;
      fens.push(g.fen());
    }
    fens.forEach((fen) => {
      const colocacion = fen.split(" ")[0];
      if (vistas.has(colocacion)) return;
      if (!new Chess().validate_fen(fen).valid) return;
      vistas.add(colocacion);
      const n = piezas(fen);
      (porCantidad[n] = porCantidad[n] || []).push({ id: "mem-" + n + "-" + hash(colocacion).toString(36), fen, partida: pz.game || null });
    });
  });
  const out = {};
  for (let n = MIN_PIEZAS; n <= MAX_PIEZAS; n++) {
    const l = porCantidad[n] || [];
    if (!l.length) throw new Error("No hay ninguna posición real con " + n + " piezas.");
    out[n] = barajar(l, "memoria" + n).slice(0, POR_CANTIDAD);
  }
  return { min: MIN_PIEZAS, max: MAX_PIEZAS, porPiezas: out };
}

if (require.main === module) {
  const datos = generar();
  const destino = path.join(RAIZ, "entreno/data/memoria.json");
  fs.writeFileSync(destino, JSON.stringify(datos) + "\n");
  const total = Object.values(datos.porPiezas).reduce((s, l) => s + l.length, 0);
  console.log("memoria.json: " + total + " posiciones, de " + datos.min + " a " + datos.max + " piezas.");
}
module.exports = { generar };
