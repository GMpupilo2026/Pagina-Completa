/* ===== Generador del cuadernillo del examen de arbitraje =====
 *
 * Arma examen-de-arbitraje.pdf a partir de los MISMOS datos que usa el sitio
 * (js/arbitraje-items.js y js/arbitraje-nivel.js): el banco entero, área por
 * área y escalón por escalón, con la respuesta correcta marcada, la
 * explicación y el artículo del Handbook de cada pregunta. Es para repasar y
 * para corregir en papel, no para tomarlo como examen: trae las respuestas.
 *
 * Al tocar el banco hay que volver a correrlo o el papel deja de coincidir con
 * la pantalla.
 *
 * Cómo se corre (necesita Node y Chromium por Playwright, que no son parte del
 * sitio: son solo para generar el archivo):
 *
 *     npm install playwright        # una vez, en cualquier carpeta temporal
 *     node herramientas/arbitraje-pdf.js
 *
 * Deja el PDF en la raíz del repositorio y un HTML intermedio en /tmp por si
 * hay que revisar la maqueta en el navegador. Con CHROMIUM=/ruta/al/chrome se
 * le puede indicar un Chromium ya instalado.
 */
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");
global.window = {};
eval(fs.readFileSync(path.join(RAIZ, "js/arbitraje-items.js"), "utf8"));
eval(fs.readFileSync(path.join(RAIZ, "js/arbitraje-nivel.js"), "utf8"));
const BANCO = global.window.ARBITRAJE_ITEMS;
const PRUEBA = global.window.ArbitrajePrueba;
const NIVEL = global.window.ArbitrajeNivel;

const LETRAS = ["a", "b", "c", "d"];

