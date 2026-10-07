/* ===== El libro «Coachess en resumen» =====
 *
 * Arma material/coachess-resumen/coachess-resumen.pdf: un resumen, capítulo
 * por capítulo, de «Coachess: inteligencia del ajedrez para tu desarrollo
 * personal y profesional» (Daniel Muñoz Sánchez, 2022). Lo pidió el dueño a
 * partir del libro que tiene en su Drive («Desarrollo personal»).
 *
 * Es un RESUMEN, no una copia: las ideas son del autor del libro y se le
 * atribuyen en la tapa, en cada página y al final; el texto está escrito
 * aparte, en tuteo, y no reproduce párrafos (el original prohíbe
 * reproducirlo). Ver «El libro “Coachess en resumen”» en
 * docs/decisiones/cursos-y-material.md.
 *
 * No decide nada: el texto sale de herramientas/libros/coachess-resumen.js, el
 * MISMO para el PDF y para la versión accesible
 * (coachess-resumen-accesible.html, sin imágenes, para lector de pantalla).
 *
 * Se cierra igual que los otros libros (tapa a página completa, marca de agua
 * con el logo en cada página del cuerpo y PDF protegido:
 * herramientas/lib/pdf-armar.js), y se deja imprimir.
 *
 * Cómo se corre (Node, Chromium por Playwright y pypdf):
 *
 *     node herramientas/coachess-resumen-pdf.js
 *     node herramientas/coachess-resumen-pdf.js --solo-accesible   # sin PDF ni pypdf
 *
 * Con CHROMIUM=/ruta/al/chrome se le puede indicar un Chromium ya instalado.
 * Lo revisa herramientas/verificar-coachess-resumen.py.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const RAIZ = path.join(__dirname, "..");
const { unir, proteger } = require("./lib/pdf-armar.js");
const N = require("./lib/notacion.js");
const L = require("./libros/coachess-resumen.js");

const CLAVE_PROPIETARIO = "coachess-resumen-oac-2026";
const CARPETA = path.join(RAIZ, "material", "coachess-resumen");
const ANIO = 2026;

function incrustar(relativo) {
  return "data:image/png;base64," + fs.readFileSync(path.join(RAIZ, relativo)).toString("base64");
}
const LOGO_CREMA = incrustar("img/logo-oscar-angulo.png");
const LOGO_MARCA = incrustar("img/logo-oscar-angulo-marca.png");

function esc(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
/* El texto del libro trae *cursiva* y **negrita** y nada más: se escapa
   primero y después se marcan. */
