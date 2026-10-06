/* ===== «Ponte a prueba»: las versiones para imprimir =====
 *
 * Cada prueba del libro tiene tres versiones (A, B y C) que no comparten
 * posiciones (herramientas/libro-examen-cuestionarios.js, que también las
 * carga como cuestionario en la plataforma). Este script las pone en papel:
 *
 *   material/ponte-a-prueba/versiones/prueba-<p>-version-<x>.pdf
 *       el cuadernillo del ALUMNO: sus 10 posiciones con las dos preguntas y la
 *       hoja de respuestas. Sin soluciones: se reparte.
 *   material/ponte-a-prueba/versiones/claves-de-correccion.pdf
 *       la clave del PROFE: la respuesta y los puntos de cada opción de las 18
 *       versiones, y la tabla de puntos a fuerza de cada una. No se reparte.
 *   material/ponte-a-prueba/ponte-a-prueba-versiones-accesible.html
 *       lo mismo para quien usa lector de pantalla: las posiciones contadas
 *       pieza por pieza, y las claves al final.
 *
 * Las versiones salen del MISMO módulo que los cuestionarios, con las opciones
 * en el MISMO orden: una clave sirve igual para el papel y para la pantalla, y
 * un grupo puede hacer la versión A en papel y otro la B en la plataforma.
 *
 * Los puntos son los del libro (la buena 5, una aceptable 1, una mala −1), así
 * que la tabla de fuerza es la misma cuenta que la del libro
 * (lib/libro-examen-comun.js), más gruesa: con diez posiciones no se puede
 * prometer más que de a 200 puntos.
 *
 * Cómo se corre (Node, Chromium por Playwright y pypdf):
 *
 *     node herramientas/libro-examen-versiones-pdf.js
 *     node herramientas/libro-examen-versiones-pdf.js --solo-accesible
 *
 * Con CHROMIUM=/ruta/al/chrome se le puede indicar un Chromium ya instalado.
 * Al volver a generar el banco o las versiones hay que volver a correr esto.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { Chess } = require("chess.js");
const { describir } = require("./lib/describir-fen.js");
const N = require("./lib/notacion.js");
const { unir, proteger } = require("./lib/pdf-armar.js");
const {
  RAIZ, LETRAS, banco, LOGO_CREMA, esc, puntosTexto, filasTablaPuntos, diagrama, htmlMarca,
} = require("./lib/libro-examen-comun.js");
const { cuestionarios } = require("./libro-examen-cuestionarios.js");

const { LIBRO, ITEMS } = banco();
const AUTOR = LIBRO.AUTOR;
const CLAVE_PROPIETARIO = "ponte-a-prueba-oac-2026";
const CARPETA = path.join(RAIZ, "material", "ponte-a-prueba", "versiones");
const ACCESIBLE = path.join(RAIZ, "material", "ponte-a-prueba", "ponte-a-prueba-versiones-accesible.html");
const ANIO = 2026;
const PASO_TABLA = 200;

const archivoDe = (v) => `prueba-${v.prueba}-version-${v.version.toLowerCase()}.pdf`;

/* ---------- cada versión, con lo que el papel necesita ----------
   Cada posición trae dos preguntas en el cuestionario (la evaluación y la
   jugada, en ese orden). Los puntos de cada opción se buscan en el banco por
   el TEXTO de la opción: así no dependen del orden en que quedaron. */
function versiones() {
  return cuestionarios().map((c) => {
    const posiciones = c.posiciones.map((id, i) => {
      const it = ITEMS.find((x) => x.id === id);
      if (!it) throw new Error(`La versión «${c.titulo}» nombra ${id}, que no está en el banco.`);
      const qEval = c.preguntas[2 * i];
      const qJug = c.preguntas[2 * i + 1];
      if (qEval.fen !== it.fen || qJug.fen !== it.fen) throw new Error(`En «${c.titulo}» las preguntas no van en pares con su posición.`);
      const puntosJug = qJug.opciones.map((t) => {
        const k = it.jugada.opciones.indexOf(t);
        if (k < 0) throw new Error(`La opción ${t} de «${c.titulo}» no está en el banco.`);
        return it.jugada.puntos[k];
      });
      return {
        n: i + 1, it,
        evaluacion: { opciones: qEval.opciones, correcta: qEval.correcta, puntos: it.evaluacion.puntos },
        jugada: { opciones: qJug.opciones, correcta: qJug.correcta, puntos: puntosJug },
      };
    });
    return Object.assign({}, c, { posiciones });
  });
}

