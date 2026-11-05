#!/usr/bin/env node
/*! rev bfb5bbb0d2d82f9f */
/* Que todo archivo de código del proyecto lleve el sello escondido
 * (herramientas/lib/sello.js), y que ponerlo no rompa nada.
 *
 * No necesita navegador, ni red, ni el sitio servido.
 *
 * Comprueba:
 *   · que cada archivo que elige herramientas/sello-estampar.js lo lleve. Un
 *     archivo nuevo, o uno que su generador volvió a escribir, sale sin él:
 *     se arregla con `node herramientas/sello-estampar.js`;
 *   · que vaya al final, sin tocar lo que había: en una página, después del
 *     <!DOCTYPE html> (un comentario antes la pone en modo «quirks»); en un
 *     SVG, después del <?xml ?>; en un script, después del «#!»;
 *   · que en JS y CSS vaya como «/*!»: es el único comentario que los
 *     minificadores conservan;
 *   · que sobreviva a esbuild minificando, que es lo que haría quien copia.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { SELLO, FORMAS, tiene, estampar, quitar } = require("./lib/sello");
const { archivos, sinSello } = require("./sello-estampar");

const RAIZ = path.resolve(__dirname, "..");
let fallos = 0;
const mal = (m) => { console.log("  ✗ " + m); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);

// ---------------------------------------------------------------- el repositorio
const todos = archivos();
const faltan = sinSello();
if (todos.length < 1500) mal(`solo ${todos.length} archivos elegidos: la lista se achicó de más`);
if (faltan.length) {
  mal(`${faltan.length} archivo(s) sin el sello (node herramientas/sello-estampar.js):`);
  for (const r of faltan.slice(0, 30)) console.log("      " + r);
} else bien(`los ${todos.length} archivos de código llevan el sello`);

let malPuestos = 0;
for (const r of todos) {
  const t = fs.readFileSync(path.join(RAIZ, r), "utf8");
  const i = t.indexOf(SELLO);
  if (i < 0) continue;
  if (/\.html$/.test(r) && /<!doctype/i.test(t) && t.search(/<!doctype/i) > i) { mal(`${r}: el sello quedó antes del DOCTYPE`); malPuestos++; }
  if (/\.svg$/.test(r) && t.includes("<?xml") && t.indexOf("<?xml") > i) { mal(`${r}: el sello quedó antes del <?xml ?>`); malPuestos++; }
  const lineas = t.replace(/^﻿/, "").split("\n", 3);
  if (lineas[0].includes(SELLO) && lineas.slice(1).some((l) => l.startsWith("#!"))) { mal(`${r}: el «#!» ya no es la primera línea`); malPuestos++; }
}
if (!malPuestos) bien("en ninguno quedó antes del DOCTYPE, del <?xml ?> ni del «#!»");

// ---------------------------------------------------------------- estampar()
const al_final = (entrada, ruta) => (s) => s.startsWith(entrada) && s.trimEnd().endsWith(FORMAS[ruta.slice(ruta.lastIndexOf("."))]);
const casos = [
  ["a.html", "<!DOCTYPE html>\n<html><head></head><body></body></html>\n"],
  ["a.svg", '<?xml version="1.0"?>\n<svg></svg>'],
  ["a.js", "#!/usr/bin/env node\n\"use strict\";\n"],
  ["a.py", "#!/usr/bin/env python3\n# -*- coding: utf-8 -*-\nx=1\n"],
  ["a.css", "\ufeffbody{}\n\n"],
].map(([r, e]) => [r, e, al_final(e, r)]);
for (const [ruta, entrada, bueno] of casos) {
  const una = estampar(entrada, ruta);
  if (!bueno(una)) mal(`estampar(${ruta}) lo puso mal: ${JSON.stringify(una)}`);
  else if (estampar(una, ruta) !== una) mal(`estampar(${ruta}) no es idempotente: lo pone dos veces`);
  else if (quitar(una, ruta) !== entrada) mal(`quitar(${ruta}) no devuelve el texto de antes, letra por letra`);
  else bien(`estampar(${ruta}) lo pone al final, sin tocar lo que había, una sola vez, y quitar() lo devuelve exacto`);
}
if (!FORMAS[".js"].startsWith("/*!") || !FORMAS[".css"].startsWith("/*!")) mal("en JS y CSS el sello tiene que ir como /*! … */");

// ---------------------------------------------------------------- minificado
let esbuild = null;
try { esbuild = require("esbuild"); } catch (e) { /* sin npm install */ }
if (!esbuild) console.log("  · esbuild no está instalado (npm install): no se prueba el minificado");
else {
  const js = esbuild.transformSync(estampar("function hola(){ return 1 + 2; }\nhola();\n", "a.js"), { minify: true, legalComments: "inline" }).code;
  const jsPorOmision = esbuild.transformSync(estampar("var x = 1;\n", "a.js"), { minify: true }).code;
  const css = esbuild.transformSync(estampar("body { color: red; }\n", "a.css"), { loader: "css", minify: true }).code;
  if (tiene(js) && tiene(jsPorOmision) && tiene(css)) bien("el sello sobrevive a esbuild minificando JS y CSS");
  else mal("esbuild minificando le borró el sello");
}

console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