function md(t) {
  return esc(t).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

/* ---------------------------------------------------------- el contenido */
// Antes de imprimir, lo que no puede faltar: un capítulo sin consejos o sin
// idea central se imprime igual y nadie lo nota hasta leerlo.
let nCap = 0;
L.partes.forEach((p) => p.capitulos.forEach((c) => {
  c.n = ++nCap;
  c.parte = p;
  for (const campo of ["titulo", "idea", "parrafos", "consejos"]) {
    if (!c[campo] || (Array.isArray(c[campo]) && !c[campo].length)) throw new Error(`Al capítulo «${c.titulo}» le falta «${campo}».`);
  }
}));
const CAPITULOS = L.partes.flatMap((p) => p.capitulos);
if (L.veinteConsejos.length !== 20) throw new Error(`El epílogo trae ${L.veinteConsejos.length} consejos y son veinte.`);

const recuadro = (clase, titulo, cuerpo) => `<div class="${clase}"><p class="rotulo">${esc(titulo)}</p>${cuerpo}</div>`;

function capitulo(c) {
  return `<section class="capitulo">
    <h3><span class="nc">${c.n}</span>${esc(c.titulo)}</h3>
    ${c.cita ? `<p class="cita">«${esc(c.cita.texto)}» <span>— ${esc(c.cita.autor)}</span></p>` : ""}
    <p class="idea"><strong>La idea:</strong> ${md(c.idea)}</p>
    ${c.parrafos.map((p) => `<p>${md(p)}</p>`).join("")}
    ${c.tablero ? recuadro("tablero", "En el tablero", c.tablero.map((t) => `<p>${md(t)}</p>`).join("")) : ""}
    ${c.estudios && c.estudios.length ? recuadro("estudios", "Lo que dicen los estudios que cita", `<ul>${c.estudios.map((e) => `<li>${md(e)}</li>`).join("")}</ul>`) : ""}
    ${recuadro("consejos", "Para llevarlo a la práctica", `<ul>${c.consejos.map((e) => `<li>${md(e)}</li>`).join("")}</ul>`)}
  </section>`;
}

function parte(p) {
  return `<div class="pagina portadilla">
    <p class="eyebrow">${esc(p.rotulo)}</p>
    <h2>${esc(p.titulo)}</h2>
    <p>${md(p.intro)}</p>
    <ol class="indice-cap" start="${p.capitulos[0].n}">${p.capitulos.map((c) => `<li>${esc(c.titulo)}</li>`).join("")}</ol>
  </div>
  <div class="pagina">${p.capitulos.map(capitulo).join("")}</div>`;
}

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${esc(L.TITULO)} · cuerpo</title>
<style>
  @page { size: A4; margin: 16mm 17mm 15mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "DejaVu Serif", Georgia, "Times New Roman", serif; font-size: 10.6pt; line-height: 1.55; color: #102a43; }
  h2.titulo { font-size: 17pt; margin: 0 0 3mm; padding-bottom: 2mm; border-bottom: 2px solid #1f3b57; }
  h3 { font-size: 14pt; margin: 9mm 0 2mm; color: #102a43; page-break-after: avoid; }
  h3 .nc { display: inline-block; min-width: 8.5mm; height: 8.5mm; line-height: 8.5mm; text-align: center; border-radius: 50%; background: #1f6f6b; color: #fff; font-size: 10pt; margin-right: 2.5mm; font-family: "DejaVu Sans", Arial, sans-serif; }
  .capitulo:first-child h3 { margin-top: 0; }
  p { margin: 0 0 2.6mm; text-align: justify; }
  .pagina { page-break-before: always; }
  .cita { font-style: italic; color: #486581; margin: 0 0 3mm; text-align: left; }
  .cita span { font-style: normal; font-size: 9pt; }
  .idea { background: #eef7f6; border-left: 3px solid #1f6f6b; padding: 2.5mm 4mm; text-align: left; }
  .rotulo { font-family: "DejaVu Sans", Arial, sans-serif; font-size: 8.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; margin: 0 0 1.5mm; text-align: left; }
  .tablero, .estudios, .consejos { padding: 2.5mm 4mm; margin: 3mm 0; font-size: 9.6pt; page-break-inside: avoid; }
  .tablero { background: #f6f1e7; border-left: 3px solid #8a5a12; }
  .tablero .rotulo { color: #7a4f0f; }
  .estudios { background: #f0f4f8; border-left: 3px solid #486581; }
  .estudios .rotulo { color: #334e68; }
  .consejos { background: #fbf3f1; border-left: 3px solid #a33a2a; }
  .consejos .rotulo { color: #8f2f21; }
  .tablero p:last-child { margin-bottom: 0; }
  ul { margin: 0; padding-left: 5mm; }
  ol { margin: 0; padding-left: 8mm; }
  li { margin-bottom: 1.2mm; }
  .portadilla { padding-top: 55mm; text-align: center; }
  .portadilla .eyebrow { font-size: 10pt; letter-spacing: .22em; text-transform: uppercase; color: #1f6f6b; margin: 0 0 4mm; text-align: center; }
  .portadilla h2 { font-size: 26pt; margin: 0 0 9mm; line-height: 1.2; }
  .portadilla p { max-width: 135mm; margin: 0 auto 7mm; font-size: 11pt; text-align: center; }
  ol.indice-cap { display: inline-block; text-align: left; font-size: 11pt; margin: 0 auto; }
  .nota { background: #f0f4f8; border-left: 3px solid #486581; padding: 2.5mm 4mm; margin: 4mm 0; font-size: 9.6pt; }
  .nota p:last-child { margin-bottom: 0; }
  ol.claves > li { margin-bottom: 2.4mm; }
  table.indice { border-collapse: collapse; width: 100%; margin-top: 3mm; }
  .indice th, .indice td { border-bottom: 1px solid #d9e2ec; padding: 1.4mm 2.5mm; text-align: left; vertical-align: top; }
  .indice th { font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; color: #627d98; font-family: "DejaVu Sans", Arial, sans-serif; }
  ol.veinte { columns: 1; }
  ol.veinte li { margin-bottom: 2.2mm; page-break-inside: avoid; }
  table.repaso { border-collapse: collapse; width: 100%; font-size: 9.5pt; }
  .repaso th, .repaso td { border: .5pt solid #9fb3c8; padding: 1.6mm 2.5mm; text-align: left; vertical-align: top; }
  .repaso th { background: #f0f4f8; color: #334e68; font-family: "DejaVu Sans", Arial, sans-serif; font-size: 8.5pt; }
  .repaso td.raya { height: 13mm; }
</style>
</head><body>

<div>
  <h2 class="titulo">Antes de empezar</h2>
  ${L.presentacion.map((p) => `<p>${md(p)}</p>`).join("")}
  <div class="nota">${L.aviso.map((p) => `<p>${md(p)}</p>`).join("")}</div>

  <h2 class="titulo pagina">El libro en una página</h2>
  <p>Si solo tienes cinco minutos, esto es lo más importante:</p>
  <ol class="claves">${L.ideasClave.map((i) => `<li>${md(i)}</li>`).join("")}</ol>

  <h2 class="titulo pagina">Índice</h2>
  <table class="indice">
    <tr><th>Parte</th><th>Capítulos</th></tr>
    ${L.partes.map((p) => `<tr><td><strong>${esc(p.rotulo)}.</strong> ${esc(p.titulo)}</td><td>${p.capitulos.map((c) => `${c.n}. ${esc(c.titulo)}`).join("<br>")}</td></tr>`).join("")}
    <tr><td><strong>Para cerrar</strong></td><td>Los veinte consejos del autor<br>Tu plan: del tablero a tu vida</td></tr>
  </table>
</div>

${L.partes.map(parte).join("")}

<div class="pagina">
  <h2 class="titulo">Los veinte consejos del autor</h2>
  <p>El libro termina con veinte consejos prácticos que reúnen todo lo anterior. Aquí van, contados con otras palabras:</p>
  <ol class="veinte">${L.veinteConsejos.map((c) => `<li>${md(c)}</li>`).join("")}</ol>
</div>

<div class="pagina">
  <h2 class="titulo">Tu plan: del tablero a tu vida</h2>
  <p>Leer sobre una idea no cambia nada; probarla una semana, sí. Elige tres ideas de este libro, escribe dónde las vas a
  usar y vuelve a esta página dentro de un mes.</p>
  <table class="repaso">
    <tr><th style="width:34%">La idea</th><th style="width:33%">Dónde la voy a usar</th><th>Cómo me fue (en un mes)</th></tr>
    ${"<tr><td class=\"raya\"></td><td></td><td></td></tr>".repeat(3)}
  </table>
  <h3>Preguntas para conversar</h3>
  <p class="cita">Para un grupo de estudio, una clase o una charla con tu profesor.</p>
  <ol>${L.preguntas.map((q) => `<li>${md(q)}</li>`).join("")}</ol>
</div>

<div class="pagina">
  <h2 class="titulo">Sobre este resumen</h2>
  ${L.creditos.map((p) => `<p>${md(p)}</p>`).join("")}
  <div class="nota" style="margin-top:8mm"><p><strong>${esc(L.RESUMIDO_POR)}</strong> · Academia Ajedrez Integral, ${ANIO}.
  Resumen de <em>${esc(L.OBRA)}</em>, de ${esc(L.AUTOR_ORIGINAL)}. Las ideas son de su autor; el texto de este resumen
  es propio y no reproduce el original.</p></div>
</div>

</body></html>`;

/* ---------------------------------------------------------- la tapa */
const htmlPortada = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${esc(L.TITULO)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { width: 210mm; height: 297mm; font-family: "DejaVu Serif", Georgia, serif; color: #f0f4f8;
         background: linear-gradient(158deg, #08262a 0%, #0f3d42 50%, #061b1e 100%); position: relative; overflow: hidden; }
  /* Los adornos van dentro de su propio recorte: overflow:hidden en el body se
     propaga al viewport y Chromium encoge la tapa (ver diagnostico-libro.js). */
  .fondo { position: absolute; inset: 0; overflow: hidden; }
  .tablero-fondo { position: absolute; right: -40mm; top: 120mm; width: 150mm; height: 150mm;
      background-image:
        linear-gradient(45deg, rgba(240,180,41,.12) 25%, transparent 25%, transparent 75%, rgba(240,180,41,.12) 75%),
        linear-gradient(45deg, rgba(240,180,41,.12) 25%, transparent 25%, transparent 75%, rgba(240,180,41,.12) 75%);
      background-size: 20mm 20mm; background-position: 0 0, 10mm 10mm; transform: rotate(14deg); }
  .brillo { position: absolute; left: -40mm; top: -50mm; width: 150mm; height: 150mm; border-radius: 50%;
      background: radial-gradient(circle, rgba(120,210,200,.18) 0%, rgba(120,210,200,0) 70%); }
  .lomo { position: absolute; left: 0; top: 0; bottom: 0; width: 7mm; background: linear-gradient(180deg, #de911d, #b4740f); }
  .hoja { position: relative; z-index: 2; height: 297mm; padding: 26mm 20mm 20mm 27mm; display: flex; flex-direction: column; }
  .marca-casa { font-size: 10pt; letter-spacing: .28em; text-transform: uppercase; color: #f0b429; font-weight: 700; margin: 0; }
  .centro { margin-top: auto; margin-bottom: auto; }
  .eyebrow { font-size: 10pt; letter-spacing: .22em; text-transform: uppercase; color: #a9d8d2; margin: 0 0 6mm; }
  h1 { font-size: 56pt; line-height: 1; margin: 0; color: #ffffff; font-weight: 700; letter-spacing: -.015em; }
  h1 .segunda { display: block; color: #f0b429; font-size: 34pt; margin-top: 3mm; }
  .filete { width: 46mm; height: 1.4mm; background: #de911d; margin: 8mm 0 7mm; }
  .sub { font-size: 13.5pt; line-height: 1.5; color: #d7ecea; margin: 0; max-width: 130mm; }
  .cifras { margin: 9mm 0 0; display: flex; gap: 10mm; }
  .cifra { border-left: .8mm solid rgba(240,180,41,.55); padding-left: 4mm; }
  .cifra .n { display: block; font-size: 21pt; font-weight: 700; color: #ffffff; line-height: 1.1; }
  .cifra .q { display: block; font-size: 8pt; letter-spacing: .12em; text-transform: uppercase; color: #a9d8d2; margin-top: 1mm; }
  .logo { display: block; width: 80mm; height: auto; margin: 10mm 0 0; }
  .pie-tapa { margin-top: auto; }
  .original { font-size: 10pt; color: #d7ecea; margin: 0 0 5mm; max-width: 140mm; line-height: 1.45; }
  .autor { font-size: 15pt; font-weight: 700; color: #ffffff; margin: 0; }
  .autor-rol { font-size: 8.5pt; letter-spacing: .18em; text-transform: uppercase; color: #f0b429; margin: 1.5mm 0 0; }
  .editorial { margin: 7mm 0 0; padding-top: 4mm; border-top: 1px solid rgba(169,216,210,.3);
      font-size: 8.5pt; color: #a9d8d2; display: flex; justify-content: space-between; gap: 6mm; }
</style>
</head><body>
  <div class="fondo"><div class="tablero-fondo"></div><div class="brillo"></div></div>
  <div class="lomo"></div>
  <div class="hoja">
    <p class="marca-casa">&#9822; Ajedrez Integral</p>
    <div class="centro">
      <p class="eyebrow">Lo que el ajedrez enseña para la vida</p>
      <h1>Coachess<span class="segunda">en resumen</span></h1>
      <div class="filete"></div>
      <p class="sub">${esc(L.SUBTITULO)}</p>
      <div class="cifras">
        <div class="cifra"><span class="n">${L.partes.length}</span><span class="q">partes</span></div>
        <div class="cifra"><span class="n">${CAPITULOS.length}</span><span class="q">capítulos</span></div>
        <div class="cifra"><span class="n">20</span><span class="q">consejos</span></div>
      </div>
      <img class="logo" src="${LOGO_CREMA}" alt="Oscar Angulo Cubero · Profesional de Ajedrez">
    </div>
    <div class="pie-tapa">
      <p class="original">Resumen de <em>${esc(L.OBRA)}</em>, de <strong>${esc(L.AUTOR_ORIGINAL)}</strong>.</p>
      <p class="autor">Resumen: ${esc(L.RESUMIDO_POR)}</p>
      <p class="autor-rol">Academia Ajedrez Integral</p>
      <div class="editorial"><span>Las ideas son del autor del libro; el texto del resumen es propio</span><span>${ANIO}</span></div>
    </div>
  </div>
</body></html>`;

/* La marca de agua: el logo, inclinado y tenue, en su propia hoja. */
const htmlMarca = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; width: 210mm; height: 297mm; }
  .sello { position: absolute; left: 52.5mm; top: 109mm; width: 105mm; transform: rotate(-15deg); opacity: .09; }
  .sello img { display: block; width: 105mm; height: auto; }
</style>
</head><body><div class="sello"><img src="${LOGO_MARCA}" alt=""></div></body></html>`;

/* ---------------------------------------------------------- accesible */
/* El mismo texto, sin una sola imagen ni recuadros de color: los recuadros
   van como subtítulos, que es como se recorren con lector de pantalla. */
function accesible() {
  // Las jugadas van dichas («dama g 7»), que es como se entienden con lector de pantalla.
  const oido = (t) => N.textoHablado(t, "espanol");
  const capituloA = (c) => `<section><h3>Capítulo ${c.n}: ${esc(c.titulo)}</h3>
    ${c.cita ? `<p><em>«${esc(c.cita.texto)}»</em> (${esc(c.cita.autor)})</p>` : ""}
    <p><strong>La idea:</strong> ${md(c.idea)}</p>
    ${c.parrafos.map((p) => `<p>${md(p)}</p>`).join("")}
    ${c.tablero ? `<h4>En el tablero</h4>${c.tablero.map((t) => `<p>${md(oido(t))}</p>`).join("")}` : ""}
    ${c.estudios && c.estudios.length ? `<h4>Lo que dicen los estudios que cita</h4><ul>${c.estudios.map((e) => `<li>${md(e)}</li>`).join("")}</ul>` : ""}
    <h4>Para llevarlo a la práctica</h4><ul>${c.consejos.map((e) => `<li>${md(e)}</li>`).join("")}</ul>
  </section>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(L.TITULO)} — versión accesible</title>
<style>
  :root { color-scheme: light dark; }
  body { max-width: 42rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; background: #fff; color: #10202e;
         font-family: Georgia, "Times New Roman", serif; font-size: 1.15rem; line-height: 1.8; }
  h1 { font-size: 1.9rem; line-height: 1.25; }
  h2 { font-size: 1.45rem; margin-top: 2.5rem; border-bottom: 2px solid #10202e; padding-bottom: .3rem; }
  h3 { font-size: 1.2rem; margin: 2rem 0 .3rem; font-family: system-ui, sans-serif; }
  h4 { font-size: 1.05rem; margin: 1.4rem 0 .3rem; font-family: system-ui, sans-serif; }
  footer { margin-top: 3rem; border-top: 1px solid #c9d4de; padding-top: 1rem; font-size: .95rem; }
  @media (prefers-color-scheme: dark) {
    body { background: #10202e; color: #eef3f7; }
    h2 { border-color: #eef3f7; }
    footer { border-color: #3b5165; }
  }
</style>
</head><body>
<h1>${esc(L.TITULO)}</h1>
<p>Resumen de <em>${esc(L.OBRA)}</em>, de ${esc(L.AUTOR_ORIGINAL)}. Resumen preparado por ${esc(L.RESUMIDO_POR)}.
Es el mismo contenido del libro en PDF, escrito para leerse con lector de pantalla o con la letra agrandada, sin
ninguna imagen.</p>
<section><h2>Antes de empezar</h2>
${L.presentacion.map((p) => `<p>${md(p)}</p>`).join("")}
${L.aviso.map((p) => `<p>${md(p)}</p>`).join("")}
</section>
<section><h2>El libro en una página</h2>
<ol>${L.ideasClave.map((i) => `<li>${md(i)}</li>`).join("")}</ol>
</section>
${L.partes.map((p) => `<section><h2>${esc(p.rotulo)}: ${esc(p.titulo)}</h2>
<p>${md(p.intro)}</p>
${p.capitulos.map(capituloA).join("")}
</section>`).join("")}
<section><h2>Los veinte consejos del autor</h2>
<ol>${L.veinteConsejos.map((c) => `<li>${md(c)}</li>`).join("")}</ol>
</section>
<section><h2>Tu plan: del tablero a tu vida</h2>
<p>Elige tres ideas de este libro, escribe dónde las vas a usar y, dentro de un mes, anota cómo te fue.</p>
<h3>Preguntas para conversar</h3>
<ol>${L.preguntas.map((q) => `<li>${md(q)}</li>`).join("")}</ol>
</section>
<section><h2>Sobre este resumen</h2>
${L.creditos.map((p) => `<p>${md(p)}</p>`).join("")}
</section>
<footer>
  <p>${esc(L.RESUMIDO_POR)} · Academia Ajedrez Integral · ${ANIO}.</p>
  <p>Resumen de <em>${esc(L.OBRA)}</em>, de ${esc(L.AUTOR_ORIGINAL)}. Las ideas son de su autor; el texto del resumen es propio.</p>
</footer>
</body></html>`;
}

/* ---------------------------------------------------------- generar */
fs.mkdirSync(CARPETA, { recursive: true });
const tmp = os.tmpdir();
const htmlTemporal = path.join(tmp, "coachess-resumen-cuerpo.html");
const htmlPortadaTemporal = path.join(tmp, "coachess-resumen-tapa.html");
const htmlMarcaTemporal = path.join(tmp, "coachess-resumen-marca.html");
fs.writeFileSync(htmlTemporal, html);
fs.writeFileSync(htmlPortadaTemporal, htmlPortada);
fs.writeFileSync(htmlMarcaTemporal, htmlMarca);
const destinoAccesible = path.join(CARPETA, "coachess-resumen-accesible.html");
fs.writeFileSync(destinoAccesible, accesible());
console.log(`Maqueta: ${htmlTemporal}\nAccesible: ${destinoAccesible}`);
console.log(`${L.partes.length} partes · ${CAPITULOS.length} capítulos · ${L.veinteConsejos.length} consejos`);
if (process.argv.includes("--solo-accesible")) process.exit(0);

(async () => {
  const { chromium } = require("playwright");
  const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const destino = path.join(CARPETA, "coachess-resumen.pdf");
  const tapa = path.join(tmp, "coachess-resumen-tapa.pdf");
  const cuerpo = path.join(tmp, "coachess-resumen-cuerpo.pdf");
  const marca = path.join(tmp, "coachess-resumen-marca.pdf");
  const sinMargen = { top: 0, bottom: 0, left: 0, right: 0 };

  const pTapa = await navegador.newPage();
  await pTapa.goto("file://" + htmlPortadaTemporal, { waitUntil: "load" });
  await pTapa.pdf({ path: tapa, format: "A4", printBackground: true, margin: sinMargen });

  const pMarca = await navegador.newPage();
  await pMarca.goto("file://" + htmlMarcaTemporal, { waitUntil: "load" });
  await pMarca.pdf({ path: marca, format: "A4", printBackground: true, margin: sinMargen });

  const pagina = await navegador.newPage();
  await pagina.goto("file://" + htmlTemporal, { waitUntil: "load" });
  await pagina.pdf({
    path: cuerpo, format: "A4", printBackground: true,
    margin: { top: "16mm", bottom: "15mm", left: "17mm", right: "17mm" },
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate: `<div style="width:100%;font-size:7.5pt;color:#829ab1;font-family:Arial,sans-serif;padding:0 17mm;display:flex;justify-content:space-between;align-items:center;"><span>Coachess en resumen · ideas de ${esc(L.AUTOR_ORIGINAL)}</span><span style="font-weight:700;">${esc(L.RESUMIDO_POR)}</span><span class="pageNumber"></span></div>`,
  });
  await navegador.close();
  unir(tapa, cuerpo, marca, destino);
  proteger(destino, {
    clave: CLAVE_PROPIETARIO, autor: `${L.RESUMIDO_POR} (resumen de ${L.AUTOR_ORIGINAL})`, imprimir: true,
    titulo: "Coachess en resumen - lo que el ajedrez enseña para la vida personal y profesional",
    asunto: `Resumen de ${L.OBRA}, de ${L.AUTOR_ORIGINAL}`,
  });
  console.log("PDF listo:", destino);
})();
