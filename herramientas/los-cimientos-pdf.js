/* ===== El libro «Los cimientos del ajedrez», de Oscar Angulo Cubero =====
 *
 * Arma material/los-cimientos-del-ajedrez/los-cimientos-del-ajedrez.pdf: el
 * libro del curso del mismo nombre. Tres niveles de 24 lecciones (táctica,
 * finales, juego posicional, estrategia, cálculo y aperturas, en el orden de
 * un método clásico de enseñanza): cada lección con su idea, sus partidas de
 * ejemplo comentadas, su tarea y cuatro ejercicios; un repaso al final de
 * cada nivel y las soluciones.
 *
 * No decide nada de ajedrez: el texto de las lecciones sale de
 * herramientas/cursos/los-cimientos-del-ajedrez.json (el MISMO del curso) y
 * las posiciones de material/los-cimientos-del-ajedrez/banco.js, que arma
 * herramientas/los-cimientos-generar.js con Stockfish. Así el libro y el
 * curso dicen lo mismo.
 *
 * Se cierra igual que «Rompe el estancamiento» (tapa a página completa, marca
 * de agua con el logo en cada página del cuerpo, firma del autor y PDF
 * protegido: herramientas/lib/pdf-armar.js), y como aquel se deja imprimir:
 * los ejercicios se trabajan en papel.
 *
 * El mismo contenido sale también en los-cimientos-del-ajedrez-accesible.html,
 * con cada posición contada pieza por pieza y las jugadas dichas, para quien
 * usa lector de pantalla.
 *
 * Cómo se corre (Node, Chromium por Playwright y pypdf):
 *
 *     node herramientas/los-cimientos-pdf.js
 *     node herramientas/los-cimientos-pdf.js --solo-accesible   # sin PDF ni pypdf
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

const SLUG = "los-cimientos-del-ajedrez";
global.window = {};
eval(fs.readFileSync(path.join(RAIZ, "material", SLUG, "banco.js"), "utf8"));
const LIBRO = global.window.LOS_CIMIENTOS;
const ITEMS = global.window.LOS_CIMIENTOS_ITEMS;
const CURSO = JSON.parse(fs.readFileSync(path.join(__dirname, "cursos", SLUG + ".json"), "utf8"));

const AUTOR = LIBRO.AUTOR;
const TITULO = LIBRO.TITULO;
const CLAVE_PROPIETARIO = "los-cimientos-oac-2026";
const CARPETA = path.join(RAIZ, "material", SLUG);
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
const POR_N = Object.fromEntries(LECCIONES.map((l) => [l.n, l]));
const EJEMPLOS = (n) => ITEMS.filter((i) => i.uso === "ejemplo" && i.leccion === n);
const EJERCICIOS = ITEMS.filter((i) => i.uso === "ejercicio");
const REPASOS = ITEMS.filter((i) => i.uso === "repaso");
const DEL_METODO = ITEMS.filter((i) => i.origen === "libro");

/* Numeración del libro: los ejercicios van de corrido (1, 2, 3…), también los
   del repaso de cada nivel; los ejemplos se nombran por su lección. */
let k = 0;
CURSO.bloques.forEach((b) => {
  EJERCICIOS.filter((i) => i.nivel === b.n).forEach((it) => { it.num = ++k; });
  REPASOS.filter((i) => i.nivel === b.n).forEach((it) => { it.num = ++k; });
});
const TOTAL_EJ = k;
const pista = (it) => (it.uso === "repaso" ? "" : POR_N[it.leccion].pregunta);

function ultimaTexto(it) {
  return `Las ${RIVAL[it.juegan]} acaban de jugar ${it.juegan === "w" ? "…" : ""}${it.ultima}.`;
}

function diagrama(it, rotulo, conPista) {
  return `<div class="ejercicio">
    <p class="cabecera"><span class="num">${esc(rotulo)}</span> <span class="turno ${it.juegan}">Juegan las ${BANDO[it.juegan]}</span></p>
    ${tablero(it.fen, { coordenadas: true, destacar: it.marca, titulo: `${rotulo}. Juegan las ${BANDO[it.juegan]}.` })}
    ${it.partida ? `<p class="partida">${esc(it.partida)}</p>` : ""}
    <p class="ultima">${esc(ultimaTexto(it))}</p>
    ${conPista && pista(it) ? `<p class="pista">${esc(pista(it))}</p>` : ""}
    <p class="respuesta">Tu solución: <span class="raya"></span></p>
  </div>`;
}

