/* ===== El libro «Una clase al día», en doce tomos =====
 *
 * Arma cursos/recursos/una-clase-al-dia/tomo-NN.pdf (uno por bloque del curso) y su
 * versión accesible tomo-NN-accesible.html: las 360 clases del MI Ángel Martín
 * («Las Mil y una Lecciones de Ajedrez», EDAMI, 2011), publicadas con permiso,
 * en el mismo orden por tema que el curso.
 *
 * No decide nada de ajedrez: todo sale de los datos del curso
 * (cursos/protegido/data/una-clase-al-dia/lNNN.json), que son la única
 * copia. Las partidas se comprobaron jugada a jugada al leerlas del libro
 * original (herramientas/mil-lecciones/) y aquí se vuelven a jugar enteras con
 * chess.js antes de imprimir: un tomo con una jugada imposible se imprime igual.
 * Los diagramas se dibujan de nuevo con herramientas/lib/tablero-svg.js en las
 * mismas jugadas donde el libro original ponía los suyos.
 *
 * Por qué doce tomos y no uno: son casi dos mil partidas. Un solo PDF pasaría
 * de dos mil páginas, y el tomo es lo que se lleva a la clase: el del bloque
 * que se está estudiando.
 *
 * Se cierra como los demás libros (tapa a página completa, marca de agua en
 * cada página del cuerpo y PDF protegido: herramientas/lib/pdf-armar.js).
 *
 *     node herramientas/mil-lecciones-pdf.js                     # los 12 tomos
 *     node herramientas/mil-lecciones-pdf.js 3 7                 # solo esos tomos
 *     node herramientas/mil-lecciones-pdf.js --solo-accesible    # sin PDF ni pypdf
 *
 * Con CHROMIUM=/ruta/al/chrome se le indica un Chromium ya instalado.
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

const SLUG = "una-clase-al-dia";
const DATOS = path.join(RAIZ, "cursos", "protegido", "data");
const INDICE = JSON.parse(fs.readFileSync(path.join(DATOS, SLUG + ".json"), "utf8"));
// En cursos/recursos/ y no en material/: el tomo es el material del curso y lo
// baja quien tiene el curso (ver «El candado de los cursos está en el servidor»).
const CARPETA = path.join(RAIZ, "cursos", "recursos", SLUG);
const TITULO = "Una clase al día";
const AUTOR = "MI Ángel Martín";
const EDICION = "Oscar Angulo Cubero";
const CLAVE_PROPIETARIO = "mil-lecciones-oac-2026";
const ANIO = 2026;
const COLORES = { clara: "#f0dcc0", oscura: "#b58863", borde: "#5b3a1f", marca: "#e8b04b" };

function incrustar(relativo) {
  return "data:image/png;base64," + fs.readFileSync(path.join(RAIZ, relativo)).toString("base64");
}
const LOGO_CREMA = incrustar("img/logo-oscar-angulo.png");
const LOGO_MARCA = incrustar("img/logo-oscar-angulo-marca.png");

const esc = (t) => String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const es = (san) => N.sanEspanol(san);
// Antes de decir las jugadas, lo que textoHablado no reconoce: una maniobra
// («Tg1-g3-h3»: la torre va de g1 a g3 y luego a h3) y la valoración pegada a
// la jugada («50.Tc1=»).
function prepararOido(t) {
  return String(t || "")
    .replace(/\b([RDTAC]?[a-h1-8]?[a-h][1-8])((?:-\s?x?[a-h][1-8]|x[a-h][1-8])+)/g, (todo, pieza, resto) => {
      if (!/^[RDTAC]/.test(pieza)) return todo;
      const casillas = resto.match(/[a-h][1-8]/g);
      return pieza + ", luego a " + casillas.map((c) => N.sanHablada(c)).join(", luego a ");
    })
    .replace(/([a-h][1-8][+#]?)(?:=|\+-|-\+|±|∓)(?=[\s)\],.;]|$)/g, "$1");
}
const oido = (t) => N.textoHablado(prepararOido(t), "espanol");
const BANDO = { w: "blancas", b: "negras" };

/* ---------------------------------------------------------- los datos */
function leccionesDe(bloque) {
  return bloque.lecciones.map((l) => JSON.parse(fs.readFileSync(path.join(DATOS, SLUG, l.archivo + ".json"), "utf8")));
}

