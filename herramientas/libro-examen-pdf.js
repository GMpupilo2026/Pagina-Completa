/* ===== El libro «Ponte a prueba», de Oscar Angulo Cubero =====
 *
 * Arma material/ponte-a-prueba/ponte-a-prueba.pdf: un examen de ajedrez para
 * medirse uno mismo —180 posiciones en seis pruebas de 30—, con sus
 * soluciones, la planilla de puntos, las tablas que pasan los puntos a una
 * fuerza en Elo (total y por categoría) y la guía de qué entrenar según lo que
 * salga flojo. Las posiciones y los puntos salen de material/ponte-a-prueba/banco.js,
 * que arma herramientas/libro-examen-generar.js: este script no decide nada
 * de ajedrez, solo lo pone en papel.
 *
 * Comparte con el libro del diagnóstico la forma de cerrarse (tapa a página
 * completa, marca de agua con el logo en cada página del cuerpo, firma del
 * autor y PDF protegido: herramientas/lib/pdf-armar.js). A diferencia de
 * aquel, ESTE se deja imprimir: es un examen y se contesta en papel.
 *
 * El mismo contenido sale también en ponte-a-prueba-accesible.html, con cada
 * posición contada pieza por pieza: un PDF con diagramas y marca de agua no le
 * sirve a quien usa lector de pantalla.
 *
 * Las tablas de fuerza no son de nadie más: salen de la dificultad de cada
 * posición (su `elo`) con la curva del Elo. Para una fuerza R, cada posición
 * se acierta con probabilidad 0,25 + 0,75 / (1 + 10^((elo − R)/400)) —0,25 es
 * acertar al azar entre cuatro—, y al fallar se cobra el promedio de las otras
 * opciones. Los puntos esperados de cada fuerza son la tabla.
 *
 * Cómo se corre (Node, Chromium por Playwright y pypdf):
 *
 *     node herramientas/libro-examen-pdf.js
 *     node herramientas/libro-examen-pdf.js --solo-accesible   # sin PDF ni pypdf
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
const { describir } = require("./lib/describir-fen.js");
const N = require("./lib/notacion.js");
const { unir, proteger } = require("./lib/pdf-armar.js");
const {
  LETRAS, banco, LOGO_CREMA, esc, puntosTexto, esperado, FUERZAS, filasTablaPuntos, diagrama, htmlMarca,
} = require("./lib/libro-examen-comun.js");

const { LIBRO, ITEMS } = banco();
const CATS = LIBRO.CATEGORIAS;

const AUTOR = LIBRO.AUTOR;
const CLAVE_PROPIETARIO = "ponte-a-prueba-oac-2026";
const CARPETA = path.join(RAIZ, "material", "ponte-a-prueba");
const ANIO = 2026;

/* Las opciones de la jugada se barajan para que la buena no quede siempre
   primera, con un orden fijo que sale del identificador: el libro, sus
   soluciones y la planilla siempre coinciden y dos impresiones son iguales. */
function ordenOpciones(item) {
  let s = 0;
  for (const c of item.id) s = (s * 31 + c.charCodeAt(0)) % 100000;
  s = s || 1;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const orden = item.jugada.opciones.map((_, i) => i);
  for (let i = orden.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [orden[i], orden[j]] = [orden[j], orden[i]];
  }
  return orden;
}

/* ---------------------------------------------------------- los textos */
/* Lo que mide cada categoría y qué hacer si sale floja. Texto propio, con los
   recursos de la plataforma donde se entrena cada cosa. */
