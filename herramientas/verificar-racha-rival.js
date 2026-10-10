#!/usr/bin/env node
/* La jugada del rival de cada ejercicio de la Racha táctica (el quinto campo
   de data/puzzle-rush-data.js, que arma herramientas/racha-jugada-rival.js).

   La Racha la dice al llegar cada ejercicio («Las negras jugaron caballo
   captura eva 6»): quien no ve el tablero no tiene otra forma de saber qué
   acaba de pasar. Una jugada mal puesta no da ningún error: se dice otra cosa.
   Acá se revisa que TODOS los ejercicios la traigan y que cuadre con la
   posición: la pieza que dice el SAN está en la casilla de llegada, es del
   color que no juega, y si el SAN dice jaque, el bando que juega está en jaque.

     node herramientas/verificar-racha-rival.js */
"use strict";
const path = require("path");
const fs = require("fs");
const { Chess } = require("chess.js");

const ventana = {};
new Function("window", fs.readFileSync(path.join(__dirname, "..", "data", "puzzle-rush-data.js"), "utf8"))(ventana);
const banco = ventana.PUZZLE_RUSH_DATA;

let fallos = 0;
const mal = (i, por) => { if (fallos++ < 15) console.log("  ❌ ejercicio " + i + ": " + por); };

banco.forEach((e, i) => {
  const [fen, , , , san] = e;
  if (typeof san !== "string" || !san) return mal(i, "no trae la jugada del rival");
  const juego = new Chess(fen);
  const rival = juego.turn() === "w" ? "b" : "w";
  const enroque = /^O-O(-O)?[+#]?$/.test(san);
  const m = san.match(/^([KQRBN])?[a-h]?[1-8]?x?([a-h][1-8])(?:=([QRBN]))?[+#]?$/);
  if (!enroque && !m) return mal(i, "«" + san + "» no parece una jugada");
  let casilla, tipo;
  if (enroque) {
    const fila = rival === "w" ? "1" : "8";
    casilla = (san.startsWith("O-O-O") ? "c" : "g") + fila; tipo = "k";
  } else {
    casilla = m[2]; tipo = (m[3] || m[1] || "P").toLowerCase();
  }
  const p = juego.get(casilla);
  if (!p || p.color !== rival || p.type !== tipo) return mal(i, "«" + san + "»: en " + casilla + " no hay esa pieza del rival");
  if (/[+#]$/.test(san) !== juego.in_check()) return mal(i, "«" + san + "»: el jaque no cuadra con la posición");
});

console.log((fallos ? "❌" : "✅") + " jugada del rival en " + (banco.length - fallos) + " de " + banco.length + " ejercicios");
if (fallos) process.exit(1);