function solucion(it) {
  return `<section class="solucion">
    <p class="cabecera"><span class="num">${it.num}</span> <strong>${esc(it.linea)}</strong></p>
    <p class="explica">${it.explica ? esc(it.explica.replace(/\.?$/, ".")) + " " : ""}${it.uso === "repaso" ? `Tema: ${esc(POR_N[it.leccion].titulo)} (lección ${it.leccion}).` : esc(POR_N[it.leccion].enlace)}</p>
    <p class="fuente">${esc(it.comprobado)}</p>
  </section>`;
}

/* Los ejemplos de cada lección van con su respuesta al lado: son para
   entender la idea, no para medirse. */
function ejemplo(l, it, i, total) {
  const rotulo = `Ejemplo${total > 1 ? " " + (i + 1) : ""} de la lección ${l.n}`;
  return `<div class="ejemplo junto">
    <div class="ej-tablero">${tablero(it.fen, { coordenadas: true, destacar: it.marca, titulo: `${rotulo}. Juegan las ${BANDO[it.juegan]}.` })}</div>
    <div class="ej-texto">
      <p class="eyebrow-ej">${total > 1 ? `Ejemplo ${i + 1}` : "Ejemplo"} · <span class="turno ${it.juegan}">Juegan las ${BANDO[it.juegan]}</span></p>
      ${it.partida ? `<p class="partida-ej">${esc(it.partida)}</p>` : ""}
      <p>${esc(l.pregunta || "")} ${esc(ultimaTexto(it))}</p>
      <p class="intenta">Piénsalo antes de leer la solución.</p>
      <div class="sol-ej"><strong>${esc(it.linea)}</strong><br>${it.explica ? esc(it.explica.replace(/\.?$/, ".")) + " " : ""}${esc(l.enlace || "")}</div>
      <p class="fuente">${esc(it.comprobado)}</p>
    </div>
  </div>`;
}

function leccion(l) {
  const ejs = EJEMPLOS(l.n);
  const ejercicios = EJERCICIOS.filter((i) => i.leccion === l.n);
  return `<section class="leccion pagina">
    <p class="area">${esc(l.area)} · Nivel ${l.bloque.n}</p>
    <h3><span class="nl">${l.n}</span> ${esc(l.titulo)}</h3>
    <p class="resumen">${esc(l.resumen)}</p>
    ${l.parrafos.map((p) => `<p>${esc(p)}</p>`).join("")}
    ${ejs.map((it, i) => ejemplo(l, it, i, ejs.length)).join("")}
    <div class="practica"><strong>Para practicar.</strong> ${esc(l.practica)}</div>
  </section>
  <div class="pagina">
    <h2 class="titulo">Ejercicios de la lección ${l.n} <span class="tema">${esc(l.titulo)}</span></h2>
    <div class="rejilla">${ejercicios.map((i) => diagrama(i, `Ejercicio ${i.num}`, true)).join("")}</div>
  </div>`;
}