const GUIA = {
  apertura: {
    mide: "Si sales de la apertura con las piezas activas y sin regalar nada, y si castigas al rival que se descuida en las primeras jugadas.",
    flojo: "Pierdes material o la iniciativa antes de la jugada 15, muchas veces por una pieza sin defender o un rey que se quedó en el centro.",
    entrena: [
      "Juega siempre las mismas aperturas durante un tiempo y aprende el porqué de cada jugada, no la lista.",
      "Repasa cada partida rápida hasta la jugada en que dejaste la teoría: ahí está lo que te falta.",
      "En la plataforma: Entrenamiento › Aperturas y «Mi repertorio», y las fichas de Estudio de aperturas y defensas.",
    ],
  },
  medio: {
    mide: "Cómo te manejas cuando están casi todas las piezas en el tablero: la parte más larga y más rica de la partida.",
    flojo: "Las partidas se te complican justo cuando ya no hay teoría y todavía no es un final: no encuentras un plan o no ves lo que hay.",
    entrena: [
      "Antes de jugar, nombra en voz baja tres cosas: qué amenaza el rival, qué piezas tuyas están mal y cuál es tu plan.",
      "Estudia partidas comentadas de maestros: una por semana, despacio, adivinando la jugada antes de verla.",
      "En la plataforma: Entrenamiento › Habilidades (Detective, la amenaza, Ruta segura) y Precisión posicional.",
    ],
  },
  final: {
    mide: "La técnica cuando quedan pocas piezas: el rey que se activa, los peones que corren y la precisión que no perdona.",
    flojo: "Llegas a finales ganados y los empatas, o finales iguales y los pierdes. Es la manera más cara de perder puntos.",
    entrena: [
      "Dedica un tercio de tu estudio a los finales: es lo que más rinde por hora y no pasa de moda.",
      "Juega los finales contra la máquina hasta ganarlos tres veces seguidas sin errores.",
      "En la plataforma: Entrenamiento › Finales y el curso «El mapa de los finales».",
    ],
  },
  ataque: {
    mide: "Si sabes llevar las piezas contra el rey rival y rematar: los mates, los golpes contra el enroque y la puntería.",
    flojo: "Ves que el rey rival está débil pero el ataque se te apaga, o pasas de largo frente a un mate.",
    entrena: [
      "Resuelve mates en dos y en tres todos los días, poquitos pero sin mover las piezas.",
      "Aprende de memoria los dibujos de mate más comunes: la coz, el pasillo, Anastasia, el de alfil y caballo.",
      "En la plataforma: Entrenamiento › Mates y Táctica (temas de ataque al rey).",
    ],
  },
  defensa: {
    mide: "Si ves lo que amenaza el rival y encuentras la única jugada que sostiene la posición.",
    flojo: "Pierdes partidas por golpes que el rival tenía preparados y que no viste venir. Juegas tu plan sin mirar el del otro.",
    entrena: [
      "Antes de cada jugada pregúntate: ¿qué quiere hacer mi rival con su última jugada?",
      "Resuelve ejercicios desde el lado del que se defiende: buscar la salvación entrena otra parte de la cabeza.",
      "En la plataforma: Entrenamiento › Habilidades (la amenaza, Aguanta, Salva las tablas).",
    ],
  },
  tactica: {
    mide: "Ver los golpes: horquillas, clavadas, ataques dobles, desviaciones, piezas sin defender.",
    flojo: "Pierdes o dejas de ganar material por golpes de una o dos jugadas. Es lo primero que hay que arreglar, a cualquier nivel.",
    entrena: [
      "Veinte minutos diarios de ejercicios tácticos valen más que tres horas un domingo.",
      "Cuando falles uno, vuelve a resolverlo al día siguiente y a la semana: el dibujo se queda.",
      "En la plataforma: Entrenamiento › Táctica y el «Repaso del día».",
    ],
  },
  calculo: {
    mide: "Llevar una variante larga en la cabeza sin mover las piezas y ver bien la posición del final de la línea.",
    flojo: "Encuentras la primera jugada pero te equivocas en la tercera, o al final de la variante ves una pieza donde ya no está.",
    entrena: [
      "Resuelve ejercicios largos con el tablero tapado: escribe la variante entera antes de comprobarla.",
      "Practica ver posiciones a ciegas: empieza por dos o tres jugadas y sube de a poco.",
      "En la plataforma: Entrenamiento › Visualización y Habilidades (Fotografía, Barrido).",
    ],
  },
  sacrificio: {
    mide: "Animarte a entregar material cuando lo que se gana —mate, iniciativa, más material— vale más.",
    flojo: "Ves la idea pero no te atreves, o te atreves sin haber contado si alcanza.",
    entrena: [
      "Cuando veas un sacrificio, cuenta tres cosas: qué entregas, qué ganas y qué puede contestar el rival.",
      "Estudia partidas de ataque de los grandes jugadores románticos y modernos.",
      "En la plataforma: Entrenamiento › Táctica (tema sacrificio) y Mates.",
    ],
  },
  tranquila: {
    mide: "Encontrar la jugada que no es jaque ni captura y que aun así no tiene defensa.",
    flojo: "Solo miras los jaques y las capturas, y se te escapan las jugadas silenciosas que deciden.",
    entrena: [
      "En cada ejercicio, antes de mirar los jaques, busca qué jugada tranquila deja al rival sin salida.",
      "Repasa tus partidas buscando jugadas que no viste porque «no hacían nada».",
      "En la plataforma: Entrenamiento › Habilidades (Con lo justo, Elige a tiempo).",
    ],
  },
  tipicos: {
    mide: "Los finales que hay que saber de memoria: rey y peón, torres, la oposición, la carrera de peones.",
    flojo: "Calculas en la mesa lo que tendrías que saber de antes, y se te va el tiempo o el resultado.",
    entrena: [
      "Aprende los finales básicos uno por uno y juégalos contra la máquina hasta no fallar.",
      "Repasa la oposición, la regla del cuadrado y la posición de Lucena y de Philidor.",
      "En la plataforma: Entrenamiento › Finales (Rey y peón) y las fichas de finales de Estudio.",
    ],
  },
};

const HABITOS = [
  "Estudia un poco todos los días. Veinte minutos diarios rinden más que una tarde por semana.",
  "Repasa cada partida que juegues, sobre todo las que pierdes. Una derrota repasada vale más que tres victorias.",
  "Escribe lo que pensabas en cada momento importante. Ahí aparecen tus errores de verdad.",
  "Antes de cada jugada, mira qué amenaza el rival. Es el hábito que más puntos salva.",
  "Busca los jaques, las capturas y las amenazas de los dos lados antes de decidir.",
  "Entrena los finales. Son la parte del ajedrez que más rinde por hora de estudio.",
  "Juega partidas lentas. Con poco tiempo se aprende a jugar rápido, no a jugar bien.",
  "Repite los ejercicios que fallaste hasta que te salgan solos.",
  "Cuida el cuerpo: dormir bien antes de un torneo vale tanto como una tarde de estudio.",
  "Vuelve a hacer este examen dentro de seis meses y compara: lo que subió es lo que funcionó.",
];

