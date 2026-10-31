/* Verifica la lista de herramientas de arbitraje (js/herramientas-arbitraje.js),
 * la que pinta la vitrina (herramientas-arbitraje.html):
 *   - que el enlace de cada herramienta lleve a una página que existe;
 *   - que cada `imagen` exista, mida lo que dice (sin eso la página salta al
 *     cargarla) y tenga un `alt` que la describa;
 *   - que Notara, la cámara que lee el tablero, esté: gratis (no lleva
 *     licencia), en Arbitraje y abriendo camara-tablero.html.
 * Sin navegador.
 *
 *   node herramientas/verificar-herramientas-vitrina.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const ok = JSON.stringify(hallado) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log((ok ? "  ✓ " : "  ✗ ") + nombre + (ok ? "" : " — hallado " + JSON.stringify(hallado) + ", se esperaba " + JSON.stringify(esperado)));
}

const ventana = {};
new Function("window", fs.readFileSync(path.join(RAIZ, "js", "herramientas-arbitraje.js"), "utf8"))(ventana);
const { LISTA } = ventana.HerramientasArbitraje;

// El tamaño de un JPEG o un PNG, leído de su cabecera.
function tamano(archivo) {
  const b = fs.readFileSync(archivo);
  if (b[0] === 0x89 && b.toString("ascii", 1, 4) === "PNG") return [b.readUInt32BE(16), b.readUInt32BE(20)];
  for (let i = 2; i < b.length;) {
    if (b[i] !== 0xff) return null;
    const marca = b[i + 1], largo = b.readUInt16BE(i + 2);
    if (marca >= 0xc0 && marca <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marca)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + largo;
  }
  return null;
}

console.log("\nLos enlaces de cada herramienta");
const rotos = LISTA.filter((h) => h.disponible && h.href).map((h) => h.href.split(/[#?]/)[0]).filter((f) => !fs.existsSync(path.join(RAIZ, f)));
igual("cada herramienta lleva a una página que existe", rotos, []);

console.log("\nLas imágenes de las tarjetas");
const conImagen = LISTA.filter((h) => h.imagen);
for (const h of conImagen) {
  const archivo = path.join(RAIZ, h.imagen.src);
  const existe = fs.existsSync(archivo);
  igual("«" + (h.corto || h.nombre) + "»: la imagen existe", existe, true);
  if (existe) igual("«" + (h.corto || h.nombre) + "»: mide lo que dice (ancho y alto)", tamano(archivo), [h.imagen.ancho, h.imagen.alto]);
  igual("«" + (h.corto || h.nombre) + "»: tiene un alt que la describe", typeof h.imagen.alt === "string" && h.imagen.alt.trim().length >= 40, true);
}

console.log("\nNotara en la vitrina");
const notara = LISTA.find((h) => h.id === "notara");
igual("está, en Arbitraje, gratis y abriendo la cámara", notara && [notara.tema, !!notara.gratis, notara.disponible, notara.href, notara.corto], ["arbitraje", true, true, "camara-tablero.html", "Notara"]);
igual("con su imagen", !!(notara && notara.imagen), true);

console.log(fallos ? "\n✗ " + fallos + " comprobaciones fallaron." : "\nLa lista de herramientas está como se pidió.");
process.exit(fallos ? 1 : 0);
