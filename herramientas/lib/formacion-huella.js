/* La huella de las láminas de una clase de Formación Ajedrez: el sha-256 de
 * sus datos (con lo que leen del curso), del generador y de su diapositivas.json. La escribe
 * formacion-laminas.js al dibujar y la vuelve a calcular
 * verificar-formacion-laminas.js: si no coinciden, las imágenes son de antes.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const HERRAMIENTAS = path.join(__dirname, "..");
const RAIZ = path.join(HERRAMIENTAS, "..");

const archivo = (clase) => path.join(HERRAMIENTAS, "datos", "formacion-laminas-" + clase + ".huella");

function huella(clase) {
  const h = crypto.createHash("sha256");
  const datos = path.join(HERRAMIENTAS, "datos", "formacion-laminas-" + clase + ".js");
  h.update(fs.readFileSync(datos));
  // Lo que los datos leen de otro lado (los cuadros cruzados de la Sesión 3
  // salen del curso) también cuenta: si cambia, la lámina es de antes.
  const leidos = fs.existsSync(datos) ? require(datos).filter((d) => d && d.cuadro).map((d) => d.cuadro) : [];
  if (leidos.length) h.update(JSON.stringify(leidos));
  h.update(fs.readFileSync(path.join(HERRAMIENTAS, "formacion-laminas.js")));
  h.update(fs.readFileSync(path.join(RAIZ, "cursos", "recursos", "formacion-ajedrez", "presentaciones", clase, "diapositivas.json")));
  return h.digest("hex");
}

module.exports = { huella, archivo };