// Antes de imprimir, lo que no puede fallar: que cada partida y cada solución se
// pueda jugar entera, y que la FEN guardada en cada jugada sea la que sale.
function comprobar(d) {
  Object.values(d.partidas).forEach((g) => {
    const c = new Chess(g.start_fen);
    g.moves.forEach((m, i) => {
      const r = c.move(m.san, { sloppy: true });
      if (!r) throw new Error(`${g.id}: la jugada ${i + 1} (${m.san}) no es legal.`);
      // Sin la casilla al paso: python-chess solo la escribe si la captura es posible.
      if (c.fen().split(" ").slice(0, 3).join(" ") !== m.fen.split(" ").slice(0, 3).join(" ")) throw new Error(`${g.id}: la posición después de ${m.san} no coincide.`);
    });
  });
  Object.values(d.ejercicios).forEach((x) => {
    const c = new Chess(x.fen);
    x.solucion.forEach((m) => { if (!c.move(m.san, { sloppy: true })) throw new Error(`${x.id}: ${m.san} no es legal.`); });
  });
}

/* ---------------------------------------------------------- el PDF */
function numero(m, primera) {
  return m.color === "w" ? `${m.n}.` : (primera ? `${m.n}…` : "");
}

function diagrama(fen, pie) {
  return `<figure class="diagrama">${tablero(fen, { coordenadas: true, colores: COLORES, titulo: pie })}<figcaption>${esc(pie)}</figcaption></figure>`;
}

function partidaPdf(g) {
  const diags = new Set(g.diagramas || []);
  const turno0 = g.start_fen.split(" ")[1];
  let html = `<div class="partida"><p class="jugadores">${esc(g.blancas)} – ${esc(g.negras)}</p>`;
  const datos = [g.evento, g.apertura && (g.apertura + (g.eco ? ` [${g.eco}]` : ""))].filter(Boolean).join(" · ");
  if (datos) html += `<p class="evento">${esc(datos)}</p>`;
  if (g.fragmento || diags.has(0)) html += diagrama(g.start_fen, `Juegan las ${BANDO[turno0]}.`);
  let tramo = [];
  const cerrar = () => { if (tramo.length) { html += `<p class="jugadas">${tramo.join(" ")}</p>`; tramo = []; } };
  g.moves.forEach((m, i) => {
    const etiqueta = `<b>${numero(m, i === 0 || tramo.length === 0)}${esc(es(m.san))}${esc(m.nag || "")}</b>`;
    tramo.push(etiqueta);
    if (m.comentario) { tramo.push(esc(m.comentario)); cerrar(); }
    if (diags.has(i + 1)) { cerrar(); html += diagrama(m.fen, `Después de ${numero(m, true)}${es(m.san)}${m.nag || ""}`); }
  });
  if (g.resultado) tramo.push(`<b>${esc(g.resultado)}</b>`);
  cerrar();
  return html + "</div>";
}

function ejercicioPdf(x, num) {
  const turno = x.fen.split(" ")[1];
  return `<div class="ejercicio"><p class="cabecera"><span class="num">${esc(x.titulo)}</span> <span class="turno ${turno}">Juegan las ${BANDO[turno]}</span> <span class="ref">(n.º ${num})</span></p>
    ${tablero(x.fen, { coordenadas: true, colores: COLORES, titulo: `${x.titulo}. Juegan las ${BANDO[turno]}.` })}
    <p class="enunciado">${esc(x.pregunta)}</p></div>`;
}

function linea(x) {
  return x.solucion.map((m, i) => `${numero(m, i === 0)}${es(m.san)}`).join(" ");
}

