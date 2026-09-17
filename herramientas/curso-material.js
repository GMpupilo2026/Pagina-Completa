/* Genera, para CADA lección de CADA curso, dos archivos de estudio:
 *
 *   cursos/recursos/<curso>/NN-<leccion>-material.pdf
 *       El cuadernillo: de qué trata la lección, los conceptos que toca con su
 *       error frecuente, ejemplos con diagrama (posiciones del propio curso, ya
 *       verificadas con motor), ejercicios, preguntas con su respuesta y las
 *       fuentes. Marca de agua en todas las páginas, firmado por Oscar Angulo
 *       Cubero y protegido: se abre sin contraseña pero no se puede imprimir,
 *       copiar ni editar.
 *
 *   cursos/recursos/<curso>/NN-<leccion>-material-accesible.html
 *       El MISMO contenido para quien usa lector de pantalla. No es un PDF a
 *       propósito: un PDF con diagramas, marca de agua y cifrado es lo peor que
 *       se le puede dar a un lector de pantalla. Acá cada posición va descrita
 *       en palabras —"Rey blanco en e4, peón blanco en d3…"— y las jugadas
 *       escritas, así que no hace falta ver ninguna imagen.
 *
 * De dónde sale el contenido:
 *   - el texto y la tarea de cada lección, de cursos/protegido/<curso>.html;
 *   - los conceptos, preguntas y ejercicios, de herramientas/material/conceptos.json,
 *     que se emparejan con la lección por palabras clave;
 *   - las posiciones, del archivo de datos del propio curso. NO se inventa
 *     ninguna posición ni ninguna cita.
 *
 * Cómo se corre (necesita Node, Chromium por Playwright y pypdf; ninguno es
 * parte del sitio, son solo para generar los archivos):
 *
 *     npm install playwright && pip install pypdf
 *     node herramientas/curso-material.js              # todos los cursos
 *     node herramientas/curso-material.js finales-practicos
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const RAIZ = path.join(__dirname, "..");
const { tablero } = require("./lib/tablero-svg.js");
const { lecciones, posiciones } = require("./lib/leer-curso.js");

const AUTOR = "Oscar Angulo Cubero";
/* La contraseña de propietario: la que levantaría las restricciones del PDF.
   Va acá a propósito, igual que en herramientas/arbitraje-pdf.js, porque no
   protege un secreto — protege el formato. */
const CLAVE_PROPIETARIO = "material-ai-2026";
const ANIO = new Date().getFullYear();
const CONCEPTOS = JSON.parse(fs.readFileSync(path.join(__dirname, "material", "conceptos.json"), "utf8"));
const LECTURAS = JSON.parse(fs.readFileSync(path.join(__dirname, "material", "lecturas.json"), "utf8"));

const CURSOS = [
  "fundamentos-del-ajedrez", "finales-practicos", "estrategia-y-tactica",
  "aperturas-y-defensas", "calculo-y-visualizacion", "desequilibrios-de-material",
  "el-mapa-de-los-finales", "estrategia-en-el-final", "partidas-modelo",
  "preparacion-para-torneos",
];
// De qué habla cada curso, para cuando una lección no engancha con ningún
// concepto por palabras clave: se le dan los de su área.
const AREA_DEL_CURSO = {
  "fundamentos-del-ajedrez": "fundamentos", "finales-practicos": "finales",
  "estrategia-y-tactica": "tactica", "aperturas-y-defensas": "aperturas",
  "calculo-y-visualizacion": "tactica", "desequilibrios-de-material": "estrategia",
  "el-mapa-de-los-finales": "finales", "estrategia-en-el-final": "finales",
  "partidas-modelo": "estrategia", "preparacion-para-torneos": "competicion",
};

// ------------------------------------------------------------------ ayudas
const escapar = (t) => String(t == null ? "" : t)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const normalizar = (t) => String(t || "").toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "");

const VACIAS = new Set(["para", "como", "cuando", "donde", "desde", "entre", "sobre", "hasta",
  "porque", "aunque", "mientras", "todos", "todas", "cada", "este", "esta", "esto", "esos",
  "unas", "unos", "muy", "mas", "menos", "bien", "puede", "tiene", "hace", "parte", "forma",
  "ajedrez", "leccion", "clase", "curso", "juego", "jugada", "jugar", "pieza", "piezas"]);

function clavesDe(texto) {
  return new Set(normalizar(texto).split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !VACIAS.has(w)));
}