/* ---------- el estilo, el mismo del libro ---------- */
const ESTILO = `
  @page { size: A4; margin: 15mm 15mm 15mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "DejaVu Serif", Georgia, "Times New Roman", serif; font-size: 10pt; line-height: 1.42; color: #102a43; }
  .pagina { page-break-before: always; }
  .junto, table, tr { page-break-inside: avoid; }
  h2.titulo { font-size: 16pt; margin: 0 0 3mm; padding-bottom: 2mm; border-bottom: 2px solid #334e68; }
  .mide { margin: 0 0 3mm; color: #334e68; }
  .nota { background: #f0f4f8; border-left: 3px solid #486581; padding: 2.5mm 4mm; margin: 3mm 0; font-size: 9pt; }
  .estrellas { color: #b4740f; letter-spacing: .06em; }
  .portada { display: flex; gap: 6mm; align-items: center; border-bottom: 2px solid #334e68; padding-bottom: 3mm; margin-bottom: 3mm; }
  /* El logo es crema, pensado para el fondo oscuro de la tapa del libro: sobre
     el blanco del papel casi no se ve, así que va en su recuadro azul. */
  .portada .logo { flex: none; background: #102a43; border-radius: 3mm; padding: 2mm 3mm; }
  .portada .logo img { display: block; width: 32mm; height: auto; }
  .portada h1 { font-size: 19pt; margin: 0; line-height: 1.15; }
  .portada .sub { margin: 1mm 0 0; color: #486581; font-size: 9.5pt; }
  .datos { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 5mm; margin: 3mm 0 3mm; font-size: 9pt; color: #486581; }
  .datos span { display: block; border-bottom: 1px solid #829ab1; height: 7mm; }
  ol.reglas { margin: 0 0 2mm 5mm; padding: 0; font-size: 9pt; }
  ol.reglas li { margin-bottom: .6mm; }

  .pregunta { page-break-inside: avoid; margin-bottom: 4mm; padding-bottom: 3.5mm; border-bottom: 1px solid #d9e2ec; }
  .cabecera { margin: 0 0 1.5mm; font-size: 9pt; color: #627d98; }
  .cabecera .num { display: inline-block; min-width: 10mm; font-weight: 700; color: #102a43; font-size: 12pt; }
  .con-tablero { display: flex; gap: 6mm; align-items: flex-start; }
  .diagrama { flex: none; width: 58mm; }
  .diagrama svg { width: 58mm; height: auto; display: block; }
  .turno { font-size: 7.5pt; color: #627d98; margin: 1mm 0 0; text-align: center; }
  .al-lado { flex: 1; }
  .ultima { margin: 0 0 2mm; font-size: 9.5pt; }
  .parte { margin: 2mm 0 1mm; font-weight: 700; }
  .etiqueta { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .08em; color: #627d98; margin-right: 1.5mm; }
  ol.opciones { list-style: none; padding: 0; margin: 0 0 0 3mm; font-size: 9.5pt; }
  ol.opciones li { margin-bottom: .7mm; }
  ol.dos { display: grid; grid-template-columns: 1fr 1fr; column-gap: 4mm; }
  ol.jugadas li { font-family: "DejaVu Sans", Arial, sans-serif; font-size: 10pt; }
  .letra { display: inline-block; min-width: 5mm; color: #627d98; }

  table.hoja { border-collapse: collapse; width: 100%; font-family: "DejaVu Sans", Arial, sans-serif; font-size: 10pt; margin-top: 3mm; }
  .hoja th, .hoja td { border: .5pt solid #9fb3c8; padding: 0 2mm; height: 9mm; text-align: center; }
  .hoja th { background: #f0f4f8; color: #334e68; font-size: 8.5pt; }
  .hoja td.num { font-weight: 700; width: 12mm; }
  .hoja .burbujas { letter-spacing: 3.5mm; color: #829ab1; }
  .hoja td.caja { width: 22mm; background: #fffaf0; }

  /* Una versión por página: así se imprime solo la clave que se va a usar. */
  .clave { page-break-before: always; }
  .clave h3 { font-size: 12pt; margin: 0 0 2mm; padding-bottom: 1mm; border-bottom: 1.5px solid #334e68; }
  table.respuestas { border-collapse: collapse; width: 100%; font-family: "DejaVu Sans", Arial, sans-serif; font-size: 7.8pt; }
  .respuestas th, .respuestas td { border: .4pt solid #d9e2ec; padding: .9mm 1.4mm; text-align: left; vertical-align: top; }
  .respuestas th { background: #f0f4f8; color: #486581; font-size: 7.5pt; }
  .respuestas td.num { font-weight: 700; text-align: center; width: 7mm; }
  .respuestas .bien { font-weight: 700; color: #0b6b3a; }
  .respuestas .linea { color: #486581; font-family: "DejaVu Serif", Georgia, serif; }
  table.fuerza { border-collapse: collapse; margin-top: 2mm; font-size: 8.5pt; }
  .fuerza th, .fuerza td { border-bottom: 1px solid #d9e2ec; padding: .8mm 3mm; text-align: left; }
  .fuerza th { font-size: 7.5pt; text-transform: uppercase; color: #627d98; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
`;

