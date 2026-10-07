/* ===== El libro «Cambiar o no cambiar», de Oscar Angulo Cubero =====
 *
 * Arma material/cambiar-o-no-cambiar/cambiar-o-no-cambiar.pdf: el libro del
 * curso del mismo nombre. Cuatro capítulos sobre el cambio de piezas (las
 * bases, alfiles y caballos, damas y torres, los cambios paradójicos), cada
 * lección con su idea, su partida modelo comentada y su tarea; los 22
 * ejercicios, sus soluciones y, al final, las 33 partidas modelo completas.
 *
 * No decide nada de ajedrez: el texto de las lecciones sale de
 * herramientas/cursos/cambiar-o-no-cambiar.json (el MISMO del curso) y las
 * posiciones de material/cambiar-o-no-cambiar/banco.js, que arma
 * herramientas/cambiar-o-no-cambiar-generar.js con chess.js y Stockfish. Así
 * el libro y el curso dicen lo mismo.
 *
 * Las partidas y los ejercicios son los que estudia el libro «El cambio de
 * piezas» del MI Diego Valerga (2005), que se cita como fuente. De ese libro
 * se toman las jugadas (que son hechos) y la selección; el texto es propio.
 *
 * Se cierra igual que «Rompe el estancamiento» (tapa a página completa, marca
 * de agua con el logo en cada página del cuerpo, firma del autor y PDF
 * protegido: herramientas/lib/pdf-armar.js), y se deja imprimir: los
 * ejercicios se trabajan en papel.
 *
 * El mismo contenido sale también en cambiar-o-no-cambiar-accesible.html, con
 * cada posición contada pieza por pieza y las jugadas dichas, para quien usa
 * lector de pantalla.
 *
 *     node herramientas/cambiar-o-no-cambiar-pdf.js
 *     node herramientas/cambiar-o-no-cambiar-pdf.js --solo-accesible   # sin PDF ni pypdf
 *
 * Con CHROMIUM=/ruta/al/chrome se le puede indicar un Chromium ya instalado.
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
// El banco lo escribe cambiar-o-no-cambiar-generar.js (es nuestro): se carga igual que en rompe-el-estancamiento-pdf.js.
eval(fs.readFileSync(path.join(RAIZ, "material/cambiar-o-no-cambiar/banco.js"), "utf8"));
const LIBRO = global.window.CAMBIAR_O_NO_CAMBIAR;
const PARTIDAS = global.window.CAMBIAR_O_NO_CAMBIAR_PARTIDAS;
const EJEMPLOS = global.window.CAMBIAR_O_NO_CAMBIAR_EJEMPLOS;
const EJERCICIOS = global.window.CAMBIAR_O_NO_CAMBIAR_EJERCICIOS;
const CURSO = JSON.parse(fs.readFileSync(path.join(__dirname, "cursos", "cambiar-o-no-cambiar.json"), "utf8"));

const AUTOR = LIBRO.AUTOR;
const CLAVE_PROPIETARIO = "cambiar-o-no-cambiar-oac-2026";
const CARPETA = path.join(RAIZ, "material", "cambiar-o-no-cambiar");
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
const PARTIDA = Object.fromEntries(PARTIDAS.map((p) => [p.id, p]));
const cabecera = (p) => `${p.blancas} – ${p.negras} · ${p.lugar}, ${p.anio}`;

/* ---------------------------------------------------------- el contenido */
let nLeccion = 0;
CURSO.bloques.forEach((b) => b.lecciones.forEach((l) => { l.n = ++nLeccion; l.bloque = b; }));
const CAPITULOS = CURSO.bloques.filter((b) => b.lecciones.some((l) => l.ejemplos));
const BLOQUE_EJ = CURSO.bloques.find((b) => b.lecciones.some((l) => l.ejercicios));
const LECCIONES = CAPITULOS.flatMap((b) => b.lecciones);

function ejemplo(e) {
  const p = PARTIDA[e.partida];
  return `<div class="ejemplo junto">
    <div class="ej-tablero">${tablero(e.fen, { coordenadas: true, titulo: `${cabecera(p)}. Juegan las ${BANDO[e.juegan]}.` })}</div>
    <div class="ej-texto">
      <p class="eyebrow-ej">${esc(cabecera(p))}</p>
      <p>${esc(e.pregunta)}</p>
      <p class="intenta">Piénsalo antes de leer la solución.</p>
      <div class="sol-ej"><strong>${esc(e.linea)}</strong><br>${esc(e.comentario)}</div>
      <p class="fuente">${esc(e.comprobado)}</p>
    </div>
  </div>`;
}