const slugDe = (t) => normalizar(t).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

// ------------------------------------------ qué conceptos toca una lección
function conceptosDe(leccion, slugCurso) {
  const texto = normalizar(leccion.titulo + " " + leccion.texto.join(" ") + " " + (leccion.tarea || ""));
  const puntuados = CONCEPTOS.map((c) => {
    let puntos = 0;
    c.claves.forEach((k) => {
      const kn = normalizar(k);
      if (texto.indexOf(kn) !== -1) puntos += kn.indexOf(" ") !== -1 ? 3 : 2;
    });
    // El área del curso desempata, no decide.
    if (c.area === AREA_DEL_CURSO[slugCurso]) puntos += 1;
    return { c, puntos };
  }).filter((x) => x.puntos > 1).sort((a, b) => b.puntos - a.puntos);

  if (puntuados.length) return puntuados.slice(0, 3).map((x) => x.c);
  // Ninguna palabra enganchó: se le dan los del área del curso, repartidos para
  // que dos lecciones seguidas no traigan exactamente los mismos.
  const area = CONCEPTOS.filter((c) => c.area === AREA_DEL_CURSO[slugCurso]);
  const base = area.length ? area : CONCEPTOS;
  return [base[leccion.n % base.length], base[(leccion.n + 1) % base.length]].filter(Boolean);
}

// --------------------------------- qué partida comentada es esta lección
// En partidas-modelo la lección ES una partida: el HTML solo monta el visor y
// todo el texto (resumen, ideas, lo que deja) vive en el archivo de datos.
function partidaDe(leccion, todas) {
  if (!todas.length) return null;
  const t = normalizar(leccion.titulo);
  let mejor = null, mejorPuntos = 0;
  todas.forEach((p) => {
    let puntos = 0;
    if (p.tema && t.startsWith(normalizar(p.tema))) puntos += 4;
    else if (p.tema && t.indexOf(normalizar(p.tema)) !== -1) puntos += 3;
    if (p.titulo && t.indexOf(normalizar(p.titulo)) !== -1) puntos += 3;
    [p.blancas, p.negras].forEach((quien) => {
      const apellido = normalizar(quien).split(/\s+/).filter((w) => w.length > 3).pop();
      if (apellido && t.indexOf(apellido) !== -1) puntos += 2;
    });
    if (puntos > mejorPuntos) { mejor = p; mejorPuntos = puntos; }
  });
  return mejorPuntos >= 2 ? mejor : null;
}

// ------------------------------------------ qué posiciones le corresponden
//
// Seis de los diez cursos no tienen archivo de posiciones propio. Antes que
// inventar posiciones para ellos —que es justo el error que este repositorio
// ya cometió una vez con una "Lucena" que no era Lucena—, se les prestan las
// de los otros cursos: son 1.178 posiciones ya verificadas con motor. La que
// se presta va rotulada con el curso del que viene, para no dar a entender que
// es de esta lección.
function posicionesDe(leccion, todas, prestadas) {
  const exactas = todas.filter((p) => Number(p.leccion) === Number(leccion.n));
  if (exactas.length) return exactas.slice(0, 3);
  const claves = clavesDe(leccion.titulo);
  if (!claves.size) return [];
  const buscar = (donde, minimo) => donde.map((p) => {
    const suyas = clavesDe(p.titulo + " " + p.contexto);
    let comunes = 0;
    claves.forEach((k) => { if (suyas.has(k)) comunes += 1; });
    return { p, comunes };
  }).filter((x) => x.comunes >= minimo).sort((a, b) => b.comunes - a.comunes);

  const propias = buscar(todas, 2);
  if (propias.length) return propias.slice(0, 2).map((x) => x.p);
  // Nada en el propio curso: se busca en el de toda la Academia.
  const fuera = buscar(prestadas || [], 2);
  return fuera.slice(0, 2).map((x) => Object.assign({}, x.p, { prestada: true }));
}

// ------------------------------------------------ describir una FEN en palabras
// Vive en lib/ porque el libro del diagnóstico describe sus posiciones igual.
const { describir } = require("./lib/describir-fen.js");

