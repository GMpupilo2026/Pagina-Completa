#!/usr/bin/env node
/* Copia a img/banderas/ las banderas que usa la creación de gafetes.
 *
 * Son las de flag-icons (MIT, fijado en package.json), solo las de la tabla de
 * js/gafetes-banderas.js, byte a byte como vienen en el paquete. No se editan
 * a mano: se corre esto después de `npm install`. Borra las que sobran (una
 * federación que salió de la tabla) para que la carpeta diga lo mismo que ella.
 *
 *   node herramientas/gafetes-banderas.js              copia
 *   node herramientas/gafetes-banderas.js --comprobar  solo dice si están al día
 *
 * Ver «Creación de gafetes» en docs/decisiones/paneles.md.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const DESTINO = path.join(RAIZ, "img", "banderas");
const { FIDE } = require(path.join(RAIZ, "js", "gafetes-banderas.js"));
const comprobar = process.argv.includes("--comprobar");

let origen;
try {
  origen = path.join(path.dirname(require.resolve("flag-icons/package.json", { paths: [RAIZ] })), "flags", "4x3");
} catch (e) {
  console.error("Falta flag-icons: correr `npm install` primero.");
  process.exit(1);
}

const isos = [...new Set(Object.values(FIDE))].sort();
const problemas = [];
if (!comprobar) fs.mkdirSync(DESTINO, { recursive: true });
for (const iso of isos) {
  const de = path.join(origen, iso + ".svg");
  const a = path.join(DESTINO, iso + ".svg");
  if (!fs.existsSync(de)) { problemas.push(`flag-icons no trae ${iso}.svg`); continue; }
  const bytes = fs.readFileSync(de);
  if (comprobar) {
    if (!fs.existsSync(a) || !fs.readFileSync(a).equals(bytes)) problemas.push(`img/banderas/${iso}.svg falta o no es la del paquete`);
  } else fs.writeFileSync(a, bytes);
}
const sobran = fs.existsSync(DESTINO) ? fs.readdirSync(DESTINO).filter((f) => !isos.includes(f.replace(/\.svg$/, ""))) : [];
for (const f of sobran) {
  if (comprobar) problemas.push(`img/banderas/${f} no está en la tabla`);
  else fs.unlinkSync(path.join(DESTINO, f));
}

if (problemas.length) {
  for (const p of problemas) console.log("  ✗ " + p);
  process.exit(1);
}
console.log(comprobar ? `Las ${isos.length} banderas están al día.` : `${isos.length} banderas copiadas a img/banderas/.`);
