/* ===== El libro «Mide tu fuerza», de Oscar Angulo Cubero =====
 *
 * Arma el PDF de un volumen (material/mide-tu-fuerza/mide-tu-fuerza.pdf el 1,
 * material/mide-tu-fuerza-2/mide-tu-fuerza-2.pdf el 2…): un banco de ejercicios
 * tácticos para medirse uno mismo —360 posiciones en 45 tests temáticos de 8,
 * en tres niveles—, con sus soluciones, el cuadro de puntuación y las tablas
 * que pasan los puntos a una fuerza en Elo. Las posiciones salen de
 * el banco.js de su carpeta, que arma herramientas/mide-tu-fuerza-generar.js:
 * este script no decide nada de ajedrez, solo lo pone en papel.
 *
 * Se cierra igual que «Ponte a prueba» (tapa a página completa, marca de agua
 * con el logo en cada página del cuerpo, firma del autor y PDF protegido:
 * herramientas/lib/pdf-armar.js), y como aquel se deja imprimir: los tests se
 * contestan en papel.
 *
 * El mismo contenido sale también en <producto>-accesible.html, con cada
 * posición contada pieza por pieza, para quien usa lector de pantalla.
 *
 * Las tablas de fuerza no son de nadie más: salen de la dificultad de cada
 * posición (su `elo`) con la curva del Elo. Para una fuerza R, cada posición
 * se resuelve con probabilidad 1 / (1 + 10^((elo − R)/400)) —sin opciones no
 * hay acierto al azar—, y vale 5 puntos. Los puntos esperados de cada fuerza
 * son la tabla.
 *
 * Cómo se corre (Node, Chromium por Playwright y pypdf):
 *
 *     node herramientas/mide-tu-fuerza-pdf.js                     # volumen 1
 *     node herramientas/mide-tu-fuerza-pdf.js 2                   # volumen 2
 *     node herramientas/mide-tu-fuerza-pdf.js 2 --solo-accesible  # sin PDF ni pypdf
 *
 * Con CHROMIUM=/ruta/al/chrome se le puede indicar un Chromium ya instalado.
 * Al volver a generar el banco hay que volver a correr esto.
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
const { producto, banco } = require("./mide-tu-fuerza-generar.js");
const VOLUMEN = +(process.argv.slice(2).find((a) => /^\d+$/.test(a)) || 1);
const PRODUCTO = producto(VOLUMEN);
eval(fs.readFileSync(banco(VOLUMEN), "utf8"));
const LIBRO = global.window.MIDE_TU_FUERZA;
const ITEMS = global.window.MIDE_TU_FUERZA_ITEMS;

const AUTOR = LIBRO.AUTOR;
const PUNTOS = LIBRO.PUNTOS;
const CLAVE_PROPIETARIO = `${PRODUCTO}-oac-2026`;
const CARPETA = path.join(RAIZ, "material", PRODUCTO);
const NOMBRE = `Mide tu fuerza · Volumen ${VOLUMEN}`;
/* Cada volumen, su color de tapa (todos oscuros: el texto crema y ámbar de la
   tapa se mide contra el más claro de los tres tonos). */
const TAPA = {
  1: ["#0c2a22", "#12443a", "#0a241d"],
  2: ["#2e0f1a", "#4a1a2b", "#260c16"],
  3: ["#101a3a", "#1c2c5c", "#0c1530"],
  4: ["#1c0f2e", "#3a2160", "#160b26"],
  5: ["#2a1a0c", "#4a3015", "#20140a"],
  6: ["#22222a", "#3d3d46", "#1a1a20"],
  7: ["#2b1020", "#4b1d3a", "#220c19"],
}[VOLUMEN] || ["#0c2a22", "#12443a", "#0a241d"];
const ANIO = 2026;

function incrustar(relativo) {
  return "data:image/png;base64," + fs.readFileSync(path.join(RAIZ, relativo)).toString("base64");
}
const LOGO_CREMA = incrustar("img/logo-oscar-angulo.png");
const LOGO_MARCA = incrustar("img/logo-oscar-angulo-marca.png");

