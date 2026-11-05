/* El sello escondido: una marca que va en cada archivo de código del sitio
 * (páginas, JavaScript, CSS, dibujos SVG y los scripts de herramientas/), para
 * poder reconocer una copia si aparece en otro lado.
 *
 * Por qué así (ver «El sello escondido en cada archivo» en
 * docs/decisiones/sitio-e-infraestructura.md):
 *   · El código que corre en el navegador no se puede esconder: lo que se
 *     manda, quien lo recibe lo lee. Lo que sí se puede es dejar en cada
 *     archivo algo que solo existe en este proyecto. Si un día aparece en otra
 *     página o en otro repositorio, la copia salió de acá y queda la prueba.
 *   · Parece un número de versión cualquiera («rev …») y no dice de quién es:
 *     un sello que se anuncia es un sello que se borra antes de copiar.
 *   · En JavaScript y CSS va como «/*! … *\/»: los minificadores (esbuild,
 *     terser, cssnano) borran los comentarios, pero conservan los que empiezan
 *     con «!». Quien copia y minifica se lo lleva igual.
 *   · Es UNO solo para todo el proyecto: una búsqueda en Google o en GitHub
 *     encuentra cualquier copia, de cualquier archivo.
 *
 * Una sola copia: el estampador (herramientas/sello-estampar.js), el
 * verificador (verificar-sello.js) y cualquier generador que escriba un archivo
 * con el sello lo toman de acá.
 */
"use strict";

const SELLO = "rev bfb5bbb0d2d82f9f";

/* Cómo se escribe en cada tipo de archivo. */
const FORMAS = {
  ".html": `<!-- ${SELLO} -->`,
  ".svg": `<!-- ${SELLO} -->`,
  ".js": `/*! ${SELLO} */`,
  ".mjs": `/*! ${SELLO} */`,
  ".mts": `/*! ${SELLO} */`,
  ".css": `/*! ${SELLO} */`,
  ".gs": `/*! ${SELLO} */`,
  ".py": `# ${SELLO}`,
  ".sh": `# ${SELLO}`,
  ".ps1": `# ${SELLO}`,
};

function extension(ruta) {
  const m = /\.[^./\\]+$/.exec(ruta);
  return m ? m[0].toLowerCase() : "";
}

function forma(ruta) {
  return FORMAS[extension(ruta)] || null;
}

function tiene(texto) {
  return texto.includes(SELLO);
}

/* Devuelve el texto con el sello puesto (igual si ya lo tenía). Va siempre
 * en una línea propia AL FINAL del archivo:
 *   · al principio no puede ir: un comentario antes del <!DOCTYPE html> pone
 *     la página en modo «quirks», antes del <?xml ?> rompe el SVG, y antes
 *     del «#!» el script deja de poder ejecutarse;
 *   · y la primera línea de un archivo de js/ dice de qué página es el código
 *     (herramientas/lib/codigo-de-pagina.js la lee).
 * Lo que había queda intacto, letra por letra, y el sello va debajo,
 * separado por un salto de línea: así quitar() lo devuelve exacto. */
function estampar(texto, ruta) {
  const f = forma(ruta);
  if (!f || tiene(texto)) return texto;
  return texto + "\n" + f + "\n";
}

/* Lo contrario: el texto tal como era antes de estampar(), letra por letra.
 * Para lo que compara o calcula una huella del contenido (un generador contra
 * su archivo, la huella de las láminas de Formación): el sello no es parte de
 * lo que el archivo dice. */
function quitar(texto, ruta) {
  const f = forma(ruta);
  const cola = "\n" + f + "\n";
  return f && texto.endsWith(cola) ? texto.slice(0, -cola.length) : texto;
}

module.exports = { SELLO, FORMAS, forma, tiene, estampar, quitar };