function leccionPdf(d, numEj) {
  const L = d.leccion;
  let h = `<section class="leccion" id="leccion-${L.n}"><h3><span class="nl">${L.n}</span> ${esc(L.titulo)}</h3>
    <p class="clase">Clase ${L.clase} del libro original${L.fecha ? " · " + esc(L.fecha) : ""}</p>`;
  if (L.que_veras.length) h += `<div class="nota"><strong>Qué verás en esta lección</strong><ul>${L.que_veras.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>`;
  const ejs = [];
  L.items.forEach((it) => {
    if (it.tipo === "texto") h += `<p>${esc(it.texto)}</p>`;
    else if (it.tipo === "subtitulo") h += `<h4>${esc(it.texto)}</h4>`;
    else if (it.tipo === "partida") h += partidaPdf(d.partidas[it.id]);
    else if (it.tipo === "ejercicio") ejs.push(d.ejercicios[it.id]);
  });
  if (L.conclusiones.length) h += `<div class="nota"><strong>Conclusiones</strong><ul>${L.conclusiones.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>`;
  if (ejs.length) {
    h += `<h4>Para resolver</h4><p class="mide">Las soluciones están al final del tomo.</p><div class="rejilla">`;
    ejs.forEach((x) => { x.num = numEj(); h += ejercicioPdf(x, x.num); });
    h += "</div>";
  }
  return { html: h + "</section>", ejs };
}

const CSS = `
  @page { size: A4; margin: 16mm 15mm 15mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "DejaVu Serif", Georgia, "Times New Roman", serif; font-size: 10pt; line-height: 1.5; color: #102a43; }
  h2.titulo { font-size: 17pt; margin: 0 0 3mm; padding-bottom: 2mm; border-bottom: 2px solid #334e68; }
  h3 { font-size: 13.5pt; margin: 0 0 1mm; color: #102a43; page-break-after: avoid; }
  h3 .nl { display: inline-block; min-width: 9mm; padding: 0 1.5mm; height: 8mm; line-height: 8mm; text-align: center; border-radius: 4mm; background: #7a3b12; color: #fff; font-size: 9.5pt; margin-right: 2mm; font-family: "DejaVu Sans", Arial, sans-serif; }
  h4 { font-size: 11pt; margin: 5mm 0 1.5mm; color: #334e68; page-break-after: avoid; }
  .leccion { page-break-before: always; }
  .clase { margin: 0 0 4mm; font-size: 8.5pt; color: #627d98; font-family: "DejaVu Sans", Arial, sans-serif; }
  p { margin: 0 0 2.4mm; text-align: justify; }
  .nota { background: #f0f4f8; border-left: 3px solid #486581; padding: 2.5mm 4mm; margin: 3mm 0; font-size: 9.5pt; page-break-inside: avoid; }
  .nota ul { margin: 1mm 0 0; padding-left: 5mm; }
  .partida { margin: 4mm 0 2mm; }
  .jugadores { font-weight: 700; font-size: 11pt; margin: 4mm 0 0; page-break-after: avoid; }
  .evento { font-size: 8.5pt; color: #627d98; margin: 0 0 2mm; font-family: "DejaVu Sans", Arial, sans-serif; page-break-after: avoid; }
  .jugadas { text-align: left; }
  .jugadas b { font-family: "DejaVu Sans", Arial, sans-serif; font-size: 9.3pt; }
  figure.diagrama { margin: 2mm auto 3.5mm; width: 62mm; page-break-inside: avoid; text-align: center; }
  figure.diagrama svg { width: 62mm; height: auto; display: block; }
  figcaption { font-size: 8pt; color: #486581; margin-top: 1mm; font-family: "DejaVu Sans", Arial, sans-serif; }
  .mide { color: #486581; font-size: 9pt; }
  .rejilla { display: grid; grid-template-columns: 1fr 1fr; column-gap: 9mm; row-gap: 5mm; }
  .ejercicio { page-break-inside: avoid; }
  .ejercicio svg { width: 76mm; height: auto; display: block; }
  .cabecera { margin: 0 0 1.5mm; font-size: 8.5pt; color: #627d98; font-family: "DejaVu Sans", Arial, sans-serif; }
  .cabecera .num { font-weight: 700; color: #102a43; font-size: 10pt; margin-right: 1mm; }
  .turno { font-weight: 700; padding: .3mm 2mm; border-radius: 1mm; border: .4mm solid #334e68; }
  .turno.w { background: #ffffff; color: #102a43; }
  .turno.b { background: #102a43; color: #ffffff; }
  .enunciado { font-size: 8.8pt; margin-top: 1.5mm; text-align: left; }
  .solucion { page-break-inside: avoid; margin-bottom: 2.5mm; padding-bottom: 2mm; border-bottom: 1px solid #eef2f6; font-size: 9pt; }
  .solucion .cabecera { color: #0b6b3a; font-size: 9.5pt; font-family: "DejaVu Serif", Georgia, serif; }
  .fuente { margin: 0; color: #829ab1; font-style: italic; font-size: 7.5pt; }
  .portadilla { padding-top: 55mm; text-align: center; }
  .portadilla .eyebrow { font-size: 10pt; letter-spacing: .22em; text-transform: uppercase; color: #7a3b12; margin: 0 0 4mm; }
  .portadilla h2 { font-size: 26pt; margin: 0 0 8mm; }
  .portadilla p { max-width: 130mm; margin: 0 auto 4mm; font-size: 11pt; text-align: center; }
  table.indice { border-collapse: collapse; width: 100%; font-size: 9.5pt; }
  .indice td { border-bottom: 1px solid #e3e9ef; padding: 1mm 2mm; vertical-align: top; }
  .indice td.n { width: 12mm; color: #7a3b12; font-weight: 700; font-family: "DejaVu Sans", Arial, sans-serif; }
  .pagina { page-break-before: always; }
`;

