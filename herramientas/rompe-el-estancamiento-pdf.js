/* ===== El libro «Rompe el estancamiento», de Oscar Angulo Cubero =====
 *
 * Arma material/rompe-el-estancamiento/rompe-el-estancamiento.pdf: el libro
 * del curso del mismo nombre. Siete capítulos, uno por familia de errores que
 * frena a un jugador de 1400 a 2100, más el método para encontrar los propios:
 * cada lección con su idea, su ejemplo comentado y su tarea; ejercicios al
 * final de cada capítulo, ejercicios mixtos, las soluciones y la ficha de
 * errores para imprimir.
 *
 * No decide nada de ajedrez: el texto de las lecciones sale de
 * herramientas/cursos/rompe-el-estancamiento.json (el MISMO del curso) y las
 * posiciones de material/rompe-el-estancamiento/banco.js, que arma
 * herramientas/rompe-el-estancamiento-generar.js con Stockfish. Así el libro y
 * el curso dicen lo mismo.
 *
 * Se cierra igual que «Mide tu fuerza» (tapa a página completa, marca de agua
 * con el logo en cada página del cuerpo, firma del autor y PDF protegido:
 * herramientas/lib/pdf-armar.js), y como aquel se deja imprimir: los
 * ejercicios y la ficha de errores se trabajan en papel.
 *
 * El mismo contenido sale también en rompe-el-estancamiento-accesible.html,
 * con cada posición contada pieza por pieza y las jugadas dichas, para quien
 * usa lector de pantalla.
 *
 * Cómo se corre (Node, Chromium por Playwright y pypdf):
 *
 *     node herramientas/rompe-el-estancamiento-pdf.js
 *     node herramientas/rompe-el-estancamiento-pdf.js --solo-accesible   # sin PDF ni pypdf
 *
 * Con CHROMIUM=/ruta/al/chrome se le puede indicar un Chromium ya instalado.
 * Al volver a generar el banco o tocar el texto del curso hay que volver a
 * correr esto.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { Chess } = require("chess.js");
const RAIZ = path.join(__dirname, "..");
const { tablero } = require("./lib/tablero-svg.js");
const { describir } = require("./lib/describir-fen.js");
const N = require("./lib/notacion.js");
const { unir, proteger } = require("./lib/pdf-armar.js");

global.window = {};
eval(fs.readFileSync(path.join(RAIZ, "material/rompe-el-estancamiento/banco.js"), "utf8"));
const LIBRO = global.window.ROMPE_EL_ESTANCAMIENTO;
const ITEMS = global.window.ROMPE_EL_ESTANCAMIENTO_ITEMS;
const CURSO = JSON.parse(fs.readFileSync(path.join(__dirname, "cursos", "rompe-el-estancamiento.json"), "utf8"));

const AUTOR = LIBRO.AUTOR;
const CLAVE_PROPIETARIO = "rompe-el-estancamiento-oac-2026";
const CARPETA = path.join(RAIZ, "material", "rompe-el-estancamiento");
const ANIO = 2026;

function incrustar(relativo) {
  return "data:image/png;base64," + fs.readFileSync(path.join(RAIZ, relativo)).toString("base64");
}
const LOGO_CREMA = incrustar("img/logo-oscar-angulo.png");
const LOGO_MARCA = incrustar("img/logo-oscar-angulo-marca.png");

function esc(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const BANDO = { w: "blancas", b: "negras" };
const RIVAL = { w: "negras", b: "blancas" };

/* ---------------------------------------------------------- el contenido */
let nLeccion = 0;
CURSO.bloques.forEach((b) => b.lecciones.forEach((l) => { l.n = ++nLeccion; l.bloque = b; }));
const LECCIONES = CURSO.bloques.flatMap((b) => b.lecciones);
const EJEMPLO = Object.fromEntries(ITEMS.filter((i) => i.uso === "ejemplo").map((i) => [i.leccion, i]));
const EJERCICIOS = ITEMS.filter((i) => i.uso === "ejercicio");
const MIXTOS = ITEMS.filter((i) => i.uso === "mixto");
const CAPITULOS = CURSO.bloques.filter((b) => b.n <= 7);

/* Numeración del libro: los ejercicios van de corrido (1, 2, 3…) y los
   ejemplos se nombran por su lección; así «Ejercicio 12» es uno solo. */
let k = 0;
EJERCICIOS.concat(MIXTOS).forEach((it) => { it.num = ++k; });
const TOTAL_EJ = k;

function ultimaTexto(it) {
  return `Las ${RIVAL[it.juegan]} acaban de jugar ${it.juegan === "w" ? "…" : ""}${it.ultima}.`;
}

function diagrama(it, rotulo, conPista) {
  return `<div class="ejercicio">
    <p class="cabecera"><span class="num">${esc(rotulo)}</span> <span class="turno ${it.juegan}">Juegan las ${BANDO[it.juegan]}</span></p>
    ${tablero(it.fen, { coordenadas: true, destacar: it.marca, titulo: `${rotulo}. Juegan las ${BANDO[it.juegan]}.` })}
    <p class="ultima">${esc(ultimaTexto(it))}</p>
    ${conPista ? `<p class="pista">${esc(it.pista)}</p>` : ""}
    <p class="respuesta">Tu solución: <span class="raya"></span></p>
  </div>`;
}

