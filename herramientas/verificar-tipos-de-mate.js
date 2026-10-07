/* Comprueba el banco del libro «Los tipos de mate»
 * (material/tipos-de-mate/banco.json) y su versión accesible.
 *
 * Lo que se rompe acá no da error: un ejercicio con dos soluciones se imprime
 * igual y el alumno que da la otra se la ponen mala; un capítulo que se quedó
 * sin un ejercicio no lo echa de menos nadie. Por eso, contra las fuentes:
 *   - 19 figuras, 24 ejercicios cada una (las dos hojas), sin repetir ninguno;
 *   - cada ejercicio es uno de «Ejercicios por tema» (entreno/data/temas.json)
 *     con la misma FEN, la misma solución y la figura de su capítulo;
 *   - cada uno tiene UNA sola solución (revisar() del banco: chess.js por
 *     fuerza bruta) y el modelo del capítulo es mate;
 *   - la versión accesible trae todos los capítulos y ninguna imagen.
 *
 *     node herramientas/verificar-tipos-de-mate.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");
const { revisar, ORDEN, EDICION } = require("./tipos-de-mate-banco.js");

const RAIZ = path.join(__dirname, "..");
const CARPETA = path.join(RAIZ, "material", "tipos-de-mate");
const TEMAS = JSON.parse(fs.readFileSync(path.join(RAIZ, "entreno/data/temas.json"), "utf8"));

let fallos = 0;
function cierto(que, ok) {
  console.log((ok ? "  ✓ " : "  ✗ ") + que);
  if (!ok) fallos++;
}

function banco(edicion) {
  const { capitulos } = JSON.parse(fs.readFileSync(path.join(CARPETA, edicion.archivo), "utf8"));
  const porCap = edicion.mateIn1 + edicion.mateIn2;
  console.log(`=== Los tipos de mate: ${edicion.archivo} ===`);
  cierto("19 figuras, en el orden del libro", capitulos.map((c) => c.clave).join() === ORDEN.join());
  cierto(`${porCap} ejercicios por figura`, capitulos.every((c) => c.ejercicios.length === porCap));
  const ids = capitulos.flatMap((c) => c.ejercicios.map((e) => e.id));
  cierto("ningún ejercicio se repite", new Set(ids).size === ids.length);
  cierto("numerados del 1 al " + ids.length, capitulos.flatMap((c) => c.ejercicios.map((e) => e.n)).every((n, i) => n === i + 1));

  const ajenos = [], dudosos = [];
  capitulos.forEach((c) => c.ejercicios.forEach((e) => {
    const p = TEMAS.puzzles[e.id];
    if (!p || p.fen !== e.fen || p.solution.join() !== e.solucion.join() || !p.themes.includes(c.clave) || !p.themes.includes(e.tipo)
        || !TEMAS.themes[c.clave].includes(e.id)) ajenos.push(e.n);
    const porque = revisar(e);
    if (porque) dudosos.push(`${e.n} (${porque})`);
  }));
  cierto("cada ejercicio es de «Ejercicios por tema», de su figura" + (ajenos.length ? ": " + ajenos.join(", ") : ""), !ajenos.length);
  cierto("cada ejercicio tiene una sola solución, comprobada con chess.js" + (dudosos.length ? ": " + dudosos.join("; ") : ""), !dudosos.length);
  cierto("el modelo de cada figura es mate", capitulos.every((c) => new Chess(c.modelo.fen).in_checkmate()));
  cierto("cada figura tiene su explicación entera", capitulos.every((c) => c.titulo && c.resumen && c.centro.length && c.bloques.length === 4));
  console.log();
  return { capitulos, ids };
}

const { capitulos, ids } = banco(EDICION);

console.log("=== La versión accesible ===");
const acc = fs.readFileSync(path.join(CARPETA, "tipos-de-mate-accesible.html"), "utf8");
cierto("trae todos los capítulos", capitulos.every((c) => acc.includes(`Capítulo ${c.n}: `)));
cierto("trae los " + ids.length + " ejercicios y sus soluciones", ids.every((_, i) => acc.includes(`<h4>Ejercicio ${i + 1}:`) && acc.includes(`<li>Ejercicio ${i + 1}:`)));
cierto("no tiene ninguna imagen", !/<(img|svg)\b/i.test(acc));
cierto("dice quiénes son los entrenadores", acc.includes("Oscar Angulo Cubero") && acc.includes("Sebastian Mora Chavarria"));

console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