function cuerpo(b, ds) {
  let k = 0;
  const numEj = () => ++k;
  const partes = ds.map((d) => leccionPdf(d, numEj));
  const ejs = partes.flatMap((p) => p.ejs);
  const npart = ds.reduce((s, d) => s + Object.keys(d.partidas).length, 0);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(TITULO)} · Tomo ${b.n}</title><style>${CSS}</style></head><body>
<div>
  <h2 class="titulo">Sobre este libro</h2>
  <p>Este es el tomo ${b.n} de <strong>${esc(TITULO)}</strong>, un libro pensado para leerse de a poco: una
  clase por día y, al cabo de un año, todo el ajedrez recorrido. Son las 360 clases que el maestro internacional
  ${esc(AUTOR)} escribió para la escuela de ajedrez EDAMI entre 2000 y 2007, reunidas en «Las Mil y una Lecciones de
  Ajedrez» (EDAMI, 2011) y publicadas aquí con permiso. El texto y los comentarios son los suyos; la Academia Ajedrez
  Integral las ordenó por tema en doce bloques, que son los doce tomos, y las convirtió en un curso donde cada partida
  se recorre en el tablero.</p>
  <p>Este tomo trae el bloque <strong>«${esc(b.titulo)}»</strong>: ${esc(b.desc.charAt(0).toLowerCase() + b.desc.slice(1))}
  Son ${ds.length} lecciones con ${npart} partidas${ejs.length ? ` y ${ejs.length} ejercicios` : ""}.</p>
  <div class="nota"><strong>Cómo se leen las partidas.</strong> Las jugadas van en notación algebraica en español
  (R rey, D dama, T torre, A alfil, C caballo; x captura, + jaque, # mate) y en negrita; lo que va entre ellas es el
  comentario del autor, con las variantes entre paréntesis. Cada partida se volvió a jugar entera, jugada a jugada,
  para comprobar que todas son legales, y los diagramas se dibujaron de nuevo en los mismos momentos donde el libro
  original ponía los suyos. En el curso de la Academia, cada partida se puede recorrer en el tablero y jugar contra el
  motor desde cualquier posición.</div>
  ${ejs.length ? `<div class="nota"><strong>Los ejercicios.</strong> Varias lecciones terminan con ejercicios de táctica y un
  «Repaso y práctica» del libro original. Sus soluciones, al final del tomo, salen del propio libro y la primera jugada
  de cada una se comprobó con Stockfish 16.</div>` : ""}
  <h2 class="titulo pagina">Índice</h2>
  <table class="indice">${ds.map((d) => `<tr><td class="n">${d.leccion.n}</td><td>${esc(d.leccion.titulo)}</td></tr>`).join("")}</table>
</div>
${partes.map((p) => p.html).join("")}
${ejs.length ? `<div class="pagina"><h2 class="titulo">Soluciones</h2>
  ${ejs.map((x) => `<section class="solucion"><p class="cabecera"><strong>${x.num}.</strong> ${esc(x.titulo)} · <strong>${esc(linea(x))}</strong></p>
  <p class="fuente">${esc(x.explicacion)}</p></section>`).join("")}</div>` : ""}
<div class="pagina"><div class="nota"><strong>${esc(AUTOR)}</strong>, «Las Mil y una Lecciones de Ajedrez» (EDAMI, 2011).
  Edición por temas de ${esc(EDICION)} para la Academia Ajedrez Integral, ${ANIO}, con permiso. Las partidas se
  comprobaron con python-chess y chess.js; los ejercicios, con Stockfish 16.</div></div>
</body></html>`;
}

function tapa(b, ds) {
  const npart = ds.reduce((s, d) => s + Object.keys(d.partidas).length, 0);
  const nej = ds.reduce((s, d) => s + Object.keys(d.ejercicios).length, 0);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(TITULO)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { width: 210mm; height: 297mm; font-family: "DejaVu Serif", Georgia, serif; color: #f6efe6;
         background: linear-gradient(160deg, #2b1608 0%, #4d2a10 50%, #1f1006 100%); position: relative; overflow: hidden; }
  .fondo { position: absolute; inset: 0; overflow: hidden; }
  .tablero-fondo { position: absolute; right: -40mm; bottom: -40mm; width: 150mm; height: 150mm;
      background-image:
        linear-gradient(45deg, rgba(232,176,75,.14) 25%, transparent 25%, transparent 75%, rgba(232,176,75,.14) 75%),
        linear-gradient(45deg, rgba(232,176,75,.14) 25%, transparent 25%, transparent 75%, rgba(232,176,75,.14) 75%);
      background-size: 20mm 20mm; background-position: 0 0, 10mm 10mm; transform: rotate(-10deg); }
  .lomo { position: absolute; left: 0; top: 0; bottom: 0; width: 7mm; background: linear-gradient(180deg, #e8b04b, #b07a1c); }
  .hoja { position: relative; z-index: 2; height: 297mm; padding: 26mm 20mm 20mm 27mm; display: flex; flex-direction: column; }
  .marca-casa { font-size: 10pt; letter-spacing: .28em; text-transform: uppercase; color: #e8b04b; font-weight: 700; margin: 0; }
  .centro { margin-top: auto; margin-bottom: auto; }
  .eyebrow { font-size: 10pt; letter-spacing: .22em; text-transform: uppercase; color: #e5c9a6; margin: 0 0 6mm; }
  h1 { font-size: 44pt; line-height: 1.05; margin: 0; color: #ffffff; font-weight: 700; }
  h1 .segunda { display: block; color: #e8b04b; }
  .filete { width: 46mm; height: 1.4mm; background: #e8b04b; margin: 8mm 0 6mm; }
  .tomo { font-size: 12pt; letter-spacing: .2em; text-transform: uppercase; color: #e5c9a6; margin: 0 0 2mm; }
  .bloque { font-size: 20pt; color: #ffffff; margin: 0 0 4mm; }
  .sub { font-size: 12pt; line-height: 1.5; color: #f1e2cf; margin: 0; max-width: 130mm; }
  .cifras { margin: 8mm 0 0; display: flex; gap: 10mm; }
  .cifra { border-left: .8mm solid rgba(232,176,75,.55); padding-left: 4mm; }
  .cifra .n { display: block; font-size: 20pt; font-weight: 700; color: #ffffff; line-height: 1.1; }
  .cifra .q { display: block; font-size: 8pt; letter-spacing: .12em; text-transform: uppercase; color: #e5c9a6; margin-top: 1mm; }
  .pie-tapa { margin-top: auto; }
  .autor { font-size: 18pt; font-weight: 700; color: #ffffff; margin: 0; }
  .autor-rol { font-size: 8.5pt; letter-spacing: .18em; text-transform: uppercase; color: #e8b04b; margin: 1.5mm 0 0; }
  .logo { display: block; width: 70mm; height: auto; margin: 8mm 0 0; }
  .editorial { margin: 6mm 0 0; padding-top: 4mm; border-top: 1px solid rgba(229,201,166,.3); font-size: 8.5pt; color: #e5c9a6; display: flex; justify-content: space-between; gap: 6mm; }
</style></head><body>
  <div class="fondo"><div class="tablero-fondo"></div></div>
  <div class="lomo"></div>
  <div class="hoja">
    <p class="marca-casa">&#9822; Ajedrez Integral</p>
    <div class="centro">
      <p class="eyebrow">360 clases · una para cada día</p>
      <h1>Una clase<span class="segunda">al día</span></h1>
      <div class="filete"></div>
      <p class="tomo">Tomo ${b.n} de 12</p>
      <p class="bloque">${esc(b.titulo)}</p>
      <p class="sub">${esc(b.desc)}</p>
      <div class="cifras">
        <div class="cifra"><span class="n">${ds.length}</span><span class="q">lecciones</span></div>
        <div class="cifra"><span class="n">${npart}</span><span class="q">partidas</span></div>
        ${nej ? `<div class="cifra"><span class="n">${nej}</span><span class="q">ejercicios</span></div>` : ""}
      </div>
    </div>
    <div class="pie-tapa">
      <p class="autor">Un poco cada día llega lejos</p>
      <p class="autor-rol">Edición por temas: ${esc(EDICION)} · Academia Ajedrez Integral</p>
      <img class="logo" src="${LOGO_CREMA}" alt="Oscar Angulo Cubero · Profesional de Ajedrez">
      <div class="editorial"><span>Texto: ${esc(AUTOR)}, «Las Mil y una Lecciones de Ajedrez», EDAMI, 2011 · publicado con permiso</span><span>${ANIO}</span></div>
    </div>
  </div>
</body></html>`;
}

