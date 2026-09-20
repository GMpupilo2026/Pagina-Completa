/* ===== Generador de la GUÍA DEL PROFESOR =====
 *
 * Arma, desde UN solo contenido (herramientas/guia/contenido.json), tres
 * archivos que dicen exactamente lo mismo:
 *
 *   guia-del-profesor-presentacion.pdf   diapositivas 16:9, para proyectar
 *   guia-del-profesor.pdf                manual A4, para leer y consultar
 *   guia-del-profesor-accesible.html     el mismo contenido sin una sola imagen
 *
 * Son tres salidas y no tres documentos: si cada una se escribiera aparte, se
 * irían separando a la primera corrección y media capacitación quedaría
 * explicando algo que el manual ya no dice. Es la misma decisión que ya tomaron
 * `js/reporte-armar.js` (una estructura neutral, tres generadores) y el
 * `informe-html.ts` del correo a la casa.
 *
 * La marca de agua es la MISMA que la de los libros (el logo de Oscar Angulo
 * Cubero, rotado y al 11%), estampada con pypdf y no con CSS: con
 * `position: fixed` Chromium la repite en todas las páginas pero al paginar no
 * respeta el centrado y la marca sale corrida y cortada. Cada formato lleva su
 * propia hoja de sello, del tamaño exacto de SU página: una hoja A4 estampada
 * sobre una diapositiva apaisada dejaría la marca en una esquina.
 *
 * Lo que esta guía hace DISTINTO de los libros, a propósito: **sí se puede
 * imprimir**. Los tres libros (el del diagnóstico, el cuadernillo y el de
 * arbitraje) bloquean la impresión porque traen las respuestas de una prueba y
 * cuanto menos circulen, mejor. Esta guía es lo contrario: es material de
 * trabajo que el profesor quiere en papel al lado del teclado y proyectado en
 * una capacitación. Bloquearle la impresión sería estorbarle el uso para el que
 * existe. Lo que sí queda bloqueado es modificarla, que es lo que protege que
 * la copia que circula sea la que salió de acá.
 *
 * Cómo se corre (Node, Chromium por Playwright y pypdf, que no son parte del
 * sitio: son solo para generar los archivos):
 *
 *     npm install playwright
 *     pip install pypdf
 *     node herramientas/guia-profesores.js
 *
 * Con CHROMIUM=/ruta/al/chrome se le indica un Chromium ya instalado.
 * Con --solo-accesible rehace únicamente el HTML y no toca ningún PDF (ni
 * necesita playwright ni pypdf): los PDF salen distintos byte por byte en cada
 * corrida porque llevan la fecha adentro, así que retocar una línea del HTML no
 * tiene por qué mover dos binarios. Sin esa puerta, la tentación es editar el
 * HTML a mano y que el generador y lo generado se vayan separando.
 */
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");

const CONTENIDO = JSON.parse(fs.readFileSync(path.join(__dirname, "guia/contenido.json"), "utf8"));
const AUTOR = "IA Oscar Angulo Cubero";
const ANIO = new Date().getFullYear();
const SOLO_ACCESIBLE = process.argv.includes("--solo-accesible");

/* La contraseña de propietario no hace falta para abrir el archivo: solo para
   quitarle las restricciones. Vive acá a propósito, para poder volver a
   generarlo. */
const CLAVE_PROPIETARIO = "guia-profesores-ai-2026";

/* La diapositiva es 16:9 en milímetros, que es lo que entiende Chromium al
   imprimir. 338.667 × 190.5 es el 16:9 de toda la vida (13.333 × 7.5 pulgadas),
   el mismo tamaño con el que sale una diapositiva de PowerPoint. */
const LAMINA = { ancho: "338.667mm", alto: "190.5mm" };

/* El logo va incrustado como data URI: las maquetas se imprimen desde /tmp y
   desde ahí no alcanzarían los archivos de img/. */
function incrustar(relativo) {
  return "data:image/png;base64," + fs.readFileSync(path.join(RAIZ, relativo)).toString("base64");
}
const LOGO_CREMA = incrustar("img/logo-oscar-angulo.png");
const LOGO_MARCA = incrustar("img/logo-oscar-angulo-marca.png");