function esc(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* Las opciones se barajan para que la correcta no quede siempre primera —el
   banco las guarda con la correcta en el índice 0—, pero con un orden fijo y
   repetible: sale del identificador de la pregunta, así que el cuadernillo y
   su hoja de respuestas siempre coinciden y dos impresiones son idénticas. */
function semilla(texto) {
  let h = 0;
  for (const c of texto) h = (h * 31 + c.charCodeAt(0)) % 100000;
  return h;
}

function ordenOpciones(item) {
  let s = semilla(item.id) || 1;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const orden = item.opciones.map((_, i) => i);
  for (let i = orden.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = orden[i]; orden[i] = orden[j]; orden[j] = t;
  }
  return orden;
}

const respuestas = [];   // para la hoja de respuestas del final

function pregunta(item, n) {
  const orden = ordenOpciones(item);
  const correcta = orden.indexOf(item.correcta);
  respuestas.push({ n, id: item.id, letra: LETRAS[correcta], area: item.area, peso: item.peso });
  const opciones = orden.map((original, i) => {
    const bien = original === item.correcta;
    return `<li class="${bien ? "bien" : ""}"><span class="letra">${LETRAS[i]})</span> ${esc(item.opciones[original])}${bien ? ' <span class="tic">✔</span>' : ""}</li>`;
  }).join("");
  return `<section class="pregunta">
      <p class="cabecera"><span class="num">${n}</span> <span class="estrellas">${"★".repeat(item.peso)}${"☆".repeat(5 - item.peso)}</span> <span class="ident">${esc(item.id)}</span></p>
      <p class="enunciado">${esc(item.enunciado)}</p>
      <ol class="opciones">${opciones}</ol>
      <p class="explica"><strong>Por qué.</strong> ${esc(item.explica)}</p>
      <p class="fuente">${esc(item.fuente)}</p>
    </section>`;
}

/* ---------- cuerpo: un capítulo por área, ordenado por escalón ---------- */
let n = 0;
const capitulos = NIVEL.AREAS.map((area) => {
  const delArea = BANCO.filter((i) => i.area === area.id);
  const porEscalon = PRUEBA.PESOS.map((peso) => {
    const grupo = delArea.filter((i) => i.peso === peso);
    if (!grupo.length) return "";
    return `<h3 class="escalon">Escalón ${peso} <span class="estrellas">${"★".repeat(peso)}${"☆".repeat(5 - peso)}</span> <span class="cuantas">${grupo.length} preguntas</span></h3>` +
      grupo.map((i) => pregunta(i, ++n)).join("");
  }).join("");
  return `<div class="pagina">
      <h2 class="area">${area.emoji} ${esc(area.nombre)} <span class="cuantas">${delArea.length} preguntas</span></h2>
      <p class="mide"><strong>Qué mide.</strong> ${esc(area.mide)}</p>
      <p class="mide"><strong>Qué estudiar.</strong> ${esc(area.estudiar)}</p>
      ${porEscalon}
    </div>`;
}).join("");

/* ---------- índice ---------- */
const indice = NIVEL.AREAS.map((area) => {
  const delArea = BANCO.filter((i) => i.area === area.id);
  const cuenta = PRUEBA.PESOS.map((p) => delArea.filter((i) => i.peso === p).length).join(" · ");
  return `<tr><td>${area.emoji} ${esc(area.nombre)}</td><td class="num">${delArea.length}</td><td class="reparto">${cuenta}</td></tr>`;
}).join("");

/* ---------- escala de niveles ---------- */
const escala = NIVEL.NIVELES.map((niv) => `<tr>
    <td class="estrellas">${niv.escalon ? "★".repeat(niv.escalon) + "☆".repeat(5 - niv.escalon) : "—"}</td>
    <td><strong>${esc(niv.etiqueta)}</strong></td>
    <td>${esc(niv.descripcion)}</td>
  </tr>`).join("");

/* ---------- hoja de respuestas ---------- */
const filas = [];
for (let i = 0; i < respuestas.length; i += 4) {
  filas.push("<tr>" + respuestas.slice(i, i + 4).map((r) =>
    `<td class="resp"><span class="rnum">${r.n}</span> ${r.letra}</td>`).join("") + "</tr>");
}

const HOY = new Date().toLocaleDateString("es-CR", { year: "numeric", month: "long", day: "numeric" });

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Examen de arbitraje · banco de preguntas</title>
<style>
  @page { size: A4; margin: 16mm 14mm 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "DejaVu Serif", Georgia, "Times New Roman", serif; font-size: 9.5pt; line-height: 1.38; color: #102a43; }
  h1 { font-size: 24pt; margin: 0 0 4mm; letter-spacing: -.01em; }
  h2.area { font-size: 15pt; margin: 0 0 3mm; padding-bottom: 2mm; border-bottom: 2px solid #334e68; }
  h3.escalon { font-size: 10.5pt; margin: 6mm 0 3mm; color: #334e68; border-bottom: 1px solid #d9e2ec; padding-bottom: 1mm; }
  .cuantas { font-size: 8pt; color: #627d98; font-weight: 400; letter-spacing: .02em; }
  .estrellas { color: #de911d; letter-spacing: .06em; }
  .portada { height: 245mm; display: flex; flex-direction: column; justify-content: center; text-align: center; }
  .portada .sello { font-size: 10pt; letter-spacing: .2em; text-transform: uppercase; color: #de911d; font-weight: 700; margin-bottom: 6mm; }
  .portada .sub { font-size: 12pt; color: #334e68; margin: 0 0 12mm; }
  .portada .aviso { margin: 0 auto; max-width: 120mm; border: 1.5px solid #de911d; background: #fffaf0; padding: 5mm 6mm; font-size: 9.5pt; text-align: left; }
  .portada .pie { margin-top: 14mm; font-size: 8.5pt; color: #627d98; }
  .pagina { page-break-before: always; }
  .pregunta { page-break-inside: avoid; margin-bottom: 4.5mm; padding-bottom: 3mm; border-bottom: 1px solid #eef2f6; }
  .cabecera { margin: 0 0 1mm; font-size: 8pt; color: #627d98; }
  .cabecera .num { display: inline-block; min-width: 9mm; font-weight: 700; color: #102a43; font-size: 9.5pt; }
  .cabecera .ident { font-family: "DejaVu Sans Mono", monospace; font-size: 7pt; color: #9fb3c8; }
  .enunciado { margin: 0 0 1.5mm; font-weight: 600; }
  ol.opciones { list-style: none; padding: 0; margin: 0 0 1.5mm 9mm; }
  ol.opciones li { margin-bottom: .6mm; }
  ol.opciones li.bien { font-weight: 700; color: #0b6b3a; }
  .letra { display: inline-block; min-width: 5mm; color: #627d98; }
  li.bien .letra { color: #0b6b3a; }
  .tic { color: #0b6b3a; }
  .explica { margin: 0 0 .8mm 9mm; font-size: 8.8pt; color: #334e68; }
  .fuente { margin: 0 0 0 9mm; font-size: 8pt; color: #829ab1; font-style: italic; }
  .mide { margin: 0 0 1.5mm; font-size: 9pt; color: #334e68; }
  table { width: 100%; border-collapse: collapse; margin-top: 4mm; }
  th, td { text-align: left; padding: 1.6mm 2mm; border-bottom: 1px solid #d9e2ec; vertical-align: top; }
  th { font-size: 8pt; text-transform: uppercase; letter-spacing: .05em; color: #627d98; }
  td.num { text-align: right; width: 18mm; font-weight: 700; }
  td.reparto { width: 42mm; color: #627d98; font-size: 8.5pt; }
  table.respuestas td.resp { width: 25%; font-family: "DejaVu Sans Mono", monospace; font-size: 9pt; }
  .rnum { display: inline-block; min-width: 10mm; color: #627d98; }
  .nota { background: #f0f4f8; border-left: 3px solid #486581; padding: 3mm 4mm; margin: 4mm 0; font-size: 9pt; }
  .marca-agua { position: fixed; inset: 0; z-index: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .marca-agua span { transform: rotate(-30deg); font-family: "DejaVu Serif", Georgia, serif; font-size: 24pt; font-weight: 700; letter-spacing: .08em; color: #bcccdc; opacity: .45; white-space: nowrap; text-transform: uppercase; }
  body > *:not(.marca-agua) { position: relative; z-index: 1; }
</style>
</head><body>
<div class="marca-agua" aria-hidden="true"><span>Ajedrez Integral · uso docente</span></div>

<div class="portada">
  <p class="sello">Ajedrez Integral</p>
  <h1>Examen de arbitraje</h1>
  <p class="sub">Banco completo de preguntas sobre el reglamento de la FIDE<br>${BANCO.length} preguntas · ${NIVEL.AREAS.length} áreas · 5 escalones de dificultad</p>
  <div class="aviso">
    <strong>Trae las respuestas.</strong> Este cuadernillo es para estudiar y para
    corregir: cada pregunta viene con la opción correcta marcada, el porqué y el
    artículo del Handbook. No sirve para tomarlo como examen. El examen se rinde
    en <em>arbitraje.html</em>, que sortea 40 preguntas de este mismo banco.
  </div>
  <p class="pie">Generado desde js/arbitraje-items.js · ${HOY}<br>Fuente de todas las respuestas: Handbook de la FIDE, handbook.fide.com</p>
</div>

<div class="pagina">
  <h2 class="area">Cómo está armado</h2>
  <div class="nota">
    <strong>El examen sortea, el banco no cambia.</strong> Cada intento toma
    ${PRUEBA.TOTAL} preguntas —una de cada escalón en cada una de las
    ${PRUEBA.AREAS.length} áreas— y vale ${PRUEBA.PUNTOS} puntos. Así, dos
    exámenes de la misma persona se comparan aunque las preguntas hayan sido
    otras. El tiempo es de 50 minutos.
  </div>
  <p><strong>El nivel sale de los escalones, no del porcentaje.</strong> El escalón
  de una pregunta (de 1 a 5) es cuánto pesa: 1 y 2 es lo que tiene que saber
  quien dirige un torneo escolar, 3 es nivel de árbitro nacional, 4 y 5 son las
  preguntas que separan a un árbitro FIDE de uno internacional. El nivel estimado
  es el escalón más alto superado —${Math.round(NIVEL.UMBRAL * 100)}% de aciertos
  ahí y en los anteriores—, y un área floja pone techo.</p>
  <table>
    <tr><th>Escalón</th><th>Nivel estimado</th><th>Qué significa</th></tr>
    ${escala}
  </table>
  <p style="margin-top:5mm"><strong>Aclaración.</strong> Esto mide conocimiento del
  reglamento. Los títulos de árbitro los otorga la FIDE con seminarios, normas y
  licencia (B.06): este examen no los reemplaza ni los anticipa.</p>

  <h3 class="escalon">Las áreas</h3>
  <table>
    <tr><th>Área</th><th class="num">Preguntas</th><th class="reparto">Por escalón (1·2·3·4·5)</th></tr>
    ${indice}
  </table>
</div>

${capitulos}

<div class="pagina">
  <h2 class="area">Hoja de respuestas</h2>
  <p class="mide">La letra de la opción correcta de cada pregunta, en el orden en que
  aparecen en este cuadernillo. En pantalla las opciones se barajan de nuevo en cada
  intento, así que estas letras valen para el papel.</p>
  <table class="respuestas">${filas.join("")}</table>
</div>

</body></html>`;

const htmlTemporal = path.join(require("os").tmpdir(), "arbitraje-imprimible.html");
fs.writeFileSync(htmlTemporal, html);
console.log(`Maqueta: ${htmlTemporal} · ${BANCO.length} preguntas · ${NIVEL.AREAS.length} áreas`);

(async () => {
  const { chromium } = require("playwright");
  const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const pagina = await navegador.newPage();
  await pagina.goto("file://" + htmlTemporal, { waitUntil: "load" });
  const destino = path.join(RAIZ, "examen-de-arbitraje.pdf");
  await pagina.pdf({
    path: destino,
    format: "A4",
    printBackground: true,
    margin: { top: "16mm", bottom: "14mm", left: "14mm", right: "14mm" },
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate: '<div style="width:100%;font-size:7.5pt;color:#9fb3c8;font-family:Arial,sans-serif;padding:0 14mm;display:flex;justify-content:space-between;"><span>Ajedrez Integral · Examen de arbitraje · uso docente</span><span class="pageNumber"></span></div>',
  });
  await navegador.close();
  console.log("PDF listo:", destino);
})();
