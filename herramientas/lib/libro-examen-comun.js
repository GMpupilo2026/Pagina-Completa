/* Lo que comparten los dos PDF de «Ponte a prueba»: el libro
 * (herramientas/libro-examen-pdf.js) y los cuadernillos de cada versión para
 * imprimir (herramientas/libro-examen-versiones-pdf.js).
 *
 * Vive acá porque una segunda copia se iría separando de la primera a la
 * primera corrección: el diagrama, el logo y la marca de agua, y sobre todo la
 * tabla de puntos a fuerza, que tiene que dar lo mismo en el libro y en el
 * cuadernillo para las mismas posiciones.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { tablero } = require("./tablero-svg.js");

const RAIZ = path.join(__dirname, "..", "..");
const LETRAS = ["a", "b", "c", "d"];

/* El banco: material/ponte-a-prueba/banco.js (lo arma libro-examen-generar.js). */
function banco() {
  const w = {};
  new Function("window", fs.readFileSync(path.join(RAIZ, "material", "ponte-a-prueba", "banco.js"), "utf8"))(w);
  return { LIBRO: w.LIBRO_EXAMEN, ITEMS: w.LIBRO_EXAMEN_ITEMS };
}

/* El logo va incrustado: la maqueta se imprime desde /tmp y desde ahí no
   alcanzaría los archivos de img/. */
function incrustar(relativo) {
  return "data:image/png;base64," + fs.readFileSync(path.join(RAIZ, relativo)).toString("base64");
}
const LOGO_CREMA = incrustar("img/logo-oscar-angulo.png");
const LOGO_MARCA = incrustar("img/logo-oscar-angulo-marca.png");

function esc(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function puntosTexto(p) {
  return p > 0 ? `+${p}` : p < 0 ? `−${-p}` : "0";
}

/* ---------------------------------------------------------- las tablas
   Para una fuerza R, cada posición se acierta con probabilidad
   0,25 + 0,75 / (1 + 10^((elo − R)/400)) —0,25 es acertar al azar entre
   cuatro—, y al fallar se cobra el promedio de las otras opciones. Los puntos
   esperados de cada fuerza son la tabla. */
const AZAR = 0.25;
function acierto(elo, R) {
  return AZAR + (1 - AZAR) / (1 + Math.pow(10, (elo - R) / 400));
}
function promedioDeLasOtras(puntos, correcta) {
  const otras = puntos.filter((_, i) => i !== correcta);
  return otras.reduce((a, b) => a + b, 0) / otras.length;
}
function esperado(items, R) {
  return items.reduce((s, it) => {
    const p = acierto(it.elo, R);
    return s
      + p * 5 + (1 - p) * promedioDeLasOtras(it.jugada.puntos, it.jugada.correcta)
      + p * 5 + (1 - p) * promedioDeLasOtras(it.evaluacion.puntos, it.evaluacion.correcta);
  }, 0);
}
const ELO_MIN = 600, ELO_MAX = 2200, PASO = 100;
const FUERZAS = [];
for (let r = ELO_MIN; r <= ELO_MAX; r += PASO) FUERZAS.push(r);

/* Desde cuántos puntos corresponde cada fuerza: el punto medio entre la
   fuerza y la de abajo. Así cada renglón cubre un tramo y no hay huecos.
   `paso` permite una tabla más gruesa cuando hay pocas posiciones: con diez,
   distinguir de a 100 puntos sería prometer una precisión que no hay. */
function filasTablaPuntos(items, maximo, paso) {
  const salto = paso || PASO;
  const fuerzas = FUERZAS.filter((r) => (r - ELO_MIN) % salto === 0);
  const t = fuerzas.map((r) => ({ r, desde: Math.round(esperado(items, r - salto / 2)) }));
  return t.map((f, i) => {
    const hasta = i + 1 < t.length ? t[i + 1].desde - 1 : maximo;
    const rango = i === 0 ? `hasta ${hasta}` : i + 1 === t.length ? `${f.desde} o más` : `${f.desde} a ${hasta}`;
    const fuerza = i === 0 ? `${f.r} o menos` : i + 1 === t.length ? `${f.r} o más` : String(f.r);
    return `<tr><td class="num">${rango}</td><td class="num"><strong>${fuerza}</strong></td></tr>`;
  }).join("");
}

/* ---------------------------------------------------------- la posición */
function diagrama(item, n) {
  return `<div class="diagrama">${tablero(item.fen, {
    coordenadas: true, destacar: item.marca,
    titulo: `Posición ${n}. Juegan las blancas.`,
  })}<p class="turno">Juegan las blancas</p></div>`;
}

/* La marca de agua: el logo, inclinado y tenue, en su propia hoja. Se estampa
   con pypdf (lib/pdf-armar.js), no con CSS: ver diagnostico-libro.js. */
const htmlMarca = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; width: 210mm; height: 297mm; }
  .sello { position: absolute; left: 52.5mm; top: 109mm; width: 105mm; transform: rotate(-15deg); opacity: .11; }
  .sello img { display: block; width: 105mm; height: auto; }
</style>
</head><body><div class="sello"><img src="${LOGO_MARCA}" alt=""></div></body></html>`;

module.exports = {
  RAIZ, LETRAS, banco, LOGO_CREMA, LOGO_MARCA, esc, puntosTexto,
  acierto, esperado, FUERZAS, filasTablaPuntos, diagrama, htmlMarca,
};
