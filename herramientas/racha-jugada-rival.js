#!/usr/bin/env node
/* La jugada del rival en la Racha táctica (data/puzzle-rush-data.js).

   Cada ejercicio de Lichess empieza con una jugada del rival: la posición del
   banco es la que queda DESPUÉS de esa jugada. El banco guardaba solo la
   posición y la solución, así que la Racha no podía decir qué acababa de jugar
   el rival, y quien no ve el tablero no tenía cómo enterarse (lo pidió el grupo
   de personas ciegas). Este script le agrega a cada ejercicio un quinto campo:
   la jugada del rival en SAN («Nxe6»), o null si no se pudo comprobar.

   De dónde sale. La tabla «Ejercicios Lichess» de Supabase guarda la posición
   ANTES de la jugada del rival y la lista de jugadas («d4e6 d6h2»). Para no
   bajar sus 343 000 filas, en la base se calcula la huella de la posición que
   queda después de la primera jugada —md5 de las 64 casillas («.» si está
   vacía) más el turno, primeros seis caracteres— y se cruza con la huella de
   cada ejercicio del banco, calculada igual acá (`node racha-jugada-rival.js
   --huellas` las escribe todas seguidas). La consulta devuelve, en el orden del
   banco, la jugada del rival en UCI pegada a lo que había en la casilla de
   llegada («d4e6b»: capturó un alfil negro; «.»: no capturó), una por renglón
   (varias, separadas por «|», si la huella coincidió con más de una).
   Ese archivo queda guardado al lado (herramientas/racha-jugada-rival.txt) y
   es el que se le pasa a este script:

     node herramientas/racha-jugada-rival.js herramientas/racha-jugada-rival.txt

   Lo comprueba verificar-racha-rival.js.

   Una huella de seis caracteres puede chocar, así que nada se cree a ciegas:
   con la jugada y lo capturado se rearma la posición de antes, se juega la del
   rival con chess.js y tiene que dar EXACTAMENTE la posición del ejercicio
   (las 64 casillas y el turno). Si no, ese ejercicio queda sin jugada.
   El SAN lo escribe chess.js, no la consulta. */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Chess } = require("chess.js");

const ARCHIVO = path.join(__dirname, "..", "data", "puzzle-rush-data.js");

function leerBanco() {
  const texto = fs.readFileSync(ARCHIVO, "utf8");
  const ventana = {};
  new Function("window", texto)(ventana);
  return { texto, banco: ventana.PUZZLE_RUSH_DATA };
}

// Las 64 casillas de a8 a h1, «.» si está vacía.
function casillas(fen) {
  return fen.split(" ")[0].replace(/\//g, "").replace(/[1-8]/g, (n) => ".".repeat(+n));
}
function aFen(tablero) {
  let filas = [];
  for (let f = 0; f < 8; f++) {
    filas.push(tablero.slice(f * 8, f * 8 + 8).replace(/\.+/g, (v) => String(v.length)));
  }
  return filas.join("/");
}
const indice = (sq) => (8 - +sq[1]) * 8 + (sq.charCodeAt(0) - 97);
const poner = (t, i, c) => t.slice(0, i) + c + t.slice(i + 1);

/* La posición de antes: la pieza vuelve a su casilla, lo capturado reaparece,
   y en el enroque y la captura al paso, la torre y el peón también. */
function antesDe(fenDespues, jugada, capturada) {
  const turnoDespues = fenDespues.split(" ")[1];
  const rival = turnoDespues === "w" ? "b" : "w";
  const desde = indice(jugada.slice(0, 2)), hasta = indice(jugada.slice(2, 4));
  let t = casillas(fenDespues);
  let pieza = t[hasta];
  if (jugada.length === 5) pieza = rival === "w" ? "P" : "p";
  t = poner(t, desde, pieza);
  t = poner(t, hasta, capturada);
  let enroque = "-", alPaso = "-";
  if (pieza.toLowerCase() === "k" && Math.abs(desde - hasta) === 2) {
    const corto = hasta > desde;
    const torreAhora = corto ? desde + 1 : desde - 1, torreAntes = corto ? desde + 3 : desde - 4;
    t = poner(poner(t, torreAntes, t[torreAhora]), torreAhora, ".");
    enroque = rival === "w" ? (corto ? "K" : "Q") : (corto ? "k" : "q");
  }
  if (pieza.toLowerCase() === "p" && capturada === "." && (desde % 8) !== (hasta % 8)) {
    const comido = desde - (desde % 8) + (hasta % 8);
    t = poner(t, comido, rival === "w" ? "p" : "P");
    alPaso = jugada.slice(2, 3) + (rival === "w" ? "6" : "3");
  }
  return aFen(t) + " " + rival + " " + enroque + " " + alPaso + " 0 1";
}

/* Un renglón puede traer varias candidatas separadas por «|» (dos posiciones
   distintas de Lichess con la misma huella): vale la que se comprueba. */
function jugadaDelRival(fenDespues, dato) {
  if (!dato || dato === "-") return null;
  for (const una of dato.split("|")) {
    const san = probar(fenDespues, una);
    if (san) return san;
  }
  return null;
}
function probar(fenDespues, dato) {
  const jugada = dato.slice(0, -1), capturada = dato.slice(-1);
  const juego = new Chess();
  if (!juego.load(antesDe(fenDespues, jugada, capturada))) return null;
  const mv = juego.move({ from: jugada.slice(0, 2), to: jugada.slice(2, 4), promotion: jugada[4] });
  if (!mv) return null;
  const dio = juego.fen().split(" ");
  const debia = fenDespues.split(" ");
  if (casillas(juego.fen()) !== casillas(fenDespues) || dio[1] !== debia[1]) return null;
  return mv.san;
}

function huella(fen) {
  return crypto.createHash("md5").update(casillas(fen) + fen.split(" ")[1]).digest("hex").slice(0, 6);
}

if (require.main === module) {
  const { texto, banco } = leerBanco();
  if (process.argv[2] === "--huellas") {
    process.stdout.write(banco.map(([fen]) => huella(fen)).join("") + "\n");
    process.exit(0);
  }
  if (!process.argv[2]) {
    console.error("Uso: node herramientas/racha-jugada-rival.js <jugadas-rival.txt>  (o --huellas)");
    process.exit(1);
  }
  const datos = fs.readFileSync(process.argv[2], "utf8").split("\n").map((s) => s.trim());
  if (datos.filter(Boolean).length !== banco.length) {
    console.error("El archivo trae " + datos.filter(Boolean).length + " renglones y el banco " + banco.length + " ejercicios.");
    process.exit(1);
  }
  let bien = 0;
  const nuevo = banco.map((e, i) => {
    const san = jugadaDelRival(e[0], datos[i]);
    if (san) bien++;
    return [e[0], e[1], e[2], e[3], san];
  });
  const cabecera = texto.slice(0, texto.indexOf("window.PUZZLE_RUSH_DATA"));
  const cuerpo = "window.PUZZLE_RUSH_DATA = [" + nuevo.map((e) => "[" + e.map((x) => JSON.stringify(x)).join(", ") + "]").join(",") + "];\n";
  fs.writeFileSync(ARCHIVO, cabecera + cuerpo);
  console.log("Jugada del rival comprobada en " + bien + " de " + banco.length + " ejercicios.");
}

module.exports = { antesDe, jugadaDelRival, huella, casillas };