// --------------------------------------------------------- las fuentes
function fuentesDe(curso, conceptos, hayPosiciones) {
  const lista = [
    `Texto de la lección: curso «${curso.titulo}» de Ajedrez Integral, de ${AUTOR}.`,
    `Conceptos, preguntas y ejercicios de este cuadernillo: material didáctico de Ajedrez Integral, de ${AUTOR}.`,
  ];
  if (hayPosiciones) {
    lista.push("Posiciones: archivo de posiciones del propio curso, verificadas jugada por jugada con chess.js y evaluadas con el motor Stockfish que el sitio usa.");
  }
  if (conceptos.some((c) => c.area === "competicion")) {
    lista.push("Reglas citadas: Leyes del Ajedrez de la FIDE (FIDE Handbook, capítulo E.I.01).");
  }
  return lista;
}

function lecturasDe(conceptos) {
  const areas = [...new Set(conceptos.map((c) => c.area))];
  const salida = [];
  areas.forEach((a) => (LECTURAS[a] || []).forEach((l) => { if (!salida.includes(l)) salida.push(l); }));
  return salida.slice(0, 5);
}

// De dónde sale el texto de "De qué trata": del HTML de la lección, y si esa
// lección no tiene texto propio —porque es el visor de una partida—, del
// resumen y las ideas de esa partida.
function textoDe(leccion, partida) {
  if (leccion.texto.length) return { parrafos: leccion.texto, ideas: [], ficha: null };
  if (!partida) return { parrafos: [], ideas: [], ficha: null };
  const parrafos = [partida.resumen, partida.teoria].filter(Boolean);
  return {
    parrafos,
    ideas: partida.lecciones.length ? partida.lecciones : partida.ideas,
    ficha: [partida.blancas && partida.negras ? `${partida.blancas} – ${partida.negras}` : "",
            partida.evento, partida.resultado].filter(Boolean).join(" · ") || null,
  };
}