const htmlMarca = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; width: 210mm; height: 297mm; }
  .sello { position: absolute; left: 52.5mm; top: 109mm; width: 105mm; transform: rotate(-15deg); opacity: .11; }
  .sello img { display: block; width: 105mm; height: auto; }
</style>
</head><body><div class="sello"><img src="${LOGO_MARCA}" alt=""></div></body></html>`;

/* ---------------------------------------------------------- accesible */
/* Sin una sola imagen: la posición de cada diagrama se cuenta pieza por pieza
   y las jugadas van dichas («alfil captura eva 5»), que es como se entienden
   con lector de pantalla. */
function posicionA(fen, rotulo) {
  const d = describir(fen);
  return `<p class="posicion"><strong>${esc(rotulo)}</strong> ${esc(d.turno)} Piezas blancas: ${esc(d.blancas)}. Piezas negras: ${esc(d.negras)}.
    <span class="fen">FEN: ${esc(fen)}</span></p>`;
}

function partidaA(g) {
  const diags = new Set(g.diagramas || []);
  let h = `<h4>${esc(g.blancas)} contra ${esc(g.negras)}</h4>`;
  const datos = [g.evento, g.apertura].filter(Boolean).join(". ");
  if (datos) h += `<p>${esc(datos)}.</p>`;
  if (g.fragmento || diags.has(0)) h += posicionA(g.start_fen, "Posición inicial.");
  let tramo = [];
  const cerrar = () => { if (tramo.length) { h += `<p>${tramo.join(" ")}</p>`; tramo = []; } };
  g.moves.forEach((m, i) => {
    tramo.push(`<strong>${m.color === "w" ? `${m.n}.` : `${m.n}, negras:`} ${esc(N.sanHablada(m.san))}</strong>`);
    if (m.comentario) { tramo.push(esc(oido(m.comentario))); cerrar(); }
    if (diags.has(i + 1)) { cerrar(); h += posicionA(m.fen, `Diagrama después de ${m.n}${m.color === "b" ? ", negras" : ""}: ${N.sanHablada(m.san)}.`); }
  });
  if (g.resultado) tramo.push(`Resultado: ${esc({ "1-0": "ganan las blancas", "0-1": "ganan las negras", "½-½": "tablas" }[g.resultado] || g.resultado)}.`);
  cerrar();
  return h;
}

function accesible(b, ds) {
  let k = 0;
  const ejs = [];
  const lecciones = ds.map((d) => {
    const L = d.leccion;
    let h = `<section id="leccion-${L.n}"><h2>Lección ${L.n}: ${esc(oido(L.titulo))}</h2><p><em>Clase ${L.clase} del libro original.</em></p>`;
    if (L.que_veras.length) h += `<h3>Qué verás en esta lección</h3><ul>${L.que_veras.map((t) => `<li>${esc(oido(t))}</li>`).join("")}</ul>`;
    L.items.forEach((it) => {
      if (it.tipo === "texto") h += `<p>${esc(oido(it.texto))}</p>`;
      else if (it.tipo === "subtitulo") h += `<h3>${esc(it.texto)}</h3>`;
      else if (it.tipo === "partida") h += partidaA(d.partidas[it.id]);
      else if (it.tipo === "ejercicio") {
        const x = d.ejercicios[it.id]; x.num = ++k; ejs.push(x);
        h += `<h3>${esc(x.titulo)} (número ${x.num})</h3><p>${esc(oido(x.pregunta))}</p>${posicionA(x.fen, "La posición.")}<p>La solución está al final, con el número ${x.num}.</p>`;
      }
    });
    if (L.conclusiones.length) h += `<h3>Conclusiones</h3><ul>${L.conclusiones.map((t) => `<li>${esc(oido(t))}</li>`).join("")}</ul>`;
    return h + "</section>";
  }).join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(TITULO)}, tomo ${b.n} — versión accesible</title>
<style>
  :root { color-scheme: light dark; }
  body { max-width: 42rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; background: #fff; color: #10202e;
         font-family: Georgia, "Times New Roman", serif; font-size: 1.15rem; line-height: 1.8; }
  h1 { font-size: 1.9rem; line-height: 1.25; }
  h2 { font-size: 1.45rem; margin-top: 2.5rem; border-bottom: 2px solid #10202e; padding-bottom: .3rem; }
  h3 { font-size: 1.2rem; margin: 2rem 0 .3rem; font-family: system-ui, sans-serif; }
  h4 { font-size: 1.05rem; margin: 1.4rem 0 .3rem; font-family: system-ui, sans-serif; }
  .posicion { background: #f1f5f8; padding: .7rem .9rem; }
  .fen { display: block; font-family: ui-monospace, monospace; font-size: .85em; word-break: break-all; }
  nav, footer { margin-top: 2rem; border-top: 1px solid #c9d4de; padding-top: 1rem; font-size: .95rem; }
  a { color: #0b4f8a; }
  @media (prefers-color-scheme: dark) {
    body { background: #10202e; color: #eef3f7; }
    h2 { border-color: #eef3f7; }
    .posicion { background: #1b3145; }
    a { color: #9cc9ff; }
    nav, footer { border-color: #3b5165; }
  }
</style>
</head><body>
<nav aria-label="Volver al curso"><a href="../../academia/${SLUG}.html">Volver al curso «${esc(TITULO)}»</a></nav>
<h1>${esc(TITULO)}. Tomo ${b.n}: ${esc(b.titulo)}</h1>
<p>Texto y partidas del ${esc(AUTOR)}, «Las Mil y una Lecciones de Ajedrez» (EDAMI, 2011), publicados con permiso.
Es el mismo contenido del tomo en PDF, escrito para leerse con lector de pantalla o con la letra agrandada: las
jugadas van dichas, cada diagrama va contado pieza por pieza y con su FEN, y no hay ninguna imagen.</p>
<p>${esc(b.desc)} ${ds.length} lecciones.</p>
<h2>Índice</h2>
<ol>${ds.map((d) => `<li value="${d.leccion.n}"><a href="#leccion-${d.leccion.n}">${esc(oido(d.leccion.titulo))}</a></li>`).join("")}</ol>
${lecciones}
${ejs.length ? `<section><h2>Soluciones</h2>${ejs.map((x) => `<h3>Solución ${x.num}: ${esc(x.titulo)}</h3><p>${esc(x.solucion.map((m) => N.sanHablada(m.san)).join(", "))}.</p><p>${esc(oido(x.explicacion))}</p>`).join("")}</section>` : ""}
<footer>
  <p>${esc(AUTOR)}, «Las Mil y una Lecciones de Ajedrez» (EDAMI, 2011). Edición por temas de ${esc(EDICION)} para la
  Academia Ajedrez Integral, ${ANIO}.</p>
  <p><a href="../../academia/${SLUG}.html">Volver al curso «${esc(TITULO)}»</a></p>
</footer>
</body></html>`;
}

