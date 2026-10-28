#!/usr/bin/env node
/* Comprueba las láminas que dibuja herramientas/formacion-laminas.js.
 *
 *   node herramientas/verificar-formacion-laminas.js
 *
 * - Hay una entrada de datos por cada diapositiva del JSON, y una imagen.
 * - Cada lámina dice poco: se cuentan las palabras que se VEN (título,
 *   encabezado y textos; no los números de artículo). Antes la Clase 1
 *   promediaba 88 y la más cargada pasaba de 140.
 * - Todo tablero pide una posición que la lámina tiene en su JSON.
 * - Las imágenes están al día con los datos: el generador deja la huella
 *   (sha-256 de los datos y del propio generador) y acá se vuelve a calcular.
 *   Cambiar una lámina sin volver a dibujarla deja la imagen diciendo otra
 *   cosa que la voz, y eso no da ningún error en la clase.
 */
const fs = require("fs");
const path = require("path");
const { huella, archivo } = require("./lib/formacion-huella");

const RAIZ = path.join(__dirname, "..");
const TOPE = 65, TOPE_TABLA = 90;
// En un cuadro cruzado las casillas son datos (un resultado, «5n ½», un
// puesto), no frases: se cuentan los encabezados, los nombres de los
// jugadores, la nota y la clave, con el tope de una tabla.
const CASILLA = /^(?:[\d¼½¾×—]+(?:[bn])?|libre)$/;
function textoCruzado(d) {
  const c = d.cuadro, jug = c.cab.indexOf("Jugador");
  const celdas = c.filas.flatMap((f) => f.map((x, k) => (k === jug ? x : String(x).split(/\s+/).filter((w) => !CASILLA.test(w)).join(" "))));
  return [d.k, d.nota, d.clave, c.cab.join(" ")].concat(celdas).join(" ");
}
const MARCA_TONOS = ["si", "no", "ojo", "info"];
let fallas = 0;
const cierto = (nombre, ok, detalle) => {
  console.log((ok ? "  ✓ " : "  ✗ ") + nombre + (ok || !detalle ? "" : "  → " + detalle));
  if (!ok) fallas++;
};

// Lo que se lee en la lámina: todo texto de los datos menos las claves que no
// son texto (el tipo, el tono, el ícono, el artículo) y las opciones del tablero.
function texto(o, clave) {
  if (typeof o === "string") return ["tipo", "tono", "ic", "a"].includes(clave) ? "" : o;
  if (Array.isArray(o)) return o.map((x) => texto(x)).join(" ");
  if (o && typeof o === "object") return Object.entries(o).map(([k, v]) => (k === "opciones" ? "" : texto(v, k))).join(" ");
  return "";
}
const palabras = (t) => t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

const clases = fs.readdirSync(path.join(__dirname, "datos"))
  .map((f) => /^formacion-laminas-(clase-\d+)\.js$/.exec(f)).filter(Boolean).map((m) => m[1]);
cierto("hay al menos una clase con láminas generadas", clases.length > 0);

for (const clase of clases) {
  console.log(clase);
  const carpeta = path.join(RAIZ, "cursos", "recursos", "formacion-ajedrez", "presentaciones", clase);
  const datos = require(path.join(__dirname, "datos", "formacion-laminas-" + clase + ".js"));
  const diapos = JSON.parse(fs.readFileSync(path.join(carpeta, "diapositivas.json"), "utf8")).diapositivas;
  cierto("una entrada de datos por diapositiva", datos.length === diapos.length, datos.length + " / " + diapos.length);

  const largas = [], sinPos = [], sinImagen = [], tonos = [];
  datos.forEach((d, i) => {
    const n = i + 1, dia = diapos[i] || {};
    const cuenta = palabras((dia.titulo || "") + " " + (d.tipo === "cruzado" ? textoCruzado(d) : texto(d)));
    if (cuenta > (d.tipo === "tabla" || d.tipo === "cruzado" ? TOPE_TABLA : TOPE)) largas.push(n + " (" + cuenta + ")");
    const pide = [];
    if (d.tipo === "tablero") pide.push(d.pos);
    if (d.tipo === "tableros") d.items.forEach((x) => pide.push(x.pos));
    pide.forEach((p) => { if (!(dia.posiciones || [])[p]) sinPos.push(n + "#" + p); });
    const img = path.join(carpeta, dia.imagen || "");
    const cab = fs.existsSync(img) ? fs.readFileSync(img).subarray(0, 12).toString("latin1") : "";
    if (!/^RIFF....WEBP$/s.test(cab)) sinImagen.push(n);
    JSON.stringify(d).replace(/"tono":"([^"]*)"/g, (_, t) => { if (!MARCA_TONOS.includes(t)) tonos.push(n + ":" + t); });
  });
  cierto("ninguna lámina pasa de " + TOPE + " palabras (" + TOPE_TABLA + " una tabla o un cuadro cruzado, sin contar sus resultados)", !largas.length, largas.join(", "));
  cierto("todo tablero pide una posición que la lámina tiene", !sinPos.length, sinPos.join(", "));
  cierto("cada lámina tiene su imagen WebP", !sinImagen.length, sinImagen.join(", "));
  cierto("los tonos son los que el generador conoce (cada uno con su palabra)", !tonos.length, tonos.join(", "));

  const guardada = archivo(clase);
  const actual = huella(clase);
  cierto("las imágenes están dibujadas con los datos de ahora", fs.existsSync(guardada) && fs.readFileSync(guardada, "utf8").trim() === actual,
    "corre: node herramientas/formacion-laminas.js " + clase);
}

if (fallas) { console.log("\n✗ " + fallas + " fallas"); process.exit(1); }
console.log("\n✓ Las láminas de Formación Ajedrez están bien");