const ENCABEZADO_PIE = (texto) => ({
  displayHeaderFooter: true,
  headerTemplate: "<div></div>",
  footerTemplate: `<div style="width:100%;font-size:7.5pt;color:#9fb3c8;font-family:Arial,sans-serif;padding:0 15mm;display:flex;justify-content:space-between;align-items:center;"><span>${esc(texto)}</span><span style="font-weight:700;color:#829ab1;">${esc(AUTOR)}</span><span class="pageNumber"></span></div>`,
});

/* ---------- el cuadernillo del alumno ---------- */
function preguntaHtml(p) {
  const evals = p.evaluacion.opciones.map((t, i) => `<li><span class="letra">${LETRAS[i]})</span> ${esc(t)}</li>`).join("");
  const jugadas = p.jugada.opciones.map((t, i) => `<li><span class="letra">${LETRAS[i]})</span> 1.${esc(t)}</li>`).join("");
  return `<section class="pregunta">
    <div class="con-tablero">${diagrama(p.it, p.n)}
      <div class="al-lado">
        <p class="cabecera"><span class="num">${p.n}</span> <span class="estrellas">${"★".repeat(p.it.peso)}${"☆".repeat(5 - p.it.peso)}</span></p>
        <p class="ultima">Las negras acaban de jugar <strong>…${esc(p.it.ultima)}</strong>.</p>
        <p class="parte"><span class="etiqueta">Pregunta 1</span> Con la mejor jugada, ¿cuánto ganan las blancas?</p>
        <ol class="opciones dos">${evals}</ol>
        <p class="parte"><span class="etiqueta">Pregunta 2</span> ¿Cuál es la mejor jugada?</p>
        <ol class="opciones jugadas dos">${jugadas}</ol>
      </div>
    </div>
  </section>`;
}

