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
 *   - la casilla de las Negras empieza un poco ANTES de NEGRAS_DESDE (0,565
 *     del bloque, medido desde el centro del número): así lo que se escribe
 *     al centro de cada casilla cae del lado bueno con margen. Lo comprueba
 *     verificar-planilla-pareo-pdf.js midiendo la planilla de verdad;
 *   - las rayas en gris claro y los renglones altos (9,2 mm): la letra no
 *     toca las rayas y Vision no junta dos renglones;
 *   - la marca de agua, tenue y en el encabezado, lejos de las casillas.
 *
 * Arriba, lo de siempre (torneo, ronda, mesa, jugadores, resultado y firmas)
 * y tres consejos para que se lea bien. Una planilla por hoja carta.
 *
 *     node herramientas/planilla-pareo-pdf.js
 *
 * Con CHROMIUM=/ruta/al/chrome se le puede indicar un Chromium ya instalado.
 * require() de este archivo devuelve { html, MEDIDAS } sin generar nada: lo
 * usa el verificador.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");
const DESTINO = path.join(RAIZ, "planilla-pareo-integral.pdf");

function incrustar(relativo) {
  return "data:image/png;base64," + fs.readFileSync(path.join(RAIZ, relativo)).toString("base64");
}

// Medidas en mm. Un bloque: número + Blancas + Negras.
const MEDIDAS = { numero: 9, blancas: 31, negras: 25, renglon: 9.2, separacion: 0 };
MEDIDAS.bloque = MEDIDAS.numero + MEDIDAS.blancas + MEDIDAS.negras + MEDIDAS.separacion;

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

function html() {
  const marca = incrustar(require("./lib/marca-agua").MARCA_AGUA);
  const campo = (etq, ancho) => `<div class="campo" style="flex:${ancho}"><span>${esc(etq)}</span><i></i></div>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Planilla de anotación — Pareo Integral</title>
<style>
  @page { size: Letter; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #fff; color: #111; font-family: "Helvetica Neue", Arial, sans-serif; }
  .hoja { width: 215.9mm; height: 279.4mm; padding: 9mm 10mm 7mm; position: relative; overflow: hidden; }
  .marca { position: absolute; top: 8mm; right: 11mm; width: 34mm; opacity: .16; }
  h1 { margin: 0 0 1mm; font-size: 15pt; letter-spacing: .02em; }
  .sub { margin: 0 0 3mm; font-size: 8.5pt; color: #333; }
  .fila { display: flex; gap: 4mm; margin-bottom: 2.6mm; margin-right: 40mm; }
  .campo { display: flex; align-items: flex-end; gap: 2mm; font-size: 9pt; font-weight: 600; white-space: nowrap; }
  .campo i { flex: 1; border-bottom: .3mm solid #555; height: 5.5mm; }
  .consejos { margin: 1mm 0 3mm; padding: 1.6mm 3mm; border: .3mm solid #888; border-radius: 1.5mm; font-size: 8pt; line-height: 1.35; }
  .consejos b { font-weight: 700; }
  .bloques { display: flex; width: ${MEDIDAS.bloque * 3}mm; }
  table.bloque { border-collapse: collapse; table-layout: fixed; width: ${MEDIDAS.bloque}mm; }
  th { height: 5.5mm; font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; background: #e9e9e9; border: .25mm solid #9a9a9a; }
  th.neg { background: #333; color: #fff; }
  td { height: ${MEDIDAS.renglon}mm; border: .25mm solid #b4b4b4; padding: 0; }
  td.n { text-align: center; font-weight: 700; font-size: 12pt; color: #000; background: #fff; }
  .pie { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 3.5mm; font-size: 9pt; }
  .resultado label { margin-right: 4mm; font-weight: 600; }
  .resultado .caja { display: inline-block; width: 4.5mm; height: 4.5mm; border: .3mm solid #333; vertical-align: -1mm; margin-right: 1.2mm; }
  .firma { width: 52mm; text-align: center; border-top: .3mm solid #555; padding-top: 1mm; font-size: 8pt; }
  .creditos { position: absolute; bottom: 3.5mm; left: 10mm; right: 10mm; font-size: 6.5pt; color: #777; text-align: center; }
</style></head><body><div class="hoja">
  <img class="marca" src="${marca}" alt="">
  <h1>Planilla de anotación</h1>
  <p class="sub">Pareo Integral · Ajedrez Integral</p>
  <div class="fila">${campo("Torneo:", 3.6)}${campo("Ronda:", 1.4)}${campo("Mesa:", 1.4)}${campo("Fecha:", 1.8)}</div>
  <div class="fila">${campo("Blancas:", 5)}${campo("Elo / ID FIDE:", 2.4)}</div>
  <div class="fila">${campo("Negras:", 5)}${campo("Elo / ID FIDE:", 2.4)}</div>
  <div class="consejos"><b>Para que la planilla se pueda leer con la cámara:</b>
    una jugada por casilla, en <b>letra de imprenta</b> y al centro de la casilla; no escribas sobre los números ni fuera de las casillas.
    Si te equivocas, tacha con una raya y escribe la buena al lado, dentro de la misma casilla.
    Para la foto: las dos planillas de frente, llenando la foto, con buena luz.</div>
  <div class="bloques">${bloque(0)}${bloque(1)}${bloque(2)}</div>
  <div class="pie">
    <div class="resultado"><label><span class="caja"></span>1-0</label><label><span class="caja"></span>½-½</label><label><span class="caja"></span>0-1</label></div>
    <div class="firma">Firma de las Blancas</div>
    <div class="firma">Firma de las Negras</div>
  </div>
  <div class="creditos">ajedrez-integral.com · Planilla para leer con «Planilla» (la cámara) de Pareo Integral</div>
</div></body></html>`;
}

module.exports = { html, MEDIDAS };

if (require.main === module) {
  (async () => {
    const { chromium } = require("playwright");
    const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
    const pagina = await navegador.newPage();
    await pagina.setContent(html(), { waitUntil: "load" });
    await pagina.pdf({ path: DESTINO, format: "Letter", printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
    await navegador.close();
    console.log("listo:", path.relative(RAIZ, DESTINO));
  })().catch((e) => { console.error(e); process.exit(1); });
}

/*! rev bfb5bbb0d2d82f9f */