function esc(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ---------------------------------------------------------- los tests */
const TEMA = Object.fromEntries(LIBRO.TEMAS.map((t) => [t.id, t]));
const NIVEL = Object.fromEntries(LIBRO.NIVELES.map((n) => [n.n, n]));
const TESTS = [];
ITEMS.forEach((it) => {
  if (!TESTS[it.test - 1]) TESTS[it.test - 1] = { n: it.test, nivel: it.nivel, tema: it.tema, items: [] };
  TESTS[it.test - 1].items.push(it);
});
TESTS.forEach((t) => { t.minutos = NIVEL[t.nivel].minutos; });
const TOTAL = ITEMS.length;
const POR_TEST = LIBRO.POR_TEST;
const MAX = PUNTOS * TOTAL;

const BANDO = { w: "blancas", b: "negras" };
const RIVAL = { w: "negras", b: "blancas" };

/* ---------------------------------------------------------- las tablas */
function acierto(elo, R) {
  return 1 / (1 + Math.pow(10, (elo - R) / 400));
}
function esperado(items, R) {
  return items.reduce((s, it) => s + PUNTOS * acierto(it.elo, R), 0);
}
const PASO = 100;
const TODAS = [];
for (let r = 200; r <= 2800; r += PASO) TODAS.push(r);

/* Cada tabla lleva solo las fuerzas que sus posiciones distinguen: las que
   esperan entre el 5 % y el 95 % de los puntos. Un nivel fácil no separa a un
   1500 de un 1900 —los dos lo sacan casi entero—, y con la lista fija salían
   renglones como «592 a 594 → 1500». Desde cuántos puntos corresponde cada
   fuerza: los esperados en el punto medio entre ella y la de abajo. Así cada
   renglón cubre un tramo y no hay huecos. */
function filasTablaPuntos(items, maximo) {
  const fuerzas = TODAS.filter((r) => {
    const e = esperado(items, r);
    return e >= 0.05 * maximo && e <= 0.95 * maximo;
  });
  const t = fuerzas.map((r) => ({ r, desde: Math.round(esperado(items, r - PASO / 2)) }));
  return t.map((f, i) => {
    const hasta = i + 1 < t.length ? t[i + 1].desde - 1 : maximo;
    const rango = i === 0 ? `hasta ${hasta}` : i + 1 === t.length ? `${f.desde} o más` : `${f.desde} a ${hasta}`;
    const fuerza = i === 0 ? `${f.r} o menos` : i + 1 === t.length ? `${f.r} o más` : String(f.r);
    return `<tr><td class="num">${rango}</td><td class="num"><strong>${fuerza}</strong></td></tr>`;
  }).join("");
}

/* ---------------------------------------------------------- la posición */
function ultimaTexto(it) {
  return `Las ${RIVAL[it.juegan]} acaban de jugar ${it.juegan === "w" ? "…" : ""}${it.ultima}.`;
}

function diagrama(it) {
  return `<div class="ejercicio">
    <p class="cabecera"><span class="num">${it.n}</span> <span class="turno ${it.juegan}">Juegan las ${BANDO[it.juegan]}</span></p>
    ${tablero(it.fen, { coordenadas: true, destacar: it.marca, titulo: `Posición ${it.n}. Juegan las ${BANDO[it.juegan]}.` })}
    <p class="ultima">${esc(ultimaTexto(it))}</p>
    <p class="respuesta">Tu solución: <span class="raya"></span></p>
  </div>`;
}

function solucion(it) {
  return `<section class="solucion">
    <p class="cabecera"><span class="num">${it.n}</span> <strong>${esc(it.linea)}</strong></p>
    <p class="explica">${esc(it.explica)} Lo que vale los ${PUNTOS} puntos: ver <strong>${esc(it.primera)}</strong> y la idea de la línea.</p>
    <p class="fuente">${esc(it.comprobado)}</p>
  </section>`;
}

function encabezadoTest(t) {
  const tema = TEMA[t.tema];
  const primero = t.nivel === 1;
  return `<h2 class="titulo">Test ${t.n} <span class="tema">${esc(tema.nombre)}</span></h2>
    <p class="datos"><span>${esc(NIVEL[t.nivel].nombre)}</span><span>Posiciones ${t.items[0].n} a ${t.items[t.items.length - 1].n}</span><span>Tiempo: <strong>${t.minutos} minutos</strong></span><span>Hasta ${PUNTOS * POR_TEST} puntos</span></p>
    <div class="nota">${primero ? `<strong>La idea.</strong> ${esc(tema.idea)}` : `<strong>Pista.</strong> ${esc(tema.pista)}`}</div>`;
}

const testsHtml = TESTS.map((t) => {
  const inicioNivel = t.n === 1 || TESTS[t.n - 2].nivel !== t.nivel;
  const portadilla = inicioNivel ? `<div class="pagina portadilla">
      <p class="eyebrow">Parte ${t.nivel}</p>
      <h2>${esc(NIVEL[t.nivel].nombre)}</h2>
      <p>${LIBRO.TEMAS.length} tests, uno por tema, con posiciones de rating ${esc(NIVEL[t.nivel].rating)} en Lichess.
      Cada test se hace en ${NIVEL[t.nivel].minutos} minutos.</p>
      ${t.nivel === 1 ? "<p>Empieza aquí aunque juegues bien: los primeros tests enseñan a reconocer cada tema, y reconocerlo rápido es la mitad del trabajo.</p>"
        : t.nivel === 2 ? "<p>Los mismos temas, más escondidos: ahora el golpe suele necesitar una jugada de preparación, o se combina con otro tema.</p>"
        : "<p>El nivel de los jugadores de torneo: líneas largas, defensas que hay que ver de antemano y temas mezclados. No te desanimes si al principio cuesta.</p>"}
    </div>` : "";
  return `${portadilla}
    <div class="pagina">
      ${encabezadoTest(t)}
      <div class="rejilla">${t.items.slice(0, 4).map(diagrama).join("")}</div>
    </div>
    <div class="pagina">
      <p class="sigue">Test ${t.n} · ${esc(TEMA[t.tema].nombre)} (continuación)</p>
      <div class="rejilla">${t.items.slice(4).map(diagrama).join("")}</div>
    </div>
    <div class="pagina">
      <h2 class="titulo">Soluciones del test ${t.n}</h2>
      <p class="mide">Corrige al terminar el test entero. Anota en el cuadro de puntuación tus puntos y el tiempo que usaste.</p>
      ${t.items.map(solucion).join("")}
    </div>`;
}).join("");

const indice = `<table class="reglas indice"><tr><th class="num">Test</th><th>Tema</th><th>Nivel</th><th class="num">Posiciones</th><th class="num">Tiempo</th></tr>
  ${TESTS.map((t) => `<tr><td class="num">${t.n}</td><td>${esc(TEMA[t.tema].nombre)}</td><td>${esc(NIVEL[t.nivel].nombre)}</td><td class="num">${t.items[0].n}–${t.items[t.items.length - 1].n}</td><td class="num">${t.minutos} min</td></tr>`).join("")}
</table>`;

const cuadro = `<table class="planilla">
  <tr><th>Test</th><th>Tema</th><th>Tiempo<br>indicado</th><th>Tiempo<br>usado</th><th>Puntos<br>(hasta 40)</th><th>Por el<br>tiempo</th><th>Total</th><th class="comentario">Comentarios</th></tr>
  ${TESTS.map((t) => `<tr><td class="num">${t.n}</td><td class="tema-c">${esc(TEMA[t.tema].nombre)}</td><td class="num">${t.minutos}</td><td></td><td></td><td></td><td class="total"></td><td></td></tr>`).join("")}
</table>`;

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${esc(NOMBRE)} · cuerpo</title>
<style>
  @page { size: A4; margin: 16mm 15mm 15mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "DejaVu Serif", Georgia, "Times New Roman", serif; font-size: 10pt; line-height: 1.42; color: #102a43; }
  h2.titulo { font-size: 17pt; margin: 0 0 2mm; padding-bottom: 2mm; border-bottom: 2px solid #334e68; }
  h2.titulo .tema { color: #b4740f; margin-left: 2mm; }
  h3 { font-size: 11.5pt; margin: 6mm 0 2mm; color: #334e68; }
  .pagina { page-break-before: always; }
  .junto, table, tr { page-break-inside: avoid; }
  .mide { margin: 0 0 3mm; color: #334e68; }
  .datos { margin: 0 0 2mm; display: flex; gap: 6mm; font-size: 9pt; color: #486581; font-family: "DejaVu Sans", Arial, sans-serif; }
  .nota { background: #f0f4f8; border-left: 3px solid #486581; padding: 2.5mm 4mm; margin: 3mm 0; font-size: 9.5pt; }
  .sigue { margin: 0 0 3mm; font-size: 9pt; color: #627d98; font-family: "DejaVu Sans", Arial, sans-serif; }

  .rejilla { display: grid; grid-template-columns: 1fr 1fr; column-gap: 10mm; row-gap: 6mm; }
  .ejercicio { page-break-inside: avoid; }
  .ejercicio svg { width: 80mm; height: auto; display: block; }
  .cabecera { margin: 0 0 1.5mm; font-size: 9pt; color: #627d98; font-family: "DejaVu Sans", Arial, sans-serif; }
  .cabecera .num { display: inline-block; min-width: 10mm; font-weight: 700; color: #102a43; font-size: 12pt; }
  .turno { font-weight: 700; padding: .3mm 2mm; border-radius: 1mm; border: .4mm solid #334e68; }
  .turno.w { background: #ffffff; color: #102a43; }
  .turno.b { background: #102a43; color: #ffffff; }
  .ultima { margin: 1.2mm 0 1mm; font-size: 8.5pt; color: #486581; }
  .respuesta { margin: 2mm 0 0; font-size: 8.5pt; color: #486581; display: flex; gap: 2mm; }
  .raya { flex: 1; border-bottom: .4pt solid #9fb3c8; }

  .solucion { page-break-inside: avoid; margin-bottom: 3mm; padding-bottom: 2.5mm; border-bottom: 1px solid #eef2f6; font-size: 9pt; }
  .solucion .cabecera { color: #0b6b3a; font-size: 9.5pt; font-family: "DejaVu Serif", Georgia, serif; }
  .solucion .cabecera strong { font-family: "DejaVu Sans", Arial, sans-serif; }
  .explica { margin: 0 0 .8mm; color: #243b53; }
  .fuente { margin: 0; color: #829ab1; font-style: italic; font-size: 7.5pt; }

  .portadilla { padding-top: 70mm; text-align: center; }
  .portadilla .eyebrow { font-size: 10pt; letter-spacing: .22em; text-transform: uppercase; color: #b4740f; margin: 0 0 4mm; }
  .portadilla h2 { font-size: 30pt; margin: 0 0 8mm; }
  .portadilla p { max-width: 130mm; margin: 0 auto 4mm; font-size: 11pt; }

  table.tabla-fuerza, table.reglas { border-collapse: collapse; width: 100%; margin-top: 3mm; }
  table.tabla-fuerza { width: 100mm; }
  .tabla-fuerza th, .tabla-fuerza td, .reglas th, .reglas td { border-bottom: 1px solid #d9e2ec; padding: 1.2mm 2.5mm; text-align: left; vertical-align: top; }
  .indice td, .indice th { padding: .45mm 2.5mm; font-size: 8.5pt; }
  th { font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; color: #627d98; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .tablas { display: flex; gap: 8mm; }
  .tablas > div { flex: 1; }
  .tablas table.tabla-fuerza { width: 100%; font-size: 9pt; }

  table.planilla { border-collapse: collapse; width: 100%; font-family: "DejaVu Sans", Arial, sans-serif; font-size: 7.5pt; }
  .planilla th, .planilla td { border: .5pt solid #9fb3c8; padding: 0 1.5mm; height: 5.2mm; text-align: center; }
  .planilla th { background: #f0f4f8; color: #334e68; text-transform: none; letter-spacing: 0; height: auto; padding: 1mm; }
  .planilla td.tema-c { text-align: left; white-space: nowrap; }
  .planilla td.total { background: #fffaf0; }
  .planilla th.comentario { width: 50mm; }
  ol.habitos li { margin-bottom: 1.6mm; }
</style>
</head><body>

<div>
  <h2 class="titulo">Antes de empezar</h2>
  <p>Este es un banco de ejercicios para entrenar la táctica y, de paso, medir cuánto has avanzado. No es un
  libro para leer de corrido: es un cuaderno de trabajo. Lo vas a disfrutar más si lo haces con calma, un
  test a la vez, y si vuelves sobre lo que fallaste.</p>
  ${VOLUMEN >= 7 ? `<p>Este es el <strong>volumen ${VOLUMEN}</strong>. Tiene la forma de los anteriores —niveles, tiempos
  y puntos— y posiciones <strong>todas nuevas</strong>: ninguna se repite. Trae además <strong>tres temas nuevos</strong>:
  el mate en dos, el mate en tres y el sacrificio, en lugar del jaque doble, los rayos X y la interferencia.</p>`
  : VOLUMEN > 1 ? `<p>Este es el <strong>volumen ${VOLUMEN}</strong>. Tiene la misma forma que el volumen 1 —los mismos temas,
  niveles, tiempos y puntos— y posiciones <strong>todas nuevas</strong>: ninguna se repite. Sirve para seguir
  entrenando después del primero, y para medir de nuevo sin que la memoria haga trampa.</p>` : ""}
  <p>Tiene <strong>${TOTAL} posiciones</strong> en <strong>${TESTS.length} tests de ${POR_TEST}</strong>. Cada test trabaja
  <strong>un solo tema</strong> —el ataque doble, la clavada, la desviación…— y te dice cuál es antes de empezar.
  Saber el tema no regala la solución: entrena el ojo para reconocerlo. En una partida nadie te avisa, pero quien
  ha visto cien clavadas encuentra la ciento una sin buscarla.</p>
  <p>Los tests están en <strong>tres niveles</strong>. Los ${LIBRO.TEMAS.length} temas se repiten en cada nivel, cada vez más
  difíciles. Puedes hacer el libro en orden, o hacer un nivel completo antes de pasar al siguiente: lo que no
  conviene es saltar al tercero sin pasar por los otros dos.</p>

  <div class="nota"><strong>De dónde salen las posiciones.</strong> Todas son de partidas reales, de la base
  abierta de ejercicios de Lichess, que es de dominio público. Ninguna está inventada ni copiada de otro libro.
  Cada una pasó por el motor Stockfish: solo quedaron las que tienen <strong>una sola jugada ganadora</strong>.
  Su dificultad también es medida, no a ojo: sale de los miles de personas que ya las intentaron resolver.</div>

  <h2 class="titulo pagina">Cómo hacer cada test</h2>
  <ol class="habitos">
    <li><strong>Prepara el reloj.</strong> Cada test dice su tiempo: ${LIBRO.NIVELES.map((n) => `${n.minutos} minutos en el ${n.nombre.toLowerCase()}`).join(", ")}.
    Anota la hora al empezar.</li>
    <li><strong>Sin mover las piezas.</strong> Puedes poner la posición en un tablero, pero no muevas nada: en la
    partida tampoco se puede. Nada de motores ni de ayuda.</li>
    <li><strong>Mira quién juega.</strong> El tablero se ve siempre desde el lado de las blancas. Arriba de cada
    diagrama dice quién juega, y la última jugada del rival está marcada: empieza por preguntarte qué quiere.</li>
    <li><strong>Escribe la solución completa,</strong> no solo la primera jugada: la jugada, la mejor defensa del rival
    y cómo sigues. El error más común no es no ver el golpe, es no ver la respuesta del otro.</li>
    <li><strong>Antes de buscar el golpe, mira la posición:</strong> ¿cuánto material hay?, ¿qué está sin defender?,
    ¿dónde está el rey rival?, ¿qué piezas están en la misma línea? El tema del test te dice qué buscar.</li>
    <li><strong>Corrige al terminar el test entero,</strong> no posición por posición. El tiempo de corregir no cuenta.</li>
    <li><strong>Las jugadas van en notación algebraica en español:</strong> R rey, D dama, T torre, A alfil, C caballo;
    x es captura, + jaque y # mate.</li>
  </ol>

  <h3>Cómo se cuentan los puntos</h3>
  <table class="reglas">
    <tr><th>Tu solución</th><th class="num">Vale</th></tr>
    <tr><td>La primera jugada y la idea de la línea: ves cómo se defiende el rival y cómo sigues.</td><td class="num">5</td></tr>
    <tr><td>La primera jugada es la buena, pero la continuación está mal o se te escapó la mejor defensa.</td><td class="num">3</td></tr>
    <tr><td>La idea es la buena, pero en el orden equivocado o con una jugada que no se puede hacer.</td><td class="num">1</td></tr>
    <tr><td>Otra primera jugada, o en blanco.</td><td class="num">0</td></tr>
    <tr><td><strong>El tiempo:</strong> por cada 5 minutos completos que te sobren, suma 1 punto (hasta 5). Por cada 5 minutos o fracción que te pases, resta 1.</td><td class="num">±</td></tr>
  </table>
  <p class="mide">Cada test vale hasta ${PUNTOS * POR_TEST} puntos sin contar el tiempo; el libro entero, hasta ${MAX}.
  No te desanimes si los primeros tests salen bajos: después de cuatro o cinco, el ojo se acostumbra y los
  puntos suben solos. Eso es justamente lo que el libro quiere medir.</p>

  <h2 class="titulo pagina">Los ${LIBRO.TEMAS.length} temas</h2>
  <table class="reglas">
    <tr><th>Tema</th><th>La idea</th></tr>
    ${LIBRO.TEMAS.map((t) => `<tr><td><strong>${esc(t.nombre)}</strong></td><td>${esc(t.idea)}</td></tr>`).join("")}
  </table>

  <h2 class="titulo pagina">Los ${TESTS.length} tests</h2>
  ${indice}
</div>

${testsHtml}

<div class="pagina">
  <h2 class="titulo">Cuadro de puntuación</h2>
  <p class="mide">Una línea por test. «Por el tiempo» es lo que sumas o restas según el reloj.</p>
  ${cuadro}
</div>

<div class="pagina">
  <h2 class="titulo">Tu fuerza</h2>
  <p class="mide">Suma tus puntos sin el ajuste del tiempo y busca el renglón. Si hiciste un solo nivel, usa su
  tabla; si hiciste el libro entero, la del total, que es la más confiable. Con un nivel solo, el margen es de
  unos 100 puntos para arriba o para abajo.</p>
  <div class="tablas">
    ${LIBRO.NIVELES.map((nv) => {
      const de = ITEMS.filter((i) => i.nivel === nv.n);
      return `<div><h3>${esc(nv.nombre)}</h3><table class="tabla-fuerza"><tr><th class="num">Puntos</th><th class="num">Elo</th></tr>${filasTablaPuntos(de, PUNTOS * de.length)}</table></div>`;
    }).join("")}
  </div>
  <h3>El libro entero (hasta ${MAX} puntos)</h3>
  <table class="tabla-fuerza"><tr><th class="num">Tus puntos</th><th class="num">Fuerza estimada (Elo)</th></tr>
  ${filasTablaPuntos(ITEMS, MAX)}</table>
  <div class="nota">Las tablas salen de la dificultad medida de cada posición, no de una encuesta: para cada
  fuerza, se suma la probabilidad de resolver cada posición según la curva del Elo. Miden lo que sabes resolver
  con tiempo y sin presión; en el torneo, con el reloj y los nervios, puede ser algo menos. Más que el número,
  vale compararlo contigo mismo: vuelve a hacer un nivel dentro de unos meses y mira cuánto subió.</div>
</div>

<div class="pagina junto">
  <h2 class="titulo">Después de cada test</h2>
  <ol class="habitos">
    <li>Pon en el tablero las posiciones que fallaste y juega la solución hasta el final. Entender por qué gana vale más que saber cuál era la jugada.</li>
    <li>Busca qué te faltó: ¿no viste el tema?, ¿viste el golpe pero no la defensa?, ¿te faltó tiempo? Anótalo en «Comentarios».</li>
    <li>Si un tema sale flojo en dos niveles, trabájalo aparte: en la plataforma de la Academia, Entrenamiento tiene ejercicios de cada tema.</li>
    <li>Vuelve a hacer el test una semana después. Si lo resuelves rápido, el patrón ya es tuyo.</li>
    <li>Uno o dos tests por semana es un buen ritmo. Más rápido se aprende menos: el ojo necesita tiempo para guardar lo que vio.</li>
  </ol>
  <div class="nota" style="margin-top:8mm"><strong>${esc(AUTOR)}</strong> · Academia Ajedrez Integral, ${ANIO}.
  Las posiciones salen de la base abierta de ejercicios de Lichess (dominio público, CC0) y se comprobaron con
  Stockfish 16. Cada solución cita el número del ejercicio en esa base.</div>
</div>

</body></html>`;

/* ---------------------------------------------------------- la tapa */
const htmlPortada = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${esc(NOMBRE)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { width: 210mm; height: 297mm; font-family: "DejaVu Serif", Georgia, serif; color: #f0f4f8;
         background: linear-gradient(158deg, ${TAPA[0]} 0%, ${TAPA[1]} 48%, ${TAPA[2]} 100%); position: relative; overflow: hidden; }
  /* Los adornos van dentro de su propio recorte: overflow:hidden en el body se
     propaga al viewport y Chromium encoge la tapa (ver diagnostico-libro.js). */
  .fondo { position: absolute; inset: 0; overflow: hidden; }
  .tablero-fondo { position: absolute; right: -44mm; bottom: -44mm; width: 158mm; height: 158mm;
      background-image:
        linear-gradient(45deg, rgba(240,180,41,.14) 25%, transparent 25%, transparent 75%, rgba(240,180,41,.14) 75%),
        linear-gradient(45deg, rgba(240,180,41,.14) 25%, transparent 25%, transparent 75%, rgba(240,180,41,.14) 75%);
      background-size: 21mm 21mm; background-position: 0 0, 10.5mm 10.5mm; transform: rotate(-12deg); }
  .brillo { position: absolute; left: -40mm; top: -50mm; width: 150mm; height: 150mm; border-radius: 50%;
      background: radial-gradient(circle, rgba(110,190,160,.22) 0%, rgba(110,190,160,0) 70%); }
  .lomo { position: absolute; left: 0; top: 0; bottom: 0; width: 7mm; background: linear-gradient(180deg, #de911d, #b4740f); }
  .hoja { position: relative; z-index: 2; height: 297mm; padding: 26mm 20mm 20mm 27mm; display: flex; flex-direction: column; }
  .marca-casa { font-size: 10pt; letter-spacing: .28em; text-transform: uppercase; color: #f0b429; font-weight: 700; margin: 0; }
  .centro { margin-top: auto; margin-bottom: auto; }
  .eyebrow { font-size: 10pt; letter-spacing: .22em; text-transform: uppercase; color: #a8c8bb; margin: 0 0 6mm; }
  h1 { font-size: 50pt; line-height: 1; margin: 0; color: #ffffff; font-weight: 700; letter-spacing: -.015em; }
  h1 .segunda { display: block; color: #f0b429; }
  .filete { width: 46mm; height: 1.4mm; background: #de911d; margin: 8mm 0 7mm; }
  .sub { font-size: 14pt; line-height: 1.5; color: #d3e3dc; margin: 0; max-width: 120mm; }
  .cifras { margin: 9mm 0 0; display: flex; gap: 10mm; }
  .cifra { border-left: .8mm solid rgba(240,180,41,.55); padding-left: 4mm; }
  .cifra .n { display: block; font-size: 21pt; font-weight: 700; color: #ffffff; line-height: 1.1; }
  .cifra .q { display: block; font-size: 8pt; letter-spacing: .12em; text-transform: uppercase; color: #a8c8bb; margin-top: 1mm; }
  .logo { display: block; width: 86mm; height: auto; margin: 10mm 0 0; }
  .pie-tapa { margin-top: auto; }
  .autor { font-size: 17pt; font-weight: 700; color: #ffffff; margin: 0; }
  .autor-rol { font-size: 8.5pt; letter-spacing: .18em; text-transform: uppercase; color: #f0b429; margin: 1.5mm 0 0; }
  .editorial { margin: 7mm 0 0; padding-top: 4mm; border-top: 1px solid rgba(168,200,187,.3);
      font-size: 8.5pt; color: #a8c8bb; display: flex; justify-content: space-between; gap: 6mm; }
</style>
</head><body>
  <div class="fondo"><div class="tablero-fondo"></div><div class="brillo"></div></div>
  <div class="lomo"></div>
  <div class="hoja">
    <p class="marca-casa">&#9822; Ajedrez Integral</p>
    <div class="centro">
      <p class="eyebrow">Banco de ejercicios tácticos · Volumen ${VOLUMEN}</p>
      <h1>Mide<span class="segunda">tu fuerza</span></h1>
      <div class="filete"></div>
      <p class="sub">Tests por tema, con tiempo y puntos, para entrenar la combinación y saber cuánto vas
        avanzando. Del ataque doble a la jugada tranquila, en tres niveles.</p>
      <div class="cifras">
        <div class="cifra"><span class="n">${TOTAL}</span><span class="q">posiciones</span></div>
        <div class="cifra"><span class="n">${TESTS.length}</span><span class="q">tests</span></div>
        <div class="cifra"><span class="n">${LIBRO.TEMAS.length}</span><span class="q">temas</span></div>
        <div class="cifra"><span class="n">${LIBRO.NIVELES.length}</span><span class="q">niveles</span></div>
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
  const tests = TESTS.map((t) => {
    const tema = TEMA[t.tema];
    const posiciones = t.items.map((it) => {
      const d = describir(it.fen);
      return `<article><h3>Posición ${it.n}</h3>
        <p class="posicion"><strong>La posición.</strong> ${d.turno} Piezas blancas: ${esc(d.blancas)}. Piezas negras: ${esc(d.negras)}.
        Las ${RIVAL[it.juegan]} acaban de jugar ${esc(oido((it.juegan === "w" ? "…" : "") + it.ultima))}.
        <span class="fen">FEN: ${esc(it.fen)}</span></p>
      </article>`;
    }).join("");
    const soluciones = t.items.map((it) => `<article><h3>Solución de la posición ${it.n}</h3>
        <p>${esc(oido(it.linea))}</p>
        <p>${esc(it.explica)}</p>
        <p class="comprobado">${esc(oido(it.comprobado))}</p>
      </article>`).join("");
    return `<section><h2>Test ${t.n}: ${esc(tema.nombre)}</h2>
      <p>${esc(NIVEL[t.nivel].nombre)}. Tiempo: ${t.minutos} minutos. ${t.nivel === 1 ? esc(tema.idea) : "Pista: " + esc(tema.pista)}</p>
      ${posiciones}
      <h2>Soluciones del test ${t.n}</h2>${soluciones}</section>`;
  }).join("");

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(NOMBRE)} — versión accesible</title>
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
  .comprobado { font-size: .92em; color: #3b4d5c; }
  table { border-collapse: collapse; }
  th, td { border-bottom: 1px solid #c9d4de; padding: .3rem .8rem; text-align: left; }
  footer { margin-top: 3rem; border-top: 1px solid #c9d4de; padding-top: 1rem; font-size: .95rem; }
  @media (prefers-color-scheme: dark) {
    body { background: #10202e; color: #eef3f7; }
    h2 { border-color: #eef3f7; }
    .posicion { background: #1b3145; }
    .comprobado { color: #b8c7d4; }
    article, footer, th, td { border-color: #3b5165; }
  }
</style>
</head><body>
<h1>${esc(NOMBRE)}</h1>
<p>Banco de ejercicios tácticos de ${esc(AUTOR)}, volumen ${VOLUMEN}.${VOLUMEN >= 7 ? " La forma de los anteriores, con posiciones todas nuevas y tres temas nuevos: mate en dos, mate en tres y sacrificio." : VOLUMEN > 1 ? " La misma forma que el volumen 1, con posiciones todas nuevas." : ""} Es el mismo contenido del libro en PDF, escrito para
leerse con lector de pantalla o con la letra agrandada: las posiciones van contadas pieza por pieza y con su
FEN, y no hay ninguna imagen.</p>
<p>${TOTAL} posiciones en ${TESTS.length} tests de ${POR_TEST}, uno por tema, en tres niveles. Cada posición resuelta vale
${PUNTOS} puntos: la primera jugada y la idea de la línea. Si la primera jugada es buena pero falla la continuación, 3.
Por cada 5 minutos que sobren se suma 1 punto, y por cada 5 de más se resta 1. Las soluciones de cada test vienen
después de sus posiciones.</p>
<h2>Los temas</h2>
<ul>${LIBRO.TEMAS.map((t) => `<li><strong>${esc(t.nombre)}</strong>: ${esc(t.idea)}</li>`).join("")}</ul>
${tests}
<h2>Tu fuerza</h2>
${LIBRO.NIVELES.map((nv) => {
  const de = ITEMS.filter((i) => i.nivel === nv.n);
  return `<h3>${esc(nv.nombre)}</h3><table><tr><th>Tus puntos</th><th>Fuerza estimada</th></tr>${filasTablaPuntos(de, PUNTOS * de.length)}</table>`;
}).join("")}
<h3>El libro entero</h3>
<table><tr><th>Tus puntos</th><th>Fuerza estimada</th></tr>${filasTablaPuntos(ITEMS, MAX)}</table>
<footer>
  <p>${esc(AUTOR)} · Academia Ajedrez Integral · ${ANIO}.</p>
  <p>Posiciones de la base abierta de ejercicios de Lichess (CC0), comprobadas con Stockfish 16.</p>
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
    if (!g.move(ingles)) throw new Error(`La jugada ${san} de la solución ${it.n} no es legal.`);
  });
  if (jugadas[0] !== it.primera) throw new Error(`La línea de la posición ${it.n} no empieza por ${it.primera}.`);
});

fs.mkdirSync(CARPETA, { recursive: true });
const tmp = os.tmpdir();
const htmlTemporal = path.join(tmp, `${PRODUCTO}-cuerpo.html`);
const htmlPortadaTemporal = path.join(tmp, `${PRODUCTO}-tapa.html`);
const htmlMarcaTemporal = path.join(tmp, `${PRODUCTO}-marca.html`);
fs.writeFileSync(htmlTemporal, html);
fs.writeFileSync(htmlPortadaTemporal, htmlPortada);
fs.writeFileSync(htmlMarcaTemporal, htmlMarca);
const destinoAccesible = path.join(CARPETA, `${PRODUCTO}-accesible.html`);
fs.writeFileSync(destinoAccesible, accesible());
console.log(`Maqueta: ${htmlTemporal}\nAccesible: ${destinoAccesible}`);
console.log(`${TOTAL} posiciones · ${TESTS.length} tests · ${LIBRO.TEMAS.length} temas`);
if (process.argv.includes("--solo-accesible")) process.exit(0);

(async () => {
  const { chromium } = require("playwright");
  const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const destino = path.join(CARPETA, `${PRODUCTO}.pdf`);
  const tapa = path.join(tmp, `${PRODUCTO}-tapa.pdf`);
  const cuerpo = path.join(tmp, `${PRODUCTO}-cuerpo.pdf`);
  const marca = path.join(tmp, `${PRODUCTO}-marca.pdf`);
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
    footerTemplate: `<div style="width:100%;font-size:7.5pt;color:#9fb3c8;font-family:Arial,sans-serif;padding:0 15mm;display:flex;justify-content:space-between;align-items:center;"><span>${esc(NOMBRE)} · Ajedrez Integral</span><span style="font-weight:700;color:#829ab1;">${esc(AUTOR)}</span><span class="pageNumber"></span></div>`,
  });
  await navegador.close();
  unir(tapa, cuerpo, marca, destino);
  proteger(destino, {
    clave: CLAVE_PROPIETARIO, autor: AUTOR, imprimir: true,
    titulo: `Mide tu fuerza, volumen ${VOLUMEN} - banco de ejercicios tacticos de ajedrez`,
    asunto: "Tests de combinacion por tema, con tiempo, puntos y fuerza en Elo",
  });
  console.log("PDF listo:", destino);
})();