function esc(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* Las cuentas se hacen una vez y las usan los tres formatos: la portada de la
   presentación, la del manual y la entradilla del accesible tienen que decir el
   mismo número de capítulos y de láminas. */
const CAPITULOS = CONTENIDO.capitulos;
const TOTAL_LAMINAS = CAPITULOS.reduce((n, c) => n + c.laminas.length, 0);

/* ==========================================================================
   1. LA PRESENTACIÓN — diapositivas 16:9
   ========================================================================== */

/* Cuánto texto lleva la diapositiva decide su tamaño de letra. Sin esto, la
   lámina con seis pasos y tres advertencias se sale de la página y el desborde
   NO da ningún error: simplemente se imprime cortada, y de eso se entera quien
   está proyectando, delante de todos. */
function densidad(lamina) {
  const renglones = (lamina.pasos || []).length + (lamina.ojo || []).length;
  const letras = [lamina.intro || "", ...(lamina.pasos || []), ...(lamina.ojo || [])]
    .join(" ").length;
  if (renglones >= 8 || letras > 900) return "apretada";
  if (renglones >= 6 || letras > 620) return "justa";
  return "holgada";
}

function laminaHTML(lamina, cap, numero) {
  const pasos = (lamina.pasos || []).length
    ? `<ol class="pasos">${lamina.pasos.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>`
    : "";
  const ojo = (lamina.ojo || []).length
    ? `<div class="ojo"><p class="ojo-t">Ojo con esto</p><ul>${
        lamina.ojo.map((o) => `<li>${esc(o)}</li>`).join("")}</ul></div>`
    : "";
  return `<section class="diapo ${densidad(lamina)}">
  <header class="cinta"><span class="cap">${esc(cap.titulo)}</span><span class="num">${numero}</span></header>
  <h2>${esc(lamina.titulo)}</h2>
  ${lamina.donde ? `<p class="donde">${esc(lamina.donde)}</p>` : ""}
  ${lamina.intro ? `<p class="intro">${esc(lamina.intro)}</p>` : ""}
  <div class="cuerpo">${pasos}${ojo}</div>
  <footer class="pie"><span>Ajedrez Integral · Guía del profesor</span><span>${esc(AUTOR)}</span></footer>
</section>`;
}

function separadorHTML(cap, indice) {
  return `<section class="diapo separador">
  <p class="capnum">Capítulo ${indice}</p>
  <h1>${esc(cap.titulo)}</h1>
  <div class="filete"></div>
  <p class="resumen">${esc(cap.resumen)}</p>
  <p class="cuantas">${cap.laminas.length} ${cap.laminas.length === 1 ? "apartado" : "apartados"}</p>
</section>`;
}

function presentacionHTML() {
  let n = 0;
  const cuerpo = CAPITULOS.map((cap, i) =>
    separadorHTML(cap, i + 1) + cap.laminas.map((l) => laminaHTML(l, cap, ++n)).join("")
  ).join("");

  const indice = CAPITULOS.map((c, i) =>
    `<li><span class="i-num">${i + 1}</span><span class="i-tit">${esc(c.titulo)}</span><span class="i-n">${c.laminas.length}</span></li>`
  ).join("");

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Guía del profesor · presentación</title>
<style>
  @page { size: ${LAMINA.ancho} ${LAMINA.alto}; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "DejaVu Sans", Arial, Helvetica, sans-serif; color: #102a43; }

  .diapo { width: ${LAMINA.ancho}; height: ${LAMINA.alto}; page-break-after: always;
      padding: 13mm 18mm 11mm; display: flex; flex-direction: column; position: relative;
      background: #ffffff; overflow: hidden; }
  .diapo:last-child { page-break-after: auto; }

  /* ---- portada ---- */
  .portada { background: #102a43; color: #ffffff; justify-content: center; padding: 16mm 22mm; }
  .portada .fondo { position: absolute; inset: 0; overflow: hidden; }
  .portada .tablero-fondo { position: absolute; right: -30mm; top: -26mm; width: 150mm; height: 150mm;
      transform: rotate(14deg); opacity: .09;
      background-image:
        linear-gradient(45deg, #f0b429 25%, transparent 25%, transparent 75%, #f0b429 75%),
        linear-gradient(45deg, #f0b429 25%, transparent 25%, transparent 75%, #f0b429 75%);
      background-size: 18.75mm 18.75mm; background-position: 0 0, 9.375mm 9.375mm; }
  .portada .brillo { position: absolute; left: -40mm; bottom: -60mm; width: 170mm; height: 170mm;
      border-radius: 50%; background: radial-gradient(circle, rgba(240,180,41,.22), transparent 68%); }
  .portada > * { position: relative; }
  .marca-casa { font-size: 11pt; letter-spacing: .2em; text-transform: uppercase; color: #f0b429; margin: 0 0 9mm; }
  .portada h1 { font-size: 46pt; line-height: 1.02; margin: 0; letter-spacing: -.015em; font-weight: 700; }
  .portada h1 .segunda { display: block; color: #f0b429; }
  .portada .filete { width: 52mm; height: 1.5mm; background: #de911d; margin: 8mm 0 7mm; }
  .portada .sub { font-size: 15pt; line-height: 1.5; color: #cfdbe6; margin: 0; max-width: 175mm; }
  .cifras { margin: 10mm 0 0; display: flex; gap: 14mm; }
  .cifra { border-left: .9mm solid rgba(240,180,41,.55); padding-left: 5mm; }
  .cifra .n { display: block; font-size: 23pt; font-weight: 700; line-height: 1.1; }
  .cifra .q { display: block; font-size: 9pt; letter-spacing: .12em; text-transform: uppercase; color: #9fb3c8; margin-top: 1mm; }
  .portada .logo { position: absolute; right: 22mm; bottom: 16mm; width: 74mm; }
  .portada .firma { position: absolute; left: 22mm; bottom: 14mm; font-size: 11pt; color: #cfdbe6; margin: 0; }
  .portada .firma strong { display: block; color: #ffffff; font-size: 13pt; }
  .sello-uso { position: absolute; top: 12mm; right: 18mm; border: .6mm solid #f0b429; color: #f0b429;
      font-size: 8pt; letter-spacing: .2em; text-transform: uppercase; padding: 1.8mm 4mm;
      border-radius: 1mm; font-weight: 700; }

  /* ---- índice ---- */
  .indice h1 { font-size: 26pt; margin: 0 0 6mm; color: #102a43; }
  .indice ol { list-style: none; padding: 0; margin: 0; columns: 2; column-gap: 16mm; }
  .indice li { display: flex; align-items: baseline; gap: 4mm; font-size: 12.5pt; line-height: 1.5;
      padding: 1.6mm 0; border-bottom: .3mm solid #e4ebf2; break-inside: avoid; }
  .i-num { flex: none; width: 8mm; font-weight: 700; color: #de911d; }
  .i-tit { flex: 1; }
  .i-n { flex: none; font-size: 9pt; color: #829ab1; }

  /* ---- separador de capítulo ---- */
  .separador { background: #1f3a55; color: #ffffff; justify-content: center; }
  .separador .capnum { font-size: 10pt; letter-spacing: .22em; text-transform: uppercase; color: #f0b429; margin: 0 0 5mm; }
  .separador h1 { font-size: 36pt; line-height: 1.08; margin: 0; font-weight: 700; }
  .separador .filete { width: 44mm; height: 1.3mm; background: #de911d; margin: 7mm 0 6mm; }
  .separador .resumen { font-size: 14pt; line-height: 1.55; color: #cfdbe6; margin: 0; max-width: 200mm; }
  .separador .cuantas { position: absolute; right: 18mm; bottom: 12mm; font-size: 9.5pt; color: #9fb3c8; margin: 0; }

  /* ---- lámina de contenido ---- */
  .cinta { display: flex; justify-content: space-between; align-items: baseline;
      border-bottom: .5mm solid #de911d; padding-bottom: 2.5mm; margin-bottom: 6mm; }
  .cinta .cap { font-size: 9.5pt; letter-spacing: .16em; text-transform: uppercase; color: #627d98; }
  .cinta .num { font-size: 9.5pt; color: #9fb3c8; font-weight: 700; }
  .diapo h2 { font-size: 28pt; line-height: 1.12; margin: 0 0 2.5mm; color: #102a43; font-weight: 700; }
  .donde { font-size: 10pt; color: #627d98; margin: 0 0 4mm; font-family: "DejaVu Sans Mono", monospace; }
  .intro { font-size: 15pt; line-height: 1.5; margin: 0 0 6mm; color: #243b53; max-width: 250mm; }
  /* El cuerpo se centra en el alto que sobra: proyectado, el texto pegado al
     borde de arriba con media diapositiva en blanco debajo se lee peor y se ve
     como si faltara algo. */
  .cuerpo { display: flex; gap: 12mm; flex: 1; align-items: flex-start;
      align-content: center; justify-content: flex-start; min-height: 0; padding-bottom: 4mm; }
  .holgada .cuerpo, .justa .cuerpo { flex: 0 1 auto; margin-top: auto; margin-bottom: auto; }
  ol.pasos { flex: 1.35; list-style: none; counter-reset: p; padding: 0; margin: 0; }
  ol.pasos li { counter-increment: p; position: relative; padding-left: 11mm; margin-bottom: 4mm;
      font-size: 15pt; line-height: 1.45; }
  ol.pasos li::before { content: counter(p); position: absolute; left: 0; top: .4mm;
      width: 7.4mm; height: 7.4mm; border-radius: 50%; background: #102a43; color: #ffffff;
      font-size: 9.5pt; font-weight: 700; display: flex; align-items: center; justify-content: center; }
  .ojo { flex: 1; background: #fffaf0; border-left: 1.1mm solid #de911d; padding: 5mm 6mm; }
  .ojo-t { font-size: 9pt; letter-spacing: .16em; text-transform: uppercase; color: #8a5a00;
      margin: 0 0 3mm; font-weight: 700; }
  .ojo ul { margin: 0; padding-left: 4.5mm; }
  .ojo li { font-size: 12.5pt; line-height: 1.42; margin-bottom: 3.2mm; color: #243b53; }
  .cuerpo > :only-child { flex: 1; }

  /* Menos aire cuando la lámina trae mucho. Es lo que evita que se salga de la
     página, que no daría ningún error: se imprime cortada. */
  .justa h2 { font-size: 25pt; }
  .justa .intro { font-size: 13.5pt; margin-bottom: 4.5mm; }
  .justa ol.pasos li { font-size: 13pt; margin-bottom: 3.2mm; }
  .justa .ojo li { font-size: 11.5pt; margin-bottom: 2.8mm; }
  .apretada h2 { font-size: 22pt; }
  .apretada .intro { font-size: 12pt; margin-bottom: 3.5mm; }
  .apretada ol.pasos li { font-size: 11.4pt; margin-bottom: 2.4mm; line-height: 1.4; }
  .apretada .ojo li { font-size: 10.4pt; margin-bottom: 2.2mm; line-height: 1.38; }
  .apretada .cinta { margin-bottom: 4mm; }
  .apretada ol.pasos li::before { width: 6.4mm; height: 6.4mm; font-size: 8.5pt; }
  .apretada ol.pasos li { padding-left: 9.5mm; }

  .pie { margin-top: auto; padding-top: 3.5mm; border-top: .3mm solid #e4ebf2;
      display: flex; justify-content: space-between; font-size: 8pt; color: #9fb3c8; }
</style>
</head><body>

<section class="diapo portada">
  <div class="fondo"><div class="tablero-fondo"></div><div class="brillo"></div></div>
  <div class="sello-uso">Uso docente</div>
  <p class="marca-casa">&#9822; Ajedrez Integral</p>
  <h1>Guía del<span class="segunda">profesor</span></h1>
  <div class="filete"></div>
  <p class="sub">${esc(CONTENIDO.subtitulo)}</p>
  <div class="cifras">
    <div class="cifra"><span class="n">${CAPITULOS.length}</span><span class="q">capítulos</span></div>
    <div class="cifra"><span class="n">${TOTAL_LAMINAS}</span><span class="q">apartados</span></div>
    <div class="cifra"><span class="n">${ANIO}</span><span class="q">edición</span></div>
  </div>
  <img class="logo" src="${LOGO_CREMA}" alt="Oscar Angulo Cubero · Profesional de Ajedrez">
  <p class="firma">${esc(AUTOR)}<strong>Academia Ajedrez Integral</strong></p>
</section>

<section class="diapo indice">
  <header class="cinta"><span class="cap">Guía del profesor</span><span class="num">Índice</span></header>
  <h1>Lo que vamos a ver</h1>
  <ol>${indice}</ol>
  <footer class="pie"><span>Ajedrez Integral · Guía del profesor</span><span>${esc(AUTOR)}</span></footer>
</section>

${cuerpo}
</body></html>`;
}

/* ==========================================================================
   2. EL MANUAL — A4, para leer
   ========================================================================== */

function manualHTML() {
  const indice = CAPITULOS.map((c, i) => `<tr>
    <td class="n">${i + 1}</td>
    <td><strong>${esc(c.titulo)}</strong><br><span class="res">${esc(c.resumen)}</span></td>
    <td class="cuantos">${c.laminas.length}</td></tr>`).join("");

  const capitulos = CAPITULOS.map((cap, i) => {
    const laminas = cap.laminas.map((l) => `<div class="apartado">
      <h3>${esc(l.titulo)}</h3>
      ${l.donde ? `<p class="donde">${esc(l.donde)}</p>` : ""}
      ${l.intro ? `<p class="intro">${esc(l.intro)}</p>` : ""}
      ${(l.pasos || []).length ? `<ol class="pasos">${l.pasos.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>` : ""}
      ${(l.ojo || []).length ? `<div class="ojo"><p class="ojo-t">Ojo con esto</p><ul>${
        l.ojo.map((o) => `<li>${esc(o)}</li>`).join("")}</ul></div>` : ""}
    </div>`).join("");
    return `<section class="capitulo">
      <p class="capnum">Capítulo ${i + 1}</p>
      <h2>${esc(cap.titulo)}</h2>
      <p class="resumen">${esc(cap.resumen)}</p>
      ${laminas}
    </section>`;
  }).join("");

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Guía del profesor · manual</title>
<style>
  @page { size: A4; margin: 17mm 16mm 15mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "DejaVu Serif", Georgia, "Times New Roman", serif;
         font-size: 10pt; line-height: 1.45; color: #102a43; }
  h2 { font-size: 19pt; margin: 0 0 3mm; line-height: 1.1; font-weight: 700; }
  h3 { font-size: 12pt; margin: 0 0 1.5mm; color: #102a43; }
  .capnum { font-size: 8pt; letter-spacing: .2em; text-transform: uppercase; color: #de911d;
      margin: 0 0 2mm; font-family: "DejaVu Sans", Arial, sans-serif; font-weight: 700; }
  .capitulo { page-break-before: always; }
  .capitulo > .resumen { font-size: 11pt; color: #334e68; margin: 0 0 7mm; padding-bottom: 5mm;
      border-bottom: .6mm solid #de911d; }
  .apartado { page-break-inside: avoid; margin-bottom: 6.5mm; padding-bottom: 5mm;
      border-bottom: .3mm solid #eef2f6; }
  .apartado:last-child { border-bottom: none; }
  .donde { font-family: "DejaVu Sans Mono", monospace; font-size: 8pt; color: #627d98; margin: 0 0 2mm; }
  .intro { margin: 0 0 2.5mm; }
  ol.pasos { counter-reset: p; list-style: none; padding: 0; margin: 0 0 3mm; }
  ol.pasos li { counter-increment: p; position: relative; padding-left: 8mm; margin-bottom: 1.6mm; }
  ol.pasos li::before { content: counter(p); position: absolute; left: 0; top: .1mm;
      width: 5.2mm; height: 5.2mm; border-radius: 50%; background: #102a43; color: #ffffff;
      font-family: "DejaVu Sans", Arial, sans-serif; font-size: 7pt; font-weight: 700;
      display: flex; align-items: center; justify-content: center; }
  .ojo { background: #fffaf0; border-left: 1mm solid #de911d; padding: 3mm 4mm; margin: 0; }
  .ojo-t { font-family: "DejaVu Sans", Arial, sans-serif; font-size: 7.5pt; letter-spacing: .14em;
      text-transform: uppercase; color: #8a5a00; margin: 0 0 1.5mm; font-weight: 700; }
  .ojo ul { margin: 0; padding-left: 4.5mm; }
  .ojo li { font-size: 9.2pt; margin-bottom: 1.4mm; color: #243b53; }

  /* ---- la primera página, que no es un capítulo ---- */
  .frente h1 { font-size: 24pt; margin: 0 0 2mm; line-height: 1.1; }
  .frente .sub { font-size: 12pt; color: #334e68; margin: 0 0 6mm; }
  .aviso { border: .5mm solid #de911d; background: #fffaf0; padding: 4mm 5mm; margin-bottom: 6mm; font-size: 9.5pt; }
  table.indice { width: 100%; border-collapse: collapse; }
  table.indice td { padding: 2mm 2mm; border-bottom: .3mm solid #d9e2ec; vertical-align: top; }
  table.indice td.n { width: 10mm; font-weight: 700; color: #de911d; text-align: right; }
  table.indice td.cuantos { width: 14mm; text-align: right; color: #829ab1; font-size: 8.5pt; }
  table.indice .res { font-size: 8.8pt; color: #627d98; }
  .como-usar { background: #f0f4f8; border-left: 1mm solid #486581; padding: 3.5mm 4.5mm; font-size: 9.5pt; }
  .como-usar p { margin: 0 0 1.8mm; }
  .como-usar p:last-child { margin: 0; }
</style>
</head><body>
<section class="frente">
  <p class="capnum">&#9822; Ajedrez Integral · ${ANIO}</p>
  <h1>Guía del profesor</h1>
  <p class="sub">${esc(CONTENIDO.subtitulo)}</p>
  <div class="aviso">
    <strong>Material de uso docente.</strong> Esta guía explica la plataforma
    desde el lado de quien da clase. Se puede imprimir y repartir dentro del
    equipo docente; lo que no se puede es modificarla y hacerla pasar por la
    versión oficial. Los tres libros con las respuestas de las pruebas
    —el del diagnóstico, el cuadernillo y el de arbitraje— son otra cosa y
    siguen siendo solo de administración.
  </div>
  <div class="como-usar">
    <p><strong>Cómo está armada.</strong> ${CAPITULOS.length} capítulos y
    ${TOTAL_LAMINAS} apartados. Cada apartado dice qué es, dónde está en el
    sitio, cómo se hace paso a paso y qué conviene no olvidar.</p>
    <p><strong>La misma guía está en diapositivas</strong>
    (<em>guia-del-profesor-presentacion.pdf</em>), para proyectarla en una
    capacitación, y en <em>guia-del-profesor-accesible.html</em>, sin ninguna
    imagen, para leerla con lector de pantalla o con la letra agrandada.</p>
    <p><strong>Si solo vas a leer un capítulo antes de tu primera clase</strong>,
    que sea el primero. Si ya diste clase y quieres sacarle más, salta al
    capítulo de planes de clase.</p>
  </div>
  <h2 style="margin-top:8mm;font-size:14pt">Índice</h2>
  <table class="indice">${indice}</table>
</section>
${capitulos}
</body></html>`;
}

/* ==========================================================================
   3. LA VERSIÓN ACCESIBLE — sin una sola imagen
   ========================================================================== */

function accesibleHTML() {
  const capitulos = CAPITULOS.map((cap, i) => {
    const laminas = cap.laminas.map((l) => `<article>
      <h3>${esc(l.titulo)}</h3>
      ${l.donde ? `<p class="donde"><strong>Dónde está:</strong> ${esc(l.donde)}</p>` : ""}
      ${l.intro ? `<p>${esc(l.intro)}</p>` : ""}
      ${(l.pasos || []).length ? `<p class="rotulo">Cómo se hace:</p><ol>${
        l.pasos.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>` : ""}
      ${(l.ojo || []).length ? `<div class="ojo"><p class="rotulo">Ojo con esto:</p><ul>${
        l.ojo.map((o) => `<li>${esc(o)}</li>`).join("")}</ul></div>` : ""}
    </article>`).join("");
    return `<section>
      <h2>Capítulo ${i + 1}. ${esc(cap.titulo)}</h2>
      <p class="resumen">${esc(cap.resumen)}</p>
      ${laminas}
    </section>`;
  }).join("");

  const indice = CAPITULOS.map((c, i) =>
    `<li><a href="#cap-${i + 1}">Capítulo ${i + 1}. ${esc(c.titulo)}</a></li>`).join("");

  /* El índice enlaza, así que cada sección necesita su ancla. Se pone acá y no
     dentro del map de arriba para no repetir el recorrido. */
  const conAnclas = capitulos.replace(/<section>\s*<h2>Capítulo (\d+)\./g,
    (_, n) => `<section id="cap-${n}"><h2>Capítulo ${n}.`);

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Guía del profesor — versión accesible</title>
<style>
  :root { color-scheme: light dark; }
  body { max-width: 42rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; background: #fff; color: #10202e;
         font-family: Georgia, "Times New Roman", serif; font-size: 1.15rem; line-height: 1.8; }
  h1 { font-size: 1.9rem; line-height: 1.25; }
  h2 { font-size: 1.45rem; margin-top: 2.8rem; border-bottom: 2px solid #10202e; padding-bottom: .3rem; }
  h3 { font-size: 1.15rem; margin: 2rem 0 .3rem; font-family: system-ui, sans-serif; }
  article { border-top: 1px solid #c9d4de; padding-top: .3rem; }
  .resumen { font-style: italic; }
  .donde { font-size: .95em; }
  .rotulo { margin: .8rem 0 .2rem; font-weight: 700; font-family: system-ui, sans-serif; font-size: .95em; }
  .ojo { background: #f7f2e6; border-left: 4px solid #8a5a00; padding: .7rem .9rem; margin: .8rem 0 0; }
  .aviso { border: 2px solid #8a5a00; padding: 1rem; }
  .volver { margin-bottom: 1.5rem; font-size: .95em; }
  .descargas { background: #f1f5f8; padding: 1rem 1.2rem; margin: 1.5rem 0; }
  .descargas .rotulo { margin: 0 0 .4rem; font-weight: 700; font-family: system-ui, sans-serif; font-size: .95em; }
  .descargas ul { margin: 0 0 .6rem; }
  .nota-pdf { margin: 0; font-size: .92em; }
  ol, ul { padding-left: 1.6rem; }
  li { margin-bottom: .35rem; }
  nav ol { padding-left: 1.4rem; }
  footer { margin-top: 3rem; border-top: 1px solid #c9d4de; padding-top: 1rem; font-size: .95rem; }
  a { color: #0b4a76; }
  @media (prefers-color-scheme: dark) {
    body { background: #10202e; color: #eef3f7; }
    h2 { border-color: #eef3f7; }
    .ojo { background: #2b2415; border-color: #e0b558; }
    .descargas { background: #1b3145; }
    article, footer { border-color: #3b5165; }
    a { color: #9ecbf0; }
  }
</style>
</head><body>
<nav class="volver" aria-label="Volver a la Academia">
  <a href="clases.html">&#8592; Volver al panel de la Academia</a>
</nav>
<h1>Guía del profesor</h1>
<p>${esc(CONTENIDO.subtitulo)} Esta página es el contenido completo, escrito
para leerse en cualquier aparato, con lector de pantalla o con la letra
agrandada. No hay ninguna imagen: no hace falta ver nada para usarla.</p>
<div class="descargas">
  <p class="rotulo">Los mismos contenidos, para llevar:</p>
  <ul>
    <li><a href="guia-del-profesor.pdf">El manual en PDF</a> — ${CAPITULOS.length}
    capítulos en A4, para leer y tener al lado del teclado.</li>
    <li><a href="guia-del-profesor-presentacion.pdf">La presentación en PDF</a> —
    diapositivas 16:9, para proyectar en una capacitación.</li>
  </ul>
  <p class="nota-pdf">Los dos se pueden imprimir. Llevan la marca de agua de la
  Academia y van firmados, como el resto del material docente.</p>
</div>
<p class="aviso"><strong>Material de uso docente.</strong> Explica la plataforma
desde el lado de quien da clase.</p>
<p><strong>${CAPITULOS.length} capítulos</strong> y ${TOTAL_LAMINAS} apartados.
Cada apartado dice qué es, dónde está en el sitio, cómo se hace paso a paso y
qué conviene no olvidar.</p>
<nav aria-labelledby="indice-t">
  <h2 id="indice-t">Índice</h2>
  <ol>${indice}</ol>
</nav>
${conAnclas}
<footer>
  <p><a href="clases.html">&#8592; Volver al panel de la Academia</a></p>
  <p>Ajedrez Integral · ${esc(AUTOR)} · ${ANIO}. Material de uso docente.</p>
</footer>
</body></html>`;
}

/* ==========================================================================
   Generar
   ==========================================================================
   Las tres maquetas se exportan para que `verificar-guia-profesores.js` las
   arme él mismo y las mida en un navegador de verdad. Comprobar una copia de
   la maqueta no comprobaría nada: lo que hay que mirar es lo que este archivo
   produce. Por eso el cuerpo ejecutable va detrás de `require.main`. */
module.exports = { presentacionHTML, manualHTML, accesibleHTML, CAPITULOS, TOTAL_LAMINAS, LAMINA };
if (require.main !== module) return;

const destinoAccesible = path.join(RAIZ, "guia-del-profesor-accesible.html");
fs.writeFileSync(destinoAccesible, accesibleHTML());
console.log(`${CAPITULOS.length} capítulos · ${TOTAL_LAMINAS} apartados`);
console.log("Accesible:", destinoAccesible);

if (SOLO_ACCESIBLE) {
  console.log("--solo-accesible: no se tocó ningún PDF.");
  process.exit(0);
}

const tmp = require("os").tmpdir();
const htmlPresentacion = path.join(tmp, "guia-profesores-presentacion.html");
const htmlManual = path.join(tmp, "guia-profesores-manual.html");
fs.writeFileSync(htmlPresentacion, presentacionHTML());
fs.writeFileSync(htmlManual, manualHTML());

/* La hoja de marca se genera a la medida de la página que va a sellar. Estampar
   una hoja A4 sobre una diapositiva apaisada dejaría el logo en una esquina. */
function htmlMarca(ancho, alto, anchoSello) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<style>
  @page { size: ${ancho} ${alto}; margin: 0; }
  html, body { margin: 0; padding: 0; width: ${ancho}; height: ${alto}; }
  .sello { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  .sello img { width: ${anchoSello}; height: auto; transform: rotate(-15deg); opacity: .11; }
</style>
</head><body><div class="sello"><img src="${LOGO_MARCA}" alt=""></div></body></html>`;
}
const htmlMarcaA4 = path.join(tmp, "guia-profesores-marca-a4.html");
const htmlMarca169 = path.join(tmp, "guia-profesores-marca-169.html");
fs.writeFileSync(htmlMarcaA4, htmlMarca("210mm", "297mm", "105mm"));
fs.writeFileSync(htmlMarca169, htmlMarca(LAMINA.ancho, LAMINA.alto, "120mm"));

(async () => {
  const { chromium } = require("playwright");
  const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

  async function imprimir(archivoHTML, salida, opciones) {
    const pagina = await navegador.newPage();
    await pagina.goto("file://" + archivoHTML, { waitUntil: "load" });
    await pagina.pdf(Object.assign({ path: salida, printBackground: true }, opciones));
    await pagina.close();
  }

  const pdfPresentacion = path.join(tmp, "guia-presentacion.pdf");
  const pdfManual = path.join(tmp, "guia-manual.pdf");
  const marcaA4 = path.join(tmp, "guia-marca-a4.pdf");
  const marca169 = path.join(tmp, "guia-marca-169.pdf");

  await imprimir(htmlPresentacion, pdfPresentacion, {
    width: LAMINA.ancho, height: LAMINA.alto,
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  await imprimir(htmlMarca169, marca169, {
    width: LAMINA.ancho, height: LAMINA.alto,
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  await imprimir(htmlMarcaA4, marcaA4, {
    format: "A4", margin: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  await imprimir(htmlManual, pdfManual, {
    format: "A4",
    margin: { top: "17mm", bottom: "15mm", left: "16mm", right: "16mm" },
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate: '<div style="width:100%;font-size:7.5pt;color:#9fb3c8;font-family:Arial,sans-serif;padding:0 16mm;display:flex;justify-content:space-between;align-items:center;"><span>Ajedrez Integral · Guía del profesor · uso docente</span><span style="font-weight:700;color:#829ab1;">IA Oscar Angulo Cubero</span><span class="pageNumber"></span></div>',
  });
  await navegador.close();

  const salidaPresentacion = path.join(RAIZ, "guia-del-profesor-presentacion.pdf");
  const salidaManual = path.join(RAIZ, "guia-del-profesor.pdf");

  sellar(pdfPresentacion, marca169, salidaPresentacion, 1);   // la portada no lleva marca
  sellar(pdfManual, marcaA4, salidaManual, 0);                // el manual arranca en contenido
  proteger(salidaPresentacion, "Guia del profesor - presentacion");
  proteger(salidaManual, "Guia del profesor - manual");

  console.log("Presentación:", salidaPresentacion);
  console.log("Manual:      ", salidaManual);
})();

/* Estampa la marca de agua sobre cada página desde `desde` (la portada de la
   presentación no la lleva: ya tiene el logo en grande y su sello de uso
   docente). Después de estampar hay que recomprimir y clonar, o el archivo se
   va a megabytes: mezclar deja el contenido de cada página SIN comprimir, y los
   flujos viejos quedan sueltos pero el escritor los sigue guardando. */
function sellar(origen, marca, destino, desde) {
  const { execFileSync } = require("child_process");
  const guion = `
import sys, zlib
from pypdf import PdfReader, PdfWriter
from pypdf.generic import StreamObject, NameObject
origen, marca, destino, desde = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
escritor = PdfWriter()
escritor.append_pages_from_reader(PdfReader(origen))
sello = PdfReader(marca).pages[0]
for n, pagina in enumerate(escritor.pages):
    if n < desde:
        continue
    pagina.merge_page(sello, over=True)
for pagina in escritor.pages:
    flujo = StreamObject()
    flujo._data = zlib.compress(pagina.get_contents().get_data(), 9)
    flujo[NameObject("/Filter")] = NameObject("/FlateDecode")
    pagina[NameObject("/Contents")] = escritor._add_object(flujo)
escritor.write(destino)
PdfWriter(clone_from=destino).write(destino)
print("marca de agua en", len(escritor.pages) - desde, "de", len(escritor.pages), "páginas")
`;
  try {
    console.log(String(execFileSync("python3", ["-c", guion, origen, marca, destino, String(desde)],
      { stdio: ["ignore", "pipe", "pipe"] })).trim());
  } catch (e) {
    console.error("\nNo se pudo estampar la marca de agua. Falta pypdf: pip install pypdf");
    console.error(String(e.stderr || "").trim().split("\n").slice(-3).join("\n"));
    process.exit(1);
  }
}

/* Chromium no sabe proteger el PDF, así que el archivo se vuelve a escribir con
   pypdf: sin contraseña de apertura (se abre normal), sin permiso de modificarlo
   ni de reordenarle las páginas, pero SÍ se puede imprimir y extraerle el texto.
   Ver el comentario de arriba: esta guía es material de trabajo, no un banco de
   respuestas, y bloquearle la impresión sería estorbarle el uso para el que
   existe. La extracción de texto se deja habilitada por la misma razón de
   siempre: sin ella el archivo queda fuera del alcance de quien lo lee con
   lector de pantalla. */
function proteger(archivo, titulo) {
  const { execFileSync } = require("child_process");
  const guion = `
import sys
from pypdf import PdfReader, PdfWriter
from pypdf.constants import UserAccessPermissions

archivo, clave, autor, titulo = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
escritor = PdfWriter()
escritor.append_pages_from_reader(PdfReader(archivo))
escritor.add_metadata({
    "/Title": titulo,
    "/Author": autor,
    "/Subject": "Plataforma Ajedrez Integral - guia de uso docente",
    "/Creator": "Ajedrez Integral",
    "/Producer": "Ajedrez Integral",
})
permisos = (
    UserAccessPermissions.PRINT
    | UserAccessPermissions.PRINT_TO_REPRESENTATION
    | UserAccessPermissions.EXTRACT_TEXT_AND_GRAPHICS
)
escritor.encrypt(
    user_password="",
    owner_password=clave,
    permissions_flag=permisos,
    algorithm="AES-256",
)
with open(archivo, "wb") as f:
    escritor.write(f)
`;
  try {
    execFileSync("python3", ["-c", guion, archivo, CLAVE_PROPIETARIO, AUTOR, titulo],
      { stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    console.error("\nNo se pudo proteger el PDF. Falta pypdf: pip install pypdf");
    console.error(String(e.stderr || "").trim().split("\n").slice(-3).join("\n"));
    fs.unlinkSync(archivo);   // mejor sin archivo que con uno sin proteger
    process.exit(1);
  }
}