function cuadernillo(v) {
  const filas = v.posiciones.map((p) => `<tr><td class="num">${p.n}</td>
      <td class="burbujas">○○○○</td><td class="burbujas">○○○○</td><td class="caja"></td></tr>`).join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${esc(v.titulo)}</title><style>${ESTILO}</style></head><body>
  <div class="portada">
    <div class="logo"><img src="${LOGO_CREMA}" alt="Oscar Angulo Cubero · Profesional de Ajedrez"></div>
    <div>
      <h1>${esc(LIBRO.TITULO)} · Prueba ${v.prueba}<br>Versión ${esc(v.version)}</h1>
      <p class="sub">Examen de ajedrez de ${esc(AUTOR)} · ${v.posiciones.length} posiciones, dos preguntas en cada una · hasta ${10 * v.posiciones.length} puntos</p>
    </div>
  </div>
  <div class="datos"><label>Nombre<span></span></label><label>Grupo<span></span></label><label>Fecha<span></span></label></div>
  <ol class="reglas">
    <li>En todas las posiciones juegan las blancas. La última jugada de las negras está marcada en el diagrama.</li>
    <li>No muevas las piezas: resuélvelo mirando. Tienes unos cinco minutos por posición.</li>
    <li>Marca tus respuestas en la hoja del final. No adivines: una respuesta mala puede restar.</li>
  </ol>
  <div class="nota"><strong>Pregunta 1, completa:</strong> con la mejor jugada, las blancas
    ${LIBRO.EVALUACION.map((t, i) => `<strong>${LETRAS[i]})</strong> ${esc(t.replace(/^Las blancas /, "").replace(/\.$/, ""))}`).join("; ")}.
    Una pieza menor vale unos 3 peones, una torre 5 y una dama 9.</div>
  ${v.posiciones.map(preguntaHtml).join("")}
  <div class="pagina junto">
    <h2 class="titulo">Hoja de respuestas · Prueba ${v.prueba}, versión ${esc(v.version)}</h2>
    <p class="mide">Rellena la letra de tu respuesta (a, b, c o d) en cada pregunta. La columna de puntos la llena quien corrige.</p>
    <table class="hoja">
      <tr><th>N.º</th><th>Pregunta 1<br>a b c d</th><th>Pregunta 2<br>a b c d</th><th>Puntos</th></tr>
      ${filas}
      <tr><th colspan="3" style="text-align:right">Total (de ${10 * v.posiciones.length})</th><td class="caja"></td></tr>
    </table>
  </div>
</body></html>`;
}

/* ---------- la clave del profe ---------- */
function opcionesConPuntos(q, conJugada) {
  return q.opciones.map((t, i) => {
    const txt = `${LETRAS[i]}) ${conJugada ? "1." + esc(t) + " " : ""}${puntosTexto(q.puntos[i])}`;
    return i === q.correcta ? `<span class="bien">${txt}</span>` : txt;
  }).join(" · ");
}

function claveHtml(v) {
  const filas = v.posiciones.map((p) => `<tr>
      <td class="num">${p.n}</td>
      <td><span class="bien">${LETRAS[p.evaluacion.correcta]})</span><br>${opcionesConPuntos(p.evaluacion, false)}</td>
      <td><span class="bien">${LETRAS[p.jugada.correcta]}) 1.${esc(p.jugada.opciones[p.jugada.correcta])}</span><br>${opcionesConPuntos(p.jugada, true)}<br><span class="linea">${esc(p.it.linea)}</span></td>
    </tr>`).join("");
  return `<section class="clave">
    <h3>Prueba ${v.prueba} · versión ${esc(v.version)}</h3>
    <table class="respuestas">
      <tr><th>N.º</th><th>Pregunta 1: la buena y los puntos de cada letra</th><th>Pregunta 2: la buena, los puntos de cada letra y la línea</th></tr>
      ${filas}
    </table>
    <table class="fuerza"><tr><th class="num">Puntos</th><th class="num">Fuerza estimada (Elo)</th></tr>
      ${filasTablaPuntos(v.posiciones.map((p) => p.it), 10 * v.posiciones.length, PASO_TABLA)}</table>
  </section>`;
}

function claves(vs) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${esc(LIBRO.TITULO)} · claves de corrección</title><style>${ESTILO}</style></head><body>
  <div class="portada">
    <div class="logo"><img src="${LOGO_CREMA}" alt="Oscar Angulo Cubero · Profesional de Ajedrez"></div>
    <div>
      <h1>${esc(LIBRO.TITULO)}<br>Claves de corrección</h1>
      <p class="sub">Las ${vs.length} versiones para imprimir · solo para quien corrige: no se reparte</p>
    </div>
  </div>
  <p class="mide">Cada posición vale hasta 10 puntos: 5 por la pregunta 1 y 5 por la pregunta 2. Junto a
  cada letra van sus puntos. En la pregunta 1, la vecina de la buena vale 1 (2 si la evaluación está en el
  borde) y una lectura muy lejana resta 1. En la pregunta 2, una jugada que deja a las blancas mejor sin ser
  la mejor vale 1, una que deja escapar la ventaja 0, y una que pierde resta 1.</p>
  <div class="nota">Las versiones son las mismas que están cargadas como cuestionario en la plataforma, con
  las opciones en el mismo orden: esta clave sirve igual para el papel y para la pantalla. Allá se califica
  solo bien o mal; acá, con los puntos de cada opción. La tabla de fuerza de cada versión es una estimación
  gruesa —con diez posiciones, unos 250 puntos para arriba o para abajo—: para medir de verdad están las
  seis pruebas completas del libro.</div>
  ${vs.map(claveHtml).join("")}
</body></html>`;
}

