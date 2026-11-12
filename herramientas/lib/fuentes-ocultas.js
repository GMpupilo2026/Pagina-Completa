/* Las fuentes de afuera apagadas por ahora (FUENTES_OCULTAS de
   js/torneos-pareo-pagina.js y de worker.js). Las pruebas de cómo se pinta un
   torneo de ajedrezcostarica.com siguen corriendo con la lista vaciada solo
   dentro de la prueba; la de que no se ven usa el archivo tal cual.
   Ver «Torneos en Pareo Integral: los torneos de ajedrezcostarica.com» en
   docs/decisiones/juegos-y-torneos.md. */
const fs = require("fs");
const path = require("path");

const LINEA = /const FUENTES_OCULTAS = \[[^\]]*\];/;

// El texto del archivo con la lista vacía. Falla fuerte si no la encuentra:
// una prueba que no logró vaciarla probaría otra cosa sin decirlo.
function sinOcultas(fuente, archivo) {
  if (!LINEA.test(fuente)) throw new Error("no encontré FUENTES_OCULTAS en " + archivo);
  return fuente.replace(LINEA, "const FUENTES_OCULTAS = [];");
}

// En una página de Playwright: sirve js/torneos-pareo-pagina.js con la lista vacía.
async function mostrarTodasEnPagina(page) {
  const archivo = path.join(__dirname, "..", "..", "js", "torneos-pareo-pagina.js");
  const texto = sinOcultas(fs.readFileSync(archivo, "utf8"), "js/torneos-pareo-pagina.js");
  await page.route("**/js/torneos-pareo-pagina.js*", (route) => route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: texto }));
}

module.exports = { sinOcultas, mostrarTodasEnPagina, LINEA };

/*! rev bfb5bbb0d2d82f9f */
