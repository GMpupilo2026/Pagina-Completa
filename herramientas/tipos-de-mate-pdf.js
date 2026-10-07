/* ===== El libro «Los tipos de mate», para imprimir y dar a los alumnos =====
 *
 * Arma material/tipos-de-mate/tipos-de-mate.pdf: las 19 figuras de mate que
 * hay que reconocer, cada una con su explicación, su diagrama modelo y 8
 * ejercicios, las soluciones al final y una planilla para anotar el avance.
 * Es de los entrenadores Oscar Angulo Cubero y Sebastian Mora Chavarria, y
 * los dos van en la tapa y en el pie de cada página.
 *
 * Todo sale de material/tipos-de-mate/banco.json, que arma
 * herramientas/tipos-de-mate-banco.js con los ejercicios ya revisados de
 * «Ejercicios por tema» y las fichas de Estudio: este script no decide nada
 * de ajedrez, solo lo pone en papel.
 *
 * Se cierra igual que «Mide tu fuerza» (tapa a página completa, marca de agua
 * con el logo en cada página del cuerpo y PDF protegido que se deja imprimir:
 * herramientas/lib/pdf-armar.js). El mismo contenido sale también en
 * tipos-de-mate-accesible.html, con cada posición contada pieza por pieza.
 *
 * Cómo se corre (Node, Chromium por Playwright y pypdf):
 *
 *     node herramientas/tipos-de-mate-pdf.js
 *     node herramientas/tipos-de-mate-pdf.js --solo-accesible   # sin PDF ni pypdf
 *
 * Con CHROMIUM=/ruta/al/chrome se le puede indicar un Chromium ya instalado.
 * Al volver a armar el banco hay que volver a correr esto.
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

const CARPETA = path.join(RAIZ, "material", "tipos-de-mate");
const { capitulos: CAPITULOS } = JSON.parse(fs.readFileSync(path.join(CARPETA, "banco.json"), "utf8"));
const EJERCICIOS = CAPITULOS.flatMap((c) => c.ejercicios);
const TOTAL = EJERCICIOS.length;

const AUTORES = ["Oscar Angulo Cubero", "Sebastian Mora Chavarria"];
const ENTRENADORES = `Entrenadores ${AUTORES[0]} y ${AUTORES[1]}`;
const CLAVE_PROPIETARIO = "tipos-de-mate-oac-2026";
const ANIO = 2026;

function incrustar(relativo) {
  return "data:image/png;base64," + fs.readFileSync(path.join(RAIZ, relativo)).toString("base64");
}
const LOGO_MARCA = incrustar("img/logo-oscar-angulo-marca.png");
// El emblema del caballo: con «Ajedrez Integral» escrito al lado es el logo
// del sitio (así está en el encabezado de index.html).
const EMBLEMA = incrustar("img/logo-marca.png");
/* Las caras de los dos entrenadores, recortadas de una foto de ellos dos.
   Viven en herramientas/datos/, que no se publica: solo van dentro del PDF. */
const FOTOS = ["oscar-angulo-cubero", "sebastian-mora-chavarria"].map((n) =>
  "data:image/jpeg;base64," + fs.readFileSync(path.join(__dirname, "datos", "tipos-de-mate", n + ".jpg")).toString("base64"));