/* ---------- la versión accesible ---------- */
function accesible(vs) {
  const oido = (t) => N.textoHablado(t, "espanol");
  const cuerpo = vs.map((v) => `<section><h2>Prueba ${v.prueba}, versión ${esc(v.version)}</h2>
    ${v.posiciones.map((p) => {
      const d = describir(p.it.fen);
      return `<article><h3>Posición ${p.n} · dificultad ${p.it.peso} de 5</h3>
        <p class="posicion"><strong>La posición.</strong> ${d.turno} Piezas blancas: ${esc(d.blancas)}. Piezas negras: ${esc(d.negras)}.
        Las negras acaban de jugar ${esc(oido("…" + p.it.ultima))}.
        <span class="fen">FEN: ${esc(p.it.fen)}</span></p>
        <p><strong>Pregunta 1.</strong> Con la mejor jugada, ¿cuánto ganan las blancas?</p>
        <ol type="a">${p.evaluacion.opciones.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>
        <p><strong>Pregunta 2.</strong> ¿Cuál es la mejor jugada?</p>
        <ol type="a">${p.jugada.opciones.map((t) => `<li>${esc(oido("1." + t))}</li>`).join("")}</ol>
      </article>`;
    }).join("")}</section>`).join("");
  const respuestas = vs.map((v) => `<h3>Prueba ${v.prueba}, versión ${esc(v.version)}</h3><ol>${v.posiciones.map((p) =>
    `<li>Pregunta 1: ${LETRAS[p.evaluacion.correcta]}. Pregunta 2: ${LETRAS[p.jugada.correcta]}, ${esc(oido("1." + p.jugada.opciones[p.jugada.correcta]))}.</li>`).join("")}</ol>`).join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Ponte a prueba, las versiones — versión accesible</title>
<style>
  :root { color-scheme: light dark; }
  body { max-width: 42rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; background: #fff; color: #10202e;
         font-family: Georgia, "Times New Roman", serif; font-size: 1.15rem; line-height: 1.8; }
  h1 { font-size: 1.9rem; line-height: 1.25; }
  h2 { font-size: 1.45rem; margin-top: 2.5rem; border-bottom: 2px solid #10202e; padding-bottom: .3rem; }
  h3 { font-size: 1.1rem; margin: 1.6rem 0 .3rem; font-family: system-ui, sans-serif; }
  article { border-top: 1px solid #c9d4de; padding-top: .3rem; }
  .posicion { background: #f1f5f8; padding: .7rem .9rem; }
  .fen { display: block; font-family: ui-monospace, monospace; font-size: .85em; word-break: break-all; }
  footer { margin-top: 3rem; border-top: 1px solid #c9d4de; padding-top: 1rem; font-size: .95rem; }
  @media (prefers-color-scheme: dark) {
    body { background: #10202e; color: #eef3f7; }
    h2 { border-color: #eef3f7; }
    .posicion { background: #1b3145; }
    article, footer { border-color: #3b5165; }
  }
</style>
</head><body>
<h1>Ponte a prueba: las versiones para imprimir</h1>
<p>Las ${vs.length} versiones de las pruebas del libro de ${esc(AUTOR)}, escritas para leerse con lector de
pantalla o con la letra agrandada: cada posición va contada pieza por pieza y con su FEN, y no hay ninguna
imagen. Son las mismas de los cuadernillos en PDF, con las opciones en el mismo orden.</p>
<p>En cada posición juegan las blancas y hay dos preguntas. Las respuestas están al final, en «Claves».</p>
${cuerpo}
<h2>Claves</h2>
<p>Para quien corrige. Los puntos de cada opción están en la clave en PDF.</p>
${respuestas}
<footer>
  <p>${esc(AUTOR)} · Academia Ajedrez Integral · ${ANIO}.</p>
  <p>Posiciones de la base abierta de ejercicios de Lichess (CC0), comprobadas con Stockfish 16.</p>
</footer>
</body></html>`;
}

/* ---------- generar ---------- */
function main() {
const vs = versiones();

// Lo que no puede fallar en papel: cada opción es legal en su posición, y la
// buena de la pregunta 2 es la solución guardada.
const INGLES = { R: "K", D: "Q", T: "R", A: "B", C: "N" };
vs.forEach((v) => v.posiciones.forEach((p) => {
  p.jugada.opciones.forEach((san, i) => {
    const m = new Chess(p.it.fen).move(san.replace(/^[RDTAC]/, (c) => INGLES[c]).replace(/=([DTAC])/, (_, c) => "=" + INGLES[c]));
    if (!m) throw new Error(`${v.titulo}, posición ${p.n}: la opción ${san} no es legal.`);
    if (i === p.jugada.correcta && (m.from !== p.it.solucion.from || m.to !== p.it.solucion.to)) {
      throw new Error(`${v.titulo}, posición ${p.n}: la buena no es la solución guardada.`);
    }
  });
}));

fs.mkdirSync(CARPETA, { recursive: true });
fs.writeFileSync(ACCESIBLE, accesible(vs));
console.log(`${vs.length} versiones · accesible: ${path.relative(RAIZ, ACCESIBLE)}`);
if (process.argv.includes("--solo-accesible")) process.exit(0);

(async () => {
  const { chromium } = require("playwright");
  const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const tmp = os.tmpdir();
  const marca = path.join(tmp, "ponte-a-prueba-versiones-marca.pdf");
  const pMarca = await navegador.newPage();
  await pMarca.setContent(htmlMarca, { waitUntil: "load" });
  await pMarca.pdf({ path: marca, format: "A4", printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });

  async function imprimir(html, destino, pie, datos) {
    const crudo = path.join(tmp, "ponte-a-prueba-versiones-cuerpo.pdf");
    const pagina = await navegador.newPage();
    await pagina.setContent(html, { waitUntil: "load" });
    await pagina.pdf(Object.assign({ path: crudo, format: "A4", printBackground: true,
      margin: { top: "15mm", bottom: "15mm", left: "15mm", right: "15mm" } }, ENCABEZADO_PIE(pie)));
    await pagina.close();
    unir(null, crudo, marca, destino);
    proteger(destino, Object.assign({ clave: CLAVE_PROPIETARIO, autor: AUTOR, imprimir: true }, datos));
  }

  for (const v of vs) {
    await imprimir(cuadernillo(v), path.join(CARPETA, archivoDe(v)),
      `${LIBRO.TITULO} · Prueba ${v.prueba} · versión ${v.version}`,
      { titulo: `Ponte a prueba - Prueba ${v.prueba} - version ${v.version}`, asunto: "Examen de ajedrez para el alumno" });
  }
  await imprimir(claves(vs), path.join(CARPETA, "claves-de-correccion.pdf"),
    `${LIBRO.TITULO} · claves de corrección · no se reparte`,
    { titulo: "Ponte a prueba - claves de correccion", asunto: "Respuestas y puntos de las versiones para imprimir" });
  await navegador.close();
  console.log(`Listo: ${vs.length} cuadernillos y las claves en ${path.relative(RAIZ, CARPETA)}/`);
})();
}

module.exports = { versiones, archivoDe };
if (require.main === module) main();
