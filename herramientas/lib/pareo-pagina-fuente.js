/* El código de la página de Pareo Integral (pareo.html), que desde el
 * 20/11/2026 está partido por zonas: js/pareo/pagina.js (el núcleo) y una
 * parte por zona en js/pareo/pagina-*.js (ver «Pareo Integral: la página
 * partida por zonas» en docs/decisiones/juegos-y-torneos.md).
 *
 * Un verificador que busca algo en el código de la página lo busca en todas
 * las partes juntas, en el orden en que pareo.html las carga: así no depende
 * de en qué parte quedó cada función. Si pareo.html carga otras partes que
 * las de ARCHIVOS (una parte nueva, una que se quitó, otro orden), leer()
 * falla en vez de buscar en un código a medias.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..", "..");

const ARCHIVOS = [
  "js/pareo/pagina.js",
  "js/pareo/pagina-torneo.js",
  "js/pareo/pagina-jugadores.js",
  "js/pareo/pagina-listas.js",
  "js/pareo/pagina-grupos.js",
  "js/pareo/pagina-evento.js",
  "js/pareo/pagina-respaldo.js",
  "js/pareo/pagina-vivo.js",
  "js/pareo/pagina-rondas.js",
  "js/pareo/pagina-resultados.js",
  "js/pareo/pagina-adjuntos.js",
  "js/pareo/pagina-mesas.js",
  "js/pareo/pagina-centro.js",
  "js/pareo/pagina-equipos.js",
  "js/pareo/pagina-impresion.js",
  "js/pareo/pagina-clasificacion.js",
  "js/pareo/pagina-publicar.js",
  "js/pareo/pagina-arranque.js",
];

// Las partes que carga pareo.html, en su orden.
function cargadas() {
  const html = fs.readFileSync(path.join(RAIZ, "pareo.html"), "utf8");
  return [...html.matchAll(/<script src="(js\/pareo\/pagina[^"]*\.js)"/g)].map((m) => m[1]);
}

function leer() {
  const enHtml = cargadas();
  if (enHtml.join("|") !== ARCHIVOS.join("|")) {
    throw new Error("pareo.html carga otras partes de la página que las de herramientas/lib/pareo-pagina-fuente.js:\n  html:  " +
      enHtml.join(", ") + "\n  lista: " + ARCHIVOS.join(", "));
  }
  return ARCHIVOS.map((a) => fs.readFileSync(path.join(RAIZ, a), "utf8")).join("\n");
}

module.exports = { ARCHIVOS, cargadas, leer };

/*! rev bfb5bbb0d2d82f9f */
