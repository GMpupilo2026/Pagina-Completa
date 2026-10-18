/* Comprueba js/estilo-modelos.js: la partida modelo de cada apertura que
 * recomienda la prueba de estilo («Ver una partida modelo»).
 *
 * Sin navegador ni motor. Lo que se rompe callado es una partida que se ve
 * perfecta y no es lo que dice:
 *
 *   1. UNA PARTIDA INVENTADA. Cada una está, jugada por jugada, en su fuente:
 *      las del repositorio en herramientas/lib/partidas-maestros.js (mismo
 *      id, mismos jugadores, mismas jugadas y resultado) y las de KingBase en
 *      herramientas/datos/estilo-modelos-kingbase.pgn. Y todas se juegan con
 *      chess.js desde la posición inicial.
 *   2. UNA PARTIDA DE OTRA APERTURA. Llega a la posición de su apertura (la
 *      propia de la medición, pero no antes de la media jugada 6: la del
 *      gambito danés es 1.e4 e5 2.d4, y ahí entraba una apertura del centro)
 *      en las primeras 30 medias jugadas.
 *   3. UNA PARTIDA PERDIDA. La gana el bando de la apertura (las blancas en
 *      una apertura, las negras en una defensa), o a lo sumo son tablas.
 *   4. LO QUE FALTA. Las 64 aperturas tienen la suya, y no hay ninguna de una
 *      apertura que no existe.
 *
 * Uso:  node herramientas/verificar-todo.js estilo-modelos
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");
const Medir = require("./estilo-aperturas-medir.js");
const PartidasMaestros = require("./lib/partidas-maestros");
const Gen = require("./estilo-modelos.js");
const MODELOS = require("../js/estilo-modelos.js");

const fallas = [];
const falla = (id, t) => fallas.push(id + ": " + t);

const aperturas = Gen.aperturasModelo();
const porId = new Map(aperturas.map((ap) => [ap.linea.id, ap]));
const repo = new Map(PartidasMaestros.leer(Chess).map((p) => [p.fuente + "|" + p.id, p]));
const kbTexto = path.join(__dirname, "datos/estilo-modelos-kingbase.pgn");
const kb = fs.existsSync(kbTexto)
  ? fs.readFileSync(kbTexto, "utf8").split(/\n\n(?=\[Event )/).map((t) => Gen.leerPgn(t)).filter(Boolean)
  : [];

for (const [id, m] of Object.entries(MODELOS)) {
  const ap = porId.get(id);
  if (!ap) { falla(id, "no es una apertura de «Aperturas y celadas»"); continue; }
  // 1. Se juega, y está en su fuente.
  const c = new Chess();
  const ilegal = m.jugadas.find((san) => !c.move(san));
  if (ilegal) { falla(id, "la jugada " + ilegal + " no se puede hacer"); continue; }
  if (m.fuente === "kingbase") {
    const igual = kb.find((p) => p.sans.join(" ") === m.jugadas.join(" "));
    if (!igual) falla(id, "no está en estilo-modelos-kingbase.pgn");
    else if (igual.blancas !== m.blancas || igual.negras !== m.negras || igual.resultado !== m.resultado) falla(id, "los nombres o el resultado no son los de KingBase");
  } else {
    const p = repo.get(m.fuente + "|" + m.id);
    if (!p) falla(id, "la partida " + m.fuente + "/" + m.id + " no está en el repositorio");
    else if (p.sans.join(" ") !== m.jugadas.join(" ") || p.blancas !== m.blancas || p.negras !== m.negras || p.resultado !== m.resultado)
      falla(id, "no es la partida " + m.id + " de " + m.fuente + " (jugadas, nombres o resultado)");
  }
  if (m.jugadas.length < Gen.MIN_PLIES) falla(id, "una miniatura de " + m.jugadas.length + " medias jugadas no muestra el plan");
  // 2. De su apertura.
  if (!Gen.posiciones(m.jugadas).has(ap.pos)) falla(id, "no llega a la posición de la apertura en las primeras " + Gen.BUSCAR_HASTA + " medias jugadas");
  // 3. Ganada por el bando de la apertura, o tablas.
  if (!Gen.gana(ap.linea.color, m.resultado) && m.resultado !== "1/2-1/2") falla(id, "la pierde el bando de la apertura (" + m.resultado + ")");
}
// 4. Ninguna sin la suya.
const sin = aperturas.filter((ap) => !MODELOS[ap.linea.id]).map((ap) => ap.linea.id);
if (sin.length) falla("aperturas", "sin partida modelo: " + sin.join(", "));

if (fallas.length) {
  console.error("✗ Partidas modelo: " + fallas.length + " problema(s)\n  " + fallas.join("\n  "));
  process.exit(1);
}
const deKb = Object.values(MODELOS).filter((m) => m.fuente === "kingbase").length;
console.log("✓ Partidas modelo: " + Object.keys(MODELOS).length + " aperturas, cada una con una partida real de su fuente ("
  + deKb + " de KingBase), que llega a su posición y la gana quien la juega.");