function esc(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const BANDO = { w: "blancas", b: "negras" };
const CUANTOS = { mateIn1: "Mate en 1", mateIn2: "Mate en 2" };

/* La solución con su número de jugada y en notación española: «1.Dh7+ Rxh7
   2.Th3#», o «1…Txa7#» si empiezan las negras. */
function lineaEspanol(ej) {
  let n = 1, negras = ej.juegan === "b";
  const partes = [];
  ej.solucion.forEach((san, i) => {
    const es = N.sanEspanol(san);
    if (!negras) partes.push(`${n}.${es}`);
    else { partes.push(i === 0 ? `${n}…${es}` : es); n++; }
    negras = !negras;
  });
  return partes.join(" ");
}

/* ---------------------------------------------------------- el cuerpo */
const NOMBRES_BLOQUES = ["Cuándo aparece", "Cómo se da", "Para no recibirlo", "Cómo practicarlo"];

function explicacion(c) {
  const m = c.modelo;
  const pie = c.diagrama || `Así queda el mate: ${N.sanEspanol(m.jugada)}. El rey y la pieza que da el mate van marcados.`;
  return `<div class="pagina capitulo">
    <p class="eyebrow">Capítulo ${c.n} de ${CAPITULOS.length}</p>
    <h2 class="titulo">${esc(c.titulo)}</h2>
    <p class="subtitulo">${esc(c.subtitulo)}</p>
    <p class="resumen">${esc(c.resumen)}</p>
    <div class="figura">
      <div class="modelo">
        ${tablero(m.fen, { coordenadas: true, destacar: m.destacar, titulo: `${c.titulo}: el mate modelo.` })}
        <p class="pie-diagrama">${esc(pie)}</p>
      </div>
      <div class="idea">
        <h3>La idea</h3>
        <ul>${c.centro.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      </div>
    </div>
    <div class="bloques">
      ${c.bloques.map((b, i) => `<div class="bloque"><h3>${NOMBRES_BLOQUES[i]}</h3><ul>${b.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>`).join("")}
    </div>
  </div>`;
}

function diagrama(ej) {
  return `<div class="ejercicio">
    <p class="cabecera"><span class="num">${ej.n}</span> <span class="turno ${ej.juegan}">Juegan las ${BANDO[ej.juegan]}</span> <span class="cuantos">${CUANTOS[ej.tipo]}</span></p>
    ${tablero(ej.fen, { coordenadas: true, titulo: `Ejercicio ${ej.n}. Juegan las ${BANDO[ej.juegan]}. ${CUANTOS[ej.tipo]}.` })}
    <p class="respuesta">Tu solución: <span class="raya"></span></p>
  </div>`;
}

function ejercicios(c) {
  const paginas = [c.ejercicios.slice(0, 4), c.ejercicios.slice(4)];
  return paginas.map((lista, i) => `<div class="pagina">
    <p class="sigue">Capítulo ${c.n} · ${esc(c.titulo)} · ejercicios ${lista[0].n} a ${lista[lista.length - 1].n}</p>
    ${i === 0 ? `<div class="nota">Busca <strong>${esc(c.titulo.replace(/^El /, "el "))}</strong> en cada posición. Escribe la solución completa: en los mates en 2, también la respuesta del rival.</div>` : ""}
    <div class="rejilla">${lista.map(diagrama).join("")}</div>
  </div>`).join("");
}

function soluciones(c) {
  return `<section class="soluciones-cap">
    <h3>${c.n}. ${esc(c.titulo)}</h3>
    ${c.ejercicios.map((ej) => `<p class="solucion"><span class="num">${ej.n}</span> <strong>${esc(lineaEspanol(ej))}</strong>&nbsp; <span class="fuente">Lichess ${esc(ej.id)}</span></p>`).join("")}
  </section>`;
}

const indice = `<table class="reglas indice"><tr><th class="num">Cap.</th><th>Figura</th><th>De qué se trata</th><th class="num">Ejercicios</th></tr>
  ${CAPITULOS.map((c) => `<tr><td class="num">${c.n}</td><td><strong>${esc(c.titulo)}</strong></td><td>${esc(c.subtitulo)}</td><td class="num">${c.ejercicios[0].n}–${c.ejercicios[c.ejercicios.length - 1].n}</td></tr>`).join("")}
</table>`;

const planilla = `<table class="planilla">
  <tr><th>Cap.</th><th>Figura</th><th>Mates en 1<br>bien</th><th>Mates en 2<br>bien</th><th>Total<br>(de 8)</th><th>Fecha</th><th class="comentario">Lo que me costó</th></tr>
  ${CAPITULOS.map((c) => {
    const en1 = c.ejercicios.filter((e) => e.tipo === "mateIn1").length;
    return `<tr><td class="num">${c.n}</td><td class="tema-c">${esc(c.titulo)}</td><td>&nbsp;&nbsp;/ ${en1}</td><td>&nbsp;&nbsp;/ ${8 - en1}</td><td class="total"></td><td></td><td></td></tr>`;
  }).join("")}
</table>`;

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Los tipos de mate · cuerpo</title>
<style>
  @page { size: A4; margin: 16mm 15mm 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "DejaVu Serif", Georgia, "Times New Roman", serif; font-size: 10pt; line-height: 1.42; color: #102a43; }
  h2.titulo { font-size: 19pt; margin: 0 0 1mm; padding-bottom: 2mm; border-bottom: 2px solid #334e68; }
  h3 { font-size: 11pt; margin: 0 0 1.5mm; color: #334e68; font-family: "DejaVu Sans", Arial, sans-serif; }
  .pagina { page-break-before: always; }
  table, tr, .solucion { page-break-inside: avoid; }
  .nota { background: #f0f4f8; border-left: 3px solid #486581; padding: 2.5mm 4mm; margin: 3mm 0; font-size: 9.5pt; }
  .sigue { margin: 0 0 3mm; font-size: 9pt; color: #627d98; font-family: "DejaVu Sans", Arial, sans-serif; }
  ul { margin: 0; padding-left: 4.5mm; }
  li { margin-bottom: 1mm; }

  .eyebrow { font-size: 9pt; letter-spacing: .2em; text-transform: uppercase; color: #b4740f; margin: 0 0 2mm; font-family: "DejaVu Sans", Arial, sans-serif; }
  .subtitulo { margin: 0 0 3mm; color: #486581; font-style: italic; font-size: 11pt; }
  .resumen { font-size: 11.5pt; margin: 0 0 5mm; }
  .figura { display: flex; gap: 8mm; align-items: flex-start; margin-bottom: 5mm; }
  .modelo { width: 88mm; flex: none; }
  .modelo svg { width: 88mm; height: auto; display: block; }
  .pie-diagrama { font-size: 8.5pt; color: #486581; margin: 1.5mm 0 0; }
  .idea { flex: 1; background: #fffaf0; border: 1px solid #f0d9a8; border-radius: 2mm; padding: 4mm; font-size: 10.5pt; }
  .bloques { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm 6mm; }
  .bloque { border-top: 2px solid #d9e2ec; padding-top: 2mm; font-size: 9.5pt; }

  .rejilla { display: grid; grid-template-columns: 1fr 1fr; column-gap: 10mm; row-gap: 7mm; }
  .ejercicio { page-break-inside: avoid; }
  .ejercicio svg { width: 80mm; height: auto; display: block; }
  .cabecera { margin: 0 0 1.5mm; font-size: 9pt; color: #627d98; font-family: "DejaVu Sans", Arial, sans-serif; }
  .cabecera .num { display: inline-block; min-width: 9mm; font-weight: 700; color: #102a43; font-size: 12pt; }
  .turno { font-weight: 700; padding: .3mm 2mm; border-radius: 1mm; border: .4mm solid #334e68; }
  .turno.w { background: #ffffff; color: #102a43; }
  .turno.b { background: #102a43; color: #ffffff; }
  .cuantos { margin-left: 2mm; font-weight: 700; color: #8a5a0b; }
  .respuesta { margin: 2.5mm 0 0; font-size: 8.5pt; color: #486581; display: flex; gap: 2mm; }
  .raya { flex: 1; border-bottom: .4pt solid #9fb3c8; }

  .soluciones-cap { page-break-inside: avoid; margin-bottom: 4mm; }
  .solucion { margin: 0 0 1mm; font-size: 9pt; }
  .solucion .num { display: inline-block; min-width: 9mm; font-weight: 700; }
  .solucion strong { font-family: "DejaVu Sans", Arial, sans-serif; color: #0b6b3a; }
  .fuente { color: #829ab1; font-size: 7.5pt; }

  table.reglas { border-collapse: collapse; width: 100%; margin-top: 3mm; }
  .reglas th, .reglas td { border-bottom: 1px solid #d9e2ec; padding: 1.1mm 2.5mm; text-align: left; vertical-align: top; }
  th { font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; color: #627d98; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  table.planilla { border-collapse: collapse; width: 100%; font-family: "DejaVu Sans", Arial, sans-serif; font-size: 8pt; }
  .planilla th, .planilla td { border: .5pt solid #9fb3c8; padding: 0 1.5mm; height: 8.5mm; text-align: center; }
  .planilla th { background: #f0f4f8; color: #334e68; text-transform: none; letter-spacing: 0; height: auto; padding: 1mm; }
  .planilla td.tema-c { text-align: left; white-space: nowrap; }
  .planilla td.total { background: #fffaf0; }
  .planilla th.comentario { width: 48mm; }
  ol.habitos li { margin-bottom: 1.8mm; }
</style>
</head><body>

<div>
  <h2 class="titulo">Antes de empezar</h2>
  <p>Un mate casi nunca se inventa en el tablero: se <strong>reconoce</strong>. Quien ya vio el mate del pasillo
  diez veces lo ve venir en la partida sin buscarlo, y quien nunca lo vio lo recibe sin entender qué pasó. Este
  libro junta las <strong>${CAPITULOS.length} figuras de mate</strong> que más se repiten para que las aprendas a reconocer.</p>
  <p>Cada capítulo trae una figura: primero <strong>la explicación</strong>, con el mate modelo en el diagrama (la
  pieza que da el mate y el rey van marcados), cuándo aparece, cómo se da y cómo no recibirlo tú. Después,
  <strong>8 ejercicios</strong> de esa figura, de más fácil a más difícil: primero los mates en 1 y después los
  mates en 2. En total son <strong>${TOTAL} ejercicios</strong>. Las soluciones están al final del libro.</p>

  <h3 style="margin-top:6mm">Cómo trabajar cada capítulo</h3>
  <ol class="habitos">
    <li><strong>Lee la explicación y mira el diagrama</strong> hasta que puedas decir por qué el rey no tiene salida.</li>
    <li><strong>Sin mover las piezas.</strong> Puedes poner la posición en un tablero, pero resuelve mirando, como en la partida.</li>
    <li><strong>Mira quién juega.</strong> Los diagramas se ven siempre desde el lado de las blancas; arriba dice quién juega y si es mate en 1 o en 2.</li>
    <li><strong>Escribe la solución completa.</strong> En un mate en 2: tu jugada, la respuesta del rival y tu mate.</li>
    <li><strong>Corrige al terminar el capítulo</strong> y anota en la planilla del final cuántos te salieron.</li>
    <li><strong>Las jugadas van en notación algebraica en español:</strong> R rey, D dama, T torre, A alfil, C caballo;
    x es captura, + jaque y # mate.</li>
  </ol>

  <div class="nota"><strong>De dónde salen los ejercicios.</strong> Todos son de partidas reales, de la base abierta
  de ejercicios de Lichess (dominio público), y son los mismos de «Ejercicios por tema» de la plataforma de la
  Academia, ya revisados. Para este libro se comprobó además, uno por uno, que tengan <strong>una sola
  solución</strong>: en los mates en 1 hay una sola jugada que da mate, y en los mates en 2 una sola primera jugada
  que lo fuerza contra cualquier defensa.</div>

  <h2 class="titulo pagina">Las ${CAPITULOS.length} figuras</h2>
  ${indice}
</div>

${CAPITULOS.map((c) => explicacion(c) + ejercicios(c)).join("")}

<div class="pagina">
  <h2 class="titulo">Soluciones</h2>
  <p class="sigue">Cada número es el del ejercicio. En los mates en 2 va la defensa más dura del rival: si responde
  otra cosa, también hay mate en la jugada siguiente. Si tu primera jugada es otra, vuelve a la posición: casi
  siempre se le escapa una casilla al rey o el rival puede tapar el jaque.</p>
  ${CAPITULOS.map(soluciones).join("")}
</div>

<div class="pagina">
  <h2 class="titulo">Mi planilla de avance</h2>
  <p class="sigue">Una línea por capítulo. Si un capítulo te sale con menos de 6, vuelve a hacerlo dentro de una semana.</p>
  ${planilla}
  <div class="nota" style="margin-top:6mm"><strong>${esc(ENTRENADORES)}</strong> · Academia Ajedrez Integral, ${ANIO}.
  Los ejercicios salen de la base abierta de ejercicios de Lichess (dominio público, CC0); cada solución lleva el
  número del ejercicio en esa base.</div>
</div>

</body></html>`;

/* ---------------------------------------------------------- la tapa */
function persona(i) {
  const [nombre, ...apellidos] = AUTORES[i].split(" ");
  const corte = apellidos.length > 1 ? `${esc(nombre + " " + apellidos[0])}<br>${esc(apellidos.slice(1).join(" "))}` : esc(AUTORES[i]);
  return `<div class="persona"><div class="cara"><img src="${FOTOS[i]}" alt="${esc(AUTORES[i])}"></div>
    <p class="autor">${corte}</p><p class="rol">Entrenador</p></div>`;
}

const htmlPortada = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Los tipos de mate</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { width: 210mm; height: 297mm; font-family: "DejaVu Serif", Georgia, serif; color: #f0f4f8;
         background: linear-gradient(158deg, #2a0c14 0%, #4a1424 48%, #22090f 100%); position: relative; overflow: hidden; }
  /* Los adornos van dentro de su propio recorte: overflow:hidden en el body se
     propaga al viewport y Chromium encoge la tapa (ver diagnostico-libro.js). */
  .fondo { position: absolute; inset: 0; overflow: hidden; }
  .tablero-fondo { position: absolute; right: -44mm; bottom: -44mm; width: 158mm; height: 158mm;
      background-image:
        linear-gradient(45deg, rgba(240,180,41,.14) 25%, transparent 25%, transparent 75%, rgba(240,180,41,.14) 75%),
        linear-gradient(45deg, rgba(240,180,41,.14) 25%, transparent 25%, transparent 75%, rgba(240,180,41,.14) 75%);
      background-size: 21mm 21mm; background-position: 0 0, 10.5mm 10.5mm; transform: rotate(-12deg); }
  .brillo { position: absolute; left: -40mm; top: -50mm; width: 150mm; height: 150mm; border-radius: 50%;
      background: radial-gradient(circle, rgba(220,130,150,.2) 0%, rgba(220,130,150,0) 70%); }
  .lomo { position: absolute; left: 0; top: 0; bottom: 0; width: 7mm; background: linear-gradient(180deg, #de911d, #b4740f); }
  .hoja { position: relative; z-index: 2; height: 297mm; padding: 26mm 20mm 20mm 27mm; display: flex; flex-direction: column; }
  .marca-casa { font-size: 10pt; letter-spacing: .28em; text-transform: uppercase; color: #f0b429; font-weight: 700; margin: 0; }
  .centro { margin-top: auto; margin-bottom: auto; }
  .eyebrow { font-size: 10pt; letter-spacing: .22em; text-transform: uppercase; color: #e3b8c2; margin: 0 0 6mm; }
  h1 { font-size: 50pt; line-height: 1; margin: 0; color: #ffffff; font-weight: 700; letter-spacing: -.015em; }
  h1 .segunda { display: block; color: #f0b429; }
  .filete { width: 46mm; height: 1.4mm; background: #de911d; margin: 8mm 0 7mm; }
  .sub { font-size: 14pt; line-height: 1.5; color: #f1dbe0; margin: 0; max-width: 125mm; }
  .cifras { margin: 9mm 0 0; display: flex; gap: 10mm; }
  .cifra { border-left: .8mm solid rgba(240,180,41,.55); padding-left: 4mm; }
  .cifra .n { display: block; font-size: 21pt; font-weight: 700; color: #ffffff; line-height: 1.1; }
  .cifra .q { display: block; font-size: 8pt; letter-spacing: .12em; text-transform: uppercase; color: #e3b8c2; margin-top: 1mm; }
  .pie-tapa { margin-top: auto; }
  /* Los dos entrenadores, uno a cada lado, y el logo de Ajedrez Integral en el medio. */
  .equipo { display: flex; justify-content: space-between; align-items: center; }
  .persona, .casa { flex: none; width: 52mm; text-align: center; }
  .cara { width: 44mm; height: 44mm; border-radius: 50%; overflow: hidden; border: 1.2mm solid #f0b429; margin: 0 auto; }
  .cara img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .autor { margin: 3mm 0 0; font-size: 11pt; font-weight: 700; color: #ffffff; line-height: 1.25; }
  .rol { margin: 1mm 0 0; font-size: 7pt; letter-spacing: .18em; text-transform: uppercase; color: #f0b429; }
  .casa img { display: block; width: 34mm; margin: 0 auto 2mm; }
  .casa .nombre { font-size: 17pt; font-weight: 700; color: #ffffff; line-height: 1.1; margin: 0; }
  .casa .nombre span { color: #f0b429; }
  .editorial { margin: 7mm 0 0; padding-top: 4mm; border-top: 1px solid rgba(227,184,194,.3);
      font-size: 8.5pt; color: #e3b8c2; display: flex; justify-content: space-between; gap: 6mm; }
</style>
</head><body>
  <div class="fondo"><div class="tablero-fondo"></div><div class="brillo"></div></div>
  <div class="lomo"></div>
  <div class="hoja">
    <p class="marca-casa">&#9822; Ajedrez Integral</p>
    <div class="centro">
      <p class="eyebrow">Cuaderno de ejercicios</p>
      <h1>Los tipos<span class="segunda">de mate</span></h1>
      <div class="filete"></div>
      <p class="sub">Las figuras de mate que hay que reconocer, del pasillo a Vuković: cada una explicada con su
        diagrama y con ejercicios de partidas reales para practicarla.</p>
      <div class="cifras">
        <div class="cifra"><span class="n">${CAPITULOS.length}</span><span class="q">figuras</span></div>
        <div class="cifra"><span class="n">${TOTAL}</span><span class="q">ejercicios</span></div>
        <div class="cifra"><span class="n">1 y 2</span><span class="q">jugadas</span></div>
      </div>
    </div>
    <div class="pie-tapa">
      <div class="equipo">
        ${persona(0)}
        <div class="casa"><img src="${EMBLEMA}" alt=""><p class="nombre">Ajedrez <span>Integral</span></p></div>
        ${persona(1)}
      </div>
      <div class="editorial"><span>Academia Ajedrez Integral</span><span>${ANIO}</span></div>
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
   dichas, que es como se entienden con lector de pantalla. */
function accesible() {
  const oido = (t) => N.textoHablado(t, "espanol");
  // Los textos de las fichas traen jugadas escritas («Dg8+»): acá van dichas.
  const dicho = (t) => esc(oido(t));
  const caps = CAPITULOS.map((c) => {
    const d = describir(c.modelo.fen);
    const ejs = c.ejercicios.map((ej) => {
      const e = describir(ej.fen);
      return `<article><h4>Ejercicio ${ej.n}: ${CUANTOS[ej.tipo].toLowerCase()}</h4>
        <p class="posicion">${e.turno} Piezas blancas: ${esc(e.blancas)}. Piezas negras: ${esc(e.negras)}.
        <span class="fen">FEN: ${esc(ej.fen)}</span></p></article>`;
    }).join("");
    return `<section><h2>Capítulo ${c.n}: ${esc(c.titulo)}</h2>
      <p><em>${dicho(c.subtitulo)}.</em> ${dicho(c.resumen)}</p>
      <h3>El mate modelo</h3>
      <p class="posicion">Piezas blancas: ${esc(d.blancas)}. Piezas negras: ${esc(d.negras)}.
      La última jugada fue ${esc(oido(N.sanEspanol(c.modelo.jugada)))}.</p>
      ${c.diagrama ? `<p>${dicho(c.diagrama)}</p>` : ""}
      <h3>La idea</h3><ul>${c.centro.map((t) => `<li>${dicho(t)}</li>`).join("")}</ul>
      ${c.bloques.map((b, i) => `<h3>${NOMBRES_BLOQUES[i]}</h3><ul>${b.map((t) => `<li>${dicho(t)}</li>`).join("")}</ul>`).join("")}
      <h3>Ejercicios</h3>${ejs}</section>`;
  }).join("");
  const sols = CAPITULOS.map((c) => `<h3>${c.n}. ${esc(c.titulo)}</h3><ul>${c.ejercicios.map((ej) =>
    `<li>Ejercicio ${ej.n}: ${esc(oido(lineaEspanol(ej)))}.</li>`).join("")}</ul>`).join("");

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Los tipos de mate — versión accesible</title>
<style>
  :root { color-scheme: light dark; }
  body { max-width: 42rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; background: #fff; color: #10202e;
         font-family: Georgia, "Times New Roman", serif; font-size: 1.15rem; line-height: 1.8; }
  h1 { font-size: 1.9rem; line-height: 1.25; }
  h2 { font-size: 1.45rem; margin-top: 2.5rem; border-bottom: 2px solid #10202e; padding-bottom: .3rem; }
  h3, h4 { font-size: 1.1rem; margin: 1.4rem 0 .3rem; font-family: system-ui, sans-serif; }
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
<h1>Los tipos de mate</h1>
<p>Cuaderno de ejercicios de los entrenadores ${esc(AUTORES[0])} y ${esc(AUTORES[1])}. Es el mismo contenido
del libro en PDF, escrito para leerse con lector de pantalla o con la letra agrandada: las posiciones van
contadas pieza por pieza y con su FEN, y no hay ninguna imagen.</p>
<p>${CAPITULOS.length} figuras de mate, cada una con su explicación y 8 ejercicios: primero los mates en 1 y después
los mates en 2. En total, ${TOTAL} ejercicios. Las soluciones están al final.</p>
${caps}
<h2>Soluciones</h2>
<p>En los mates en 2, si el rival responde otra cosa, también hay mate en la jugada siguiente.</p>
${sols}
<footer>
  <p>${esc(ENTRENADORES)} · Academia Ajedrez Integral · ${ANIO}.</p>
  <p>Ejercicios de la base abierta de ejercicios de Lichess (CC0).</p>
</footer>
</body></html>`;
}

/* ---------------------------------------------------------- generar */
// Antes de imprimir, lo que no puede fallar: que cada solución se pueda jugar
// entera y termine en mate. Un libro con una jugada imposible se imprime igual.
EJERCICIOS.forEach((ej) => {
  const g = new Chess(ej.fen);
  ej.solucion.forEach((san) => { if (!g.move(san)) throw new Error(`La jugada ${san} del ejercicio ${ej.n} no es legal.`); });
  if (!g.in_checkmate()) throw new Error(`La solución del ejercicio ${ej.n} no termina en mate.`);
});

fs.mkdirSync(CARPETA, { recursive: true });
const tmp = os.tmpdir();
const htmlTemporal = path.join(tmp, "tipos-de-mate-cuerpo.html");
const htmlPortadaTemporal = path.join(tmp, "tipos-de-mate-tapa.html");
const htmlMarcaTemporal = path.join(tmp, "tipos-de-mate-marca.html");
fs.writeFileSync(htmlTemporal, html);
fs.writeFileSync(htmlPortadaTemporal, htmlPortada);
fs.writeFileSync(htmlMarcaTemporal, htmlMarca);
const destinoAccesible = path.join(CARPETA, "tipos-de-mate-accesible.html");
fs.writeFileSync(destinoAccesible, accesible());
console.log(`Maqueta: ${htmlTemporal}\nAccesible: ${destinoAccesible}`);
console.log(`${CAPITULOS.length} figuras · ${TOTAL} ejercicios`);
if (process.argv.includes("--solo-accesible")) process.exit(0);

(async () => {
  const { chromium } = require("playwright");
  const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const destino = path.join(CARPETA, "tipos-de-mate.pdf");
  const tapa = path.join(tmp, "tipos-de-mate-tapa.pdf");
  const cuerpo = path.join(tmp, "tipos-de-mate-cuerpo.pdf");
  const marca = path.join(tmp, "tipos-de-mate-marca.pdf");
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
    margin: { top: "16mm", bottom: "16mm", left: "15mm", right: "15mm" },
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate: `<div style="width:100%;font-size:7.5pt;color:#9fb3c8;font-family:Arial,sans-serif;padding:0 15mm;display:flex;justify-content:space-between;align-items:center;gap:4mm;"><span>Los tipos de mate · Ajedrez Integral</span><span style="font-weight:700;color:#627d98;">${esc(ENTRENADORES)}</span><span class="pageNumber"></span></div>`,
  });
  await navegador.close();
  unir(tapa, cuerpo, marca, destino);
  proteger(destino, {
    clave: CLAVE_PROPIETARIO, autor: `${AUTORES[0]} y ${AUTORES[1]}`, imprimir: true,
    titulo: "Los tipos de mate - cuaderno de ejercicios de ajedrez",
    asunto: "Las figuras de mate explicadas, con ejercicios de mate en 1 y en 2",
  });
  console.log("PDF listo:", destino);
})();
