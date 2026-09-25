/* El código de una página, esté donde esté: su HTML más el que se mudó a js/.
 *
 * Con «El código de las páginas sale del HTML»
 * (docs/decisiones/sitio-e-infraestructura.md) el código de una pantalla deja
 * de estar dentro de su .html y pasa a js/<pagina>.js. Un verificador que
 * busca algo en el código leyendo solo el .html deja de encontrarlo, y según
 * cómo esté escrito falla (lo que pasó con verificar-admin.js al mudar
 * informes.html) o, peor, pasa sin comprobar nada.
 *
 * leer("informes.html") devuelve el HTML seguido del código mudado: los
 * archivos que la página carga con <script src> y cuya primera línea dice que
 * son su código (la cabecera que escribe herramientas/mudar-script.py, o la
 * de js/sesion.js, que se mudó antes a mano).
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..", "..");

function leer(pagina) {
  const ruta = path.join(RAIZ, pagina);
  const html = fs.readFileSync(ruta, "utf8");
  const partes = [html];
  for (const m of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) {
    if (/^(https?:)?\/\//.test(m[1])) continue;
    const js = path.resolve(path.dirname(ruta), m[1].split("?")[0]);
    if (!fs.existsSync(js)) continue;
    const texto = fs.readFileSync(js, "utf8");
    // Solo la PRIMERA línea, y diciendo que es su código: un módulo compartido
    // que en su cabecera nombra las páginas que lo usan (js/precios-acceso.js
    // nombra precios.html) no es el código de ninguna.
    const primera = texto.slice(0, texto.indexOf("\n"));
    if (primera === "/* El código de " + pagina + "." || primera.includes("(" + pagina + "): todo su código")) partes.push(texto);
  }
  return partes.join("\n");
}

module.exports = { leer };
