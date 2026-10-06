#!/usr/bin/env node
/*
 * La lista de PDF de admin.html#pdf (data/pdfs.json) está al día con el disco.
 * No necesita red ni navegador.
 *
 * La sección «PDF» promete TODOS los PDF del sitio, también los que se creen
 * después. La lista la arma herramientas/pdfs-catalogo.js leyendo el disco,
 * pero un generador que nadie corre no promete nada: el PDF nuevo no aparece y
 * no da ningún error. Por eso esto falla en el CI —y dice cuál falta— hasta que
 * se vuelva a generar. Comprueba:
 *   - data/pdfs.json es exactamente lo que el generador arma hoy;
 *   - cada PDF del sitio está una sola vez, y cada uno de la lista existe;
 *   - cada lección de un curso trae algo, y nada de un curso cae en «sueltos».
 *
 *   node herramientas/verificar-pdfs-catalogo.js
 */
"use strict";

const fs = require("fs");
const { armar, buscarPdfs, SALIDA, RAIZ } = require("./pdfs-catalogo.js");

let fallos = 0;
const ok = (c, m) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); if (!c) fallos++; };

const guardado = fs.existsSync(SALIDA) ? JSON.parse(fs.readFileSync(SALIDA, "utf8")) : null;
ok(guardado, "data/pdfs.json existe");
if (!guardado) process.exit(1);

const enDisco = new Set(buscarPdfs(RAIZ, "", []));
const rutas = (d) => d.material.concat(d.sueltos, ...d.cursos.map((c) => c.lecciones.flatMap((l) => l.archivos).concat(c.otros)))
  .map((a) => a.ruta);
const listadas = rutas(guardado);

console.log("\nTodos los PDF, una vez");
const faltan = [...enDisco].filter((r) => !listadas.includes(r));
ok(!faltan.length, faltan.length
  ? `faltan en la lista (corre node herramientas/pdfs-catalogo.js): ${faltan.slice(0, 10).join(", ")}${faltan.length > 10 ? "…" : ""}`
  : `los ${enDisco.size} PDF del sitio están en la lista`);
const sobran = listadas.filter((r) => !enDisco.has(r));
ok(!sobran.length, sobran.length ? `en la lista pero ya no existen: ${sobran.slice(0, 10).join(", ")}` : "ninguno de la lista falta en el disco");
ok(new Set(listadas).size === listadas.length, "ninguno aparece dos veces");
ok(guardado.total === enDisco.size, `el total dice ${guardado.total} y hay ${enDisco.size}`);

console.log("\nEn su lugar");
ok(guardado.sueltos.every((a) => !a.ruta.startsWith("cursos/") && !a.ruta.startsWith("material/")),
  "nada de un curso ni de material/ cae en «sueltos»");
const vacias = guardado.cursos.flatMap((c) => c.lecciones.filter((l) => !l.archivos.length).map((l) => c.slug + ": " + l.titulo));
ok(!vacias.length, vacias.length ? `lecciones sin PDF: ${vacias.join(", ")}` : "cada lección trae sus PDF");
const sinTitulo = guardado.cursos.flatMap((c) => c.lecciones).filter((l) => !l.titulo);
ok(!sinTitulo.length, "cada lección tiene su nombre");

console.log("\nAl día");
// El peso (kb) no se compara: volver a generar un PDF lo cambia en unos bytes
// y no por eso la lista queda mal. Lo que sí: qué hay, dónde y con qué nombre.
const sinPeso = (d) => JSON.stringify(d, (k, v) => (k === "kb" ? undefined : v));
ok(sinPeso(armar()) === sinPeso(guardado),
  "data/pdfs.json es lo que el generador arma hoy (si no: node herramientas/pdfs-catalogo.js)");

console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
process.exit(fallos ? 1 : 0);