function leccion(l) {
  return `<section class="leccion">
    <h3><span class="nl">${l.n}</span> ${esc(l.titulo)}</h3>
    <p class="resumen">${esc(l.resumen)}</p>
    ${l.parrafos.map((t) => `<p>${esc(t)}</p>`).join("")}
    ${EJEMPLOS.filter((e) => e.leccion === l.n).map(ejemplo).join("")}
    <div class="practica"><strong>Para practicar.</strong> ${esc(l.practica)}</div>
  </section>`;
}

function capitulo(b) {
  return `<div class="pagina portadilla">
      <p class="eyebrow">Capítulo ${b.n}</p>
      <h2>${esc(b.titulo)}</h2>
      <ol class="indice-cap" start="${b.lecciones[0].n}">${b.lecciones.map((l) => `<li>${esc(l.titulo)}</li>`).join("")}</ol>
    </div>
    <div class="pagina">${b.lecciones.map(leccion).join("")}</div>`;
}

function diagramaEj(e) {
  return `<div class="ejercicio">
    <p class="cabecera"><span class="num">Ejercicio ${e.n}</span> <span class="turno ${e.juegan}">Juegan las ${BANDO[e.juegan]}</span></p>
    ${tablero(e.fen, { coordenadas: true, titulo: `Ejercicio ${e.n}. Juegan las ${BANDO[e.juegan]}.` })}
    <p class="quien">${esc(e.blancas)} – ${esc(e.negras)} · ${esc(e.lugar)}, ${e.anio}</p>
    <p class="pregunta">${esc(e.pregunta)}</p>
    <p class="respuesta">Tu respuesta: <span class="raya"></span></p>
  </div>`;
}

function solucion(e) {
  return `<section class="solucion">
    <p class="cabecera"><span class="num">${e.n}</span> <strong>${esc(e.linea)}</strong></p>
    <p class="explica">${esc(e.explica)}</p>
    ${e.siguio ? `<p class="explica">En la partida se jugó ${esc(e.siguio)}.</p>` : ""}
    <p class="fuente">${esc(e.comprobado)}</p>
  </section>`;
}