function pregunta(item) {
  const orden = ordenOpciones(item);
  const evals = LIBRO.EVALUACION_CORTA.map((t, i) =>
    `<li><span class="letra">${LETRAS[i]})</span> ${esc(t)}</li>`).join("");
  const jugadas = orden.map((o, i) =>
    `<li><span class="letra">${LETRAS[i]})</span> 1.${esc(item.jugada.opciones[o])}</li>`).join("");
  return `<section class="pregunta">
    <div class="con-tablero">${diagrama(item, item.n)}
      <div class="al-lado">
        <p class="cabecera"><span class="num">${item.n}</span> <span class="estrellas">${"★".repeat(item.peso)}${"☆".repeat(5 - item.peso)}</span></p>
        <p class="ultima">Las negras acaban de jugar <strong>…${esc(item.ultima)}</strong>.</p>
        <p class="parte"><span class="etiqueta">Pregunta 1</span> Con la mejor jugada, ¿cuánto ganan las blancas?</p>
        <ol class="opciones dos">${evals}</ol>
        <p class="parte"><span class="etiqueta">Pregunta 2</span> ¿Cuál es la mejor jugada?</p>
        <ol class="opciones jugadas dos">${jugadas}</ol>
      </div>
    </div>
  </section>`;
}

function nombreCat(id) { return CATS.find((c) => c.id === id).nombre; }

function solucion(item) {
  const orden = ordenOpciones(item);
  const filaEval = LIBRO.EVALUACION.map((_, i) => {
    const p = item.evaluacion.puntos[i];
    return `<td class="${i === item.evaluacion.correcta ? "bien" : ""}">${LETRAS[i]}) ${puntosTexto(p)}</td>`;
  }).join("");
  const filaJug = orden.map((o, i) => {
    const p = item.jugada.puntos[o];
    return `<td class="${o === item.jugada.correcta ? "bien" : ""}">${LETRAS[i]}) 1.${esc(item.jugada.opciones[o])} ${puntosTexto(p)}</td>`;
  }).join("");
  const letraEval = LETRAS[item.evaluacion.correcta];
  const letraJug = LETRAS[orden.indexOf(item.jugada.correcta)];
  return `<section class="solucion">
    <p class="cabecera"><span class="num">${item.n}</span> <strong>Pregunta 1: ${letraEval})</strong> · <strong>Pregunta 2: ${letraJug}) 1.${esc(item.jugada.opciones[item.jugada.correcta])}</strong></p>
    <table class="puntos"><tr><th>P. 1</th>${filaEval}</tr><tr><th>P. 2</th>${filaJug}</tr></table>
    <p class="explica">${esc(item.explica)}</p>
    <p class="cats"><strong>Suma en:</strong> ${item.categorias.map(nombreCat).join(" · ")}. <span class="fuente">${esc(item.comprobado)}</span></p>
  </section>`;
}

/* ---------------------------------------------------------- la planilla */
const SIGLA = { apertura: "Ap", medio: "MJ", final: "Fi", ataque: "At", defensa: "De", tactica: "Tá", calculo: "Cá", sacrificio: "Sa", tranquila: "JT", tipicos: "FT" };
function planilla(p) {
  const delas = ITEMS.filter((i) => i.prueba === p);
  const filas = delas.map((it) => `<tr><td class="num">${it.n}</td><td class="caja"></td><td class="caja"></td><td class="caja total"></td>${
    CATS.map((c) => `<td class="${it.categorias.includes(c.id) ? "caja" : "gris"}"></td>`).join("")}</tr>`).join("");
  return `<div class="pagina">
    <h2 class="titulo">Planilla de la prueba ${p}</h2>
    <p class="mide">Anota los puntos de cada pregunta y su suma. Después copia la suma en cada casilla
    blanca de su renglón: así cada columna junta lo de su categoría. Las grises no cuentan.</p>
    <table class="planilla">
      <tr><th>N.º</th><th>P. 1</th><th>P. 2</th><th>Suma</th>${CATS.map((c) => `<th title="${esc(c.nombre)}">${SIGLA[c.id]}</th>`).join("")}</tr>
      ${filas}
      <tr class="totales"><th colspan="3">Total</th><td class="caja total"></td>${CATS.map(() => '<td class="caja"></td>').join("")}</tr>
      <tr class="totales"><th colspan="4">Máximo posible</th>${CATS.map((c) => `<td class="num">${10 * delas.filter((i) => i.categorias.includes(c.id)).length}</td>`).join("")}</tr>
    </table>
    <p class="leyenda">${CATS.map((c) => `<strong>${SIGLA[c.id]}</strong> ${esc(c.nombre)}`).join(" · ")}</p>
  </div>`;
}

/* ---------------------------------------------------------- por categoría */
function tablaCategorias(grupo) {
  const cab = grupo.map((c) => `<th class="num">${esc(c.nombre)}</th>`).join("");
  const filas = FUERZAS.filter((r) => r % 200 === 0).map((r) => `<tr><td class="num"><strong>${r}</strong></td>${grupo.map((c) => {
    const items = ITEMS.filter((i) => i.categorias.includes(c.id));
    const pct = esperado(items, r) / (10 * items.length) * 100;
    return `<td class="num">${Math.round(pct)} %</td>`;
  }).join("")}</tr>`).join("");
  return `<table class="cats-tabla"><tr><th class="num">Fuerza</th>${cab}</tr>${filas}</table>`;
}

/* ---------------------------------------------------------- el cuerpo */
const TOTAL = ITEMS.length;
const POR_PRUEBA = TOTAL / LIBRO.PRUEBAS;
const cuentaCat = Object.fromEntries(CATS.map((c) => [c.id, ITEMS.filter((i) => i.categorias.includes(c.id)).length]));