// ------------------------------------------------------------- el cuadernillo
function cuadernilloHtml(curso, leccion, conceptos, posics, partida) {
  const cuerpo = textoDe(leccion, partida);
  const fuentes = fuentesDe(curso, conceptos, posics.length > 0);
  const lecturas = lecturasDe(conceptos);
  const diag = (p) => tablero(p.fen, { titulo: p.titulo || "Posición de la lección" });

  const secciones = [];

  secciones.push(`<section><h2>1. De qué trata esta lección</h2>
    ${cuerpo.ficha ? `<p class="nota">${escapar(cuerpo.ficha)}</p>` : ""}
    ${cuerpo.parrafos.map((t) => `<p>${escapar(t)}</p>`).join("") || "<p>Esta lección se trabaja en clase y con la presentación; acá va el material de apoyo.</p>"}
    ${cuerpo.ideas.length ? `<h3>Lo que deja esta partida</h3><ul>${cuerpo.ideas.map((i) => `<li>${escapar(i)}</li>`).join("")}</ul>` : ""}
  </section>`);

  secciones.push(`<section><h2>2. Conceptos clave</h2>
    ${conceptos.map((c) => `<div class="concepto">
      <h3>${escapar(c.nombre)}</h3>
      <p>${escapar(c.definicion)}</p>
      <p class="error"><strong>El error de siempre.</strong> ${escapar(c.error)}</p>
      <p class="ejemplo"><strong>Para verlo.</strong> ${escapar(c.ejemplo)}</p>
    </div>`).join("")}
  </section>`);

  if (posics.length) {
    secciones.push(`<section><h2>3. Ejemplos del curso</h2>
      <p class="nota">Posiciones verificadas con motor. Las que vienen de otro curso de la Academia lo dicen debajo.</p>
      ${posics.map((p) => {
        const d = describir(p.fen);
        return `<div class="ejemplo-pos">
          <div class="diag">${diag(p)}</div>
          <div class="txt">
            <h3>${escapar(p.titulo || "Posición")}</h3>
            ${p.prestada && p.deCurso ? `<p class="nota">Posición del curso «${escapar(p.deCurso)}» de la Academia.</p>` : ""}
            <p class="fen">Blancas: ${escapar(d.blancas)}.<br>Negras: ${escapar(d.negras)}.<br>${escapar(d.turno)}</p>
            ${p.pregunta ? `<p><strong>¿Qué harías?</strong> ${escapar(p.pregunta)}</p>` : ""}
            ${p.linea ? `<p class="linea"><strong>La línea:</strong> ${escapar(p.linea)}</p>` : ""}
            ${p.resultado ? `<p class="linea"><strong>Resultado:</strong> ${escapar(p.resultado)}</p>` : ""}
            ${p.comentario ? `<p>${escapar(p.comentario)}</p>` : ""}
          </div>
        </div>`;
      }).join("")}
    </section>`);
  }

  const nEj = posics.length ? 4 : 3;
  const ejercicios = [];
  if (leccion.tarea) ejercicios.push(leccion.tarea);
  conceptos.forEach((c) => c.ejercicios.forEach((e) => ejercicios.push(e)));
  secciones.push(`<section><h2>${nEj}. Ejercicios</h2>
    <ol class="ejercicios">${ejercicios.map((e) => `<li>${escapar(e)}</li>`).join("")}</ol>
  </section>`);

  const preguntas = [];
  conceptos.forEach((c) => c.preguntas.forEach((q) => preguntas.push(q)));
  secciones.push(`<section class="corte"><h2>${nEj + 1}. Preguntas con su respuesta</h2>
    <p class="nota">Tapa la respuesta, contesta en voz alta y después compara.</p>
    <ol class="preguntas">${preguntas.map((q) =>
      `<li><p class="p">${escapar(q.p)}</p><p class="r"><strong>Respuesta.</strong> ${escapar(q.r)}</p></li>`).join("")}</ol>
  </section>`);

  secciones.push(`<section><h2>${nEj + 2}. Fuentes</h2>
    <ul class="fuentes">${fuentes.map((f) => `<li>${escapar(f)}</li>`).join("")}</ul>
    <h3>Para seguir leyendo</h3>
    <p class="nota">Obras de referencia sobre estos temas. Este cuadernillo <strong>no reproduce texto de ellas</strong>: se listan como lectura recomendada, no como origen de lo que aquí se dice.</p>
    <ul class="fuentes">${lecturas.map((l) => `<li>${escapar(l)}</li>`).join("")}</ul>
    <p class="aviso">© ${ANIO} ${escapar(AUTOR)} · Ajedrez Integral. Material de uso docente para alumnos de la Academia. No se autoriza su reproducción ni su distribución fuera de ella.</p>
  </section>`);

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${escapar(leccion.titulo)} — ${escapar(curso.titulo)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm 20mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, "Times New Roman", serif; font-size: 10.5pt; line-height: 1.55;
         color: #102a43; margin: 0; }
  h1 { font-size: 20pt; margin: 0 0 2mm; color: #102a43; }
  h2 { font-size: 13pt; margin: 8mm 0 3mm; padding-bottom: 1.5mm;
       border-bottom: 2px solid #f0b429; color: #102a43; page-break-after: avoid; }
  h3 { font-size: 11pt; margin: 4mm 0 1mm; color: #243b53; page-break-after: avoid; }
  p { margin: 0 0 2.5mm; }
  section { page-break-inside: auto; }
  .corte { page-break-before: auto; }
  .cabecera { border-bottom: 3px solid #102a43; padding-bottom: 4mm; margin-bottom: 4mm; }
  .curso { font-size: 9pt; letter-spacing: .08em; text-transform: uppercase; color: #627d98; margin: 0 0 1mm; }
  .autor { font-size: 9.5pt; color: #627d98; margin: 1mm 0 0; }
  .concepto { margin-bottom: 4mm; page-break-inside: avoid; }
  .error { background: #fffbea; border-left: 3px solid #f0b429; padding: 2mm 3mm; }
  .ejemplo { color: #243b53; }
  .nota { font-size: 9pt; color: #627d98; font-style: italic; }
  .ejemplo-pos { display: flex; gap: 5mm; align-items: flex-start; margin-bottom: 5mm; page-break-inside: avoid; }
  .ejemplo-pos .diag { flex: 0 0 52mm; }
  .ejemplo-pos .diag svg { width: 52mm; height: 52mm; }
  .ejemplo-pos .txt { flex: 1; min-width: 0; }
  .fen { font-size: 9pt; color: #486581; }
  .linea { font-family: "Courier New", monospace; font-size: 9.5pt; }
  ol.ejercicios li, ol.preguntas li { margin-bottom: 3mm; page-break-inside: avoid; }
  ol.preguntas .p { font-weight: bold; margin-bottom: 1mm; }
  ol.preguntas .r { margin: 0; }
  ul.fuentes { font-size: 9.5pt; padding-left: 5mm; }
  ul.fuentes li { margin-bottom: 1.5mm; }
  .aviso { margin-top: 5mm; font-size: 8.5pt; color: #627d98; border-top: 1px solid #d9e2ec; padding-top: 2mm; }
</style></head><body>
  <div class="cabecera">
    <p class="curso">${escapar(curso.titulo)} · Lección ${leccion.n}</p>
    <h1>${escapar(leccion.titulo)}</h1>
    <p class="autor">Material de estudio · ${escapar(AUTOR)} · Ajedrez Integral</p>
  </div>
  ${secciones.join("\n")}
</body></html>`;
}

// El camino de vuelta. El material se abre en su propia pestaña desde la
// lección, así que sin esto queda en un callejón sin salida: no hay encabezado
// del sitio, no hay menú y el "atrás" del navegador es lo único que queda.
// Las direcciones son relativas a cursos/recursos/<curso>/, que es donde vive
// este archivo.
function volverA(curso, etiqueta) {
  // Arriba es una región de navegación con su nombre; abajo, el mismo par de
  // enlaces dentro del pie, ya como párrafo. Dos <nav> con el mismo nombre se
  // anuncian como dos regiones iguales y no se sabe cuál es cuál.
  const enlaces = `<a href="../../academia/${escapar(curso.slug)}.html">← Volver al curso ${escapar(curso.titulo)}</a>
  ·
  <a href="../../../clases.html">Panel de Academia</a>`;
  return etiqueta
    ? `<nav class="volver" aria-label="${escapar(etiqueta)}">\n  ${enlaces}\n</nav>`
    : `<p class="volver">\n  ${enlaces}\n</p>`;
}

// ------------------------------------------------------- la versión accesible
function accesibleHtml(curso, leccion, conceptos, posics, partida) {
  const cuerpo = textoDe(leccion, partida);
  const fuentes = fuentesDe(curso, conceptos, posics.length > 0);
  const lecturas = lecturasDe(conceptos);
  const ejercicios = [];
  if (leccion.tarea) ejercicios.push(leccion.tarea);
  conceptos.forEach((c) => c.ejercicios.forEach((e) => ejercicios.push(e)));
  const preguntas = [];
  conceptos.forEach((c) => c.preguntas.forEach((q) => preguntas.push(q)));

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(leccion.titulo)} — ${escapar(curso.titulo)} — material de estudio</title>
<meta name="robots" content="noindex">
<meta name="author" content="${escapar(AUTOR)}">
<meta name="description" content="Material de estudio en formato accesible de la lección ${leccion.n} del curso ${escapar(curso.titulo)}.">
<style>
  /* Sin imágenes y sin columnas a propósito: esta versión está hecha para
     lectores de pantalla y para quien necesita agrandar mucho el texto. */
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
         font-size: 1.15rem; line-height: 1.8; color: #102a43; background: #ffffff;
         max-width: 42rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; }
  h1 { font-size: 1.7rem; line-height: 1.3; }
  h2 { font-size: 1.3rem; margin-top: 2.5rem; border-bottom: 2px solid #102a43; padding-bottom: .3rem; }
  h3 { font-size: 1.1rem; margin-top: 1.8rem; }
  a { color: #8a4a00; }
  dt { font-weight: 700; margin-top: 1rem; }
  dd { margin: .3rem 0 0; }
  .posicion { border: 2px solid #243b53; border-radius: .5rem; padding: 1rem; margin: 1rem 0; }
  .respuesta { background: #f0f4f8; border-left: 4px solid #102a43; padding: .6rem .9rem; }
  footer { margin-top: 3rem; border-top: 2px solid #102a43; padding-top: 1rem; font-size: .95rem; }
  /* La vuelta a la plataforma. Este archivo se abre solo, en su propia
     pestaña: sin estos enlaces no hay forma de regresar al curso salvo el
     botón "atrás" del navegador, que con lector de pantalla no siempre está
     a mano. Van arriba y abajo: el documento es largo y quien termina de
     leerlo no tendría que subir de nuevo para salir. */
  .volver { margin: 0 0 1.5rem; font-size: 1rem; }
  footer .volver { margin: 1rem 0 0; }
  .volver a { display: inline-block; padding: .2rem 0; }
  @media (prefers-color-scheme: dark) {
    body { background: #0a1f33; color: #f0f4f8; }
    h2, footer { border-color: #f0b429; }
    a { color: #f0b429; }
    .posicion { border-color: #829ab1; }
    .respuesta { background: #102a43; border-color: #f0b429; }
  }
</style>
</head>
<body>
${volverA(curso, "Volver a la plataforma")}
<header>
  <p>${escapar(curso.titulo)} · Lección ${leccion.n}</p>
  <h1>${escapar(leccion.titulo)}</h1>
  <p>Material de estudio en formato accesible. Autor: ${escapar(AUTOR)}, Ajedrez Integral.</p>
  <p>Esta versión dice en palabras todo lo que en el cuadernillo en PDF está dibujado: cada
     posición viene descrita pieza por pieza, así que no hace falta ver ninguna imagen.</p>
</header>

<h2>1. De qué trata esta lección</h2>
${cuerpo.ficha ? `<p>${escapar(cuerpo.ficha)}</p>` : ""}
${cuerpo.parrafos.map((t) => `<p>${escapar(t)}</p>`).join("\n") || "<p>Esta lección se trabaja en clase y con la presentación.</p>"}
${cuerpo.ideas.length ? `<h3>Lo que deja esta partida</h3>\n<ul>\n${cuerpo.ideas.map((i) => `  <li>${escapar(i)}</li>`).join("\n")}\n</ul>` : ""}

<h2>2. Conceptos clave</h2>
<dl>
${conceptos.map((c) => `  <dt>${escapar(c.nombre)}</dt>
  <dd>${escapar(c.definicion)}</dd>
  <dd><strong>El error de siempre:</strong> ${escapar(c.error)}</dd>
  <dd><strong>Para verlo:</strong> ${escapar(c.ejemplo)}</dd>`).join("\n")}
</dl>

${posics.length ? `<h2>3. Ejemplos del curso</h2>
${posics.map((p, i) => {
  const d = describir(p.fen);
  return `<div class="posicion">
  <h3>Posición ${i + 1}${p.titulo ? ": " + escapar(p.titulo) : ""}</h3>
  ${p.prestada && p.deCurso ? `<p>Esta posición viene del curso ${escapar(p.deCurso)} de la Academia.</p>` : ""}
  <p>Piezas blancas: ${escapar(d.blancas) || "ninguna"}.</p>
  <p>Piezas negras: ${escapar(d.negras) || "ninguna"}.</p>
  <p>${escapar(d.turno)}</p>
  ${p.pregunta ? `<p>Pregunta: ${escapar(p.pregunta)}</p>` : ""}
  ${p.linea ? `<p>La línea, jugada por jugada: ${escapar(p.linea)}</p>` : ""}
  ${p.resultado ? `<p>Resultado: ${escapar(p.resultado)}</p>` : ""}
  ${p.comentario ? `<p>${escapar(p.comentario)}</p>` : ""}
  <p>Posición en notación FEN, por si la quieres cargar en un programa: ${escapar(p.fen)}</p>
</div>`;
}).join("\n")}` : ""}

<h2>${posics.length ? 4 : 3}. Ejercicios</h2>
<ol>
${ejercicios.map((e) => `  <li>${escapar(e)}</li>`).join("\n")}
</ol>

<h2>${posics.length ? 5 : 4}. Preguntas con su respuesta</h2>
<p>Contesta en voz alta antes de seguir leyendo: la respuesta viene justo después de cada pregunta.</p>
<ol>
${preguntas.map((q) => `  <li>
    <p>${escapar(q.p)}</p>
    <p class="respuesta"><strong>Respuesta.</strong> ${escapar(q.r)}</p>
  </li>`).join("\n")}
</ol>

<h2>${posics.length ? 6 : 5}. Fuentes</h2>
<ul>
${fuentes.map((f) => `  <li>${escapar(f)}</li>`).join("\n")}
</ul>
<h3>Para seguir leyendo</h3>
<p>Obras de referencia sobre estos temas. Este material no reproduce texto de ellas: se listan como lectura recomendada, no como origen de lo que aquí se dice.</p>
<ul>
${lecturas.map((l) => `  <li>${escapar(l)}</li>`).join("\n")}
</ul>

<footer>
  <p>© ${ANIO} ${escapar(AUTOR)} · Ajedrez Integral. Material de uso docente para alumnos de la Academia.</p>
  <p>No se autoriza su reproducción ni su distribución fuera de ella.</p>
${volverA(curso)}
</footer>
</body>
</html>`;
}

module.exports = { conceptosDe, posicionesDe, partidaDe, textoDe, describir, cuadernilloHtml, accesibleHtml,
                   fuentesDe, lecturasDe, slugDe, CURSOS, AUTOR, CLAVE_PROPIETARIO };