/* ---------------------------------------------------------- generar */
const args = process.argv.slice(2);
const soloAccesible = args.includes("--solo-accesible");
const pedidos = args.filter((a) => /^\d+$/.test(a)).map(Number);
const BLOQUES = INDICE.curso.bloques.filter((b) => !pedidos.length || pedidos.includes(b.n));
fs.mkdirSync(CARPETA, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mil-lecciones-"));

const tomos = BLOQUES.map((b) => {
  const ds = leccionesDe(b);
  ds.forEach(comprobar);
  const nom = `tomo-${String(b.n).padStart(2, "0")}`;
  fs.writeFileSync(path.join(CARPETA, nom + "-accesible.html"), accesible(b, ds));
  const htmlCuerpo = path.join(tmp, nom + "-cuerpo.html");
  const htmlTapa = path.join(tmp, nom + "-tapa.html");
  fs.writeFileSync(htmlCuerpo, cuerpo(b, ds));
  fs.writeFileSync(htmlTapa, tapa(b, ds));
  console.log(`Tomo ${b.n}: ${ds.length} lecciones · accesible listo`);
  return { b, nom, htmlCuerpo, htmlTapa };
});
if (soloAccesible) process.exit(0);

(async () => {
  const { chromium } = require("playwright");
  const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const sinMargen = { top: 0, bottom: 0, left: 0, right: 0 };
  const htmlMarcaT = path.join(tmp, "marca.html");
  fs.writeFileSync(htmlMarcaT, htmlMarca);
  const marca = path.join(tmp, "marca.pdf");
  const pM = await navegador.newPage();
  await pM.goto("file://" + htmlMarcaT, { waitUntil: "load" });
  await pM.pdf({ path: marca, format: "A4", printBackground: true, margin: sinMargen });
  await pM.close();
  for (const t of tomos) {
    const pdfTapa = path.join(tmp, t.nom + "-tapa.pdf");
    const pdfCuerpo = path.join(tmp, t.nom + "-cuerpo.pdf");
    const destino = path.join(CARPETA, t.nom + ".pdf");
    const pT = await navegador.newPage();
    await pT.goto("file://" + t.htmlTapa, { waitUntil: "load" });
    await pT.pdf({ path: pdfTapa, format: "A4", printBackground: true, margin: sinMargen });
    await pT.close();
    const p = await navegador.newPage();
    await p.goto("file://" + t.htmlCuerpo, { waitUntil: "load", timeout: 0 });
    await p.pdf({
      path: pdfCuerpo, format: "A4", printBackground: true, timeout: 0,
      margin: { top: "16mm", bottom: "15mm", left: "15mm", right: "15mm" },
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: `<div style="width:100%;font-size:7.5pt;color:#9fb3c8;font-family:Arial,sans-serif;padding:0 15mm;display:flex;justify-content:space-between;align-items:center;"><span>${esc(TITULO)} · Tomo ${t.b.n}</span><span style="font-weight:700;color:#829ab1;">${esc(AUTOR)} · Ajedrez Integral</span><span class="pageNumber"></span></div>`,
    });
    await p.close();
    unir(pdfTapa, pdfCuerpo, marca, destino);
    proteger(destino, {
      clave: CLAVE_PROPIETARIO, autor: AUTOR, imprimir: true,
      titulo: `${TITULO} - Tomo ${t.b.n}: ${t.b.titulo}`,
      asunto: "360 clases de ajedrez ordenadas por tema, una para cada día, con sus partidas comentadas",
    });
    console.log("PDF listo:", destino);
  }
  await navegador.close();
})();
