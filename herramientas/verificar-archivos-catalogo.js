#!/usr/bin/env node
/*
 * La lista de admin.html#archivos (data/archivos.json) está al día con el
 * disco: todos los PDF, Word, Excel y presentaciones del sitio. No necesita
 * red ni navegador.
 *
 * La sección promete TODOS los archivos, también los que se creen después. La
 * lista la arma herramientas/archivos-catalogo.js leyendo el disco, pero un
 * generador que nadie corre no promete nada: el archivo nuevo no aparece y no
 * da ningún error. Por eso esto falla en el CI —y dice cuál falta— hasta que
 * se vuelva a generar. Comprueba, para cada ficha (PDF, Word, Excel,
 * presentaciones):
 *   - cada archivo del sitio está una sola vez, y cada uno de la lista existe;
 *   - data/archivos.json es lo que el generador arma hoy (sin mirar el peso);
 *   - cada lección de un curso trae algo, y nada de un curso cae en «sueltos».
 *
 *   node herramientas/verificar-archivos-catalogo.js
 */
"use strict";

const fs = require("fs");
const { armar, enDisco, TIPOS, SALIDA } = require("./archivos-catalogo.js");

let fallos = 0;
const ok = (c, m) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); if (!c) fallos++; };

const guardado = fs.existsSync(SALIDA) ? JSON.parse(fs.readFileSync(SALIDA, "utf8")) : null;
ok(guardado, "data/archivos.json existe");
if (!guardado) process.exit(1);

const NOMBRE = { pdf: "PDF", word: "Word", excel: "Excel", presentaciones: "Presentaciones" };
function rutasDe(tipo, d) {
  const f = d[tipo];
  if (!f) return [];
  if (f.cursos) {
    return f.material.concat(f.sueltos, ...f.cursos.map((c) => c.lecciones.flatMap((l) => l.archivos).concat(c.otros)))
      .map((a) => a.ruta);
  }
  return f.grupos.flatMap((g) => g.archivos).map((a) => a.ruta);
}

for (const tipo of Object.keys(TIPOS)) {
  console.log(`\n${NOMBRE[tipo]}: todos, una vez`);
  const disco = new Set(enDisco(tipo));
  const listadas = rutasDe(tipo, guardado);
  const faltan = [...disco].filter((r) => !listadas.includes(r));
  ok(!faltan.length, faltan.length
    ? `faltan en la lista (corre node herramientas/archivos-catalogo.js): ${faltan.slice(0, 10).join(", ")}${faltan.length > 10 ? "…" : ""}`
    : `los ${disco.size} del sitio están en la lista`);
  const sobran = listadas.filter((r) => !disco.has(r));
  ok(!sobran.length, sobran.length ? `en la lista pero ya no existen: ${sobran.slice(0, 10).join(", ")}` : "ninguno de la lista falta en el disco");
  ok(new Set(listadas).size === listadas.length, "ninguno aparece dos veces");
  ok(guardado[tipo] && guardado[tipo].total === disco.size, `el total dice ${guardado[tipo] && guardado[tipo].total} y hay ${disco.size}`);
}

for (const tipo of ["pdf", "presentaciones"]) {
  console.log(`\n${NOMBRE[tipo]}, en su lugar`);
  const f = guardado[tipo];
  ok(f.sueltos.every((a) => !a.ruta.startsWith("cursos/") && !a.ruta.startsWith("material/")),
    "nada de un curso ni de material/ cae en «sueltos»");
  const vacias = f.cursos.flatMap((c) => c.lecciones.filter((l) => !l.archivos.length).map((l) => c.slug + ": " + l.titulo));
  ok(!vacias.length, vacias.length ? `lecciones vacías: ${vacias.join(", ")}` : "cada lección trae lo suyo");
  ok(f.cursos.flatMap((c) => c.lecciones).every((l) => l.titulo), "cada lección tiene su nombre");
}

console.log("\nAl día");
// El peso (kb) no se compara: volver a generar un archivo lo cambia en unos
// bytes y no por eso la lista queda mal. Lo que sí: qué hay, dónde y con qué nombre.
const sinPeso = (d) => JSON.stringify(d, (k, v) => (k === "kb" ? undefined : v));
ok(sinPeso(armar()) === sinPeso(guardado),
  "data/archivos.json es lo que el generador arma hoy (si no: node herramientas/archivos-catalogo.js)");

console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
process.exit(fallos ? 1 : 0);