function solucion(it) {
  return `<section class="solucion">
    <p class="cabecera"><span class="num">${it.num}</span> <strong>${esc(it.linea)}</strong></p>
    <p class="explica">${it.explica ? esc(it.explica) + " " : ""}${esc(it.pista)}</p>
    <p class="fuente">${esc(it.comprobado)}</p>
  </section>`;
}

/* El ejemplo de cada lección va con su respuesta al lado: es para entender
   la idea, no para medirse. */
function ejemplo(l) {
  const it = EJEMPLO[l.n];
  if (!it) return "";
  return `<div class="ejemplo junto">
    <div class="ej-tablero">${tablero(it.fen, { coordenadas: true, destacar: it.marca, titulo: `Ejemplo de la lección ${l.n}. Juegan las ${BANDO[it.juegan]}.` })}</div>
    <div class="ej-texto">
      <p class="eyebrow-ej">Ejemplo · <span class="turno ${it.juegan}">Juegan las ${BANDO[it.juegan]}</span></p>
      <p>${esc(l.pregunta || "")} ${esc(ultimaTexto(it))}</p>
      <p class="intenta">Piénsalo antes de leer la solución.</p>
      <div class="sol-ej"><strong>${esc(it.linea)}</strong><br>${it.explica ? esc(it.explica) + " " : ""}${esc(l.enlace || "")}</div>
      <p class="fuente">${esc(it.comprobado)}</p>
    </div>
  </div>`;
}

function leccion(l) {
  return `<section class="leccion">
    <h3><span class="nl">${l.n}</span> ${esc(l.titulo)}</h3>
    <p class="resumen">${esc(l.resumen)}</p>
    ${l.parrafos.map((p) => `<p>${esc(p)}</p>`).join("")}
    ${ejemplo(l)}
    <div class="practica"><strong>Para practicar.</strong> ${esc(l.practica)}</div>
  </section>`;
}

function capitulo(b) {
  const ej = EJERCICIOS.filter((i) => i.capitulo === b.n);
  return `<div class="pagina portadilla">
      <p class="eyebrow">Capítulo ${b.n}</p>
      <h2>${esc(b.titulo)}</h2>
      <ol class="indice-cap">${b.lecciones.map((l) => `<li>${esc(l.titulo)}</li>`).join("")}</ol>
    </div>
    <div class="pagina">${b.lecciones.map(leccion).join("")}</div>
    ${ej.length ? `<div class="pagina">
      <h2 class="titulo">Ejercicios del capítulo ${b.n} <span class="tema">${esc(b.titulo)}</span></h2>
      <p class="mide">Ocho posiciones de partidas reales donde aparece lo que trabajó el capítulo, de la más fácil a la más difícil.
      Cada una tiene una sola jugada que funciona. Escribe la solución completa: la jugada, la mejor respuesta del rival y cómo sigues.
      Las soluciones están al final del libro.</p>
      <div class="rejilla">${ej.slice(0, 4).map((i) => diagrama(i, `Ejercicio ${i.num}`, true)).join("")}</div>
    </div>
    <div class="pagina">
      <p class="sigue">Ejercicios del capítulo ${b.n} (continuación)</p>
      <div class="rejilla">${ej.slice(4).map((i) => diagrama(i, `Ejercicio ${i.num}`, true)).join("")}</div>
    </div>` : ""}`;
}

const FAMILIAS = CAPITULOS.map((b) => b.titulo);

const ficha = `<table class="planilla">
  <tr><th>Fecha</th><th>Partida (rival, ritmo)</th><th>Jugada</th><th>Familia del error</th><th class="comentario">Qué pasó y qué debí hacer</th></tr>
  ${Array.from({ length: 18 }, () => "<tr><td></td><td></td><td></td><td></td><td></td></tr>").join("")}
</table>`;

const cuenta = `<table class="planilla cuenta">
  <tr><th>Familia de errores</th>${["1", "2", "3", "4", "5", "6"].map((m) => `<th>Mes ${m}</th>`).join("")}</tr>
  ${FAMILIAS.map((f, i) => `<tr><td class="tema-c">${i + 1}. ${esc(f)}</td>${"<td></td>".repeat(6)}</tr>`).join("")}
  <tr><td class="tema-c"><strong>Partidas analizadas</strong></td>${"<td></td>".repeat(6)}</tr>
</table>`;

