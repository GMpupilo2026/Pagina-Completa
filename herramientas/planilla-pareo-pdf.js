/* ===== La planilla para imprimir, hecha para «📷 Planilla» de Pareo Integral =====
 *
 * Arma planilla-pareo-integral.pdf (en la raíz: se descarga desde el sitio).
 * Es una planilla de anotación común, de 60 jugadas, pero dibujada a la medida
 * del lector de planillas (js/planilla-reconstruir.js, hojasDeLaFoto()), que se
 * guía por los números impresos para saber en qué casilla cae cada palabra:
 *
 *   - tres bloques de 20 renglones (1-20, 21-40, 41-60), cada uno con su
 *     columna de números, Blancas y Negras: el lector arma las columnas con
 *     los números y cuenta el bloque por la decena;
 *   - números grandes, en negrita y negro puro, sin nada pegado: son lo que
 *     Vision tiene que leer sí o sí;
 *   - Blancas y Negras del mismo ancho (lo pidió el dueño, 19/11). El lector
 *     parte las dos un poco más a la derecha de la raya (NEGRAS_DESDE, 0,565
 *     del bloque desde el centro del número, medido con las planillas de la
 *     FCA), así que una jugada de las Negras escrita muy pegada a la raya
 *     tiene unos 4 mm de margen; verificar-planilla-pareo-pdf.js lo comprueba
 *     con letra de tamaño normal, al centro y pegada a la raya;
 *   - las rayas en gris claro y los renglones altos: la letra no toca las
 *     rayas y Vision no junta dos renglones;
 *   - la marca de agua, tenue y en el encabezado, lejos de las casillas.
 *
 * Arriba, el nombre del torneo en grande (en lugar de «Planilla de
 * anotación»: así se gana espacio), ronda, mesa, fecha y los dos jugadores;
 * abajo, el resultado y las firmas con su espacio. De consejos, solo qué hacer
 * si uno se equivoca. Una planilla por hoja carta.
 *
 *     node herramientas/planilla-pareo-pdf.js
 *     node herramientas/planilla-pareo-pdf.js --torneo "Nombre del torneo" --salida otra.pdf
 *
 * Sin --torneo, el título es una raya para escribirlo a mano. Con
 * CHROMIUM=/ruta/al/chrome se le puede indicar un Chromium ya instalado.
 * require() de este archivo devuelve { html, MEDIDAS } sin generar nada: lo
 * usa el verificador.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");

function incrustar(relativo) {
  return "data:image/png;base64," + fs.readFileSync(path.join(RAIZ, relativo)).toString("base64");
}

// Medidas en mm. Un bloque: número + Blancas + Negras (las dos del mismo ancho).
const MEDIDAS = { numero: 8.3, blancas: 28.5, negras: 28.5, renglon: 10.2 };
MEDIDAS.bloque = MEDIDAS.numero + MEDIDAS.blancas + MEDIDAS.negras;

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

function bloque(b) {
  let filas = "";
  for (let f = 1; f <= 20; f++) {
    const n = b * 20 + f;
    filas += `<tr><td class="n" data-n="${n}">${n}</td><td class="c" data-celda="${n}b"></td><td class="c" data-celda="${n}n"></td></tr>`;
  }
  return `<table class="bloque" data-bloque="${b}">
    <colgroup><col style="width:${MEDIDAS.numero}mm"><col style="width:${MEDIDAS.blancas}mm"><col style="width:${MEDIDAS.negras}mm"></colgroup>
    <thead><tr><th>#</th><th>Blancas</th><th class="neg">Negras</th></tr></thead><tbody>${filas}</tbody></table>`;
}

function html(opciones) {
  const torneo = String((opciones && opciones.torneo) || "").trim();
  const marca = incrustar(require("./lib/marca-agua").MARCA_AGUA);
  const campo = (etq, ancho) => `<div class="campo" style="flex:${ancho}"><span>${esc(etq)}</span><i></i></div>`;
  const titulo = torneo ? `<h1>${esc(torneo)}</h1>` : `<h1 class="a-mano"><span>Torneo:</span><i></i></h1>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Planilla — ${esc(torneo || "Pareo Integral")}</title>
<style>
  @page { size: Letter; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #fff; color: #111; font-family: "Helvetica Neue", Arial, sans-serif; }
  .hoja { width: 215.9mm; height: 279.4mm; padding: 8mm 10mm 6mm; position: relative; overflow: hidden; }
  .marca { position: absolute; top: 5mm; right: 10mm; width: 26mm; opacity: .16; }
  .cabeza { margin-right: 30mm; }
  h1 { margin: 0 0 3mm; font-size: 17pt; line-height: 1.15; min-height: 8mm; }
  h1.a-mano { display: flex; align-items: flex-end; gap: 2mm; }
  h1.a-mano i { flex: 1; border-bottom: .3mm solid #555; height: 8mm; }
  .fila { display: flex; gap: 5mm; margin-bottom: 2.4mm; }
  .campo { display: flex; align-items: flex-end; gap: 2mm; font-size: 9.5pt; font-weight: 600; white-space: nowrap; }
  .campo i { flex: 1; border-bottom: .3mm solid #555; height: 6mm; }
  .aviso { margin: 0 0 2mm; font-size: 8.5pt; color: #222; }
  .bloques { display: flex; width: ${(MEDIDAS.bloque * 3).toFixed(1)}mm; }
  table.bloque { border-collapse: collapse; table-layout: fixed; width: ${MEDIDAS.bloque}mm; }
  th { height: 5.5mm; font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; background: #e9e9e9; border: .25mm solid #9a9a9a; }
  th.neg { background: #333; color: #fff; }
  td { height: ${MEDIDAS.renglon}mm; border: .25mm solid #b4b4b4; padding: 0; }
  td.n { text-align: center; font-weight: 700; font-size: 12pt; color: #000; background: #fff; }
  .pie { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 3mm; font-size: 9.5pt; }
  .resultado label { margin-right: 4mm; font-weight: 600; }
  .resultado .caja { display: inline-block; width: 5mm; height: 5mm; border: .3mm solid #333; vertical-align: -1.2mm; margin-right: 1.2mm; }
  .firma { width: 58mm; text-align: center; font-size: 8.5pt; }
  .firma i { display: block; height: 13mm; border-bottom: .3mm solid #555; margin-bottom: 1mm; }
  .creditos { position: absolute; bottom: 3mm; left: 10mm; right: 10mm; font-size: 6.5pt; color: #777; text-align: center; }
</style></head><body><div class="hoja">
  <img class="marca" src="${marca}" alt="">
  <div class="cabeza">
    ${titulo}
    <div class="fila">${campo("Ronda:", 1)}${campo("Mesa:", 1)}${campo("Fecha:", 1.6)}</div>
    <div class="fila">${campo("Blancas:", 1)}${campo("Negras:", 1)}</div>
  </div>
  <p class="aviso">Si te equivocas, tacha con una raya y escribe la jugada buena al lado, dentro de la misma casilla.</p>
  <div class="bloques">${bloque(0)}${bloque(1)}${bloque(2)}</div>
  <div class="pie">
    <div class="resultado"><label><span class="caja"></span>1-0</label><label><span class="caja"></span>½-½</label><label><span class="caja"></span>0-1</label></div>
    <div class="firma"><i></i>Firma de las Blancas</div>
    <div class="firma"><i></i>Firma de las Negras</div>
  </div>
  <div class="creditos">ajedrez-integral.com · Pareo Integral</div>
</div></body></html>`;
}

module.exports = { html, MEDIDAS };

if (require.main === module) {
  const arg = (nombre) => { const i = process.argv.indexOf(nombre); return i > 0 ? process.argv[i + 1] : undefined; };
  const destino = path.resolve(RAIZ, arg("--salida") || "planilla-pareo-integral.pdf");
  (async () => {
    const { chromium } = require("playwright");
    const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
    const pagina = await navegador.newPage();
    await pagina.setContent(html({ torneo: arg("--torneo") }), { waitUntil: "load" });
    await pagina.pdf({ path: destino, format: "Letter", printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
    await navegador.close();
    console.log("listo:", path.relative(RAIZ, destino));
  })().catch((e) => { console.error(e); process.exit(1); });
}

/*! rev bfb5bbb0d2d82f9f */
