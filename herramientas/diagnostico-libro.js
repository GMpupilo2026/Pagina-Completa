/* ===== Generador del LIBRO del diagnóstico de nivel =====
 *
 * Arma libro-de-diagnostico.pdf: el banco ENTERO de ítems, área por área y
 * escalón por escalón, con la respuesta marcada, el porqué y cómo se verificó
 * cada posición. Es el hermano de examen-de-arbitraje.pdf y comparte todas sus
 * características: tapa a página completa, capítulo por área, índice, escala de
 * niveles, hoja de respuestas, marca de agua estampada en todas las páginas del
 * cuerpo, firma del autor y protección del PDF.
 *
 * NO es lo mismo que diagnostico-de-nivel.pdf, que sigue existiendo y es otra
 * cosa: aquel es UNA forma de la prueba, sorteada, para que el alumno la
 * conteste en papel. Este es el banco completo, para estudiar y para corregir.
 * Uno se reparte, el otro no.
 *
 * Cada posición se cuenta ADEMÁS en palabras, en libro-de-diagnostico-accesible.html:
 * un PDF con diagramas, marca de agua y cifrado es lo peor que se le puede dar a
 * un lector de pantalla. Es la misma decisión que ya se tomó con el material de
 * estudio de los cursos, y por eso comparten el describir de lib/.
 *
 * Al tocar el banco hay que volver a correrlo o el papel deja de coincidir con
 * la pantalla.
 *
 * Cómo se corre (necesita Node, Chromium por Playwright y pypdf, que no son
 * parte del sitio: son solo para generar el archivo):
 *
 *     npm install playwright        # una vez, en cualquier carpeta temporal
 *     pip install pypdf
 *     node herramientas/diagnostico-libro.js
 *
 * Con CHROMIUM=/ruta/al/chrome se le puede indicar un Chromium ya instalado.
 */
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");
const { describir } = require("./lib/describir-fen.js");

global.window = {};
// El plan va PRIMERO: de ahí saca el banco la lista de áreas de la prueba.
eval(fs.readFileSync(path.join(RAIZ, "js/plan-entrenamiento.js"), "utf8"));
eval(fs.readFileSync(path.join(RAIZ, "js/diagnostico-items.js"), "utf8"));
const BANCO = global.window.DIAGNOSTICO_ITEMS;
const PRUEBA = global.window.DiagnosticoPrueba;
const PE = global.window.PlanEntrenamiento;

const LETRAS = ["a", "b", "c", "d"];
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

/* El logo va incrustado como data URI: la maqueta se imprime desde /tmp y desde
   ahí no alcanzaría los archivos de img/. */
function incrustar(relativo) {
  return "data:image/png;base64," + fs.readFileSync(path.join(RAIZ, relativo)).toString("base64");
}
const LOGO_CREMA = incrustar("img/logo-oscar-angulo.png");
const LOGO_MARCA = incrustar("img/logo-oscar-angulo-marca.png");

const AUTOR = "IA Oscar Angulo Cubero";

/* Contraseña de propietario: no hace falta para abrir el PDF, solo para quitarle
   las restricciones de copia e impresión. Vive acá a propósito, para poder
   volver a generar el archivo. */
const CLAVE_PROPIETARIO = "diagnostico-ai-2026";

