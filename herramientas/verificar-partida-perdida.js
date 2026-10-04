#!/usr/bin/env node
/* «La partida perdida»: el banco, sin navegador.

   · js/partida-perdida-banco.js es exactamente lo que genera
     herramientas/partida-perdida-generar.js (no se editó a mano ni quedó
     viejo: una partida cambiada en el generador y sin volver a generar deja
     en la página la posición de antes);
   · cada solución es legal y llega a la posición del reto en el número de
     jugadas que dice, desde la salida («ninguna posición se inventa»);
   · ninguna posición se repite, ninguna es la de salida salvo la que lo dice
     a propósito, los retos van de menos a más jugadas y cada uno trae pista.
   Ver «La partida perdida» en docs/decisiones/juegos-y-torneos.md. */
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");
const gen = require("./partida-perdida-generar.js");

const RAIZ = path.join(__dirname, "..");
let fallos = 0;
function ok(cond, msg, detalle) {
  if (cond) console.log("  ✓ " + msg);
  else { fallos += 1; console.log("  ✗ " + msg + (detalle !== undefined ? "  →  " + JSON.stringify(detalle) : "")); }
}

console.log("=== La partida perdida: el banco ===");
const archivo = fs.readFileSync(path.join(RAIZ, "js/partida-perdida-banco.js"), "utf8");
ok(archivo === gen.texto(gen.armar()), "el banco está al día con su generador (node herramientas/partida-perdida-generar.js)");

const ventana = {};
new Function("window", archivo)(ventana);
const banco = ventana.PARTIDA_PERDIDA || [];
ok(banco.length >= 15, "hay retos para rato (" + banco.length + ")");

const ES_A_EN = { R: "K", D: "Q", T: "R", A: "B", C: "N" };
const enIngles = (san) => san.replace(/^[RDTAC]/, (c) => ES_A_EN[c]).replace(/=([DTAC])/, (_, c) => "=" + ES_A_EN[c]);
const SALIDA = new Chess().fen().split(" ")[0];
const vistas = new Set();
let antes = 0;
banco.forEach((r, i) => {
  const g = new Chess();
  let legal = true;
  for (const san of r.solucion) if (!g.move(enIngles(san))) { legal = false; break; }
  ok(legal, r.id + ". «" + r.titulo + "»: la solución es legal", r.solucion);
  ok(r.solucion.length === r.jugadas, r.id + ": la solución tiene las " + r.jugadas + " jugadas que dice");
  ok(g.fen().split(" ")[0] === r.posicion, r.id + ": y llega a la posición del reto");
  ok(r.id === i + 1, r.id + ": los números van en orden");
  ok(r.jugadas >= antes, r.id + ": no tiene menos jugadas que el anterior");
  ok(!vistas.has(r.posicion), r.id + ": su posición no se repite");
  ok(r.posicion !== SALIDA || /como al principio/.test(r.pista), r.id + ": solo «Como si nada» termina en la posición de salida");
  ok(typeof r.pista === "string" && r.pista.length > 10, r.id + ": trae su pista");
  vistas.add(r.posicion);
  antes = r.jugadas;
});

console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