function nivel(b) {
  const rep = REPASOS.filter((i) => i.nivel === b.n);
  const paginasRepaso = [];
  for (let p = 0; p < rep.length; p += 4) paginasRepaso.push(rep.slice(p, p + 4));
  return `<div class="pagina portadilla">
      <p class="eyebrow">Nivel ${b.n}</p>
      <h2>${esc(b.titulo)}</h2>
      <p>${esc(b.intro)}</p>
      <ol class="indice-cap" start="${b.lecciones[0].n}">${b.lecciones.map((l) => `<li>${esc(l.titulo)} <span class="area-i">${esc(l.area)}</span></li>`).join("")}</ol>
    </div>
    ${b.lecciones.map(leccion).join("")}
    ${paginasRepaso.map((grupo, p) => `<div class="pagina">
      ${p === 0 ? `<h2 class="titulo">Repaso del nivel ${b.n}</h2>
      <p class="mide">${rep.length} posiciones de los temas del nivel, de la más fácil a la más difícil, sin decir de qué lección
      es cada una: como en una partida, nadie avisa qué buscar. Cada una tiene una sola jugada que funciona.</p>` : `<p class="sigue">Repaso del nivel ${b.n} (continuación)</p>`}
      <div class="rejilla">${grupo.map((i) => diagrama(i, `Ejercicio ${i.num}`, false)).join("")}</div>
    </div>`).join("")}`;
}

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${esc(TITULO)} · cuerpo</title>
<style>
  @page { size: A4; margin: 16mm 15mm 15mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "DejaVu Serif", Georgia, "Times New Roman", serif; font-size: 10.3pt; line-height: 1.5; color: #102a43; }
  h2.titulo { font-size: 16pt; margin: 0 0 3mm; padding-bottom: 2mm; border-bottom: 2px solid #334e68; }
  h2.titulo .tema { color: #8a5a00; margin-left: 2mm; font-size: 12pt; }
  h3 { font-size: 14pt; margin: 0 0 1mm; color: #102a43; page-break-after: avoid; }
  h3 .nl { display: inline-block; min-width: 8mm; height: 8mm; line-height: 8mm; text-align: center; border-radius: 50%; background: #1f5f3f; color: #fff; font-size: 10pt; margin-right: 2mm; font-family: "DejaVu Sans", Arial, sans-serif; }
  .area { margin: 0 0 1mm; font-family: "DejaVu Sans", Arial, sans-serif; font-size: 8pt; letter-spacing: .1em; text-transform: uppercase; color: #8a5a00; }
  .resumen { font-style: italic; color: #486581; margin: 0 0 3mm; }
  .leccion p { margin: 0 0 2.5mm; text-align: justify; }
  .pagina { page-break-before: always; }
  .junto, table, tr { page-break-inside: avoid; }
  .mide { margin: 0 0 3mm; color: #334e68; }
  .nota { background: #f0f4f8; border-left: 3px solid #486581; padding: 2.5mm 4mm; margin: 3mm 0; font-size: 9.5pt; }
  .practica { background: #eef6f1; border-left: 3px solid #1f5f3f; padding: 2.5mm 4mm; margin: 3mm 0 2mm; font-size: 9.5pt; page-break-inside: avoid; }
  .sigue { margin: 0 0 3mm; font-size: 9pt; color: #627d98; font-family: "DejaVu Sans", Arial, sans-serif; }

  .ejemplo { display: flex; gap: 6mm; margin: 4mm 0; padding: 3mm; border: 1px solid #d9e2ec; border-radius: 2mm; }
  .ej-tablero svg { width: 66mm; height: auto; display: block; }
  .ej-texto { flex: 1; font-size: 9.3pt; }
  .ej-texto p { margin: 0 0 2mm; text-align: left; }
  .eyebrow-ej { font-family: "DejaVu Sans", Arial, sans-serif; font-size: 8.5pt; color: #627d98; text-transform: uppercase; letter-spacing: .06em; }
  .partida-ej { font-weight: 700; color: #243b53; }
  .intenta { color: #627d98; font-style: italic; }
  .sol-ej { border-top: 1px dashed #9fb3c8; padding-top: 2mm; margin-bottom: 2mm; }

  .rejilla { display: grid; grid-template-columns: 1fr 1fr; column-gap: 10mm; row-gap: 6mm; }
  .ejercicio { page-break-inside: avoid; }
  .ejercicio svg { width: 78mm; height: auto; display: block; }
  .cabecera { margin: 0 0 1.5mm; font-size: 9pt; color: #627d98; font-family: "DejaVu Sans", Arial, sans-serif; }
  .cabecera .num { display: inline-block; min-width: 10mm; font-weight: 700; color: #102a43; font-size: 11pt; margin-right: 2mm; }
  .turno { font-weight: 700; padding: .3mm 2mm; border-radius: 1mm; border: .4mm solid #334e68; text-transform: none; letter-spacing: 0; }
  .turno.w { background: #ffffff; color: #102a43; }
  .turno.b { background: #102a43; color: #ffffff; }
  .partida { margin: 1.2mm 0 0; font-size: 8.5pt; color: #243b53; font-weight: 700; }
  .ultima { margin: .8mm 0 1mm; font-size: 8.5pt; color: #486581; }
  .pista { margin: 0 0 1mm; font-size: 8.5pt; color: #6b4600; font-style: italic; }
  .respuesta { margin: 2mm 0 0; font-size: 8.5pt; color: #486581; display: flex; gap: 2mm; }
  .raya { flex: 1; border-bottom: .4pt solid #9fb3c8; }

  .solucion { page-break-inside: avoid; margin-bottom: 3mm; padding-bottom: 2.5mm; border-bottom: 1px solid #eef2f6; font-size: 9pt; }
  .solucion .cabecera { color: #0b6b3a; font-size: 9.5pt; font-family: "DejaVu Serif", Georgia, serif; }
  .solucion .cabecera strong { font-family: "DejaVu Sans", Arial, sans-serif; }
  .explica { margin: 0 0 .8mm; color: #243b53; }
  .fuente { margin: 0; color: #627d98; font-style: italic; font-size: 7.5pt; }
  h4.sol-l { font-size: 10pt; margin: 4mm 0 1.5mm; color: #1f5f3f; font-family: "DejaVu Sans", Arial, sans-serif; page-break-after: avoid; }

  .portadilla { padding-top: 40mm; text-align: center; }
  .portadilla .eyebrow { font-size: 10pt; letter-spacing: .22em; text-transform: uppercase; color: #8a5a00; margin: 0 0 4mm; }
  .portadilla h2 { font-size: 28pt; margin: 0 0 6mm; }
  .portadilla p { max-width: 140mm; margin: 0 auto 6mm; font-size: 10.5pt; }
  ol.indice-cap { display: inline-block; text-align: left; font-size: 10pt; margin: 0 auto; columns: 2; column-gap: 10mm; }
  ol.indice-cap li { margin-bottom: 1.2mm; break-inside: avoid; }
  .area-i { color: #627d98; font-size: 8pt; font-family: "DejaVu Sans", Arial, sans-serif; }

  table.reglas { border-collapse: collapse; width: 100%; margin-top: 3mm; font-size: 9pt; }
  .reglas th, .reglas td { border-bottom: 1px solid #d9e2ec; padding: 1.2mm 2.5mm; text-align: left; vertical-align: top; }
  th { font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; color: #627d98; }
  ol.habitos li { margin-bottom: 1.6mm; }
</style>
</head><body>

<div>
  <h2 class="titulo">Antes de empezar</h2>
  <p>Este libro es para el jugador de club que ya sabe mover las piezas y quiere unas bases que no se caigan: los dibujos
  de mate y los golpes tácticos que deciden casi todas las partidas, los finales que hay que saber de memoria, las ideas
  de juego posicional que ordenan el medio juego, un método para calcular y las reglas de la apertura.</p>
  <p>Son <strong>72 lecciones en tres niveles</strong>. Los temas no van en bloques cerrados («primero toda la táctica,
  después todos los finales»): se alternan, como en un entrenamiento de verdad, y cada uno vuelve en el nivel
  siguiente un escalón más arriba. Cada lección explica una idea, la muestra en partidas reales, propone una tarea y
  cierra con cuatro ejercicios. Al final de cada nivel hay un repaso de doce posiciones mezcladas.</p>
  <p>Es el libro del curso «${esc(TITULO)}» de la Academia Ajedrez Integral: dice lo mismo que el curso, con los mismos
  ejemplos, para leerlo en papel, subrayarlo y trabajar los ejercicios con lápiz.</p>

  <div class="nota"><strong>De dónde salen las posiciones.</strong> Las ${ITEMS.length} posiciones del libro son de partidas
  reales; ninguna está inventada. ${DEL_METODO.length} son de partidas clásicas y de torneo que se buscaron jugada a jugada en
  una base pública de partidas; las demás, de otras partidas de esa misma base y de la base abierta de ejercicios de
  Lichess, que es de dominio público. Todas pasaron por el motor Stockfish: un ejemplo solo quedó si la jugada de la
  partida es la mejor o vale lo mismo, y un ejercicio solo si tiene <strong>una sola jugada buena</strong>.</div>

  <h2 class="titulo pagina">Cómo usar este libro</h2>
  <ol class="habitos">
    <li><strong>Una lección a la vez, en orden.</strong> Cada nivel da por sabido lo del anterior. Si una lección se te
    hace fácil, haz igual sus ejercicios: es la forma de comprobarlo.</li>
    <li><strong>Antes de leer la solución de cada ejemplo, piénsalo.</strong> Tapa el texto de la derecha con una hoja y
    busca la jugada. Después lee qué pasó en la partida y por qué.</li>
    <li><strong>Los ejercicios, sin mover las piezas.</strong> Puedes poner la posición en un tablero, pero no muevas nada
    hasta tener la solución completa escrita: la jugada, la mejor respuesta del rival y cómo sigues.</li>
    <li><strong>Mira quién juega.</strong> El tablero se ve siempre desde el lado de las blancas. Arriba de cada diagrama
    dice quién juega, y la última jugada del rival está marcada: empieza por preguntarte qué quiere.</li>
    <li><strong>Cuenta tus aciertos.</strong> Si resuelves tres de los cuatro ejercicios de una lección, sigue; si no,
    vuelve a leerla otro día y repite los que fallaste. En el repaso de cada nivel, con ocho de doce estás listo para
    el siguiente.</li>
    <li><strong>Las jugadas van en notación algebraica en español:</strong> R rey, D dama, T torre, A alfil, C caballo;
    x es captura, + jaque y # mate.</li>
  </ol>

  <h2 class="titulo pagina">Índice</h2>
  <table class="reglas">
    <tr><th>Nivel</th><th>Lecciones</th></tr>
    ${CURSO.bloques.map((b) => `<tr><td><strong>${b.n}. ${esc(b.titulo)}</strong></td><td>${b.lecciones.map((l) => `${l.n}. ${esc(l.titulo)}`).join(" · ")} · Repaso del nivel ${b.n}</td></tr>`).join("")}
    <tr><td><strong>Soluciones</strong></td><td>De los ${TOTAL_EJ} ejercicios</td></tr>
  </table>
</div>

${CURSO.bloques.map(nivel).join("")}

<div class="pagina">
  <h2 class="titulo">Soluciones</h2>
  <p class="mide">Cuenta como resuelto solo si viste la primera jugada y la idea de la línea. Si la primera era la buena
  pero no viste la respuesta del rival, vuelve a mirarla con calma.</p>
  ${CURSO.bloques.map((b) => `<h3>Nivel ${b.n} · ${esc(b.titulo)}</h3>
    ${b.lecciones.map((l) => `<h4 class="sol-l">Lección ${l.n} · ${esc(l.titulo)}</h4>${EJERCICIOS.filter((i) => i.leccion === l.n).map(solucion).join("")}`).join("")}
    <h4 class="sol-l">Repaso del nivel ${b.n}</h4>${REPASOS.filter((i) => i.nivel === b.n).map(solucion).join("")}`).join("")}
</div>

<div class="pagina junto">
  <h2 class="titulo">Para terminar</h2>
  <p>Unos buenos cimientos no se notan: se notan cuando faltan. Vuelve a este libro cada vez que en una partida te
  sorprenda algo que ya estaba aquí: ese es el tema que toca repasar.</p>
  <div class="nota" style="margin-top:8mm"><strong>${esc(AUTOR)}</strong> · Academia Ajedrez Integral, ${ANIO}.
  El orden de los temas y buena parte de las partidas de ejemplo siguen el programa de <em>El método Yusupov</em>, de
  Artur Yusupov, que se tomó como referencia; el texto, los comentarios y la selección de ejercicios son propios. Las
  partidas se comprobaron en una base pública de partidas; las demás posiciones salen de la base abierta de ejercicios
  de Lichess (dominio público, CC0). Todo se comprobó con Stockfish 16, y cada solución dice de dónde sale.</div>
</div>

</body></html>`;

/* ---------------------------------------------------------- la tapa */
const htmlPortada = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${esc(TITULO)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { width: 210mm; height: 297mm; font-family: "DejaVu Serif", Georgia, serif; color: #f0f4f8;
         background: linear-gradient(158deg, #0c2a1d 0%, #14402b 48%, #0a2117 100%); position: relative; overflow: hidden; }
  /* Los adornos van dentro de su propio recorte: overflow:hidden en el body se
     propaga al viewport y Chromium encoge la tapa (ver diagnostico-libro.js). */
  .fondo { position: absolute; inset: 0; overflow: hidden; }
  .muro { position: absolute; left: 0; right: 0; bottom: 0; height: 96mm;
      background-image:
        linear-gradient(rgba(240,180,41,.16) 1.2mm, transparent 1.2mm),
        linear-gradient(90deg, rgba(240,180,41,.16) 1.2mm, transparent 1.2mm);
      background-size: 30mm 16mm, 30mm 32mm; background-position: 0 0, 15mm 16mm; }
  .brillo { position: absolute; left: -40mm; top: -50mm; width: 150mm; height: 150mm; border-radius: 50%;
      background: radial-gradient(circle, rgba(120,200,150,.18) 0%, rgba(120,200,150,0) 70%); }
  .lomo { position: absolute; left: 0; top: 0; bottom: 0; width: 7mm; background: linear-gradient(180deg, #de911d, #b4740f); }
  .hoja { position: relative; z-index: 2; height: 297mm; padding: 26mm 20mm 20mm 27mm; display: flex; flex-direction: column; }
  .marca-casa { font-size: 10pt; letter-spacing: .28em; text-transform: uppercase; color: #f0b429; font-weight: 700; margin: 0; }
  .centro { margin-top: auto; margin-bottom: auto; }
  .eyebrow { font-size: 10pt; letter-spacing: .22em; text-transform: uppercase; color: #b9dcc7; margin: 0 0 6mm; }
  h1 { font-size: 50pt; line-height: 1; margin: 0; color: #ffffff; font-weight: 700; letter-spacing: -.015em; }
  h1 .segunda { display: block; color: #f0b429; }
  .filete { width: 46mm; height: 1.4mm; background: #de911d; margin: 8mm 0 7mm; }
  .sub { font-size: 14pt; line-height: 1.5; color: #dcefe3; margin: 0; max-width: 128mm; }
  .cifras { margin: 9mm 0 0; display: flex; gap: 10mm; }
  .cifra { border-left: .8mm solid rgba(240,180,41,.55); padding-left: 4mm; }
  .cifra .n { display: block; font-size: 21pt; font-weight: 700; color: #ffffff; line-height: 1.1; }
  .cifra .q { display: block; font-size: 8pt; letter-spacing: .12em; text-transform: uppercase; color: #b9dcc7; margin-top: 1mm; }
  .logo { display: block; width: 86mm; height: auto; margin: 10mm 0 0; }
  .pie-tapa { margin-top: auto; }
  .autor { font-size: 17pt; font-weight: 700; color: #ffffff; margin: 0; }
  .autor-rol { font-size: 8.5pt; letter-spacing: .18em; text-transform: uppercase; color: #f0b429; margin: 1.5mm 0 0; }
  .editorial { margin: 7mm 0 0; padding-top: 4mm; border-top: 1px solid rgba(185,220,199,.3);
      font-size: 8.5pt; color: #b9dcc7; display: flex; justify-content: space-between; gap: 6mm; }
</style>
</head><body>
  <div class="fondo"><div class="muro"></div><div class="brillo"></div></div>
  <div class="lomo"></div>
  <div class="hoja">
    <p class="marca-casa">&#9822; Ajedrez Integral</p>
    <div class="centro">
      <p class="eyebrow">Un programa en tres niveles</p>
      <h1>Los cimientos<span class="segunda">del ajedrez</span></h1>
      <div class="filete"></div>
      <p class="sub">Táctica, finales, juego posicional, cálculo y aperturas, tema por tema, con las partidas clásicas
        que mejor los muestran y ejercicios para resolver en papel.</p>
      <div class="cifras">
        <div class="cifra"><span class="n">${CURSO.bloques.length}</span><span class="q">niveles</span></div>
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
    return `<p class="posicion"><strong>La posición.</strong> ${it.partida ? `Partida ${esc(it.partida)}. ` : ""}${d.turno} Piezas blancas: ${esc(d.blancas)}. Piezas negras: ${esc(d.negras)}.
      Las ${RIVAL[it.juegan]} acaban de jugar ${esc(oido((it.juegan === "w" ? "…" : "") + it.ultima))}.
      <span class="fen">FEN: ${esc(it.fen)}</span></p>`;
  };
  const leccionA = (l) => {
    const ejs = EJEMPLOS(l.n);
    return `<section><h3>Lección ${l.n}: ${esc(l.titulo)}</h3>
      <p>${esc(l.area)}.</p>
      <p><em>${esc(oido(l.resumen))}</em></p>
      ${l.parrafos.map((p) => `<p>${esc(oido(p))}</p>`).join("")}
      ${ejs.map((it, i) => `<h4>Ejemplo${ejs.length > 1 ? " " + (i + 1) : ""} de la lección ${l.n}</h4>
      <p>${esc(oido(l.pregunta || ""))}</p>
      ${posicion(it)}
      <p><strong>Solución.</strong> ${esc(oido(it.linea))}. ${it.explica ? esc(oido(it.explica.replace(/\.?$/, "."))) + " " : ""}${esc(oido(l.enlace || ""))}</p>
      <p class="comprobado">${esc(oido(it.comprobado))}</p>`).join("")}
      <p><strong>Para practicar.</strong> ${esc(oido(l.practica))}</p>
      <h4>Ejercicios de la lección ${l.n}</h4>
      ${EJERCICIOS.filter((i) => i.leccion === l.n).map((i) => ejercicioA(i, true)).join("")}
    </section>`;
  };
  const ejercicioA = (it, conPista) => `<article><h5>Ejercicio ${it.num}</h5>${conPista && pista(it) ? `<p>Pista: ${esc(oido(pista(it)))}</p>` : ""}${posicion(it)}</article>`;
  const solucionA = (it) => `<article><h4>Solución del ejercicio ${it.num}</h4>
      <p>${esc(oido(it.linea))}</p>
      <p>${it.explica ? esc(oido(it.explica.replace(/\.?$/, "."))) + " " : ""}${it.uso === "repaso" ? `Tema: ${esc(POR_N[it.leccion].titulo)}, lección ${it.leccion}.` : esc(oido(POR_N[it.leccion].enlace))}</p>
      <p class="comprobado">${esc(oido(it.comprobado))}</p></article>`;

  const niveles = CURSO.bloques.map((b) => `<section><h2>Nivel ${b.n}: ${esc(b.titulo)}</h2>
      <p>${esc(oido(b.intro))}</p>
      ${b.lecciones.map(leccionA).join("")}
      <h3>Repaso del nivel ${b.n}</h3>
      <p>Posiciones de los temas del nivel, sin decir de qué lección es cada una, de la más fácil a la más difícil.</p>
      ${REPASOS.filter((i) => i.nivel === b.n).map((i) => ejercicioA(i, false)).join("")}
    </section>`).join("");

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(TITULO)} — versión accesible</title>
<style>
  :root { color-scheme: light dark; }
  body { max-width: 42rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; background: #fff; color: #10202e;
         font-family: Georgia, "Times New Roman", serif; font-size: 1.15rem; line-height: 1.8; }
  h1 { font-size: 1.9rem; line-height: 1.25; }
  h2 { font-size: 1.45rem; margin-top: 2.5rem; border-bottom: 2px solid #10202e; padding-bottom: .3rem; }
  h3 { font-size: 1.2rem; margin: 2rem 0 .3rem; font-family: system-ui, sans-serif; }
  h4 { font-size: 1.05rem; margin: 1.4rem 0 .3rem; font-family: system-ui, sans-serif; }
  h5 { font-size: 1rem; margin: 1rem 0 .2rem; font-family: system-ui, sans-serif; }
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
<h1>${esc(TITULO)}</h1>
<p>Libro de ${esc(AUTOR)}. Es el mismo contenido del libro en PDF, escrito para leerse con lector de pantalla o con
la letra agrandada: las posiciones van contadas pieza por pieza y con su FEN, las jugadas van dichas, y no hay
ninguna imagen.</p>
<p>Setenta y dos lecciones en tres niveles: táctica, finales, juego posicional, estrategia, cálculo y aperturas. Cada
lección trae su idea, sus partidas de ejemplo con la solución, una tarea y cuatro ejercicios. Al final de cada nivel hay
un repaso de ${LIBRO.REPASO} posiciones; al final del libro, las soluciones de los ${TOTAL_EJ} ejercicios.</p>
<p>Todas las posiciones son de partidas reales y se comprobaron con Stockfish: un ejemplo solo quedó si la jugada de la
partida es la mejor, y un ejercicio solo si tiene una sola jugada buena.</p>
${niveles}
<section><h2>Soluciones</h2>
${EJERCICIOS.concat(REPASOS).sort((a, b) => a.num - b.num).map(solucionA).join("")}
</section>
<footer>
  <p>${esc(AUTOR)} · Academia Ajedrez Integral · ${ANIO}.</p>
  <p>El orden de los temas y buena parte de las partidas de ejemplo siguen el programa de El método Yusupov, de Artur
  Yusupov, que se tomó como referencia; el texto, los comentarios y la selección de ejercicios son propios. Las demás
  posiciones son de partidas de una base pública y de la base abierta de ejercicios de Lichess (CC0), comprobadas con
  Stockfish 16.</p>
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
  if (!EJEMPLOS(l.n).length) throw new Error(`La lección ${l.n} no tiene ejemplo: vuelve a correr los-cimientos-generar.js.`);
  if (EJERCICIOS.filter((i) => i.leccion === l.n).length !== LIBRO.POR_LECCION) throw new Error(`La lección ${l.n} no tiene sus ${LIBRO.POR_LECCION} ejercicios.`);
});

fs.mkdirSync(CARPETA, { recursive: true });
const tmp = os.tmpdir();
const htmlTemporal = path.join(tmp, SLUG + "-cuerpo.html");
const htmlPortadaTemporal = path.join(tmp, SLUG + "-tapa.html");
const htmlMarcaTemporal = path.join(tmp, SLUG + "-marca.html");
fs.writeFileSync(htmlTemporal, html);
fs.writeFileSync(htmlPortadaTemporal, htmlPortada);
fs.writeFileSync(htmlMarcaTemporal, htmlMarca);
const destinoAccesible = path.join(CARPETA, SLUG + "-accesible.html");
fs.writeFileSync(destinoAccesible, accesible());
console.log(`Maqueta: ${htmlTemporal}\nAccesible: ${destinoAccesible}`);
console.log(`${LECCIONES.length} lecciones · ${ITEMS.filter((i) => i.uso === "ejemplo").length} ejemplos (${DEL_METODO.filter((i) => i.uso === "ejemplo").length} del método) · ${TOTAL_EJ} ejercicios`);
if (process.argv.includes("--solo-accesible")) process.exit(0);

(async () => {
  const { chromium } = require("playwright");
  const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const destino = path.join(CARPETA, SLUG + ".pdf");
  const tapa = path.join(tmp, SLUG + "-tapa.pdf");
  const cuerpo = path.join(tmp, SLUG + "-cuerpo.pdf");
  const marca = path.join(tmp, SLUG + "-marca.pdf");
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
    footerTemplate: `<div style="width:100%;font-size:7.5pt;color:#9fb3c8;font-family:Arial,sans-serif;padding:0 15mm;display:flex;justify-content:space-between;align-items:center;"><span>${esc(TITULO)} · Ajedrez Integral</span><span style="font-weight:700;color:#829ab1;">${esc(AUTOR)}</span><span class="pageNumber"></span></div>`,
  });
  await navegador.close();
  unir(tapa, cuerpo, marca, destino);
  proteger(destino, {
    clave: CLAVE_PROPIETARIO, autor: AUTOR, imprimir: true,
    titulo: "Los cimientos del ajedrez - un programa en tres niveles",
    asunto: "Tactica, finales, juego posicional, calculo y aperturas en 72 lecciones, con partidas reales comprobadas con Stockfish",
  });
  console.log("PDF listo:", destino);
})();