function esc(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* Las opciones se barajan para que la correcta no quede siempre primera —el
   banco las guarda con la correcta en `correcta`—, pero con un orden fijo y
   repetible: sale del identificador del ítem, así que el libro y su hoja de
   respuestas siempre coinciden y dos impresiones son idénticas. */
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

/* ---------------------------------------------------- el diagrama impreso */
const GLYPH = { w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
                b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" } };

function piezasDeFen(fen) {
  const mapa = {};
  fen.split(" ")[0].split("/").forEach((fila, i) => {
    let col = 0;
    for (const c of fila) {
      if (/\d/.test(c)) { col += +c; continue; }
      mapa[FILES[col] + (8 - i)] = { color: c === c.toUpperCase() ? "w" : "b", tipo: c.toLowerCase() };
      col++;
    }
  });
  return mapa;
}

function diagrama(fen) {
  const piezas = piezasDeFen(fen);
  let html = '<div class="diagrama"><table class="tablero">';
  for (let r = 8; r >= 1; r--) {
    html += `<tr><td class="coord">${r}</td>`;
    FILES.forEach((f, i) => {
      const p = piezas[f + r];
      html += `<td class="${(i + r - 1) % 2 === 1 ? "clara" : "oscura"}">${p ? GLYPH[p.color][p.tipo] : ""}</td>`;
    });
    html += "</tr>";
  }
  html += '<tr><td class="coord"></td>' + FILES.map((f) => `<td class="coord">${f}</td>`).join("") + "</tr>";
  const turno = fen.split(" ")[1] === "b" ? "Juegan las negras" : "Juegan las blancas";
  return html + `</table><p class="turno">${turno}</p></div>`;
}

/* ------------------------------------------------------- la respuesta */
/* Un ítem de "jugada" puede tener más de una respuesta válida para el mismo
   enunciado (ver `alternas` en el banco): se listan todas. Dar solo una dejaría
   a quien corrige marcando mal una respuesta que es correcta. */
function jugadasBuenas(item) {
  return [item.solucion].concat(item.alternas || [])
    .map((j) => `${j.from}–${j.to}${j.promotion ? "=D" : ""}`);
}

function respuestaCorta(item) {
  if (item.tipo === "jugada") return jugadasBuenas(item).join(" o ");
  if (item.tipo === "casilla") return [item.solucion].concat(item.alternas || []).join(" o ");
  return LETRAS[ordenOpciones(item).indexOf(item.correcta)] + ")";
}

const respuestas = [];

function pregunta(item, n) {
  respuestas.push({ n, id: item.id, corta: respuestaCorta(item), tipo: item.tipo });

  let cuerpo;
  if (item.opciones) {
    cuerpo = '<ol class="opciones">' + ordenOpciones(item).map((original, i) => {
      const bien = original === item.correcta;
      return `<li class="${bien ? "bien" : ""}"><span class="letra">${LETRAS[i]})</span> ${esc(item.opciones[original])}${bien ? ' <span class="tic">✔</span>' : ""}</li>`;
    }).join("") + "</ol>";
  } else {
    const que = item.tipo === "casilla" ? "Casilla" : "Jugada";
    cuerpo = `<p class="solucion"><span class="etiqueta-sol">${que}</span> <strong>${esc(respuestaCorta(item))}</strong> <span class="tic">✔</span></p>`;
  }

  const lado = item.fen
    ? `<div class="con-tablero">${diagrama(item.fen)}<div class="al-lado">${cuerpo}</div></div>`
    : cuerpo;

  return `<section class="pregunta">
      <p class="cabecera"><span class="num">${n}</span> <span class="estrellas">${"★".repeat(item.peso)}${"☆".repeat(5 - item.peso)}</span> <span class="ident">${esc(item.id)}</span></p>
      <p class="enunciado">${esc(item.enunciado)}</p>
      ${lado}
      <p class="explica"><strong>Por qué.</strong> ${esc(item.explica)}</p>
      ${item.prueba ? `<p class="fuente">Cómo se comprobó: ${esc(item.prueba)}</p>` : ""}
    </section>`;
}

/* ---------- cuerpo: un capítulo por área, ordenado por escalón ---------- */
let n = 0;
const capitulos = PE.AREAS.map((area) => {
  const delArea = BANCO.filter((i) => i.area === area.id);
  const porEscalon = PE.ESCALONES.map((peso) => {
    const grupo = delArea.filter((i) => i.peso === peso);
    if (!grupo.length) return "";
    return `<h3 class="escalon">Escalón ${peso} <span class="estrellas">${"★".repeat(peso)}${"☆".repeat(5 - peso)}</span> <span class="cuantas">${grupo.length} ${grupo.length === 1 ? "pregunta" : "preguntas"}</span></h3>` +
      grupo.map((i) => pregunta(i, ++n)).join("");
  }).join("");
  return `<div class="pagina">
      <h2 class="area">${area.emoji} ${esc(area.nombre)} <span class="cuantas">${delArea.length} preguntas</span></h2>
      <p class="mide"><strong>Qué mide.</strong> ${esc(area.mide)}</p>
      <p class="mide"><strong>Cuando está flojo.</strong> ${esc(area.flojo)}</p>
      <p class="mide"><strong>Qué entrenar.</strong> ${esc(area.tareas[0])}</p>
      ${porEscalon}
    </div>`;
}).join("");

/* ---------- índice ---------- */
const indice = PE.AREAS.map((area) => {
  const delArea = BANCO.filter((i) => i.area === area.id);
  const cuenta = PE.ESCALONES.map((p) => delArea.filter((i) => i.peso === p).length).join(" · ");
  return `<tr><td>${area.emoji} ${esc(area.nombre)}</td><td class="num">${delArea.length}</td><td class="reparto">${cuenta}</td></tr>`;
}).join("");

/* ---------- escala de niveles ---------- */
const escala = PE.NIVELES.map((niv) => `<tr>
    <td><strong>${esc(niv.etiqueta)}</strong></td>
    <td class="rango">${esc(niv.rango)}</td>
    <td>${esc(niv.descripcion)}</td>
  </tr>`).join("");

/* ---------- hoja de respuestas ---------- */
const filasResp = [];
for (let i = 0; i < respuestas.length; i += 3) {
  filasResp.push("<tr>" + respuestas.slice(i, i + 3).map((r) =>
    `<td class="resp"><span class="rnum">${r.n}</span> ${esc(r.corta)}</td>`).join("") + "</tr>");
}

const REPARTO = PRUEBA.AREAS.map((a) => {
  const n = PE.ESCALONES.reduce((s, p) => s + PRUEBA.cuota(a, p), 0);
  return `${PE.AREA_POR_ID[a].nombre.toLowerCase()} ${n}`;
}).join(", ");

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Libro del diagnóstico · cuerpo</title>
<style>
  @page { size: A4; margin: 16mm 14mm 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "DejaVu Serif", Georgia, "Times New Roman", serif; font-size: 9.5pt; line-height: 1.38; color: #102a43; }
  h2.area { font-size: 15pt; margin: 0 0 3mm; padding-bottom: 2mm; border-bottom: 2px solid #334e68; }
  h3.escalon { font-size: 10.5pt; margin: 6mm 0 3mm; color: #334e68; border-bottom: 1px solid #d9e2ec; padding-bottom: 1mm; }
  .cuantas { font-size: 8pt; color: #627d98; font-weight: 400; letter-spacing: .02em; }
  .estrellas { color: #de911d; letter-spacing: .06em; }
  .aviso { border: 1.5px solid #de911d; background: #fffaf0; padding: 4mm 5mm; font-size: 9.5pt; margin-bottom: 4mm; }
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
  .solucion { margin: 0 0 1.5mm 9mm; color: #0b6b3a; }
  .etiqueta-sol { font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; color: #627d98; }
  .explica { margin: 0 0 .8mm 9mm; font-size: 8.8pt; color: #334e68; }
  .fuente { margin: 0 0 0 9mm; font-size: 7.6pt; color: #829ab1; font-style: italic; }
  .mide { margin: 0 0 1.5mm; font-size: 9pt; color: #334e68; }

  /* El diagrama va al lado de la respuesta y no encima: con el tablero arriba,
     cada pregunta con posición ocupaba media página y el libro se iba a 120. */
  .con-tablero { display: flex; gap: 5mm; align-items: flex-start; margin-left: 9mm; }
  .con-tablero .al-lado { flex: 1; }
  .con-tablero ol.opciones, .con-tablero .solucion { margin-left: 0; }
  .diagrama { flex: none; }
  table.tablero { border-collapse: collapse; }
  table.tablero td { width: 5.6mm; height: 5.6mm; text-align: center; vertical-align: middle; font-size: 11pt; line-height: 1; color: #102a43; }
  table.tablero td.clara { background: #f0f4f8; border: .3pt solid #9fb3c8; }
  table.tablero td.oscura { background: #bcccdc; border: .3pt solid #9fb3c8; }
  table.tablero td.coord { background: none; border: none; font-size: 6pt; color: #627d98; width: 3.4mm; height: 3.4mm; }
  .turno { font-size: 7pt; color: #627d98; margin: 1mm 0 0; text-align: center; }

  table { width: 100%; border-collapse: collapse; margin-top: 4mm; }
  table, tr, .junto { page-break-inside: avoid; }
  th, td { text-align: left; padding: 1.6mm 2mm; border-bottom: 1px solid #d9e2ec; vertical-align: top; }
  th { font-size: 8pt; text-transform: uppercase; letter-spacing: .05em; color: #627d98; }
  td.num { text-align: right; width: 18mm; font-weight: 700; }
  td.reparto { width: 42mm; color: #627d98; font-size: 8.5pt; }
  td.rango { width: 30mm; color: #627d98; font-size: 8.5pt; }
  table.respuestas td.resp { width: 33.3%; font-family: "DejaVu Sans Mono", monospace; font-size: 8.5pt; }
  .rnum { display: inline-block; min-width: 9mm; color: #627d98; }
  .nota { background: #f0f4f8; border-left: 3px solid #486581; padding: 3mm 4mm; margin: 4mm 0; font-size: 9pt; }
</style>
</head><body>
<div>
  <h2 class="area">Cómo está armado</h2>
  <div class="aviso">
    <strong>Trae las respuestas.</strong> Este libro es para estudiar y para
    corregir: cada pregunta viene con la respuesta marcada, el porqué y cómo se
    comprobó la posición. No sirve para tomarlo como prueba. El diagnóstico se
    rinde en <em>entreno/diagnostico.html</em>, y en papel está
    <em>diagnostico-de-nivel.pdf</em>, que es UNA forma sorteada de ${PRUEBA.TOTAL}
    preguntas — ese sí se le entrega al alumno.
  </div>
  <div class="nota">
    <strong>La prueba sortea, el banco no cambia.</strong> Cada diagnóstico toma
    ${PRUEBA.TOTAL} preguntas de estas ${BANCO.length} —${REPARTO}, cada área con
    una cuota fija de cada escalón— y vale ${PRUEBA.PUNTOS} puntos. Así, dos
    diagnósticos del mismo alumno se comparan aunque las preguntas hayan sido
    otras.
  </div>
  <p><strong>Cada pregunta tiene su dificultad en puntos Elo</strong>: la fuerza
  con la que se acierta la mitad de las veces. Las de tablero salen del rating
  del ejercicio en Lichess; las demás, de las respuestas de los diagnósticos ya
  rendidos, cruzadas con el Elo que declaró cada persona. La fuerza del alumno es
  la que mejor explica cuáles resolvió y cuáles no, con la misma curva del Elo,
  y el nivel es el tramo de Elo de esa fuerza. Resolver una difícil de mover en el
  tablero pesa mucho más que acertar una fácil de opción, donde también se acierta
  al azar. El escalón de cada pregunta (de 1 a 5) es el tramo de su dificultad:
  menos de 1100, 1100 a 1399, 1400 a 1699, 1700 a 1999 y 2000 o más.</p>
  <table>
    <tr><th>Nivel estimado</th><th>Fuerza en Elo</th><th>Qué significa</th></tr>
    ${escala}
  </table>
  <div class="nota" style="margin-top:5mm">
    <strong>Ninguna opción se delata por el largo.</strong> Las cuatro opciones de
    cada pregunta miden prácticamente lo mismo (la correcta nunca gana por más de
    dos caracteres) y la explicación va aparte, nunca dentro de la opción. Antes
    la correcta era la más larga en 91 de 96 ítems: se aprobaba media prueba
    eligiendo la más larga, sin saber ajedrez. Al agregar un ítem hay que
    respetarlo.
  </div>
  <p class="mide"><strong>En todas las posiciones juegan las blancas</strong> salvo
  que el enunciado diga lo contrario, y el tablero se mira siempre desde el lado
  blanco: es una cosa menos que descifrar mientras se mide otra. Los ítems de
  tablero se responden con UNA jugada, también los mates en dos o en tres: se
  pide la jugada clave, no la secuencia.</p>

  <div class="junto">
    <h3 class="escalon">Las áreas</h3>
    <table>
      <tr><th>Área</th><th class="num">Preguntas</th><th class="reparto">Por escalón (1·2·3·4·5)</th></tr>
      ${indice}
    </table>
  </div>
</div>

${capitulos}

<div class="pagina">
  <h2 class="area">Hoja de respuestas</h2>
  <p class="mide">La respuesta de cada pregunta en el orden en que aparecen en este
  libro: la letra de la opción, o la jugada cuando se contesta sobre el tablero.
  En pantalla las opciones se barajan de nuevo en cada intento, así que estas
  letras valen para el papel. Donde dice «o» hay más de una respuesta válida para
  el mismo enunciado: cualquiera de ellas cuenta como buena.</p>
  <table class="respuestas">${filasResp.join("")}</table>
</div>

</body></html>`;

/* ---------- la tapa ----------
   Va en su propio documento, a página completa y sin márgenes ni pie: así el
   fondo llega al borde del papel y el pie del cuerpo no le cae encima. Después
   se pegan los dos con pypdf. */
const ANIO = new Date().getFullYear();
const htmlPortada = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Libro del diagnóstico de nivel</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { width: 210mm; height: 297mm; font-family: "DejaVu Serif", Georgia, "Times New Roman", serif; color: #f0f4f8;
         background: linear-gradient(158deg, #081b2e 0%, #143253 48%, #0a2138 100%); position: relative; overflow: hidden; }
  /* Los adornos van dentro de un recorte propio. Poner overflow:hidden en el
     BODY no sirve: se propaga al viewport en vez de recortar el body, así que el
     tablero del fondo —que asoma 44mm a la derecha— hacía el documento más
     ancho que A4 y Chromium encogía la tapa entera al 79%. Se veía como un
     lomo y un degradado que se cortan antes de llegar al borde de abajo. */
  .fondo { position: absolute; inset: 0; overflow: hidden; }
  .tablero-fondo { position: absolute; right: -44mm; bottom: -44mm; width: 158mm; height: 158mm;
      background-image:
        linear-gradient(45deg, rgba(222,145,29,.14) 25%, transparent 25%, transparent 75%, rgba(222,145,29,.14) 75%),
        linear-gradient(45deg, rgba(222,145,29,.14) 25%, transparent 25%, transparent 75%, rgba(222,145,29,.14) 75%);
      background-size: 21mm 21mm; background-position: 0 0, 10.5mm 10.5mm;
      transform: rotate(-12deg); }
  .brillo { position: absolute; left: -40mm; top: -50mm; width: 150mm; height: 150mm; border-radius: 50%;
      background: radial-gradient(circle, rgba(93,143,196,.22) 0%, rgba(93,143,196,0) 70%); }
  .lomo { position: absolute; left: 0; top: 0; bottom: 0; width: 7mm; background: linear-gradient(180deg, #de911d, #b4740f); }
  .lomo::after { content: ""; position: absolute; left: 7mm; top: 0; bottom: 0; width: 1.2mm; background: rgba(240,244,248,.18); }
  .hoja { position: relative; z-index: 2; height: 297mm; padding: 26mm 20mm 20mm 27mm; display: flex; flex-direction: column; }
  .marca-casa { display: flex; align-items: center; gap: 3mm; font-size: 10pt; letter-spacing: .28em;
      text-transform: uppercase; color: #f0b429; font-weight: 700; }
  .marca-casa .peon { font-size: 16pt; letter-spacing: 0; line-height: 1; }
  .sello-uso { position: absolute; top: 24mm; right: 20mm; z-index: 3; border: 1px solid rgba(240,180,41,.8); color: #f0b429;
      font-size: 7.5pt; letter-spacing: .2em; text-transform: uppercase; padding: 1.6mm 3.5mm; border-radius: 1mm; font-weight: 700; }
  .centro { margin-top: auto; margin-bottom: auto; }
  .eyebrow { font-size: 9.5pt; letter-spacing: .22em; text-transform: uppercase; color: #9fb3c8; margin: 0 0 6mm; }
  h1 { font-size: 42pt; line-height: 1.02; margin: 0; letter-spacing: -.015em; color: #ffffff; font-weight: 700; }
  h1 .segunda { display: block; color: #f0b429; }
  .filete { width: 46mm; height: 1.4mm; background: #de911d; margin: 8mm 0 7mm; }
  .sub { font-size: 13pt; line-height: 1.5; color: #cfdbe6; margin: 0; max-width: 108mm; text-wrap: balance; }
  .cifras { margin: 9mm 0 0; display: flex; gap: 10mm; }
  .cifra { border-left: .8mm solid rgba(240,180,41,.55); padding-left: 4mm; }
  .cifra .n { display: block; font-size: 21pt; font-weight: 700; color: #ffffff; line-height: 1.1; }
  .cifra .q { display: block; font-size: 8pt; letter-spacing: .12em; text-transform: uppercase; color: #9fb3c8; margin-top: 1mm; }
  .logo { display: block; width: 86mm; height: auto; margin: 10mm 0 0; }
  .pie-tapa { margin-top: auto; }
  .autor { font-size: 15pt; font-weight: 700; color: #ffffff; letter-spacing: .02em; margin: 0; }
  .autor-rol { font-size: 8.5pt; letter-spacing: .18em; text-transform: uppercase; color: #f0b429; margin: 1.5mm 0 0; }
  .editorial { margin: 7mm 0 0; padding-top: 4mm; border-top: 1px solid rgba(159,179,200,.3);
      font-size: 8.5pt; color: #9fb3c8; display: flex; justify-content: space-between; gap: 6mm; }
</style>
</head><body>
  <div class="fondo">
    <div class="tablero-fondo"></div>
    <div class="brillo"></div>
  </div>
  <div class="lomo"></div>
  <div class="sello-uso">Uso docente</div>

  <div class="hoja">
    <p class="marca-casa"><span class="peon">&#9822;</span> Ajedrez Integral</p>

    <div class="centro">
      <p class="eyebrow">Diagnóstico de nivel</p>
      <h1>El banco<span class="segunda">de preguntas</span></h1>
      <div class="filete"></div>
      <p class="sub">Todas las preguntas del diagnóstico, con su respuesta, el porqué
        y cómo se comprobó cada posición.</p>
      <div class="cifras">
        <div class="cifra"><span class="n">${BANCO.length}</span><span class="q">preguntas</span></div>
        <div class="cifra"><span class="n">${PE.AREAS.length}</span><span class="q">áreas</span></div>
        <div class="cifra"><span class="n">${PE.ESCALONES.length}</span><span class="q">escalones</span></div>
      </div>
      <img class="logo" src="${LOGO_CREMA}" alt="Oscar Angulo Cubero · Profesional de Ajedrez">
    </div>

    <div class="pie-tapa">
      <p class="autor">${AUTOR}</p>
      <p class="autor-rol">Academia Ajedrez Integral</p>
      <div class="editorial">
        <span>Posiciones y soluciones verificadas con chess.js</span>
        <span>${ANIO}</span>
      </div>
    </div>
  </div>
</body></html>`;

/* ---------- la marca de agua ----------
   Va en su propia hoja y se estampa encima de cada página del cuerpo con pypdf.
   Con CSS (position: fixed) Chromium la repite en todas las páginas pero al
   paginar no respeta el centrado: la marca termina corrida y cortada. */
const htmlMarca = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; width: 210mm; height: 297mm; }
  .sello { position: absolute; left: 52.5mm; top: 109mm; width: 105mm; transform: rotate(-15deg); opacity: .11; }
  .sello img { display: block; width: 105mm; height: auto; }
</style>
</head><body><div class="sello"><img src="${LOGO_MARCA}" alt=""></div></body></html>`;

/* ---------- la versión accesible ----------
   Sin una sola imagen: cada posición va contada pieza por pieza. Un PDF con
   diagramas, marca de agua y cifrado es lo peor que se le puede dar a un lector
   de pantalla, así que el mismo contenido sale también acá. Los encabezados van
   en orden (un h1, h2 por área, h3 por escalón) para poder saltar de sección en
   sección sin leerlo todo. */
function accesible() {
  const capitulos = PE.AREAS.map((area) => {
    const delArea = BANCO.filter((i) => i.area === area.id);
    const secciones = PE.ESCALONES.map((peso) => {
      const grupo = delArea.filter((i) => i.peso === peso);
      if (!grupo.length) return "";
      return `<h3>Escalón ${peso} · ${grupo.length} ${grupo.length === 1 ? "pregunta" : "preguntas"}</h3>` +
        grupo.map((item) => {
          let pos = "";
          if (item.fen) {
            const d = describir(item.fen);
            pos = `<p class="posicion"><strong>La posición.</strong> ${d.turno}
              Piezas blancas: ${esc(d.blancas)}. Piezas negras: ${esc(d.negras)}.
              <span class="fen">FEN: ${esc(item.fen)}</span></p>`;
          }
          let cuerpo;
          if (item.opciones) {
            const orden = ordenOpciones(item);
            cuerpo = "<ol>" + orden.map((original, i) => {
              const bien = original === item.correcta;
              return `<li>${esc(item.opciones[original])}${bien ? " <strong>(correcta)</strong>" : ""}</li>`;
            }).join("") + "</ol>";
          } else {
            cuerpo = `<p class="respuesta"><strong>Respuesta correcta:</strong> ${esc(respuestaCorta(item))}.</p>`;
          }
          return `<article>
            <h4>Pregunta ${esc(item.id)} · dificultad ${item.peso} de 5</h4>
            <p class="enunciado">${esc(item.enunciado)}</p>
            ${pos}
            ${cuerpo}
            <p class="explica"><strong>Por qué.</strong> ${esc(item.explica)}</p>
            ${item.prueba ? `<p class="comprobado"><strong>Cómo se comprobó:</strong> ${esc(item.prueba)}</p>` : ""}
          </article>`;
        }).join("");
    }).join("");
    return `<section><h2>${esc(area.nombre)} · ${delArea.length} preguntas</h2>
      <p><strong>Qué mide.</strong> ${esc(area.mide)}</p>
      <p><strong>Cuando está flojo.</strong> ${esc(area.flojo)}</p>
      ${secciones}</section>`;
  }).join("");

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Libro del diagnóstico de nivel — versión accesible</title>
<style>
  :root { color-scheme: light dark; }
  body { max-width: 42rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; background: #fff; color: #10202e;
         font-family: Georgia, "Times New Roman", serif; font-size: 1.15rem; line-height: 1.8; }
  h1 { font-size: 1.9rem; line-height: 1.25; }
  h2 { font-size: 1.45rem; margin-top: 2.5rem; border-bottom: 2px solid #10202e; padding-bottom: .3rem; }
  h3 { font-size: 1.2rem; margin-top: 1.8rem; }
  h4 { font-size: 1rem; margin: 1.6rem 0 .3rem; font-family: system-ui, sans-serif; letter-spacing: .02em; }
  article { border-top: 1px solid #c9d4de; padding-top: .3rem; }
  .enunciado { font-weight: 700; }
  .posicion { background: #f1f5f8; padding: .7rem .9rem; }
  .fen { display: block; font-family: ui-monospace, monospace; font-size: .85em; word-break: break-all; }
  .comprobado { font-size: .92em; color: #3b4d5c; }
  ol { padding-left: 1.6rem; }
  li { margin-bottom: .35rem; }
  .aviso { border: 2px solid #8a5a00; padding: 1rem; }
  footer { margin-top: 3rem; border-top: 1px solid #c9d4de; padding-top: 1rem; font-size: .95rem; }
  @media (prefers-color-scheme: dark) {
    body { background: #10202e; color: #eef3f7; }
    h2 { border-color: #eef3f7; }
    .posicion { background: #1b3145; }
    .comprobado { color: #b8c7d4; }
    article, footer { border-color: #3b5165; }
  }
</style>
</head><body>
<h1>Libro del diagnóstico de nivel</h1>
<p>El banco entero de preguntas del diagnóstico de Ajedrez Integral, con su
respuesta y el porqué. Es el mismo contenido de <em>libro-de-diagnostico.pdf</em>,
escrito para leerse con lector de pantalla o con la letra agrandada.</p>
<p class="aviso"><strong>Trae las respuestas: es material de uso docente.</strong>
No es la prueba. El diagnóstico se rinde en la página del sitio.</p>
<p><strong>Las posiciones van contadas en palabras</strong>, pieza por pieza, y con
su FEN por si se quieren cargar en un programa de ajedrez. No hay ninguna imagen
en esta página: no hace falta ver nada para usarla.</p>
<p><strong>${BANCO.length} preguntas</strong> repartidas en ${PE.AREAS.length} áreas y
${PE.ESCALONES.length} escalones de dificultad. Cada diagnóstico sortea
${PRUEBA.TOTAL} de ellas y vale ${PRUEBA.PUNTOS} puntos.</p>
${capitulos}
<footer>
  <p>Ajedrez Integral · ${esc(AUTOR)} · ${ANIO}. Material de uso docente.</p>
  <p>Posiciones y soluciones verificadas con chess.js.</p>
</footer>
</body></html>`;
}

/* ------------------------------------------------------------ generar */
const tmp = require("os").tmpdir();
const htmlMarcaTemporal = path.join(tmp, "diagnostico-libro-marca.html");
const htmlPortadaTemporal = path.join(tmp, "diagnostico-libro-portada.html");
const htmlTemporal = path.join(tmp, "diagnostico-libro-cuerpo.html");
fs.writeFileSync(htmlMarcaTemporal, htmlMarca);
fs.writeFileSync(htmlPortadaTemporal, htmlPortada);
fs.writeFileSync(htmlTemporal, html);

const destinoAccesible = path.join(RAIZ, "libro-de-diagnostico-accesible.html");
fs.writeFileSync(destinoAccesible, accesible());

console.log(`Maqueta: ${htmlTemporal}\nTapa:    ${htmlPortadaTemporal}`);
console.log(`${BANCO.length} preguntas · ${PE.AREAS.length} áreas · ${BANCO.filter((i) => i.fen).length} con posición`);
console.log("Accesible:", destinoAccesible);

(async () => {
  const { chromium } = require("playwright");
  const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const destino = path.join(RAIZ, "libro-de-diagnostico.pdf");
  const tapa = path.join(tmp, "diagnostico-libro-tapa.pdf");
  const cuerpo = path.join(tmp, "diagnostico-libro-cuerpo.pdf");
  const marca = path.join(tmp, "diagnostico-libro-marca.pdf");

  const pTapa = await navegador.newPage();
  await pTapa.goto("file://" + htmlPortadaTemporal, { waitUntil: "load" });
  await pTapa.pdf({ path: tapa, format: "A4", printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });

  const pMarca = await navegador.newPage();
  await pMarca.goto("file://" + htmlMarcaTemporal, { waitUntil: "load" });
  await pMarca.pdf({ path: marca, format: "A4", printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });

  const pagina = await navegador.newPage();
  await pagina.goto("file://" + htmlTemporal, { waitUntil: "load" });
  await pagina.pdf({
    path: cuerpo,
    format: "A4",
    printBackground: true,
    margin: { top: "16mm", bottom: "14mm", left: "14mm", right: "14mm" },
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate: '<div style="width:100%;font-size:7.5pt;color:#9fb3c8;font-family:Arial,sans-serif;padding:0 14mm;display:flex;justify-content:space-between;align-items:center;"><span>Ajedrez Integral · Diagnóstico de nivel · uso docente</span><span style="font-weight:700;color:#829ab1;">IA Oscar Angulo Cubero</span><span class="pageNumber"></span></div>',
  });
  await navegador.close();
  unir(tapa, cuerpo, marca, destino);
  proteger(destino);
  console.log("PDF listo:", destino);
})();

/* Tapa y cuerpo salen de dos impresiones distintas (la tapa no lleva márgenes ni
   pie), así que se pegan acá; de paso se estampa la marca de agua sobre cada
   página del cuerpo. La tapa no la lleva: ya tiene el logo en grande y su propio
   sello de uso docente. */
function unir(tapa, cuerpo, marca, destino) {
  const { execFileSync } = require("child_process");
  const guion = `
import sys, zlib
from pypdf import PdfReader, PdfWriter
from pypdf.generic import StreamObject, NameObject
tapa, cuerpo, marca, destino = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
escritor = PdfWriter()
for archivo in (tapa, cuerpo):
    escritor.append_pages_from_reader(PdfReader(archivo))
sello = PdfReader(marca).pages[0]
for n, pagina in enumerate(escritor.pages):
    if n == 0:
        continue
    pagina.merge_page(sello, over=True)

# Estampar deja el contenido de cada página SIN comprimir. Se vuelve a
# comprimir a mano...
for pagina in escritor.pages:
    flujo = StreamObject()
    flujo._data = zlib.compress(pagina.get_contents().get_data(), 9)
    flujo[NameObject("/Filter")] = NameObject("/FlateDecode")
    pagina[NameObject("/Contents")] = escritor._add_object(flujo)
escritor.write(destino)

# ...y se clona el resultado, que es lo que de verdad tira los flujos viejos:
# quedan sueltos pero el escritor los sigue guardando, y clonar solo copia lo
# que cuelga del catálogo.
PdfWriter(clone_from=destino).write(destino)
print("marca de agua en", len(escritor.pages) - 1, "páginas")
`;
  try {
    console.log(String(execFileSync("python3", ["-c", guion, tapa, cuerpo, marca, destino], { stdio: ["ignore", "pipe", "pipe"] })).trim());
  } catch (e) {
    console.error("\nNo se pudieron unir tapa y cuerpo. Falta pypdf: pip install pypdf");
    console.error(String(e.stderr || "").trim().split("\n").slice(-3).join("\n"));
    process.exit(1);
  }
}

/* Chromium no sabe proteger el PDF, así que el archivo se vuelve a escribir con
   pypdf: sin contraseña de apertura (se abre normal) pero sin permiso de copiar,
   editar ni imprimir. Se deja habilitada la extracción de texto para lectores de
   pantalla: bloquearla dejaría el libro fuera del alcance de quien lo lee así, y
   no es lo que se quiere evitar. */
function proteger(archivo) {
  const { execFileSync } = require("child_process");
  const guion = `
import sys
from pypdf import PdfReader, PdfWriter
from pypdf.constants import UserAccessPermissions

archivo, clave, autor = sys.argv[1], sys.argv[2], sys.argv[3]
escritor = PdfWriter()
escritor.append_pages_from_reader(PdfReader(archivo))
escritor.add_metadata({
    "/Title": "Libro del diagnostico de nivel - banco de preguntas",
    "/Author": autor,
    "/Subject": "Diagnostico de nivel de ajedrez - material de uso docente",
    "/Creator": "Ajedrez Integral",
    "/Producer": "Ajedrez Integral",
})
escritor.encrypt(
    user_password="",
    owner_password=clave,
    permissions_flag=UserAccessPermissions.EXTRACT_TEXT_AND_GRAPHICS,
    algorithm="AES-256",
)
with open(archivo, "wb") as f:
    escritor.write(f)
`;
  try {
    execFileSync("python3", ["-c", guion, archivo, CLAVE_PROPIETARIO, AUTOR], { stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    console.error("\nNo se pudo proteger el PDF. Falta pypdf: pip install pypdf");
    console.error(String(e.stderr || "").trim().split("\n").slice(-3).join("\n"));
    fs.unlinkSync(archivo);   // mejor sin archivo que con uno sin proteger
    process.exit(1);
  }
  console.log("Protegido: se abre sin contraseña, no se puede copiar ni imprimir.");
}