const metodo = CURSO.bloques.find((b) => b.n === 8);

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Rompe el estancamiento · cuerpo</title>
<style>
  @page { size: A4; margin: 16mm 15mm 15mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "DejaVu Serif", Georgia, "Times New Roman", serif; font-size: 10.3pt; line-height: 1.5; color: #102a43; }
  h2.titulo { font-size: 17pt; margin: 0 0 2mm; padding-bottom: 2mm; border-bottom: 2px solid #334e68; }
  h2.titulo .tema { color: #a33a2a; margin-left: 2mm; font-size: 13pt; }
  h3 { font-size: 13pt; margin: 8mm 0 1mm; color: #102a43; page-break-after: avoid; }
  h3 .nl { display: inline-block; min-width: 8mm; height: 8mm; line-height: 8mm; text-align: center; border-radius: 50%; background: #a33a2a; color: #fff; font-size: 10pt; margin-right: 2mm; font-family: "DejaVu Sans", Arial, sans-serif; }
  .leccion:first-child h3 { margin-top: 0; }
  .resumen { font-style: italic; color: #486581; margin: 0 0 3mm; }
  .leccion p { margin: 0 0 2.5mm; text-align: justify; }
  .pagina { page-break-before: always; }
  .junto, table, tr { page-break-inside: avoid; }
  .mide { margin: 0 0 3mm; color: #334e68; }
  .nota { background: #f0f4f8; border-left: 3px solid #486581; padding: 2.5mm 4mm; margin: 3mm 0; font-size: 9.5pt; }
  .practica { background: #fbf3f1; border-left: 3px solid #a33a2a; padding: 2.5mm 4mm; margin: 3mm 0 2mm; font-size: 9.5pt; page-break-inside: avoid; }
  .sigue { margin: 0 0 3mm; font-size: 9pt; color: #627d98; font-family: "DejaVu Sans", Arial, sans-serif; }

  .ejemplo { display: flex; gap: 6mm; margin: 4mm 0; padding: 3mm; border: 1px solid #d9e2ec; border-radius: 2mm; }
  .ej-tablero svg { width: 68mm; height: auto; display: block; }
  .ej-texto { flex: 1; font-size: 9.3pt; }
  .ej-texto p { margin: 0 0 2mm; text-align: left; }
  .eyebrow-ej { font-family: "DejaVu Sans", Arial, sans-serif; font-size: 8.5pt; color: #627d98; text-transform: uppercase; letter-spacing: .06em; }
  .intenta { color: #829ab1; font-style: italic; }
  .sol-ej { border-top: 1px dashed #9fb3c8; padding-top: 2mm; margin-bottom: 2mm; }

  .rejilla { display: grid; grid-template-columns: 1fr 1fr; column-gap: 10mm; row-gap: 6mm; }
  .ejercicio { page-break-inside: avoid; }
  .ejercicio svg { width: 80mm; height: auto; display: block; }
  .cabecera { margin: 0 0 1.5mm; font-size: 9pt; color: #627d98; font-family: "DejaVu Sans", Arial, sans-serif; }
  .cabecera .num { display: inline-block; min-width: 10mm; font-weight: 700; color: #102a43; font-size: 11pt; margin-right: 2mm; }
  .turno { font-weight: 700; padding: .3mm 2mm; border-radius: 1mm; border: .4mm solid #334e68; text-transform: none; letter-spacing: 0; }
  .turno.w { background: #ffffff; color: #102a43; }
  .turno.b { background: #102a43; color: #ffffff; }
  .ultima { margin: 1.2mm 0 1mm; font-size: 8.5pt; color: #486581; }
  .pista { margin: 0 0 1mm; font-size: 8.5pt; color: #7a2b1f; font-style: italic; }
  .respuesta { margin: 2mm 0 0; font-size: 8.5pt; color: #486581; display: flex; gap: 2mm; }
  .raya { flex: 1; border-bottom: .4pt solid #9fb3c8; }

  .solucion { page-break-inside: avoid; margin-bottom: 3mm; padding-bottom: 2.5mm; border-bottom: 1px solid #eef2f6; font-size: 9pt; }
  .solucion .cabecera { color: #0b6b3a; font-size: 9.5pt; font-family: "DejaVu Serif", Georgia, serif; }
  .solucion .cabecera strong { font-family: "DejaVu Sans", Arial, sans-serif; }
  .explica { margin: 0 0 .8mm; color: #243b53; }
  .fuente { margin: 0; color: #829ab1; font-style: italic; font-size: 7.5pt; }

  .portadilla { padding-top: 60mm; text-align: center; }
  .portadilla .eyebrow { font-size: 10pt; letter-spacing: .22em; text-transform: uppercase; color: #a33a2a; margin: 0 0 4mm; }
  .portadilla h2 { font-size: 28pt; margin: 0 0 10mm; }
  .portadilla p { max-width: 130mm; margin: 0 auto 4mm; font-size: 11pt; }
  ol.indice-cap { display: inline-block; text-align: left; font-size: 11pt; margin: 0 auto; }
  ol.indice-cap li { margin-bottom: 1.5mm; }

  table.reglas { border-collapse: collapse; width: 100%; margin-top: 3mm; }
  .reglas th, .reglas td { border-bottom: 1px solid #d9e2ec; padding: 1.2mm 2.5mm; text-align: left; vertical-align: top; }
  th { font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; color: #627d98; }
  table.planilla { border-collapse: collapse; width: 100%; font-family: "DejaVu Sans", Arial, sans-serif; font-size: 8pt; margin-top: 3mm; }
  .planilla th, .planilla td { border: .5pt solid #9fb3c8; padding: 0 1.5mm; height: 8.5mm; text-align: center; }
  .planilla th { background: #f0f4f8; color: #334e68; text-transform: none; letter-spacing: 0; height: auto; padding: 1.5mm; }
  .planilla td.tema-c { text-align: left; white-space: nowrap; }
  .planilla th.comentario { width: 70mm; }
  .cuenta td { height: 7mm; }
  ol.habitos li { margin-bottom: 1.6mm; }
</style>
</head><body>

<div>
  <h2 class="titulo">Antes de empezar</h2>
  <p>Este libro es para quien ya sabe jugar, estudia, hace ejercicios… y lleva meses en el mismo Elo. Casi siempre
  pasa entre los 1400 y los 2100 puntos, y casi siempre por lo mismo: pasado cierto nivel, sumar conocimientos ya no
  alcanza. Lo que frena son errores que se repiten partida tras partida y que no son despistes, sino hábitos.</p>
  <p>Aquí esos errores están ordenados en <strong>siete familias</strong>: jugar sin plan, usar mal los conceptos,
  leer la posición a medias, cambiar piezas sin preguntarse qué cambia, calcular con agujeros, olvidarse del rival
  y dejar que la cabeza juegue en contra. Cada capítulo explica una familia, error por error, con un ejemplo de una
  partida real y una tarea concreta. El último capítulo es el más importante: un método para encontrar
  <strong>tus</strong> errores en tus partidas y llevar la cuenta de si están desapareciendo.</p>
  <p>Es el libro del curso «Rompe el estancamiento» de la Academia Ajedrez Integral: dice lo mismo que el curso, con
  los mismos ejemplos, para leerlo en papel, subrayarlo y trabajar los ejercicios con lápiz.</p>

  <div class="nota"><strong>De dónde salen las posiciones.</strong> Las ${ITEMS.length} posiciones del libro son de partidas
  reales, de la base abierta de ejercicios de Lichess, que es de dominio público. Ninguna está inventada ni copiada
  de otro libro. Cada una pasó por el motor Stockfish: solo quedaron las que tienen <strong>una sola jugada
  buena</strong>. Su dificultad también es medida: sale de los miles de personas que ya las intentaron.</div>

  <h2 class="titulo pagina">Cómo usar este libro</h2>
  <ol class="habitos">
    <li><strong>Lee un capítulo a la vez</strong> y, al terminar cada lección, haz su tarea con tus propias partidas.
    Leer sobre un error no lo corrige; encontrarlo en tus partidas, sí.</li>
    <li><strong>Antes de leer la solución de cada ejemplo, piénsalo.</strong> Tapa el texto de la derecha con una hoja y
    busca la jugada. Después lee por qué es esa.</li>
    <li><strong>Al final de cada capítulo hay ocho ejercicios</strong> de sus temas, de menos a más difícil, y al final del
    libro ${MIXTOS.length} ejercicios mixtos donde no se dice qué buscar, como en una partida. En total, ${TOTAL_EJ}
    ejercicios con sus soluciones.</li>
    <li><strong>Sin mover las piezas.</strong> Puedes poner la posición en un tablero, pero no muevas nada hasta tener la
    solución completa escrita: la jugada, la mejor respuesta del rival y cómo sigues.</li>
    <li><strong>Mira quién juega.</strong> El tablero se ve siempre desde el lado de las blancas. Arriba de cada diagrama
    dice quién juega, y la última jugada del rival está marcada: empieza por preguntarte qué quiere.</li>
    <li><strong>Las jugadas van en notación algebraica en español:</strong> R rey, D dama, T torre, A alfil, C caballo;
    x es captura, + jaque y # mate.</li>
    <li><strong>Usa la ficha de errores</strong> del capítulo 8 desde el primer día. Es la parte del libro que más rinde.</li>
  </ol>

  <h2 class="titulo pagina">Índice</h2>
  <table class="reglas">
    <tr><th>Capítulo</th><th>Lecciones</th></tr>
    ${CURSO.bloques.map((b) => `<tr><td><strong>${b.n}. ${esc(b.titulo)}</strong></td><td>${b.lecciones.map((l) => `${l.n}. ${esc(l.titulo)}`).join(" · ")}</td></tr>`).join("")}
    <tr><td><strong>Ejercicios mixtos</strong></td><td>Ejercicios ${MIXTOS[0].num} a ${MIXTOS[MIXTOS.length - 1].num}</td></tr>
    <tr><td><strong>Soluciones</strong></td><td>De los ${TOTAL_EJ} ejercicios</td></tr>
  </table>
</div>

${CAPITULOS.map(capitulo).join("")}

<div class="pagina portadilla">
  <p class="eyebrow">Capítulo 8</p>
  <h2>${esc(metodo.titulo)}</h2>
  <p>El método para encontrar tus propios errores, y la ficha para llevar la cuenta.</p>
</div>
<div class="pagina">${metodo.lecciones.map(leccion).join("")}
  <h3>Las siete familias, en una línea</h3>
  <table class="reglas">
    ${CAPITULOS.map((b) => `<tr><td><strong>${b.n}. ${esc(b.titulo)}</strong></td><td>${b.lecciones.map((l) => esc(l.titulo)).join(" · ")}</td></tr>`).join("")}
  </table>
  <h3>Cómo analizar una partida con la ficha</h3>
  <ol class="habitos">
    <li>Analízala primero sin motor, apenas termine: anota qué pensabas en los momentos importantes, antes de olvidarlo.</li>
    <li>Pásala por el motor y busca los dos o tres momentos en que la evaluación cambió de verdad (más de un peón).</li>
    <li>Para cada momento, pregúntate cuál de las siete familias lo explica mejor. Si dudas entre dos, elige la que
    pasó primero: un error de cálculo suele venir de haber jugado sin plan.</li>
    <li>Escribe en la ficha la fecha, la jugada, la familia y una línea de qué debiste hacer.</li>
    <li>Cada mes, cuenta cuántas veces apareció cada familia en el cuadro de abajo. La que más se repite es tu
    próximo capítulo a releer.</li>
  </ol>
</div>
<div class="pagina">
  <h2 class="titulo">Ficha de errores</h2>
  <p class="mide">Una fila por error. Fotocopia esta página las veces que haga falta.</p>
  ${ficha}
</div>
<div class="pagina">
  <h2 class="titulo">La cuenta de cada mes</h2>
  <p class="mide">Cuántas veces apareció cada familia en las partidas que analizaste ese mes. Lo que buscas no es un cero:
  es que la familia que más te costaba aparezca cada vez menos.</p>
  ${cuenta}
  <div class="nota" style="margin-top:6mm">Llévale la ficha a tu profesor: con ella se arma un plan de entrenamiento hecho a
  tu medida, que es exactamente lo que ningún libro puede darte.</div>
</div>

<div class="pagina">
  <h2 class="titulo">Ejercicios mixtos</h2>
  <p class="mide">En la partida nadie avisa qué buscar. Aquí tampoco: ${MIXTOS.length} posiciones de todas las familias,
  de la más fácil a la más difícil. Algunas piden atacar y otras defender.</p>
  <div class="rejilla">${MIXTOS.slice(0, 4).map((i) => diagrama(i, `Ejercicio ${i.num}`, false)).join("")}</div>
</div>
${Array.from({ length: Math.ceil((MIXTOS.length - 4) / 4) }, (_, p) => `<div class="pagina">
  <p class="sigue">Ejercicios mixtos (continuación)</p>
  <div class="rejilla">${MIXTOS.slice(4 + p * 4, 8 + p * 4).map((i) => diagrama(i, `Ejercicio ${i.num}`, false)).join("")}</div>
</div>`).join("")}

<div class="pagina">
  <h2 class="titulo">Soluciones</h2>
  <p class="mide">Cuenta como resuelto solo si viste la primera jugada y la idea de la línea. Si la primera era la buena
  pero no viste la respuesta del rival, vuelve a mirarla: ese es justamente el error de «dar jugadas por hechas».</p>
  ${CAPITULOS.map((b) => {
    const ej = EJERCICIOS.filter((i) => i.capitulo === b.n);
    return ej.length ? `<h3>Capítulo ${b.n} · ${esc(b.titulo)}</h3>${ej.map(solucion).join("")}` : "";
  }).join("")}
  <h3>Ejercicios mixtos</h3>
  ${MIXTOS.map(solucion).join("")}
</div>

<div class="pagina junto">
  <h2 class="titulo">Para terminar</h2>
  <p>Ningún libro rompe un estancamiento por sí solo. Lo que lo rompe es encontrar qué estás restando en tus partidas y
  dejar de restarlo, una familia a la vez. Vuelve a este libro cada vez que la ficha te diga qué capítulo toca.</p>
  <div class="nota" style="margin-top:8mm"><strong>${esc(AUTOR)}</strong> · Academia Ajedrez Integral, ${ANIO}.
  El texto es propio. Las posiciones salen de la base abierta de ejercicios de Lichess (dominio público, CC0) y se
  comprobaron con Stockfish 16; cada solución cita el número del ejercicio en esa base.</div>
</div>

</body></html>`;

/* ---------------------------------------------------------- la tapa */
const htmlPortada = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Rompe el estancamiento</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { width: 210mm; height: 297mm; font-family: "DejaVu Serif", Georgia, serif; color: #f0f4f8;
         background: linear-gradient(158deg, #2a0f0c 0%, #4a1a14 48%, #220b09 100%); position: relative; overflow: hidden; }
  /* Los adornos van dentro de su propio recorte: overflow:hidden en el body se
     propaga al viewport y Chromium encoge la tapa (ver diagnostico-libro.js). */
  .fondo { position: absolute; inset: 0; overflow: hidden; }
  .tablero-fondo { position: absolute; right: -44mm; bottom: -44mm; width: 158mm; height: 158mm;
      background-image:
        linear-gradient(45deg, rgba(240,180,41,.13) 25%, transparent 25%, transparent 75%, rgba(240,180,41,.13) 75%),
        linear-gradient(45deg, rgba(240,180,41,.13) 25%, transparent 25%, transparent 75%, rgba(240,180,41,.13) 75%);
      background-size: 21mm 21mm; background-position: 0 0, 10.5mm 10.5mm; transform: rotate(-12deg); }
  .grieta { position: absolute; left: 20mm; top: 118mm; width: 190mm; height: 1.2mm; background: rgba(240,180,41,.55); transform: rotate(-8deg); }
  .brillo { position: absolute; left: -40mm; top: -50mm; width: 150mm; height: 150mm; border-radius: 50%;
      background: radial-gradient(circle, rgba(220,120,100,.2) 0%, rgba(220,120,100,0) 70%); }
  .lomo { position: absolute; left: 0; top: 0; bottom: 0; width: 7mm; background: linear-gradient(180deg, #de911d, #b4740f); }
  .hoja { position: relative; z-index: 2; height: 297mm; padding: 26mm 20mm 20mm 27mm; display: flex; flex-direction: column; }
  .marca-casa { font-size: 10pt; letter-spacing: .28em; text-transform: uppercase; color: #f0b429; font-weight: 700; margin: 0; }
  .centro { margin-top: auto; margin-bottom: auto; }
  .eyebrow { font-size: 10pt; letter-spacing: .22em; text-transform: uppercase; color: #e3b5aa; margin: 0 0 6mm; }
  h1 { font-size: 52pt; line-height: 1; margin: 0; color: #ffffff; font-weight: 700; letter-spacing: -.015em; }
  h1 .segunda { display: block; color: #f0b429; }
  .filete { width: 46mm; height: 1.4mm; background: #de911d; margin: 8mm 0 7mm; }
  .sub { font-size: 14pt; line-height: 1.5; color: #f1dcd6; margin: 0; max-width: 125mm; }
  .cifras { margin: 9mm 0 0; display: flex; gap: 10mm; }
  .cifra { border-left: .8mm solid rgba(240,180,41,.55); padding-left: 4mm; }
  .cifra .n { display: block; font-size: 21pt; font-weight: 700; color: #ffffff; line-height: 1.1; }
  .cifra .q { display: block; font-size: 8pt; letter-spacing: .12em; text-transform: uppercase; color: #e3b5aa; margin-top: 1mm; }
  .logo { display: block; width: 86mm; height: auto; margin: 10mm 0 0; }
  .pie-tapa { margin-top: auto; }
  .autor { font-size: 17pt; font-weight: 700; color: #ffffff; margin: 0; }
  .autor-rol { font-size: 8.5pt; letter-spacing: .18em; text-transform: uppercase; color: #f0b429; margin: 1.5mm 0 0; }
  .editorial { margin: 7mm 0 0; padding-top: 4mm; border-top: 1px solid rgba(227,181,170,.3);
      font-size: 8.5pt; color: #e3b5aa; display: flex; justify-content: space-between; gap: 6mm; }
</style>
</head><body>
  <div class="fondo"><div class="tablero-fondo"></div><div class="grieta"></div><div class="brillo"></div></div>
  <div class="lomo"></div>
  <div class="hoja">
    <p class="marca-casa">&#9822; Ajedrez Integral</p>
    <div class="centro">
      <p class="eyebrow">Los errores que frenan tu progreso</p>
      <h1>Rompe el<span class="segunda">estancamiento</span></h1>
      <div class="filete"></div>
      <p class="sub">Las siete familias de errores que repite un jugador de 1400 a 2100, cómo reconocerlas en tus
        partidas y cómo corregirlas una por una.</p>
      <div class="cifras">
        <div class="cifra"><span class="n">${CAPITULOS.length}</span><span class="q">familias</span></div>
        <div class="cifra"><span class="n">${LECCIONES.length}</span><span class="q">lecciones</span></div>
        <div class="cifra"><span class="n">${TOTAL_EJ}</span><span class="q">ejercicios</span></div>
      </div>
      <img class="logo" src="${LOGO_CREMA}" alt="Oscar Angulo Cubero · Profesional de Ajedrez">
    </div>
    <div class="pie-tapa">
      <p class="autor">${esc(AUTOR)}</p>
      <p class="autor-rol">Academia Ajedrez Integral</p>
      <div class="editorial"><span>Posiciones de partidas reales, comprobadas con Stockfish</span><span>${ANIO}</span></div>
    </div>
  </div>
</body></html>`;

/* La marca de agua: el logo, inclinado y tenue, en su propia hoja. */
const htmlMarca = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; width: 210mm; height: 297mm; }
  .sello { position: absolute; left: 52.5mm; top: 109mm; width: 105mm; transform: rotate(-15deg); opacity: .11; }
  .sello img { display: block; width: 105mm; height: auto; }
</style>
</head><body><div class="sello"><img src="${LOGO_MARCA}" alt=""></div></body></html>`;

/* ---------------------------------------------------------- accesible */
/* Sin una sola imagen: la posición se cuenta pieza por pieza y las jugadas van
   dichas («alfil captura felix 6»), que es como se entienden con lector de
   pantalla. */
function accesible() {
  const oido = (t) => N.textoHablado(t, "espanol");
  const posicion = (it) => {
    const d = describir(it.fen);
    return `<p class="posicion"><strong>La posición.</strong> ${d.turno} Piezas blancas: ${esc(d.blancas)}. Piezas negras: ${esc(d.negras)}.
      Las ${RIVAL[it.juegan]} acaban de jugar ${esc(oido((it.juegan === "w" ? "…" : "") + it.ultima))}.
      <span class="fen">FEN: ${esc(it.fen)}</span></p>`;
  };
  const leccionA = (l) => {
    const it = EJEMPLO[l.n];
    return `<section><h3>Lección ${l.n}: ${esc(l.titulo)}</h3>
      <p><em>${esc(oido(l.resumen))}</em></p>
      ${l.parrafos.map((p) => `<p>${esc(oido(p))}</p>`).join("")}
      ${it ? `<h4>Ejemplo de la lección ${l.n}</h4>
      <p>${esc(oido(l.pregunta || ""))}</p>
      ${posicion(it)}
      <p><strong>Solución.</strong> ${esc(oido(it.linea))}. ${esc(it.explica)} ${esc(oido(l.enlace || ""))}</p>
      <p class="comprobado">${esc(oido(it.comprobado))}</p>` : ""}
      <p><strong>Para practicar.</strong> ${esc(oido(l.practica))}</p>
    </section>`;
  };
  const ejercicioA = (it, pista) => `<article><h4>Ejercicio ${it.num}</h4>${pista ? `<p>Pista: ${esc(it.pista)}</p>` : ""}${posicion(it)}</article>`;
  const solucionA = (it) => `<article><h4>Solución del ejercicio ${it.num}</h4>
      <p>${esc(oido(it.linea))}</p>
      <p>${it.explica ? esc(it.explica) + " " : ""}${esc(it.pista)}</p>
      <p class="comprobado">${esc(oido(it.comprobado))}</p></article>`;

  const capitulos = CAPITULOS.map((b) => {
    const ej = EJERCICIOS.filter((i) => i.capitulo === b.n);
    return `<section><h2>Capítulo ${b.n}: ${esc(b.titulo)}</h2>
      ${b.lecciones.map(leccionA).join("")}
      ${ej.length ? `<h3>Ejercicios del capítulo ${b.n}</h3>
      <p>Ocho posiciones de partidas reales, de la más fácil a la más difícil. Cada una tiene una sola jugada que funciona. Las soluciones están al final.</p>
      ${ej.map((i) => ejercicioA(i, true)).join("")}` : ""}
    </section>`;
  }).join("");

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Rompe el estancamiento — versión accesible</title>
<style>
  :root { color-scheme: light dark; }
  body { max-width: 42rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; background: #fff; color: #10202e;
         font-family: Georgia, "Times New Roman", serif; font-size: 1.15rem; line-height: 1.8; }
  h1 { font-size: 1.9rem; line-height: 1.25; }
  h2 { font-size: 1.45rem; margin-top: 2.5rem; border-bottom: 2px solid #10202e; padding-bottom: .3rem; }
  h3 { font-size: 1.2rem; margin: 2rem 0 .3rem; font-family: system-ui, sans-serif; }
  h4 { font-size: 1.05rem; margin: 1.4rem 0 .3rem; font-family: system-ui, sans-serif; }
  article { border-top: 1px solid #c9d4de; padding-top: .3rem; }
  .posicion { background: #f1f5f8; padding: .7rem .9rem; }
  .fen { display: block; font-family: ui-monospace, monospace; font-size: .85em; word-break: break-all; }
  .comprobado { font-size: .92em; color: #3b4d5c; }
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
<h1>Rompe el estancamiento</h1>
<p>Libro de ${esc(AUTOR)}. Es el mismo contenido del libro en PDF, escrito para leerse con lector de pantalla o con
la letra agrandada: las posiciones van contadas pieza por pieza y con su FEN, las jugadas van dichas, y no hay
ninguna imagen.</p>
<p>Siete capítulos, uno por cada familia de errores que frena a un jugador de 1400 a 2100, y un octavo con el método
para encontrar los tuyos. Cada lección trae su idea, un ejemplo de partida real con la solución y una tarea. Al final
de cada capítulo hay ocho ejercicios; al final del libro, ${MIXTOS.length} ejercicios mixtos y las soluciones de los ${TOTAL_EJ}.</p>
<p>Las posiciones son de la base abierta de ejercicios de Lichess (dominio público) y se comprobaron con Stockfish:
cada una tiene una sola jugada buena.</p>
${capitulos}
<section><h2>Capítulo 8: ${esc(metodo.titulo)}</h2>
${metodo.lecciones.map(leccionA).join("")}
<h3>La ficha de errores</h3>
<p>Después de cada partida lenta, anota cada error importante en una fila con cinco datos: la fecha, la partida (rival
y ritmo), la jugada, la familia del error y una línea de qué pasó y qué debiste hacer. Las siete familias son:</p>
<ol>${FAMILIAS.map((f) => `<li>${esc(f)}</li>`).join("")}</ol>
<p>Cada mes, cuenta cuántas veces apareció cada familia y cuántas partidas analizaste. La que más se repite es el próximo
capítulo a releer; lo que buscas es que aparezca cada vez menos.</p>
</section>
<section><h2>Ejercicios mixtos</h2>
<p>Posiciones de todas las familias, sin decir qué buscar, de la más fácil a la más difícil.</p>
${MIXTOS.map((i) => ejercicioA(i, false)).join("")}
</section>
<section><h2>Soluciones</h2>
${EJERCICIOS.concat(MIXTOS).map(solucionA).join("")}
</section>
<footer>
  <p>${esc(AUTOR)} · Academia Ajedrez Integral · ${ANIO}.</p>
  <p>El texto es propio. Las posiciones son de la base abierta de ejercicios de Lichess (CC0), comprobadas con Stockfish 16.</p>
</footer>
</body></html>`;
}

/* ---------------------------------------------------------- generar */
// Antes de imprimir, lo que no puede fallar: que la línea de cada solución
// se pueda jugar entera en su posición. Un libro con una jugada imposible se
// imprime igual.
const INGLES = { R: "K", D: "Q", T: "R", A: "B", C: "N" };
ITEMS.forEach((it) => {
  const g = new Chess(it.fen);
  const jugadas = it.linea.replace(/\d+(\.|…)/g, " ").trim().split(/\s+/);
  jugadas.forEach((san) => {
    const ingles = san.replace(/^[RDTAC]/, (c) => INGLES[c]).replace(/=([DTAC])/, (_, c) => "=" + INGLES[c]);
    if (!g.move(ingles)) throw new Error(`La jugada ${san} de la posición ${it.id} no es legal.`);
  });
  if (jugadas[0] !== it.primera) throw new Error(`La línea de la posición ${it.id} no empieza por ${it.primera}.`);
});
LECCIONES.forEach((l) => {
  if (l.tema && !EJEMPLO[l.n]) throw new Error(`La lección ${l.n} pide un ejemplo y el banco no lo trae: vuelve a correr rompe-el-estancamiento-generar.js.`);
});

fs.mkdirSync(CARPETA, { recursive: true });
const tmp = os.tmpdir();
const htmlTemporal = path.join(tmp, "rompe-el-estancamiento-cuerpo.html");
const htmlPortadaTemporal = path.join(tmp, "rompe-el-estancamiento-tapa.html");
const htmlMarcaTemporal = path.join(tmp, "rompe-el-estancamiento-marca.html");
fs.writeFileSync(htmlTemporal, html);
fs.writeFileSync(htmlPortadaTemporal, htmlPortada);
fs.writeFileSync(htmlMarcaTemporal, htmlMarca);
const destinoAccesible = path.join(CARPETA, "rompe-el-estancamiento-accesible.html");
fs.writeFileSync(destinoAccesible, accesible());
console.log(`Maqueta: ${htmlTemporal}\nAccesible: ${destinoAccesible}`);
console.log(`${LECCIONES.length} lecciones · ${Object.keys(EJEMPLO).length} ejemplos · ${TOTAL_EJ} ejercicios`);
if (process.argv.includes("--solo-accesible")) process.exit(0);

(async () => {
  const { chromium } = require("playwright");
  const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const destino = path.join(CARPETA, "rompe-el-estancamiento.pdf");
  const tapa = path.join(tmp, "rompe-el-estancamiento-tapa.pdf");
  const cuerpo = path.join(tmp, "rompe-el-estancamiento-cuerpo.pdf");
  const marca = path.join(tmp, "rompe-el-estancamiento-marca.pdf");
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
    margin: { top: "16mm", bottom: "15mm", left: "15mm", right: "15mm" },
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate: `<div style="width:100%;font-size:7.5pt;color:#9fb3c8;font-family:Arial,sans-serif;padding:0 15mm;display:flex;justify-content:space-between;align-items:center;"><span>Rompe el estancamiento · Ajedrez Integral</span><span style="font-weight:700;color:#829ab1;">${esc(AUTOR)}</span><span class="pageNumber"></span></div>`,
  });
  await navegador.close();
  unir(tapa, cuerpo, marca, destino);
  proteger(destino, {
    clave: CLAVE_PROPIETARIO, autor: AUTOR, imprimir: true,
    titulo: "Rompe el estancamiento - los errores que frenan tu progreso en ajedrez",
    asunto: "Siete familias de errores, como reconocerlas y corregirlas, con ejercicios comprobados con Stockfish",
  });
  console.log("PDF listo:", destino);
})();