const RESULTADO = { "1-0": "1-0", "0-1": "0-1", "1/2-1/2": "½-½", "*": "" };
function partidaCompleta(p) {
  return `<section class="partida">
    <p class="p-cab"><strong>${esc(p.blancas)} – ${esc(p.negras)}</strong> · ${esc(p.lugar)}, ${p.anio}</p>
    ${p.desde === "diagrama" ? `<p class="p-nota">Desde la posición del diagrama (FEN ${esc(p.fen)}).</p>` : ""}
    <p class="p-jug">${esc(p.jugadas)} ${p.completa ? `<strong>${RESULTADO[p.resultado] || ""}</strong>` : ""}</p>
    ${p.nota ? `<p class="p-nota">${esc(p.nota)}</p>` : ""}
  </section>`;
}

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Cambiar o no cambiar · cuerpo</title>
<style>
  @page { size: A4; margin: 16mm 15mm 15mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "DejaVu Serif", Georgia, "Times New Roman", serif; font-size: 10.3pt; line-height: 1.5; color: #102a43; }
  h2.titulo { font-size: 17pt; margin: 0 0 2mm; padding-bottom: 2mm; border-bottom: 2px solid #334e68; }
  h3 { font-size: 13pt; margin: 8mm 0 1mm; color: #102a43; page-break-after: avoid; }
  h3 .nl { display: inline-block; min-width: 8mm; height: 8mm; line-height: 8mm; text-align: center; border-radius: 50%; background: #1f6e5a; color: #fff; font-size: 10pt; margin-right: 2mm; font-family: "DejaVu Sans", Arial, sans-serif; }
  .leccion:first-child h3 { margin-top: 0; }
  .resumen { font-style: italic; color: #486581; margin: 0 0 3mm; }
  .leccion p { margin: 0 0 2.5mm; text-align: justify; }
  .pagina { page-break-before: always; }
  .junto, table, tr { page-break-inside: avoid; }
  .mide { margin: 0 0 3mm; color: #334e68; }
  .nota { background: #f0f4f8; border-left: 3px solid #486581; padding: 2.5mm 4mm; margin: 3mm 0; font-size: 9.5pt; }
  .practica { background: #eef6f3; border-left: 3px solid #1f6e5a; padding: 2.5mm 4mm; margin: 3mm 0 2mm; font-size: 9.5pt; page-break-inside: avoid; }
  .sigue { margin: 0 0 3mm; font-size: 9pt; color: #627d98; font-family: "DejaVu Sans", Arial, sans-serif; }

  .ejemplo { display: flex; gap: 6mm; margin: 4mm 0; padding: 3mm; border: 1px solid #d9e2ec; border-radius: 2mm; }
  .ej-tablero svg { width: 66mm; height: auto; display: block; }
  .ej-texto { flex: 1; font-size: 9.3pt; }
  .ej-texto p { margin: 0 0 2mm; text-align: left; }
  .eyebrow-ej { font-family: "DejaVu Sans", Arial, sans-serif; font-size: 8pt; color: #627d98; text-transform: uppercase; letter-spacing: .05em; }
  .intenta { color: #829ab1; font-style: italic; }
  .sol-ej { border-top: 1px dashed #9fb3c8; padding-top: 2mm; margin-bottom: 2mm; }

  .rejilla { display: grid; grid-template-columns: 1fr 1fr; column-gap: 10mm; row-gap: 5mm; }
  .ejercicio { page-break-inside: avoid; }
  .ejercicio svg { width: 74mm; height: auto; display: block; }
  .cabecera { margin: 0 0 1.5mm; font-size: 9pt; color: #627d98; font-family: "DejaVu Sans", Arial, sans-serif; }
  .cabecera .num { display: inline-block; min-width: 10mm; font-weight: 700; color: #102a43; font-size: 11pt; margin-right: 2mm; }
  .turno { font-weight: 700; padding: .3mm 2mm; border-radius: 1mm; border: .4mm solid #334e68; font-family: "DejaVu Sans", Arial, sans-serif; font-size: 8.5pt; }
  .turno.w { background: #ffffff; color: #102a43; }
  .turno.b { background: #102a43; color: #ffffff; }
  .quien { margin: 1.2mm 0 .5mm; font-size: 8.3pt; color: #486581; font-family: "DejaVu Sans", Arial, sans-serif; }
  .pregunta { margin: 0 0 1mm; font-size: 8.8pt; }
  .respuesta { margin: 1.5mm 0 0; font-size: 8.5pt; color: #486581; display: flex; gap: 2mm; }
  .raya { flex: 1; border-bottom: .4pt solid #9fb3c8; }

  .solucion { page-break-inside: avoid; margin-bottom: 3mm; padding-bottom: 2.5mm; border-bottom: 1px solid #eef2f6; font-size: 9pt; }
  .solucion .cabecera { color: #0b6b3a; font-size: 9.5pt; font-family: "DejaVu Serif", Georgia, serif; }
  .solucion .cabecera strong { font-family: "DejaVu Sans", Arial, sans-serif; }
  .explica { margin: 0 0 .8mm; color: #243b53; }
  .fuente { margin: 0; color: #829ab1; font-style: italic; font-size: 7.5pt; }

  .partida { page-break-inside: avoid; margin-bottom: 3mm; font-size: 8.6pt; }
  .p-cab { margin: 0 0 .8mm; font-size: 9.3pt; }
  .p-jug { margin: 0; text-align: justify; font-family: "DejaVu Sans", Arial, sans-serif; font-size: 8.2pt; line-height: 1.55; }
  .p-nota { margin: .5mm 0 0; color: #627d98; font-size: 7.8pt; font-style: italic; }
  h4.seccion { font-size: 10.5pt; margin: 5mm 0 2mm; color: #1f6e5a; page-break-after: avoid; }

  .portadilla { padding-top: 60mm; text-align: center; }
  .portadilla .eyebrow { font-size: 10pt; letter-spacing: .22em; text-transform: uppercase; color: #1f6e5a; margin: 0 0 4mm; }
  .portadilla h2 { font-size: 28pt; margin: 0 0 10mm; }
  .portadilla p { max-width: 130mm; margin: 0 auto 4mm; font-size: 11pt; }
  ol.indice-cap { display: inline-block; text-align: left; font-size: 11pt; margin: 0 auto; }
  ol.indice-cap li { margin-bottom: 1.5mm; }

  table.reglas { border-collapse: collapse; width: 100%; margin-top: 3mm; }
  .reglas th, .reglas td { border-bottom: 1px solid #d9e2ec; padding: 1.2mm 2.5mm; text-align: left; vertical-align: top; }
  th { font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; color: #627d98; }
  ol.habitos li { margin-bottom: 1.6mm; }
</style>
</head><body>

<div>
  <h2 class="titulo">Antes de empezar</h2>
  <p>Cada vez que una pieza sale del tablero, la partida cambia: unas piezas se quedan con más trabajo y otras con
  menos, una casilla queda sin defensor, un peón queda débil o un rey queda expuesto. Por eso decidir qué cambiar, y
  qué no, es una de las habilidades que más separan al jugador de club del maestro. Las reglas generales ayudan
  («con ventaja material, cambia piezas», «cambia tu alfil malo», «con más espacio, no cambies»), pero ninguna vale
  siempre.</p>
  <p>Este libro recorre esas reglas en cuatro capítulos —las bases del cambio, alfiles y caballos, damas y torres, y
  los cambios paradójicos de la técnica moderna— con una partida modelo de gran maestro en cada lección. Después
  vienen <strong>${EJERCICIOS.length} ejercicios</strong> de partidas reales para decidir un cambio, con sus
  soluciones, y al final las <strong>${PARTIDAS.length} partidas</strong> completas para reproducirlas en un
  tablero.</p>
  <p>Es el libro del curso «Cambiar o no cambiar» de la Academia Ajedrez Integral: dice lo mismo que el curso, con
  las mismas posiciones, para leerlo en papel y trabajar los ejercicios con lápiz.</p>

  <div class="nota"><strong>De dónde salen las partidas y los ejercicios.</strong> Las partidas modelo y los
  ejercicios son los que estudia el libro <em>${esc(LIBRO.FUENTE)}</em>, una obra muy recomendable sobre este tema.
  De ella se tomaron la selección de partidas y las posiciones de los ejercicios; el texto, las explicaciones y las
  preguntas de este libro son propios. Cada partida se reprodujo jugada por jugada con un programa que comprueba que
  todas sean legales, y cada posición pasó por el motor ${esc(LIBRO.MOTOR)}: lo que dice el motor va escrito al pie,
  también cuando no está de acuerdo con la jugada de la partida.</div>

  <h2 class="titulo pagina">Cómo usar este libro</h2>
  <ol class="habitos">
    <li><strong>Lee un capítulo a la vez.</strong> Cada lección tiene una idea, una partida modelo y una tarea para
    hacer con tus propias partidas.</li>
    <li><strong>Antes de leer la solución de cada ejemplo, piénsalo.</strong> Tapa el texto de la derecha con una hoja,
    decide qué cambiarías y por qué, y después compara.</li>
    <li><strong>Pon las posiciones en un tablero.</strong> Las partidas completas están al final: reproducir la que
    acompaña cada lección ayuda a ver de dónde viene la posición y adónde va.</li>
    <li><strong>Los ${EJERCICIOS.length} ejercicios no están ordenados por tema</strong>, para que no sepas de antemano
    qué regla se aplica. En varios no hay una sola jugada que gana: lo que cuenta es la razón del cambio.</li>
    <li><strong>Escribe la respuesta completa:</strong> la jugada, qué piezas quedan después del cambio y a quién le
    conviene esa posición.</li>
    <li><strong>Las jugadas van en notación algebraica en español:</strong> R rey, D dama, T torre, A alfil, C caballo;
    x es captura, + jaque y # mate. Las evaluaciones del motor van en peones desde el lado de las blancas: +0,5 es
    medio peón a favor de las blancas.</li>
  </ol>

  <h2 class="titulo pagina">Índice</h2>
  <table class="reglas">
    <tr><th>Capítulo</th><th>Lecciones</th></tr>
    ${CAPITULOS.map((b) => `<tr><td><strong>${b.n}. ${esc(b.titulo)}</strong></td><td>${b.lecciones.map((l) => `${l.n}. ${esc(l.titulo)}`).join(" · ")}</td></tr>`).join("")}
    <tr><td><strong>${BLOQUE_EJ.n}. ${esc(BLOQUE_EJ.titulo)}</strong></td><td>${EJERCICIOS.length} posiciones de partidas de grandes maestros</td></tr>
    <tr><td><strong>Soluciones</strong></td><td>De los ${EJERCICIOS.length} ejercicios</td></tr>
    <tr><td><strong>Las partidas</strong></td><td>Las ${PARTIDAS.length} partidas modelo completas</td></tr>
  </table>
</div>

${CAPITULOS.map(capitulo).join("")}

<div class="pagina portadilla">
  <p class="eyebrow">Capítulo ${BLOQUE_EJ.n}</p>
  <h2>${esc(BLOQUE_EJ.titulo)}</h2>
  <p>${EJERCICIOS.length} posiciones de partidas entre grandes maestros donde hay que decidir un cambio. No están
  ordenadas por tema ni por dificultad: en la partida nadie avisa qué buscar.</p>
</div>
${Array.from({ length: Math.ceil(EJERCICIOS.length / 4) }, (_, k) => `<div class="pagina">
  ${k === 0 ? `<h2 class="titulo">Ejercicios</h2>
  <p class="mide">Para cada uno: ¿qué piezas quedarían después del cambio?, ¿a quién le conviene esa posición?, ¿cuál es
  la jugada? Las soluciones están después del último ejercicio.</p>` : `<p class="sigue">Ejercicios (continuación)</p>`}
  <div class="rejilla">${EJERCICIOS.slice(k * 4, k * 4 + 4).map(diagramaEj).join("")}</div>
</div>`).join("")}

<div class="pagina">
  <h2 class="titulo">Soluciones</h2>
  <p class="mide">Cuenta el ejercicio como resuelto si acertaste la jugada <em>y</em> la razón. Si acertaste la jugada
  por otro motivo, vuelve a leer la explicación: en el cambio de piezas, la razón es lo que se aprende.</p>
  ${EJERCICIOS.map(solucion).join("")}
</div>

<div class="pagina">
  <h2 class="titulo">Las partidas</h2>
  <p class="mide">Las ${PARTIDAS.length} partidas modelo del libro, tal como se jugaron, para reproducirlas en un tablero.
  Algunas empiezan desde la posición de su diagrama, en el momento que interesa.</p>
  ${[1, 2, 3, 4].map((c) => {
    const de = PARTIDAS.filter((p) => p.capitulo === c);
    return `<h4 class="seccion">Capítulo ${c} · ${esc(CURSO.bloques[c - 1].titulo)}</h4>${de.map(partidaCompleta).join("")}`;
  }).join("")}
</div>

<div class="pagina junto">
  <h2 class="titulo">Para terminar</h2>
  <p>Ninguna regla decide un cambio por ti. Lo que sí puedes hacer es preguntarte, antes de cada uno, qué piezas
  quedan, quién se queda con las que trabajan y qué posición es la que buscas. Con el tiempo esas preguntas se
  vuelven automáticas, y entonces el cambio correcto empieza a verse solo.</p>
  <div class="nota" style="margin-top:8mm"><strong>${esc(AUTOR)}</strong> · Academia Ajedrez Integral, ${ANIO}.
  El texto es propio. Las partidas y las posiciones de los ejercicios son las que estudia <em>${esc(LIBRO.FUENTE)}</em>;
  se comprobaron con chess.js y con ${esc(LIBRO.MOTOR)}.</div>
</div>

</body></html>`;

/* ---------------------------------------------------------- la tapa */
const htmlPortada = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Cambiar o no cambiar</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { width: 210mm; height: 297mm; font-family: "DejaVu Serif", Georgia, serif; color: #f0f4f8;
         background: linear-gradient(158deg, #0b2a24 0%, #134438 48%, #08201b 100%); position: relative; overflow: hidden; }
  /* Los adornos van dentro de su propio recorte: overflow:hidden en el body se
     propaga al viewport y Chromium encoge la tapa (ver diagnostico-libro.js). */
  .fondo { position: absolute; inset: 0; overflow: hidden; }
  .tablero-fondo { position: absolute; right: -44mm; bottom: -44mm; width: 158mm; height: 158mm;
      background-image:
        linear-gradient(45deg, rgba(240,180,41,.13) 25%, transparent 25%, transparent 75%, rgba(240,180,41,.13) 75%),
        linear-gradient(45deg, rgba(240,180,41,.13) 25%, transparent 25%, transparent 75%, rgba(240,180,41,.13) 75%);
      background-size: 21mm 21mm; background-position: 0 0, 10.5mm 10.5mm; transform: rotate(-12deg); }
  .flechas { position: absolute; left: 118mm; top: 34mm; font-size: 64pt; color: rgba(240,180,41,.35); letter-spacing: -.05em; }
  .brillo { position: absolute; left: -40mm; top: -50mm; width: 150mm; height: 150mm; border-radius: 50%;
      background: radial-gradient(circle, rgba(120,220,190,.18) 0%, rgba(120,220,190,0) 70%); }
  .lomo { position: absolute; left: 0; top: 0; bottom: 0; width: 7mm; background: linear-gradient(180deg, #de911d, #b4740f); }
  .hoja { position: relative; z-index: 2; height: 297mm; padding: 26mm 20mm 20mm 27mm; display: flex; flex-direction: column; }
  .marca-casa { font-size: 10pt; letter-spacing: .28em; text-transform: uppercase; color: #f0b429; font-weight: 700; margin: 0; }
  .centro { margin-top: auto; margin-bottom: auto; }
  .eyebrow { font-size: 10pt; letter-spacing: .22em; text-transform: uppercase; color: #a8dccb; margin: 0 0 6mm; }
  h1 { font-size: 54pt; line-height: 1; margin: 0; color: #ffffff; font-weight: 700; letter-spacing: -.015em; }
  h1 .segunda { display: block; color: #f0b429; }
  .filete { width: 46mm; height: 1.4mm; background: #de911d; margin: 8mm 0 7mm; }
  .sub { font-size: 14pt; line-height: 1.5; color: #d6efe7; margin: 0; max-width: 125mm; }
  .cifras { margin: 9mm 0 0; display: flex; gap: 10mm; }
  .cifra { border-left: .8mm solid rgba(240,180,41,.55); padding-left: 4mm; }
  .cifra .n { display: block; font-size: 21pt; font-weight: 700; color: #ffffff; line-height: 1.1; }
  .cifra .q { display: block; font-size: 8pt; letter-spacing: .12em; text-transform: uppercase; color: #a8dccb; margin-top: 1mm; }
  .logo { display: block; width: 86mm; height: auto; margin: 10mm 0 0; }
  .pie-tapa { margin-top: auto; }
  .autor { font-size: 17pt; font-weight: 700; color: #ffffff; margin: 0; }
  .autor-rol { font-size: 8.5pt; letter-spacing: .18em; text-transform: uppercase; color: #f0b429; margin: 1.5mm 0 0; }
  .editorial { margin: 7mm 0 0; padding-top: 4mm; border-top: 1px solid rgba(168,220,203,.3);
      font-size: 8.5pt; color: #a8dccb; display: flex; justify-content: space-between; gap: 6mm; }
</style>
</head><body>
  <div class="fondo"><div class="tablero-fondo"></div><div class="flechas">&#8644;</div><div class="brillo"></div></div>
  <div class="lomo"></div>
  <div class="hoja">
    <p class="marca-casa">&#9822; Ajedrez Integral</p>
    <div class="centro">
      <p class="eyebrow">El cambio de piezas en la estrategia</p>
      <h1>Cambiar<span class="segunda">o no cambiar</span></h1>
      <div class="filete"></div>
      <p class="sub">Qué piezas cambiar, cuáles conservar y por qué: las reglas clásicas, sus excepciones y la técnica
        moderna, en partidas de grandes maestros.</p>
      <div class="cifras">
        <div class="cifra"><span class="n">${LECCIONES.length}</span><span class="q">lecciones</span></div>
        <div class="cifra"><span class="n">${PARTIDAS.length}</span><span class="q">partidas</span></div>
        <div class="cifra"><span class="n">${EJERCICIOS.length}</span><span class="q">ejercicios</span></div>
      </div>
      <img class="logo" src="${LOGO_CREMA}" alt="Oscar Angulo Cubero · Profesional de Ajedrez">
    </div>
    <div class="pie-tapa">
      <p class="autor">${esc(AUTOR)}</p>
      <p class="autor-rol">Academia Ajedrez Integral</p>
      <div class="editorial"><span>Partidas de grandes maestros, comprobadas con Stockfish</span><span>${ANIO}</span></div>
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
  const posicion = (fen) => {
    const d = describir(fen);
    return `<p class="posicion"><strong>La posición.</strong> ${d.turno} Piezas blancas: ${esc(d.blancas)}. Piezas negras: ${esc(d.negras)}.
      <span class="fen">FEN: ${esc(fen)}</span></p>`;
  };
  const leccionA = (l) => `<section><h3>Lección ${l.n}: ${esc(l.titulo)}</h3>
      <p><em>${esc(oido(l.resumen))}</em></p>
      ${l.parrafos.map((t) => `<p>${esc(oido(t))}</p>`).join("")}
      ${EJEMPLOS.filter((e) => e.leccion === l.n).map((e) => `<h4>Partida modelo: ${esc(cabecera(PARTIDA[e.partida]))}</h4>
      <p>${esc(oido(e.pregunta))}</p>
      ${posicion(e.fen)}
      <p><strong>Solución.</strong> ${esc(oido(e.linea))}. ${esc(oido(e.comentario))}</p>
      <p class="comprobado">${esc(oido(e.comprobado))}</p>`).join("")}
      <p><strong>Para practicar.</strong> ${esc(oido(l.practica))}</p>
    </section>`;
  const ejercicioA = (e) => `<article><h4>Ejercicio ${e.n}</h4>
      <p>${esc(e.blancas)} contra ${esc(e.negras)}, ${esc(e.lugar)}, ${e.anio}. ${esc(oido(e.pregunta))}</p>
      ${posicion(e.fen)}<p>Pista: ${esc(oido(e.pista))}</p></article>`;
  const solucionA = (e) => `<article><h4>Solución del ejercicio ${e.n}</h4>
      <p>${esc(oido(e.linea))}.</p>
      <p>${esc(oido(e.explica))}</p>
      ${e.siguio ? `<p>En la partida se jugó ${esc(oido(e.siguio))}.</p>` : ""}
      <p class="comprobado">${esc(oido(e.comprobado))}</p></article>`;
  const partidaA = (p) => `<article><h4>${esc(p.blancas)} contra ${esc(p.negras)}, ${esc(p.lugar)}, ${p.anio}</h4>
      ${p.desde === "diagrama" ? posicion(p.fen) : ""}
      <p>${esc(oido(p.jugadas))}. ${p.completa ? esc({ "1-0": "Ganaron las blancas.", "0-1": "Ganaron las negras.", "1/2-1/2": "Tablas." }[p.resultado] || "") : ""}</p>
      ${p.nota ? `<p>${esc(oido(p.nota))}</p>` : ""}</article>`;

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Cambiar o no cambiar — versión accesible</title>
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
<h1>Cambiar o no cambiar</h1>
<p>Libro de ${esc(AUTOR)}. Es el mismo contenido del libro en PDF, escrito para leerse con lector de pantalla o con
la letra agrandada: las posiciones van contadas pieza por pieza y con su FEN, las jugadas van dichas, y no hay
ninguna imagen.</p>
<p>Cuatro capítulos sobre el cambio de piezas, cada lección con su idea, una partida modelo con la solución y una
tarea; después, ${EJERCICIOS.length} ejercicios de partidas reales con sus soluciones, y las ${PARTIDAS.length} partidas modelo completas.</p>
<p>Las partidas y los ejercicios son los que estudia el libro ${esc(LIBRO.FUENTE)}. El texto es propio. Cada
partida se comprobó jugada por jugada y cada posición pasó por el motor ${esc(LIBRO.MOTOR)}.</p>
${CAPITULOS.map((b) => `<section><h2>Capítulo ${b.n}: ${esc(b.titulo)}</h2>${b.lecciones.map(leccionA).join("")}</section>`).join("")}
<section><h2>Capítulo ${BLOQUE_EJ.n}: ${esc(BLOQUE_EJ.titulo)}</h2>
<p>Posiciones de partidas de grandes maestros donde hay que decidir un cambio, sin orden de tema ni de dificultad. Las soluciones están después.</p>
${EJERCICIOS.map(ejercicioA).join("")}
</section>
<section><h2>Soluciones</h2>
${EJERCICIOS.map(solucionA).join("")}
</section>
<section><h2>Las partidas</h2>
${PARTIDAS.map(partidaA).join("")}
</section>
<footer>
  <p>${esc(AUTOR)} · Academia Ajedrez Integral · ${ANIO}.</p>
  <p>El texto es propio. Las partidas y las posiciones de los ejercicios son las que estudia ${esc(LIBRO.FUENTE)}, comprobadas con ${esc(LIBRO.MOTOR)}.</p>
</footer>
</body></html>`;
}

/* ---------------------------------------------------------- generar */
// Antes de imprimir, lo que no puede fallar: que cada línea se pueda jugar
// entera en su posición. Un libro con una jugada imposible se imprime igual.
const INGLES = { R: "K", D: "Q", T: "R", A: "B", C: "N" };
function comprobarLinea(fen, linea, quien) {
  const g = new Chess(fen);
  const jugadas = linea.replace(/\d+(\.|…)/g, " ").trim().split(/\s+/);
  jugadas.forEach((san) => {
    const ingles = san.replace(/^[RDTAC]/, (c) => INGLES[c]).replace(/=([DTAC])/, (_, c) => "=" + INGLES[c]);
    if (!g.move(ingles)) throw new Error(`La jugada ${san} de ${quien} no es legal.`);
  });
  return jugadas;
}
EJEMPLOS.forEach((e) => {
  const j = comprobarLinea(e.fen, e.linea, `el ejemplo ${e.id}`);
  if (j[0] !== e.primera) throw new Error(`La línea del ejemplo ${e.id} no empieza por ${e.primera}.`);
});
EJERCICIOS.forEach((e) => {
  const j = comprobarLinea(e.fen, e.linea, `el ejercicio ${e.n}`);
  if (j[0] !== e.primera) throw new Error(`La línea del ejercicio ${e.n} no empieza por ${e.primera}.`);
  if (e.siguio) comprobarLinea(e.fen, e.siguio, `lo que siguió en el ejercicio ${e.n}`);
});
PARTIDAS.forEach((p) => comprobarLinea(p.fen, p.jugadas, `la partida ${p.id}`));
LECCIONES.forEach((l) => {
  if (!EJEMPLOS.some((e) => e.leccion === l.n)) throw new Error(`La lección ${l.n} no tiene su partida modelo: vuelve a correr cambiar-o-no-cambiar-generar.js.`);
});

fs.mkdirSync(CARPETA, { recursive: true });
const tmp = os.tmpdir();
const htmlTemporal = path.join(tmp, "cambiar-o-no-cambiar-cuerpo.html");
const htmlPortadaTemporal = path.join(tmp, "cambiar-o-no-cambiar-tapa.html");
const htmlMarcaTemporal = path.join(tmp, "cambiar-o-no-cambiar-marca.html");
fs.writeFileSync(htmlTemporal, html);
fs.writeFileSync(htmlPortadaTemporal, htmlPortada);
fs.writeFileSync(htmlMarcaTemporal, htmlMarca);
const destinoAccesible = path.join(CARPETA, "cambiar-o-no-cambiar-accesible.html");
fs.writeFileSync(destinoAccesible, accesible());
console.log(`Maqueta: ${htmlTemporal}\nAccesible: ${destinoAccesible}`);
console.log(`${LECCIONES.length} lecciones · ${EJEMPLOS.length} ejemplos · ${EJERCICIOS.length} ejercicios · ${PARTIDAS.length} partidas`);
if (process.argv.includes("--solo-accesible")) process.exit(0);

(async () => {
  const { chromium } = require("playwright");
  const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const destino = path.join(CARPETA, "cambiar-o-no-cambiar.pdf");
  const tapa = path.join(tmp, "cambiar-o-no-cambiar-tapa.pdf");
  const cuerpo = path.join(tmp, "cambiar-o-no-cambiar-cuerpo.pdf");
  const marca = path.join(tmp, "cambiar-o-no-cambiar-marca.pdf");
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
    footerTemplate: `<div style="width:100%;font-size:7.5pt;color:#9fb3c8;font-family:Arial,sans-serif;padding:0 15mm;display:flex;justify-content:space-between;align-items:center;"><span>Cambiar o no cambiar · Ajedrez Integral</span><span style="font-weight:700;color:#829ab1;">${esc(AUTOR)}</span><span class="pageNumber"></span></div>`,
  });
  await navegador.close();
  unir(tapa, cuerpo, marca, destino);
  proteger(destino, {
    clave: CLAVE_PROPIETARIO, autor: AUTOR, imprimir: true,
    titulo: "Cambiar o no cambiar - el cambio de piezas en la estrategia",
    asunto: "Que piezas cambiar y cuales conservar: reglas clasicas, excepciones y tecnica moderna, con partidas de grandes maestros y ejercicios",
  });
  console.log("PDF listo:", destino);
})();