const pruebasHtml = Array.from({ length: LIBRO.PRUEBAS }, (_, k) => {
  const p = k + 1;
  const delas = ITEMS.filter((i) => i.prueba === p);
  return `<div class="pagina">
      <h2 class="titulo">Prueba ${p}</h2>
      <p class="mide">${POR_PRUEBA} posiciones, de la más fácil a la más difícil. Dos preguntas en cada una:
      cómo queda la posición y cuál es la mejor jugada. Hasta ${10 * POR_PRUEBA} puntos.
      Las soluciones están al final de la prueba: no las mires hasta terminar.</p>
      <div class="nota clave"><strong>Las respuestas de la pregunta 1</strong>, completas:
      <ol class="opciones">${LIBRO.EVALUACION.map((t, i) => `<li><span class="letra">${LETRAS[i]})</span> ${esc(t)}</li>`).join("")}</ol>
      «Peones de ventaja» es lo que le queda a favor a las blancas cuando se calma la posición: una pieza menor vale unos 3, una torre 5, una dama 9.</div>
      ${delas.map(pregunta).join("")}
    </div>
    <div class="pagina">
      <h2 class="titulo">Soluciones de la prueba ${p}</h2>
      <p class="mide">Junto a cada opción van sus puntos. La buena vale 5; una jugada que deja a las blancas
      mejor aunque no sea la mejor, 1; una que deja escapar la ventaja, 0; una que pierde, −1.</p>
      ${delas.map(solucion).join("")}
    </div>
    <div class="pagina junto">
      <h2 class="titulo">Tu resultado en la prueba ${p}</h2>
      <p class="mide">Suma tus puntos de las ${POR_PRUEBA} posiciones y busca el renglón. Es una estimación: con
      una sola prueba el margen es de unos 150 puntos para arriba o para abajo. Con las seis, la tabla de la
      fuerza total es mucho más precisa.</p>
      <table class="tabla-fuerza"><tr><th class="num">Tus puntos</th><th class="num">Fuerza estimada (Elo)</th></tr>
      ${filasTablaPuntos(delas, 10 * POR_PRUEBA)}</table>
    </div>`;
}).join("");

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Ponte a prueba · cuerpo</title>
<style>
  @page { size: A4; margin: 16mm 15mm 15mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "DejaVu Serif", Georgia, "Times New Roman", serif; font-size: 10pt; line-height: 1.42; color: #102a43; }
  h2.titulo { font-size: 17pt; margin: 0 0 3mm; padding-bottom: 2mm; border-bottom: 2px solid #334e68; }
  h3 { font-size: 11.5pt; margin: 6mm 0 2mm; color: #334e68; }
  .pagina { page-break-before: always; }
  .junto, table, tr { page-break-inside: avoid; }
  .mide { margin: 0 0 3mm; color: #334e68; }
  .nota { background: #f0f4f8; border-left: 3px solid #486581; padding: 3mm 4mm; margin: 4mm 0; font-size: 9.5pt; }
  .aviso { border: 1.5px solid #de911d; background: #fffaf0; padding: 4mm 5mm; margin: 4mm 0; }
  .estrellas { color: #b4740f; letter-spacing: .06em; }

  .pregunta { page-break-inside: avoid; margin-bottom: 4mm; padding-bottom: 3.5mm; border-bottom: 1px solid #d9e2ec; }
  .cabecera { margin: 0 0 1.5mm; font-size: 9pt; color: #627d98; }
  .cabecera .num { display: inline-block; min-width: 10mm; font-weight: 700; color: #102a43; font-size: 12pt; }
  .con-tablero { display: flex; gap: 6mm; align-items: flex-start; }
  .diagrama { flex: none; width: 60mm; }
  .diagrama svg { width: 60mm; height: auto; display: block; }
  .turno { font-size: 7.5pt; color: #627d98; margin: 1mm 0 0; text-align: center; }
  .al-lado { flex: 1; }
  .ultima { margin: 0 0 2mm; font-size: 9.5pt; }
  .parte { margin: 2mm 0 1mm; font-weight: 700; }
  .etiqueta { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .08em; color: #627d98; margin-right: 1.5mm; }
  ol.opciones { list-style: none; padding: 0; margin: 0 0 0 3mm; font-size: 9.5pt; }
  ol.opciones li { margin-bottom: .7mm; }
  ol.dos { display: grid; grid-template-columns: 1fr 1fr; column-gap: 4mm; }
  .clave ol.opciones { margin: 1.5mm 0 1.5mm 3mm; }
  ol.jugadas li { font-family: "DejaVu Sans", Arial, sans-serif; font-size: 10pt; }
  .letra { display: inline-block; min-width: 5mm; color: #627d98; }

  .solucion { page-break-inside: avoid; margin-bottom: 4mm; padding-bottom: 3mm; border-bottom: 1px solid #eef2f6; font-size: 9pt; }
  .solucion .cabecera { color: #0b6b3a; font-size: 9.5pt; }
  table.puntos { border-collapse: collapse; width: 100%; margin: 1mm 0 1.5mm; font-family: "DejaVu Sans", Arial, sans-serif; font-size: 8pt; }
  table.puntos th, table.puntos td { border: .4pt solid #d9e2ec; padding: .8mm 1.5mm; text-align: left; }
  table.puntos th { width: 10mm; color: #627d98; }
  table.puntos td.bien { background: #e3f4ea; font-weight: 700; color: #0b6b3a; }
  .explica { margin: 0 0 1mm; color: #243b53; }
  .cats { margin: 0; color: #486581; font-size: 8pt; }
  .fuente { color: #829ab1; font-style: italic; }

  table.tabla-fuerza, table.cats-tabla, table.reglas { border-collapse: collapse; width: 100%; margin-top: 3mm; }
  table.tabla-fuerza { width: 110mm; }
  .tabla-fuerza th, .tabla-fuerza td, .cats-tabla th, .cats-tabla td, .reglas th, .reglas td { border-bottom: 1px solid #d9e2ec; padding: 1.4mm 2.5mm; text-align: left; vertical-align: top; }
  th { font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; color: #627d98; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .cats-tabla { font-size: 9pt; table-layout: fixed; }
  .cats-tabla th:first-child, .cats-tabla td:first-child { width: 22mm; }

  table.planilla { border-collapse: collapse; width: 100%; font-family: "DejaVu Sans", Arial, sans-serif; font-size: 8pt; }
  .planilla th, .planilla td { border: .5pt solid #9fb3c8; padding: 0; height: 6.4mm; text-align: center; }
  .planilla th { background: #f0f4f8; color: #334e68; text-transform: none; letter-spacing: 0; }
  .planilla td.num { text-align: center; font-weight: 700; width: 10mm; }
  .planilla td.gris { background: #d9e2ec; }
  .planilla td.total { background: #fffaf0; }
  .planilla tr.totales th { text-align: right; padding-right: 2mm; }
  .leyenda { font-size: 7.5pt; color: #486581; margin-top: 2mm; }

  .categoria { page-break-inside: avoid; margin-bottom: 4mm; }
  .categoria h3 { margin-top: 4mm; }
  .categoria ul { margin: 1mm 0 0 5mm; padding: 0; }
  .categoria li { margin-bottom: .8mm; }
  ol.habitos li { margin-bottom: 1.6mm; }
</style>
</head><body>

<div>
  <h2 class="titulo">Antes de empezar</h2>
  <p>Este libro sirve para dos cosas: saber cuánto juegas de verdad y saber qué te conviene entrenar.
  No es un libro de ejercicios para resolver de corrido. Es un examen, y como todo buen examen, lo más
  valioso no es la nota: es lo que te dice de ti.</p>
  <p>Tiene ${TOTAL} posiciones repartidas en ${LIBRO.PRUEBAS} pruebas de ${POR_PRUEBA}. En cada posición te hago dos
  preguntas: <strong>cómo queda la posición</strong> con la mejor jugada y <strong>cuál es esa jugada</strong>.
  Las dos juntas miden algo que una sola no alcanza: encontrar la jugada sin entender adónde lleva vale menos
  que encontrarla sabiendo lo que se gana con ella.</p>
  <p>Cada posición suma puntos a varias categorías —apertura, medio juego, final, ataque, defensa, táctica,
  cálculo, sacrificio, jugadas tranquilas y finales típicos—. Al terminar vas a tener tu fuerza estimada en
  puntos Elo, en total y en cada categoría. La diferencia entre las categorías es lo más útil del libro:
  te dice dónde está el hueco que te está costando partidas.</p>
  <p>Al final encontrarás una guía de entrenamiento para cada categoría y los recursos de la plataforma de la
  Academia Ajedrez Integral con los que puedes trabajarla.</p>

  <div class="nota"><strong>De dónde salen las posiciones.</strong> Todas son de partidas reales, de la base
  abierta de ejercicios de Lichess, que es de dominio público. Ninguna está inventada. Cada una pasó por el
  motor Stockfish: solo quedaron las que tienen <strong>una sola jugada buena</strong>, y las otras tres
  opciones son jugadas que tientan —jaques, capturas, la idea que parece buena— y fallan por algo que la
  solución explica. Los puntos de cada opción también los decide el motor, no el gusto de nadie.</div>

  <h2 class="titulo pagina">Cómo hacer el examen</h2>
  <ol class="habitos">
    <li><strong>Una prueba por sesión.</strong> Hazla de un tirón, con calma, en un lugar sin ruido. Cada prueba lleva
    entre una hora y media y dos horas y media.</li>
    <li><strong>Sin mover las piezas.</strong> Puedes poner la posición en un tablero, pero no muevas nada: en la
    partida tampoco se puede. Nada de motores ni de ayuda.</li>
    <li><strong>No más de cinco minutos por posición.</strong> Si no lo ves, elige la que te parezca más razonable y
    sigue. Si una te gusta mucho, márcala para estudiarla después.</li>
    <li><strong>No adivines.</strong> Una respuesta mala resta un punto. Contestar al azar no suma nada en promedio, y
    ensucia el resultado.</li>
    <li><strong>En todas las posiciones juegan las blancas</strong> y el tablero se mira desde su lado. La última
    jugada de las negras está marcada en el diagrama: empieza por preguntarte qué quiere.</li>
    <li><strong>Las jugadas van en notación algebraica en español:</strong> R rey, D dama, T torre, A alfil, C caballo;
    x es captura, + jaque y # mate.</li>
    <li><strong>Corrige al terminar la prueba entera,</strong> con las soluciones que vienen después. Anota los puntos en
    la planilla de esa prueba (al final del libro) y busca tu resultado en su tabla.</li>
  </ol>

  <h3>Cómo se cuentan los puntos</h3>
  <table class="reglas">
    <tr><th>Pregunta</th><th class="num">Vale</th><th>Cuándo</th></tr>
    <tr><td>1 · Cómo queda</td><td class="num">5</td><td>La respuesta que da el motor tras la mejor jugada.</td></tr>
    <tr><td></td><td class="num">1 o 2</td><td>La de al lado: 2 si la evaluación está justo en el borde entre las dos.</td></tr>
    <tr><td></td><td class="num">−1</td><td>Una lectura muy lejos de la verdad.</td></tr>
    <tr><td>2 · La jugada</td><td class="num">5</td><td>La mejor jugada: la única que consigue lo que la posición ofrece.</td></tr>
    <tr><td></td><td class="num">1</td><td>Otra que deja a las blancas mejor, aunque se escape lo mejor.</td></tr>
    <tr><td></td><td class="num">0</td><td>Una que deja escapar la ventaja.</td></tr>
    <tr><td></td><td class="num">−1</td><td>Una que pierde.</td></tr>
  </table>
  <p class="mide">Cada posición vale hasta 10 puntos; cada prueba, hasta ${10 * POR_PRUEBA}; el libro entero, hasta ${10 * TOTAL}.
  Las estrellas junto al número (de una a cinco) dicen qué tan difícil es la posición.</p>

  <h2 class="titulo pagina">Las diez categorías</h2>
  <p class="mide">Cada posición suma a todas las categorías que le corresponden. La lista de cuáles está en sus
  soluciones y en la planilla.</p>
  <table class="reglas">
    <tr><th>Categoría</th><th class="num">Posiciones</th><th>Qué mide</th></tr>
    ${CATS.map((c) => `<tr><td><strong>${esc(c.nombre)}</strong></td><td class="num">${cuentaCat[c.id]}</td><td>${esc(GUIA[c.id].mide)}</td></tr>`).join("")}
  </table>
</div>

${pruebasHtml}

${Array.from({ length: LIBRO.PRUEBAS }, (_, k) => planilla(k + 1)).join("")}

<div class="pagina">
  <h2 class="titulo">Tu fuerza total</h2>
  <p class="mide">Si hiciste las seis pruebas, suma todos tus puntos (hasta ${10 * TOTAL}) y busca el renglón. Esta es la
  estimación más confiable del libro: ${TOTAL} posiciones de todas las dificultades.</p>
  <table class="tabla-fuerza"><tr><th class="num">Tus puntos</th><th class="num">Fuerza estimada (Elo)</th></tr>
  ${filasTablaPuntos(ITEMS, 10 * TOTAL)}</table>
  <div class="nota">La fuerza del libro mide lo que <strong>sabes</strong> resolver con tiempo y sin presión.
  En el torneo, con el reloj y los nervios, tu resultado puede quedar hasta unos cien puntos más arriba o más abajo.
  Lo que más vale no es el número: es la comparación entre tus categorías.</div>
</div>

<div class="pagina">
  <h2 class="titulo">Tu fuerza en cada categoría</h2>
  <p class="mide">Para cada categoría, divide tus puntos entre el máximo posible de las pruebas que hiciste (lo dice la
  última fila de cada planilla) y multiplica por cien. Busca en su columna el porcentaje más cercano al tuyo: el
  renglón dice tu fuerza en esa categoría.</p>
  ${tablaCategorias(CATS.slice(0, 5))}
  ${tablaCategorias(CATS.slice(5))}
  <h3>Cómo leer el resultado</h3>
  <p>Compara cada categoría con tu fuerza total. Una categoría <strong>200 puntos o más por debajo</strong> es la
  prioridad: ahí se te van las partidas. Una <strong>200 puntos por encima</strong> es tu fuerte: apóyate en ella
  al elegir tus aperturas y tu estilo. Empieza por la más floja y no trabajes más de dos categorías a la vez.</p>
</div>

<div class="pagina">
  <h2 class="titulo">Guía de entrenamiento</h2>
  <p class="mide">Qué significa cada categoría floja y con qué trabajarla.</p>
  ${CATS.map((c) => `<div class="categoria"><h3>${esc(c.nombre)}</h3>
    <p><strong>Cuando sale floja.</strong> ${esc(GUIA[c.id].flojo)}</p>
    <ul>${GUIA[c.id].entrena.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>`).join("")}
</div>

<div class="pagina junto">
  <h2 class="titulo">Diez hábitos para mejorar</h2>
  <ol class="habitos">${HABITOS.map((h) => `<li>${esc(h)}</li>`).join("")}</ol>
  <div class="nota" style="margin-top:8mm"><strong>${esc(AUTOR)}</strong> · Academia Ajedrez Integral, ${ANIO}.
  Las posiciones salen de la base abierta de ejercicios de Lichess (dominio público, CC0) y se comprobaron con
  Stockfish 16. Cada solución cita el número del ejercicio en esa base.</div>
</div>

</body></html>`;

/* ---------------------------------------------------------- la tapa */
const htmlPortada = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Ponte a prueba</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { width: 210mm; height: 297mm; font-family: "DejaVu Serif", Georgia, serif; color: #f0f4f8;
         background: linear-gradient(158deg, #081b2e 0%, #143253 48%, #0a2138 100%); position: relative; overflow: hidden; }
  /* Los adornos van dentro de su propio recorte: overflow:hidden en el body se
     propaga al viewport y Chromium encoge la tapa (ver diagnostico-libro.js). */
  .fondo { position: absolute; inset: 0; overflow: hidden; }
  .tablero-fondo { position: absolute; right: -44mm; bottom: -44mm; width: 158mm; height: 158mm;
      background-image:
        linear-gradient(45deg, rgba(222,145,29,.14) 25%, transparent 25%, transparent 75%, rgba(222,145,29,.14) 75%),
        linear-gradient(45deg, rgba(222,145,29,.14) 25%, transparent 25%, transparent 75%, rgba(222,145,29,.14) 75%);
      background-size: 21mm 21mm; background-position: 0 0, 10.5mm 10.5mm; transform: rotate(-12deg); }
  .brillo { position: absolute; left: -40mm; top: -50mm; width: 150mm; height: 150mm; border-radius: 50%;
      background: radial-gradient(circle, rgba(93,143,196,.22) 0%, rgba(93,143,196,0) 70%); }
  .lomo { position: absolute; left: 0; top: 0; bottom: 0; width: 7mm; background: linear-gradient(180deg, #de911d, #b4740f); }
  .hoja { position: relative; z-index: 2; height: 297mm; padding: 26mm 20mm 20mm 27mm; display: flex; flex-direction: column; }
  .marca-casa { font-size: 10pt; letter-spacing: .28em; text-transform: uppercase; color: #f0b429; font-weight: 700; margin: 0; }
  .centro { margin-top: auto; margin-bottom: auto; }
  .eyebrow { font-size: 10pt; letter-spacing: .22em; text-transform: uppercase; color: #9fb3c8; margin: 0 0 6mm; }
  h1 { font-size: 50pt; line-height: 1; margin: 0; color: #ffffff; font-weight: 700; letter-spacing: -.015em; }
  h1 .segunda { display: block; color: #f0b429; }
  .filete { width: 46mm; height: 1.4mm; background: #de911d; margin: 8mm 0 7mm; }
  .sub { font-size: 14pt; line-height: 1.5; color: #cfdbe6; margin: 0; max-width: 120mm; }
  .cifras { margin: 9mm 0 0; display: flex; gap: 10mm; }
  .cifra { border-left: .8mm solid rgba(240,180,41,.55); padding-left: 4mm; }
  .cifra .n { display: block; font-size: 21pt; font-weight: 700; color: #ffffff; line-height: 1.1; }
  .cifra .q { display: block; font-size: 8pt; letter-spacing: .12em; text-transform: uppercase; color: #9fb3c8; margin-top: 1mm; }
  .logo { display: block; width: 86mm; height: auto; margin: 10mm 0 0; }
  .pie-tapa { margin-top: auto; }
  .autor { font-size: 17pt; font-weight: 700; color: #ffffff; margin: 0; }
  .autor-rol { font-size: 8.5pt; letter-spacing: .18em; text-transform: uppercase; color: #f0b429; margin: 1.5mm 0 0; }
  .editorial { margin: 7mm 0 0; padding-top: 4mm; border-top: 1px solid rgba(159,179,200,.3);
      font-size: 8.5pt; color: #9fb3c8; display: flex; justify-content: space-between; gap: 6mm; }
</style>
</head><body>
  <div class="fondo"><div class="tablero-fondo"></div><div class="brillo"></div></div>
  <div class="lomo"></div>
  <div class="hoja">
    <p class="marca-casa">&#9822; Ajedrez Integral</p>
    <div class="centro">
      <p class="eyebrow">Examen y guía de entrenamiento</p>
      <h1>Ponte<span class="segunda">a prueba</span></h1>
      <div class="filete"></div>
      <p class="sub">Mide tu fuerza en ajedrez, descubre tus puntos débiles y sabe qué entrenar.
        Para todos los niveles, desde quien empieza hasta el jugador de torneo.</p>
      <div class="cifras">
        <div class="cifra"><span class="n">${TOTAL}</span><span class="q">posiciones</span></div>
        <div class="cifra"><span class="n">${LIBRO.PRUEBAS}</span><span class="q">pruebas</span></div>
        <div class="cifra"><span class="n">${CATS.length}</span><span class="q">categorías</span></div>
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

/* ---------------------------------------------------------- accesible */
/* Sin una sola imagen: la posición se cuenta pieza por pieza y las jugadas van
   dichas («alfil captura felix 6»), que es como se entienden con lector de
   pantalla. */
function accesible() {
  const oido = (t) => N.textoHablado(t, "espanol");
  const pruebas = Array.from({ length: LIBRO.PRUEBAS }, (_, k) => {
    const p = k + 1;
    const delas = ITEMS.filter((i) => i.prueba === p);
    const preguntas = delas.map((it) => {
      const d = describir(it.fen);
      const orden = ordenOpciones(it);
      return `<article><h3>Posición ${it.n} · dificultad ${it.peso} de 5</h3>
        <p class="posicion"><strong>La posición.</strong> ${d.turno} Piezas blancas: ${esc(d.blancas)}. Piezas negras: ${esc(d.negras)}.
        Las negras acaban de jugar ${esc(oido("…" + it.ultima))}.
        <span class="fen">FEN: ${esc(it.fen)}</span></p>
        <p><strong>Pregunta 1.</strong> Con la mejor jugada, ¿cómo queda la posición?</p>
        <ol type="a">${LIBRO.EVALUACION.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>
        <p><strong>Pregunta 2.</strong> ¿Cuál es la mejor jugada?</p>
        <ol type="a">${orden.map((o) => `<li>${esc(oido("1." + it.jugada.opciones[o]))}</li>`).join("")}</ol>
      </article>`;
    }).join("");
    const soluciones = delas.map((it) => {
      const orden = ordenOpciones(it);
      return `<article><h3>Solución de la posición ${it.n}</h3>
        <p>Pregunta 1: ${LETRAS[it.evaluacion.correcta]}, ${esc(LIBRO.EVALUACION[it.evaluacion.correcta])}
        Puntos de cada respuesta: ${LIBRO.EVALUACION.map((_, i) => `${LETRAS[i]}, ${puntosTexto(it.evaluacion.puntos[i])}`).join("; ")}.</p>
        <p>Pregunta 2: ${LETRAS[orden.indexOf(it.jugada.correcta)]}, ${esc(oido("1." + it.jugada.opciones[it.jugada.correcta]))}.
        Puntos de cada respuesta: ${orden.map((o, i) => `${LETRAS[i]}, ${puntosTexto(it.jugada.puntos[o])}`).join("; ")}.</p>
        <p>${esc(oido(it.explica))}</p>
        <p class="comprobado">Suma en: ${it.categorias.map(nombreCat).join(", ")}. ${esc(oido(it.comprobado))}</p>
      </article>`;
    }).join("");
    return `<section><h2>Prueba ${p}</h2>${preguntas}
      <h2>Soluciones de la prueba ${p}</h2>${soluciones}
      <h2>Tu resultado en la prueba ${p}</h2>
      <table><tr><th>Tus puntos</th><th>Fuerza estimada</th></tr>${filasTablaPuntos(delas, 10 * POR_PRUEBA)}</table></section>`;
  }).join("");

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Ponte a prueba — versión accesible</title>
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
<h1>Ponte a prueba</h1>
<p>Examen y guía de entrenamiento de ajedrez, de ${esc(AUTOR)}. Es el mismo contenido del libro en PDF,
escrito para leerse con lector de pantalla o con la letra agrandada: las posiciones van contadas pieza por
pieza y con su FEN, y no hay ninguna imagen.</p>
<p>${TOTAL} posiciones en ${LIBRO.PRUEBAS} pruebas de ${POR_PRUEBA}. En cada una juegan las blancas y hay dos preguntas:
cómo queda la posición con la mejor jugada y cuál es esa jugada. La buena vale 5 puntos; las demás, de 2 a −1,
según lo que deja cada una. Las soluciones de cada prueba vienen después de sus preguntas.</p>
<h2>Las categorías</h2>
<ul>${CATS.map((c) => `<li><strong>${esc(c.nombre)}</strong> (${cuentaCat[c.id]} posiciones): ${esc(GUIA[c.id].mide)}</li>`).join("")}</ul>
${pruebas}
<h2>Tu fuerza total</h2>
<table><tr><th>Tus puntos</th><th>Fuerza estimada</th></tr>${filasTablaPuntos(ITEMS, 10 * TOTAL)}</table>
<h2>Guía de entrenamiento</h2>
${CATS.map((c) => `<h3>${esc(c.nombre)}</h3><p>Cuando sale floja: ${esc(GUIA[c.id].flojo)}</p><ul>${GUIA[c.id].entrena.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`).join("")}
<h2>Diez hábitos para mejorar</h2>
<ol>${HABITOS.map((h) => `<li>${esc(h)}</li>`).join("")}</ol>
<footer>
  <p>${esc(AUTOR)} · Academia Ajedrez Integral · ${ANIO}.</p>
  <p>Posiciones de la base abierta de ejercicios de Lichess (CC0), comprobadas con Stockfish 16.</p>
</footer>
</body></html>`;
}

/* ---------------------------------------------------------- generar */
// Antes de imprimir, lo que no puede fallar: que cada jugada de las opciones
// sea legal en su posición. Un libro con una opción imposible se imprime igual.
ITEMS.forEach((it) => {
  it.jugada.opciones.forEach((san) => {
    const g = new Chess(it.fen);
    const ingles = san.replace(/^[RDTAC]/, (c) => ({ R: "K", D: "Q", T: "R", A: "B", C: "N" })[c])
      .replace(/=([DTAC])/, (_, c) => "=" + ({ D: "Q", T: "R", A: "B", C: "N" })[c]);
    if (!g.move(ingles)) throw new Error(`La opción ${san} de la posición ${it.n} no es legal.`);
  });
});

fs.mkdirSync(CARPETA, { recursive: true });
const tmp = os.tmpdir();
const htmlTemporal = path.join(tmp, "ponte-a-prueba-cuerpo.html");
const htmlPortadaTemporal = path.join(tmp, "ponte-a-prueba-tapa.html");
const htmlMarcaTemporal = path.join(tmp, "ponte-a-prueba-marca.html");
fs.writeFileSync(htmlTemporal, html);
fs.writeFileSync(htmlPortadaTemporal, htmlPortada);
fs.writeFileSync(htmlMarcaTemporal, htmlMarca);
const destinoAccesible = path.join(CARPETA, "ponte-a-prueba-accesible.html");
fs.writeFileSync(destinoAccesible, accesible());
console.log(`Maqueta: ${htmlTemporal}\nAccesible: ${destinoAccesible}`);
console.log(`${TOTAL} posiciones · ${LIBRO.PRUEBAS} pruebas · ${CATS.length} categorías`);
if (process.argv.includes("--solo-accesible")) process.exit(0);

(async () => {
  const { chromium } = require("playwright");
  const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const destino = path.join(CARPETA, "ponte-a-prueba.pdf");
  const tapa = path.join(tmp, "ponte-a-prueba-tapa.pdf");
  const cuerpo = path.join(tmp, "ponte-a-prueba-cuerpo.pdf");
  const marca = path.join(tmp, "ponte-a-prueba-marca.pdf");
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
    footerTemplate: `<div style="width:100%;font-size:7.5pt;color:#9fb3c8;font-family:Arial,sans-serif;padding:0 15mm;display:flex;justify-content:space-between;align-items:center;"><span>Ponte a prueba · Ajedrez Integral</span><span style="font-weight:700;color:#829ab1;">${esc(AUTOR)}</span><span class="pageNumber"></span></div>`,
  });
  await navegador.close();
  unir(tapa, cuerpo, marca, destino);
  proteger(destino, {
    clave: CLAVE_PROPIETARIO, autor: AUTOR, imprimir: true,
    titulo: "Ponte a prueba - examen y guia de entrenamiento de ajedrez",
    asunto: "Examen de ajedrez para medir la fuerza y saber que entrenar",
  });
  console.log("PDF listo:", destino);
})();
